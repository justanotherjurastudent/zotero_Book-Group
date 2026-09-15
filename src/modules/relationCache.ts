import { REBUILD_DELAY } from "./constants";
import {
  RelationIndex,
  creatorKey,
  findAmbiguousContributions,
  markMetadataMatches,
  resolveLinks,
  type CandidateItem,
  type RelationRow,
  type VolumeMetadata,
} from "./core/relationIndex";
import { getTypeKinds, safeGetItem } from "./itemTypes";

type ChangeListener = () => void;

/** Zotero.Relations.relatedItemPredicate (xpcom/data/relations.js) */
const RELATED_ITEM_PREDICATE: string =
  (Zotero as unknown as { Relations?: { relatedItemPredicate?: string } })
    .Relations?.relatedItemPredicate ?? "dc:relation";

/**
 * Keeps the RelationIndex in sync with Zotero's related-item relations
 * (the single source of truth).
 *
 * Loading reads the database directly instead of `item.relatedItems`, because
 * relations are not guaranteed to be loaded for every item at startup
 * (`Item.prototype._getRelatedItems()` calls `_requireData('relations')`).
 */
export class RelationCache {
  readonly index = new RelationIndex();

  private listeners = new Set<ChangeListener>();
  private observerID: string | null = null;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private building: Promise<void> | null = null;
  private rebuildQueued = false;
  private destroyed = false;
  /** Incremented on every delete, to discard rebuilds loaded before it. */
  private deleteGeneration = 0;

  /** Subscribe to index changes. @return unsubscribe function */
  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Initial load plus notifier registration. */
  async init(): Promise<void> {
    this.observerID = Zotero.Notifier.registerObserver(
      {
        notify: (event: string, type: string, ids: unknown[], extraData) =>
          this.handleNotify(event, type, ids, extraData),
      },
      ["item"],
      "bookgroup-relations",
      // Run before the item tree observer (priority 50) so deleted items are
      // gone from the index before rows are re-rendered.
      40,
    );
    await this.rebuild();
  }

