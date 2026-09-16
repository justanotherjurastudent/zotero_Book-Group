import {
	compareGroupEntries,
	compareWithinGroup,
	parsePageStart,
	type GroupEntry,
	type StringCompare,
} from "./core/groupOrder";
import { safeGetItem } from "./itemTypes";
import type { RelationCache } from "./relationCache";
import type { SettingsStore } from "./settings";

/** Returns true if the item with the given ID is part of the current view. */
export type VisibilityCheck = (id: number) => boolean;

/**
 * Computes grouped sort order for Zotero items.
 *
 * Base keys of group roots are cached across sorts and dropped whenever items,
 * relations or the base-sort preference change.
 */
export class GroupSorter {
	private _rootKeys = new Map<number, string[]>();

	constructor(
		private readonly _relations: RelationCache,
		private readonly _settings: SettingsStore,
	) {}

	invalidate(): void {
		this._rootKeys.clear();
	}

	/**
	 * Parent volume of an item, if it is a linked contribution and the volume
	 * is visible in the current view.
	 *
	 * @param itemID ID of the item
	 * @param isVisible Function to check if an ID is visible
	 * @return The parent ID or undefined
	 */
	getVisibleParentID(itemID: number, isVisible: VisibilityCheck): number | undefined {
		const parentID = this._relations.index.getParentID(itemID);
		return parentID !== undefined && isVisible(parentID) ? parentID : undefined;
	}

	/**
	 * True if at least one linked contribution is visible.
	 *
	 * @param itemID ID of the item
	 * @param isVisible Function to check if an ID is visible
	 * @return True if at least one visible child exists
	 */
	hasVisibleChildren(itemID: number, isVisible: VisibilityCheck): boolean {
		return this._relations.index.getChildIDs(itemID).some(isVisible);
	}

	/**
	 * Build the ordering entry of an item, or null for non-item rows
	 * (collections/searches in the trash).
	 *
	 * Every item gets an entry – standalone notes and attachments act as their
	 * own group root – so that all item comparisons use one consistent ordering.
	 *
	 * @param item The item to get the entry for
	 * @param isVisible Function to check if an ID is visible
	 * @return The group entry or null
	 */
	getEntry(item: unknown, isVisible: VisibilityCheck): GroupEntry | null {
		if (!(item instanceof Zotero.Item)) {
			return null;
		}
		const parentID = item.isRegularItem()
			? this.getVisibleParentID(item.id, isVisible)
			: undefined;
		const parent = parentID !== undefined ? safeGetItem(parentID) : null;
		const root = parent ?? item;
		return {
			id: item.id,
			rootID: root.id,
			rootKey: this._getRootKey(root),
			rank: parent ? 1 : 0,
			pageStart: parent ? parsePageStart(item.getField("pages") as string) : null,
			title: Zotero.Items.getSortTitle(item.getDisplayTitle()),
		};
	}

	/**
	 * Compare two items in grouped order.
	 *
	 * @param a First item to compare
	 * @param b Second item to compare
	 * @param direction Sort direction
	 * @param compareStrings String comparison function
	 * @param isVisible Function to check if an ID is visible
	 * @param entryCache Optional cache for group entries
	 * @return comparison result for Zotero's `_compareField()` contract, or
	 *   null if neither row is an item (caller falls back to title order)
	 */
	compare(
		a: unknown,
		b: unknown,
		direction: number,
		compareStrings: StringCompare,
		isVisible: VisibilityCheck,
		entryCache?: Map<number, GroupEntry | null>,
	): number | null {
		const entryA = this._getCachedEntry(a, isVisible, entryCache);
		const entryB = this._getCachedEntry(b, isVisible, entryCache);
		if (!entryA && !entryB) {
			return null;
		}
		// Non-item rows (trash collections/searches) form one consistent block:
		// before all items when ascending, after them when descending
		if (!entryA || !entryB) {
			return entryA ? 1 : -1;
		}
		return compareGroupEntries(entryA, entryB, direction, compareStrings);
	}

	/**
	 * Order contributions of one volume (used by the citation list layout).
	 *
	 * @param ids Array of contribution item IDs
	 * @param compareStrings String comparison function
	 * @param isVisible Function to check if an ID is visible
	 * @return Sorted array of IDs
	 */
	sortContributions(
		ids: number[],
		compareStrings: StringCompare,
		isVisible: VisibilityCheck,
	): number[] {
		const entries = ids
			.map((id) => this.getEntry(safeGetItem(id), isVisible))
			.filter((entry): entry is GroupEntry => entry !== null);
		entries.sort((a, b) => compareWithinGroup(a, b, compareStrings));
		return entries.map((entry) => entry.id);
	}

	/**
	 * Text shown in the (normally hidden) sort column.
	 *
	 * @param item The item to describe
	 * @param pageLabel Function to format page numbers
	 * @return Description string
	 */
	describe(item: Zotero.Item, pageLabel: (page: string) => string): string {
		const index = this._relations.index;
		const parentID = index.getParentID(item.id);
		if (parentID !== undefined) {
			const parent = safeGetItem(parentID);
			if (parent) {
				const pages = String(item.getField("pages") || "");
				const title = parent.getDisplayTitle();
				return pages ? `${title} › ${pageLabel(pages)}` : title;
			}
		}
		return index.isParent(item.id) ? item.getDisplayTitle() : "";
	}

	private _getCachedEntry(
		item: unknown,
		isVisible: VisibilityCheck,
		cache?: Map<number, GroupEntry | null>,
	): GroupEntry | null {
		const id = item instanceof Zotero.Item ? item.id : undefined;
		if (cache && id !== undefined) {
			const cached = cache.get(id);
			if (cached !== undefined) {
				return cached;
			}
		}
		const entry = this.getEntry(item, isVisible);
		if (cache && id !== undefined) {
			cache.set(id, entry);
		}
		return entry;
	}

	private _getRootKey(item: Zotero.Item): string[] {
		let key = this._rootKeys.get(item.id);
		if (!key) {
			key = this._computeRootKey(item);
			this._rootKeys.set(item.id, key);
		}
		return key;
	}

	/**
	 * Base key of a group root, mirroring how Zotero's item tree derives its
	 * creator, year and title sort values (ItemTreeRowProvider._compareField /
	 * _getSortField in itemTree.js).
	 */
	private _computeRootKey(item: Zotero.Item): string[] {
		const creatorProp = Zotero.Prefs.get("sortCreatorAsString")
			? "firstCreator"
			: "sortCreator";
		const creatorValue =
			(item as unknown as Record<string, string>)[creatorProp] ||
			(item.getField("firstCreator") as string) ||
			"";
		const creator = Zotero.Items.getSortTitle(creatorValue);

		let year = String(item.getField("date", true, true) || "").substring(0, 4);
		if (year === "0000") {
			year = "";
		}
		const title = Zotero.Items.getSortTitle(item.getDisplayTitle());

		return this._settings.current.baseSort === "title"
			? [title, creator, year]
			: [creator, year, title];
	}
}
