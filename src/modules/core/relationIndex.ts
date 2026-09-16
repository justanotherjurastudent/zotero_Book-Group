/**
 * Pure in-memory index of "edited volume → contribution" links.
 *
 * Contains no Zotero API calls so it can be unit-tested in Node.
 * The Zotero-facing loader lives in `../relationCache.ts`.
 */

/** A link between an edited volume (container) and one contribution. */
export interface GroupLink {
	containerID: number;
	contributionID: number;
	/**
	 * The contribution's volume title and at least one editor match the
	 * container (see matchesVolume). Only evaluated when a contribution is
	 * linked to several containers.
	 */
	metadataMatch?: boolean;
}

/** Title and editors used to pick a volume among several candidates. */
export interface VolumeMetadata {
	/** Container: its title. Contribution: its book/encyclopedia title. */
	volumeTitle: string;
	/** Normalized editor names (see creatorKey). */
	editors: string[];
}

/** Case-, whitespace- and Unicode-form-insensitive text for comparisons. */
export function normalizeText(value: string | null | undefined): string {
	return String(value ?? "")
		.normalize("NFC")
		.replace(/\s+/g, " ")
		.trim()
		.toLocaleLowerCase();
}

/** Comparable key of a person name; empty if the name is empty. */
export function creatorKey(creator: {
	firstName?: string | null;
	lastName?: string | null;
}): string {
	const lastName = normalizeText(creator.lastName);
	const firstName = normalizeText(creator.firstName);
	return lastName || firstName ? `${lastName}|${firstName}` : "";
}

/**
 * True if a contribution belongs to a volume by its metadata: the volume
 * title is equal and at least one editor appears in both items. This is what
 * Zotero's "Create Book Section" copies (title → Book Title, editors kept).
 */
export function matchesVolume(contribution: VolumeMetadata, container: VolumeMetadata): boolean {
	const title = normalizeText(contribution.volumeTitle);
	if (!title || title !== normalizeText(container.volumeTitle)) {
		return false;
	}
	const editors = new Set(container.editors.filter(Boolean));
	return contribution.editors.some((editor) => editor && editors.has(editor));
}

/** IDs of contributions that are linked to more than one container. */
export function findAmbiguousContributions(links: Iterable<GroupLink>): number[] {
	const containers = new Map<number, Set<number>>();
	for (const { containerID, contributionID } of links) {
		let set = containers.get(contributionID);
		if (!set) {
			set = new Set();
			containers.set(contributionID, set);
		}
		set.add(containerID);
	}
	return [...containers]
		.filter(([, set]) => set.size > 1)
		.map(([contributionID]) => contributionID);
}

/**
 * Set `metadataMatch` on all links of the given contributions.
 *
 * @param metadata metadata of contributions and containers by item ID;
 *   missing entries count as "no match"
 */
export function markMetadataMatches(
	links: GroupLink[],
	contributionIDs: Iterable<number>,
	metadata: ReadonlyMap<number, VolumeMetadata>,
): void {
	const ambiguous = new Set(contributionIDs);
	for (const link of links) {
		if (!ambiguous.has(link.contributionID)) {
			continue;
		}
		const contribution = metadata.get(link.contributionID);
		const container = metadata.get(link.containerID);
		link.metadataMatch =
			!!contribution && !!container && matchesVolume(contribution, container);
	}
}

export type ItemKind = "container" | "contribution";

/** Minimal description of a candidate item, as loaded from the database. */
export interface CandidateItem {
	id: number;
	libraryID: number;
	key: string;
	kind: ItemKind;
}

/** One `dc:relation` row: `subjectID` declares a relation to `object`. */
export interface RelationRow {
	subjectID: number;
	objectLibraryID: number;
	objectKey: string;
}

/**
 * Derive container/contribution links from relation rows.
 *
 * Only direct relations between a container and a contribution of the same
 * library count. Relations may be declared on either side (Zotero normally
 * stores both directions); duplicates collapse into one link.
 */