  /** True while a rebuild is scheduled or running (used by tests). */
  get isPending(): boolean {
    return !!this.rebuildTimer || !!this.building;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.observerID) {
      Zotero.Notifier.unregisterObserver(this.observerID);
      this.observerID = null;
    }
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
    }
    this.listeners.clear();
  }

  /**
   * Rebuild the index from the database. Concurrent calls are coalesced:
   * a call during a running build queues exactly one follow-up build.
   */
  async rebuild(): Promise<void> {
    if (this.building) {
      this.rebuildQueued = true;
      return this.building;
    }
    let changed = false;
    this.building = (async () => {
      do {
        this.rebuildQueued = false;
        const generation = this.deleteGeneration;
        const start = Date.now();
        const links = resolveLinks(
          await RelationCache.loadCandidates(),
          await RelationCache.loadRelationRows(),
        );
        const ambiguous = findAmbiguousContributions(links);
        if (ambiguous.length) {
          const ambiguousSet = new Set(ambiguous);
          const ids = new Set<number>(ambiguous);
          for (const link of links) {
            if (ambiguousSet.has(link.contributionID)) {
              ids.add(link.containerID);
            }
          }
          markMetadataMatches(
            links,
            ambiguous,
            await RelationCache.loadVolumeMetadata([...ids]),
          );
        }
        if (this.destroyed) {
          return;
        }
        if (generation !== this.deleteGeneration) {
          // Items were deleted while loading: the result may be stale
          this.rebuildQueued = true;
          continue;
        }
        changed = this.index.rebuild(links) || changed;
        ztoolkit.log(
          `Relation cache: ${this.index.linkCount} links in ${Date.now() - start} ms`,
        );
      } while (this.rebuildQueued && !this.destroyed);
    })();
    try {
      await this.building;
    } finally {
      this.building = null;
    }
    // Field changes are handled by full re-sorts; only link changes matter here
    if (changed) {
      this.emitChange();
    }
  }

  scheduleRebuild(): void {
    if (this.destroyed) {
      return;
    }
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
    }
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = null;
      this.rebuild().catch((e) => Zotero.logError(e));
    }, REBUILD_DELAY);
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        Zotero.logError(e as Error);
      }
    }
  }

  private handleNotify(
    event: string,
    type: string,
    ids: unknown[],
    _extraData: unknown,
  ): void {
    if (type !== "item" || this.destroyed) {
      return;
    }
    const numericIDs = ids.filter((id): id is number => typeof id === "number");

    if (event === "delete") {
      this.deleteGeneration++;
      // Remove immediately so no row refers to a deleted item.
      if (this.index.removeItems(numericIDs)) {
        this.emitChange();
      }
      return;
    }

    // add, modify, trash, refresh, ... – rebuild if a grouping type is involved
    const kinds = getTypeKinds();
    const relevant = numericIDs.some((id) => {
      if (this.index.has(id)) {
        return true;
      }
      const item = safeGetItem(id);
      return !!item && kinds.has(item.itemTypeID);
    });
    if (relevant) {
      if (event === "trash" && this.index.removeItems(numericIDs)) {
        this.emitChange();
      }
      this.scheduleRebuild();
    }
  }

  /** All non-deleted items of a grouping type, across libraries. */
  private static async loadCandidates(): Promise<CandidateItem[]> {
    const kinds = getTypeKinds();
    if (!kinds.size) {
      return [];
    }
    // Type IDs are integers from Zotero.ItemTypes, safe to inline.
    const typeIDs = [...kinds.keys()].join(", ");
    const rows = (await Zotero.DB.queryAsync(
      `SELECT itemID, libraryID, key, itemTypeID FROM items
			WHERE itemTypeID IN (${typeIDs})
			AND itemID NOT IN (SELECT itemID FROM deletedItems)`,
    )) as Array<{
      itemID: number;
      libraryID: number;
      key: string;
      itemTypeID: number;
    }>;
    return rows.map((row) => ({
      id: row.itemID,
      libraryID: row.libraryID,
      key: row.key,
      kind: kinds.get(row.itemTypeID)!,
    }));
  }

  /**
   * Volume title and editors of the given items, used only for contributions
   * linked to several volumes (rare, so loading through the item API is fine).
   *
   * - Container: `title`
   * - Contribution: `bookTitle`/`encyclopediaTitle`, read through their base
   *   field `publicationTitle` (Item.prototype.getField with includeBaseMapped)
   */
  private static async loadVolumeMetadata(
    ids: number[],
  ): Promise<Map<number, VolumeMetadata>> {
    const metadata = new Map<number, VolumeMetadata>();
    const kinds = getTypeKinds();
    const editorTypeID = Zotero.CreatorTypes.getID("editor");
    const items = (
      (await Zotero.Items.getAsync(ids)) as Array<Zotero.Item | false>
    ).filter((item): item is Zotero.Item => !!item);
    await Zotero.Items.loadDataTypes(items, ["itemData", "creators"]);

    for (const item of items) {
      const kind = kinds.get(item.itemTypeID);
      if (!kind) {
        continue;
      }
      try {
        const volumeTitle =
          kind === "container"
            ? item.getField("title")
            : item.getField("publicationTitle", false, true);
        const editors = item
          .getCreators()
          .filter((creator) => creator.creatorTypeID === editorTypeID)
          .map((creator) => creatorKey(creator))
          .filter(Boolean);
        metadata.set(item.id, { volumeTitle: String(volumeTitle), editors });
      } catch (e) {
        Zotero.logError(e as Error);
      }
    }
    return metadata;
  }

  /** `dc:relation` rows whose subject is an item of a grouping type. */
  private static async loadRelationRows(): Promise<RelationRow[]> {
    const kinds = getTypeKinds();
    if (!kinds.size) {
      return [];
    }
    const typeIDs = [...kinds.keys()].join(", ");
    const rows = (await Zotero.DB.queryAsync(
      `SELECT IR.itemID AS itemID, IR.object AS object
			FROM itemRelations IR
			JOIN relationPredicates RP USING (predicateID)
			JOIN items I ON (I.itemID = IR.itemID)
			WHERE RP.predicate = ? AND I.itemTypeID IN (${typeIDs})`,
      [RELATED_ITEM_PREDICATE],
    )) as Array<{ itemID: number; object: string }>;

    const result: RelationRow[] = [];
    for (const row of rows) {
      // Same parser Zotero uses in Item.prototype._getRelatedItems()
      const parsed = Zotero.URI.getURIItemLibraryKey(row.object) as
        { libraryID: number; key: string } | false;
      if (parsed && parsed.key) {
        result.push({
          subjectID: row.itemID,
          objectLibraryID: parsed.libraryID,
          objectKey: parsed.key,
        });
      }
    }
    return result;
  }
}
