import {
  ALL_CSS_CLASSES,
  DIALOG_TREE_IDS,
  DIALOG_URLS,
  MAIN_TREE_ID,
  RESORT_DELAY,
} from "./constants";
import type { GroupEntry } from "./core/groupOrder";
import type { GroupColors } from "./groupColors";
import type { GroupSorter, VisibilityCheck } from "./groupSorter";
import { createGroupSortMenuItem, createMenuSeparator } from "./groupSortMenu";
import { warn } from "../utils/log";
import { safeGetItem } from "./itemTypes";
import type { SettingsStore } from "./settings";
import { applyGroupStyle, clearGroupStyle, type GroupRole } from "./styles";

/*
 * Structural types for the parts of Zotero's item tree this module touches.
 * All of them are internal and undocumented; verified against Zotero 10.0.2:
 *   chrome/content/zotero/itemTree.js
 *     - ItemTreeRowProvider._compareField(a, b, sortField)
 *       (called from _compareRows(), which multiplies by _sortDirection)
 *     - ItemTreeRowProvider._sort(itemIDs): with itemIDs, only those rows are
 *       re-positioned (comparator returns 0 for all other pairs); callers:
 *       notify() on modify, CollectionViewItemTreeRowProvider refresh/filter
 *     - ItemTreeRowProvider._initSortState() creates a fresh _sortCache object
 *       per sort pass, used here as a pass token
 *     - ItemTree._renderItem(index, selection, oldDiv, columns) returns the
 *       row <div>; divs are recycled, so classes must be reset on each call
 *     - ItemTree.render() passes `renderItem: this._renderItem.bind(this)`, so
 *       a prototype patch only reaches the table after the next forceUpdate()
 *     - module.exports = ItemTree; module.exports.ItemTreeRowProvider = …
 *   chrome/content/zotero/components/virtualized-table.js
 *     - Columns.toggleSort(index) → props.onColumnSort → ItemTree._handleColumnSort
 *       (does nothing if the tree is not sortable)
 *   chrome/content/zotero/include.js / resource/require.js
 *     - every window gets its own CommonJS loader, hence its own ItemTree class
 */

/** Zotero.Intl.collation (xpcom/intl.js): Intl.Collator plus compareString */
export interface SortCollation {
  compareString(level: number, a: string, b: string): number;
}

interface TreeRow {
  ref: unknown;
  level: number;
  isObjectRow?: boolean;
}

interface VirtualizedTableColumns {
  getAsArray(): Array<{ dataKey: string }>;
  toggleSort(index: number): unknown;
}

export interface ItemTreeLike {
  props: { id: string };
  domEl?: Element;
  tree?: {
    invalidate(): void;
    _columns?: VirtualizedTableColumns;
  } | null;
  rowProvider?: RowProviderLike;
  getRow(index: number): TreeRow | undefined;
  getSortField(): string;
  _sortedColumn?: { dataKey: string; sortDirection?: number } | null;
  sort(): Promise<unknown> | unknown;
  forceUpdate?(callback?: () => void): void;
  invalidateRowCache?(ids: number[] | true): void;
}

interface RowProviderLike {
  itemTree: ItemTreeLike;
  rowMap: Record<string | number, number>;
  _sortDirection: number;
  _sortCollation: SortCollation;
  _sortCache: object;
}

type CompareField = (a: TreeRow, b: TreeRow, sortField: string) => number;
type SortRows = (itemIDs?: number[] | false | null) => unknown;

interface ItemTreeModule {
  prototype: {
    _renderItem: (...args: unknown[]) => HTMLElement;
    buildColumnPickerMenu?: (menupopup: Element) => unknown;
  };
  ItemTreeRowProvider?: {
    prototype: {
      _compareField: CompareField;
      _sort: SortRows;
    };
  };
}

interface PatchRecord {
  owners: Set<Window>;
  restore: () => void;
}

/**
 * Assign a property and confirm it took effect. Assignments to foreign
 * objects can silently no-op or throw, depending on strict mode.
 */
function assignChecked(target: object, name: string, value: unknown): boolean {
  try {
    (target as Record<string, unknown>)[name] = value;
  } catch {
    return false;
  }
  return (target as Record<string, unknown>)[name] === value;
}