export function resolveLinks(
	candidates: Iterable<CandidateItem>,
	rows: Iterable<RelationRow>,
): GroupLink[] {
	const byID = new Map<number, CandidateItem>();
	const byLibraryKey = new Map<string, CandidateItem>();
	for (const item of candidates) {
		byID.set(item.id, item);
		byLibraryKey.set(`${item.libraryID}/${item.key}`, item);
	}

	const seen = new Set<string>();
	const links: GroupLink[] = [];
	for (const row of rows) {
		const subject = byID.get(row.subjectID);
		if (!subject || subject.libraryID !== row.objectLibraryID) {
			continue;
		}
		const object = byLibraryKey.get(`${row.objectLibraryID}/${row.objectKey}`);
		if (!object || object.kind === subject.kind) {
			continue;
		}
		const link =
			subject.kind === "container"
				? { containerID: subject.id, contributionID: object.id }
				: { containerID: object.id, contributionID: subject.id };
		const dedupeKey = `${link.containerID}:${link.contributionID}`;
		if (!seen.has(dedupeKey)) {
			seen.add(dedupeKey);
			links.push(link);
		}
	}
	return links;
}

/**
 * Bidirectional lookup structure with O(1) access in both directions.
 *
 * A contribution linked to several containers is assigned to a container
 * whose metadata matches (`metadataMatch`); if none or several match, the
 * lowest item ID among them wins, so the result is deterministic and
 * independent of row order.
 */
export class RelationIndex {
	private _childToParent = new Map<number, number>();
	private _parentToChildren = new Map<number, number[]>();

	constructor(links: Iterable<GroupLink> = []) {
		this.rebuild(links);
	}

	/**
	 * Replace the whole index with the given links.
	 *
	 * @param links The links to rebuild from
	 * @return true if any contribution → volume assignment changed
	 */
	rebuild(links: Iterable<GroupLink>): boolean {
		const childToParent = new Map<number, number>();
		const parentMatches = new Map<number, boolean>();
		for (const { containerID, contributionID, metadataMatch } of links) {
			if (containerID === contributionID) {
				continue;
			}
			const match = !!metadataMatch;
			const current = childToParent.get(contributionID);
			const currentMatch = parentMatches.get(contributionID) ?? false;
			const better =
				current === undefined ||
				(match && !currentMatch) ||
				(match === currentMatch && containerID < current);
			if (better) {
				childToParent.set(contributionID, containerID);
				parentMatches.set(contributionID, match);
			}
		}

		const parentToChildren = new Map<number, number[]>();
		for (const [childID, parentID] of childToParent) {
			let children = parentToChildren.get(parentID);
			if (!children) {
				children = [];
				parentToChildren.set(parentID, children);
			}
			children.push(childID);
		}
		for (const children of parentToChildren.values()) {
			children.sort((a, b) => a - b);
		}

		let changed = childToParent.size !== this._childToParent.size;
		if (!changed) {
			for (const [childID, parentID] of childToParent) {
				if (this._childToParent.get(childID) !== parentID) {
					changed = true;
					break;
				}
			}
		}

		this._childToParent = childToParent;
		this._parentToChildren = parentToChildren;
		return changed;
	}

	/**
	 * Remove items (e.g. after deletion) from both sides of the index.
	 *
	 * @return true if the index changed
	 */
	removeItems(ids: Iterable<number>): boolean {
		let changed = false;
		for (const id of ids) {
			const parentID = this._childToParent.get(id);
			if (parentID !== undefined) {
				this._childToParent.delete(id);
				const siblings = this._parentToChildren.get(parentID);
				if (siblings) {
					const remaining = siblings.filter((childID) => childID !== id);
					if (remaining.length) {
						this._parentToChildren.set(parentID, remaining);
					} else {
						this._parentToChildren.delete(parentID);
					}
				}
				changed = true;
			}
			const children = this._parentToChildren.get(id);
			if (children) {
				for (const childID of children) {
					this._childToParent.delete(childID);
				}
				this._parentToChildren.delete(id);
				changed = true;
			}
		}
		return changed;
	}

	getParentID(childID: number): number | undefined {
		return this._childToParent.get(childID);
	}

	getChildIDs(parentID: number): readonly number[] {
		return this._parentToChildren.get(parentID) ?? [];
	}

	isChild(id: number): boolean {
		return this._childToParent.has(id);
	}

	isParent(id: number): boolean {
		return this._parentToChildren.has(id);
	}

	has(id: number): boolean {
		return this.isChild(id) || this.isParent(id);
	}

	/** Map<parentID, childIDs> view, as required by the specification. */
	get parents(): ReadonlyMap<number, readonly number[]> {
		return this._parentToChildren;
	}

	get linkCount(): number {
		return this._childToParent.size;
	}
}