function getTopLevelItem(item: Zotero.Item): Zotero.Item | null {
  let current: Zotero.Item | null = item;
  for (let depth = 0; current && current.parentItemID && depth < 4; depth++) {
    current = safeGetItem(current.parentItemID);
  }
  return current;
}

function isVisibleIn(
  rowMap: Record<string | number, number> | undefined,
): VisibilityCheck {
  return (id: number) => !!rowMap && rowMap[id] !== undefined;
}

function isAlive(win: Window): boolean {
  return !Components.utils.isDeadWrapper(win) && !win.closed;
}

/**
 * Hooks grouped sorting and row decoration into the item trees of the main
 * window and the integration dialogs.
 */
export class TreeIntegration {
  /** Namespaced dataKey returned by ItemTreeManager.registerColumn(). */
  columnKey: string | null = null;

  private windows = new Map<Window, object>();
  private patches = new Map<object, PatchRecord>();
  private sortPasses = new WeakMap<
    object,
    { token: object; entries: Map<number, GroupEntry | null> }
  >();
  private autoActivated = new WeakSet<object>();
  private dialogTrees = new WeakMap<object, boolean>();
  private resortTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private readonly settings: SettingsStore,
    private readonly sorter: GroupSorter,
    private readonly colors: GroupColors,
  ) {}

  /**
   * Patch the item tree classes of a window (idempotent).
   *
   * @return true if the window is integrated
   */
  attach(win: Window): boolean {
    if (this.destroyed) {
      return false;
    }
    if (this.windows.has(win)) {
      return true;
    }
    const module = TreeIntegration.getItemTreeModule(win);
    const treeProto = module?.prototype;
    const providerProto = module?.ItemTreeRowProvider?.prototype;
    if (
      !treeProto ||
      typeof treeProto._renderItem !== "function" ||
      !providerProto ||
      typeof providerProto._compareField !== "function" ||
      typeof providerProto._sort !== "function"
    ) {
      warn("item tree internals not found – grouping disabled in this window");
      return false;
    }

    let record = this.patches.get(treeProto);
    if (!record) {
      const restore = this.patchPrototypes(treeProto, providerProto);
      if (!restore) {
        return false;
      }
      record = { owners: new Set(), restore };
      this.patches.set(treeProto, record);
    }
    record.owners.add(win);
    this.windows.set(win, treeProto);
    TreeIntegration.rerender(win);
    return true;
  }

  /** Undo patches of a window and strip decorations from its rows. */
  detach(win: Window): void {
    const treeProto = this.windows.get(win);
    if (!treeProto) {
      return;
    }
    this.windows.delete(win);
    const record = this.patches.get(treeProto);
    if (record) {
      record.owners.delete(win);
      if (!record.owners.size) {
        record.restore();
        this.patches.delete(treeProto);
      }
    }
    if (isAlive(win)) {
      const selector = ALL_CSS_CLASSES.map((name) => `.${name}`).join(", ");
      for (const element of win.document.querySelectorAll<HTMLElement>(
        selector,
      )) {
        clearGroupStyle(element);
      }
      TreeIntegration.rerender(win);
    }
  }

  /** Detach all windows and ignore any callbacks still scheduled. */
  destroy(): void {
    this.destroyed = true;
    if (this.resortTimer) {
      clearTimeout(this.resortTimer);
      this.resortTimer = null;
    }
    for (const win of [...this.windows.keys()]) {
      this.detach(win);
    }
    this.columnKey = null;
  }

  /** Item trees of a window: main pane, citation dialog, bibliography dialog. */
  static getTrees(win: Window): ItemTreeLike[] {
    const scope = win as unknown as Record<string, any>;
    const candidates = [
      scope.ZoteroPane?.itemsView,
      scope.libraryLayout?.itemsView,
      scope.itemsView,
    ];
    const trees: ItemTreeLike[] = [];
    for (const tree of candidates) {
      if (
        tree &&
        typeof tree.getSortField === "function" &&
        !trees.includes(tree)
      ) {
        trees.push(tree);
      }
    }
    return trees;
  }

  /** Grouping is active for a tree if enabled for its context. */
  isTreeActive(tree: ItemTreeLike | undefined): boolean {
    const settings = this.settings.current;
    if (!settings.enable || !tree || this.destroyed) {
      return false;
    }
    const id = tree.props?.id;
    if (id === MAIN_TREE_ID) {
      return true;
    }
    return settings.citationDialog && this.isDialogTree(tree);
  }

  /** True for the item tree of a citation or bibliography dialog. */
  isDialogTree(tree: ItemTreeLike): boolean {
    let result = this.dialogTrees.get(tree);
    if (result === undefined) {
      const href = tree.domEl?.ownerGlobal?.location?.href ?? "";
      result =
        (DIALOG_TREE_IDS as readonly string[]).includes(tree.props?.id) &&
        DIALOG_URLS.some((url) => href.startsWith(url));
      this.dialogTrees.set(tree, result);
    }
    return result;
  }

  /**
   * `getSortField()` throws in CollectionViewItemTree before its columns
   * exist (no collection rows yet), so treat that as "not grouped".
   */
  isGroupSorted(tree: ItemTreeLike): boolean {
    if (!this.columnKey) {
      return false;
    }
    try {
      return tree.getSortField() === this.columnKey;
    } catch {
      return false;
    }
  }

  /** Sort a tree by the grouping column. @return true on success */
  activate(tree: ItemTreeLike): boolean {
    if (!this.columnKey || this.destroyed) {
      return false;
    }
    return this.isGroupSorted(tree) || this.sortByColumn(tree, this.columnKey);
  }

  /** Switch a grouped tree back to title sorting. */
  deactivate(tree: ItemTreeLike): boolean {
    if (!this.isGroupSorted(tree)) {
      return true;
    }
    return this.sortByColumn(tree, "title");
  }

  /** Apply `callback` to every tree in every integrated window. */
  forEachTree(callback: (tree: ItemTreeLike, win: Window) => void): void {
    for (const win of [...this.windows.keys()]) {
      if (!isAlive(win)) {
        this.windows.delete(win);
        continue;
      }
      for (const tree of TreeIntegration.getTrees(win)) {
        try {
          callback(tree, win);
        } catch (e) {
          Zotero.logError(e as Error);
        }
      }
    }
  }

  /**
   * Re-render all trees; with `resort`, fully re-sort trees sorted by the
   * grouping column (after relation, sort-key or column changes).
   */
  async refresh({ resort = false } = {}): Promise<void> {
    const pending: Promise<unknown>[] = [];
    this.forEachTree((tree) => {
      if (resort && this.isGroupSorted(tree)) {
        // The column text (describe()) depends on relations
        tree.invalidateRowCache?.(true);
        pending.push(
          Promise.resolve(tree.sort())
            .catch((e) => Zotero.logError(e))
            .then(() => tree.tree?.invalidate()),
        );
      } else {
        tree.tree?.invalidate();
      }
    });
    await Promise.all(pending);
  }

  /** Coalesce several re-sort requests (e.g. notifier bursts) into one. */
  scheduleResort(): void {
    if (this.destroyed) {
      return;
    }
    if (this.resortTimer) {
      clearTimeout(this.resortTimer);
    }
    this.resortTimer = setTimeout(() => {
      this.resortTimer = null;
      this.refresh({ resort: true }).catch((e) => Zotero.logError(e));
    }, RESORT_DELAY);
  }

  /**
   * Make React pick up (or drop) the patched `_renderItem` binding, then
   * repaint the rows with it.
   */
  private static rerender(win: Window): void {
    for (const tree of TreeIntegration.getTrees(win)) {
      try {
        if (tree.forceUpdate) {
          tree.forceUpdate(() => tree.tree?.invalidate());
        } else {
          tree.tree?.invalidate();
        }
      } catch (e) {
        Zotero.logError(e as Error);
      }
    }
  }

  private static getItemTreeModule(win: Window): ItemTreeModule | null {
    const req = (win as unknown as { require?: (id: string) => unknown })
      .require;
    if (typeof req !== "function") {
      return null;
    }
    try {
      return req("zotero/itemTree") as ItemTreeModule;
    } catch (e) {
      Zotero.logError(e as Error);
      return null;
    }
  }

  /** @return true if the tree is sorted by `dataKey` afterwards */
  private sortByColumn(tree: ItemTreeLike, dataKey: string): boolean {
    const columns = tree.tree?._columns;
    if (!columns || typeof columns.toggleSort !== "function") {
      return false;
    }
    // Same index source as Zotero's own header click (virtualized-table.js)
    const index = columns
      .getAsArray()
      .findIndex((column) => column.dataKey === dataKey);
    if (index < 0) {
      return false;
    }
    columns.toggleSort(index);
    // _handleColumnSort sets _sortedColumn synchronously before sorting
    try {
      return tree.getSortField() === dataKey;
    } catch {
      return false;
    }
  }

  /** @return restore function, or null if a patch did not take effect */
  private patchPrototypes(
    treeProto: ItemTreeModule["prototype"],
    providerProto: NonNullable<
      ItemTreeModule["ItemTreeRowProvider"]
    >["prototype"],
  ): (() => void) | null {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const integration = this;
    const originalRender = treeProto._renderItem;
    const originalCompare = providerProto._compareField;
    const originalSort = providerProto._sort;
    // React keeps the bound render function until the next render(), so
    // closures must turn into pass-throughs once the patch is restored.
    let enabled = true;

    const patchedRender = function (this: ItemTreeLike, ...args: unknown[]) {
      const div = originalRender.apply(this, args);
      if (!enabled) {
        return div;
      }
      try {
        integration.decorateRow(this, args[0] as number, div);
      } catch (e) {
        Zotero.logError(e as Error);
      }
      return div;
    };

    const patchedCompare = function (
      this: RowProviderLike,
      a: TreeRow,
      b: TreeRow,
      sortField: string,
    ) {
      if (
        enabled &&
        sortField === integration.columnKey &&
        integration.isTreeActive(this.itemTree)
      ) {
        try {
          const result = integration.compareRows(this, a, b);
          // Only pairs of non-item rows (trash collections) use title order
          return result ?? originalCompare.call(this, a, b, "title");
        } catch (e) {
          Zotero.logError(e as Error);
          return 0;
        }
      }
      return originalCompare.call(this, a, b, sortField);
    };

    // A row's grouped position depends on other rows (its volume's key and
    // visibility), so partial sorts would tear groups apart: sort fully.
    const patchedSort = function (
      this: RowProviderLike,
      itemIDs?: number[] | false | null,
    ) {
      try {
        if (
          enabled &&
          itemIDs &&
          integration.isTreeActive(this.itemTree) &&
          integration.isGroupSorted(this.itemTree)
        ) {
          itemIDs = null;
        }
      } catch (e) {
        Zotero.logError(e as Error);
      }
      return originalSort.call(this, itemIDs);
    };

    const applied: Array<[object, string, unknown, unknown]> = [
      [treeProto, "_renderItem", patchedRender, originalRender],
      [providerProto, "_compareField", patchedCompare, originalCompare],
      [providerProto, "_sort", patchedSort, originalSort],
    ];

    // Optional: the column header context menu. Without it grouping still
    // works through View → Sort By and the column itself.
    const originalPicker = treeProto.buildColumnPickerMenu;
    if (typeof originalPicker === "function") {
      const patchedPicker = function (this: ItemTreeLike, menupopup: Element) {
        const result = originalPicker.call(this, menupopup);
        if (enabled) {
          try {
            integration.addColumnPickerEntry(this, menupopup);
          } catch (e) {
            Zotero.logError(e as Error);
          }
        }
        return result;
      };
      applied.push([
        treeProto,
        "buildColumnPickerMenu",
        patchedPicker,
        originalPicker,
      ]);
    }
    const restore = () => {
      enabled = false;
      for (const [target, name, , original] of applied) {
        assignChecked(target, name, original);
      }
    };
    for (const [target, name, patched] of applied) {
      if (!assignChecked(target, name, patched)) {
        warn(`patch of ${name} did not take effect`);
        restore();
        return null;
      }
    }
    return restore;
  }

  /**
   * Insert "Group by Edited Volume" into the column header context menu,
   * right before the "Secondary Sort" submenu.
   *
   * ItemTree._displayColumnPickerMenu() builds a fresh popup with the ID
   * `zotero-column-picker` on every right-click; View → Columns in the main
   * window reuses buildColumnPickerMenu() with another popup and is skipped
   * (View → Sort By already offers the entry there).
   */
  private addColumnPickerEntry(tree: ItemTreeLike, menupopup: Element): void {
    if (
      menupopup.id !== "zotero-column-picker" ||
      !this.columnKey ||
      !this.isTreeActive(tree)
    ) {
      return;
    }
    const doc = menupopup.ownerDocument;
    if (!doc) {
      return;
    }
    const item = createGroupSortMenuItem(doc, tree, this);
    item.id = "bookgroup-column-picker-sort";
    const secondarySort = menupopup.querySelector(
      ':scope > [anonid="zotero-column-picker-sort-menu"]',
    );
    if (secondarySort) {
      secondarySort.before(item);
    } else {
      menupopup.append(createMenuSeparator(doc), item);
    }
  }

  private compareRows(
    provider: RowProviderLike,
    a: TreeRow,
    b: TreeRow,
  ): number | null {
    // One entry cache per sort pass (see header comment on _sortCache)
    const token = provider._sortCache;
    let pass = this.sortPasses.get(provider);
    if (!pass || pass.token !== token) {
      pass = { token, entries: new Map() };
      this.sortPasses.set(provider, pass);
    }
    // Zotero derives _sortDirection from a fresh _getColumns() array, but a
    // plugin column without a treePrefs.json entry loses its direction there
    // while ItemTree._sortedColumn keeps it (verified in 10.0.2: descending
    // header clicks on the column sorted ascending). Use the column's own
    // direction and cancel out the provider's multiplication.
    const providerDirection = provider._sortDirection < 0 ? -1 : 1;
    const sortedColumn = provider.itemTree?._sortedColumn;
    const direction =
      sortedColumn?.dataKey === this.columnKey
        ? (sortedColumn?.sortDirection ?? 1) < 0
          ? -1
          : 1
        : providerDirection;
    const collation = provider._sortCollation;
    const result = this.sorter.compare(
      a.ref,
      b.ref,
      direction,
      (x, y) => collation.compareString(1, x, y),
      isVisibleIn(provider.rowMap),
      pass.entries,
    );
    return result === null ? null : result * direction * providerDirection;
  }

  private decorateRow(
    tree: ItemTreeLike,
    index: number,
    div: HTMLElement,
  ): void {
    if (!div?.classList) {
      return;
    }
    clearGroupStyle(div);
    if (!this.isTreeActive(tree)) {
      return;
    }
    this.maybeAutoActivate(tree, div);
    if (!this.isGroupSorted(tree)) {
      return;
    }

    const row = tree.getRow(index);
    if (
      !row ||
      row.isObjectRow === false ||
      !(row.ref instanceof Zotero.Item)
    ) {
      return;
    }
    const topItem = row.level > 0 ? getTopLevelItem(row.ref) : row.ref;
    if (!topItem) {
      return;
    }

    const isVisible = isVisibleIn(tree.rowProvider?.rowMap);
    const parentID = this.sorter.getVisibleParentID(topItem.id, isVisible);
    let role: GroupRole | null = null;
    let rootID = topItem.id;
    if (parentID !== undefined) {
      role = "child";
      rootID = parentID;
    } else if (this.sorter.hasVisibleChildren(topItem.id, isVisible)) {
      // Attachments/notes of a volume keep the contour but no background
      role = row.level === 0 ? "parent" : "member";
    }
    if (role) {
      applyGroupStyle(div, role, rootID, this.settings.current, this.colors);
    }
  }

  /**
   * Dialog trees are switched to grouped sorting once, when first rendered
   * (their init is asynchronous and happens after the window load event).
   */
  private maybeAutoActivate(tree: ItemTreeLike, div: HTMLElement): void {
    if (tree.props?.id === MAIN_TREE_ID || this.autoActivated.has(tree)) {
      return;
    }
    this.autoActivated.add(tree);
    div.ownerGlobal?.setTimeout(() => {
      if (!this.destroyed && !this.activate(tree)) {
        ztoolkit.log(`Could not activate grouping in tree ${tree.props?.id}`);
      }
    });
  }
}
