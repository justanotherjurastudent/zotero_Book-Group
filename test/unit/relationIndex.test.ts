import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RelationIndex,
  creatorKey,
  findAmbiguousContributions,
  markMetadataMatches,
  matchesVolume,
  resolveLinks,
  type GroupLink,
  type VolumeMetadata,
  type CandidateItem,
  type RelationRow,
} from "../../src/modules/core/relationIndex.ts";

const book = (id: number, key: string, libraryID = 1): CandidateItem => ({
  id,
  key,
  libraryID,
  kind: "container",
});
const section = (id: number, key: string, libraryID = 1): CandidateItem => ({
  id,
  key,
  libraryID,
  kind: "contribution",
});
const rel = (
  subjectID: number,
  objectKey: string,
  objectLibraryID = 1,
): RelationRow => ({
  subjectID,
  objectKey,
  objectLibraryID,
});

describe("resolveLinks", () => {
  it("links a contribution to its volume from either side, without duplicates", () => {
    const links = resolveLinks(
      [book(1, "BOOK"), section(2, "SEC")],
      [rel(1, "SEC"), rel(2, "BOOK")],
    );
    assert.deepEqual(links, [{ containerID: 1, contributionID: 2 }]);
  });

  it("ignores relations between items of the same kind", () => {
    const links = resolveLinks(
      [book(1, "A"), book(2, "B"), section(3, "C"), section(4, "D")],
      [rel(1, "B"), rel(3, "D")],
    );
    assert.deepEqual(links, []);
  });

  it("ignores unknown objects and cross-library relations", () => {
    const links = resolveLinks(
      [book(1, "BOOK", 1), section(2, "SEC", 2)],
      [rel(1, "SEC", 2), rel(1, "MISSING", 1), rel(99, "BOOK", 1)],
    );
    assert.deepEqual(links, []);
  });

  it("resolves keys per library", () => {
    const links = resolveLinks(
      [book(1, "SAME", 1), section(2, "SEC", 1), book(3, "SAME", 2)],
      [rel(2, "SAME", 1)],
    );
    assert.deepEqual(links, [{ containerID: 1, contributionID: 2 }]);
  });
});

describe("volume metadata matching", () => {
  const editor = (lastName: string, firstName = "") =>
    creatorKey({ lastName, firstName });

  it("matches on equal volume title and a shared editor", () => {
    assert.equal(
      matchesVolume(
        {
          volumeTitle: "Handbuch  des Rechts",
          editors: [editor("Müller", "Anna")],
        },
        {
          volumeTitle: "handbuch des rechts",
          editors: [editor("Schmidt"), editor("müller", "anna")],
        },
      ),
      true,
    );
  });

  it("requires both title and editor", () => {
    const section = { volumeTitle: "Handbuch", editors: [editor("Müller")] };
    assert.equal(
      matchesVolume(section, {
        volumeTitle: "Anderes Buch",
        editors: [editor("Müller")],
      }),
      false,
    );
    assert.equal(
      matchesVolume(section, {
        volumeTitle: "Handbuch",
        editors: [editor("Schmidt")],
      }),
      false,
    );
    assert.equal(
      matchesVolume(
        { volumeTitle: "", editors: [] },
        { volumeTitle: "", editors: [] },
      ),
      false,
    );
  });

  it("finds contributions with several volumes", () => {
    assert.deepEqual(
      findAmbiguousContributions([
        { containerID: 1, contributionID: 10 },
        { containerID: 2, contributionID: 10 },
        { containerID: 1, contributionID: 11 },
      ]),
      [10],
    );
  });

  it("prefers the matching volume over the lowest item ID", () => {
    const links: GroupLink[] = [
      { containerID: 1, contributionID: 10 },
      { containerID: 5, contributionID: 10 },
      { containerID: 1, contributionID: 11 },
    ];
    markMetadataMatches(
      links,
      findAmbiguousContributions(links),
      new Map<number, VolumeMetadata>([
        [10, { volumeTitle: "Kommentar", editors: [editor("Weber")] }],
        [1, { volumeTitle: "Festschrift", editors: [editor("Weber")] }],
        [5, { volumeTitle: "Kommentar", editors: [editor("Weber")] }],
      ]),
    );
    const index = new RelationIndex(links);
    assert.equal(index.getParentID(10), 5);
    assert.equal(index.getParentID(11), 1);
  });

  it("falls back to the lowest item ID without a match", () => {
    const links: GroupLink[] = [
      { containerID: 7, contributionID: 10 },
      { containerID: 3, contributionID: 10 },
    ];
    markMetadataMatches(links, [10], new Map());
    assert.equal(new RelationIndex(links).getParentID(10), 3);
  });

  it("uses the lowest ID among several matching volumes", () => {
    const links: GroupLink[] = [
      { containerID: 9, contributionID: 10, metadataMatch: true },
      { containerID: 4, contributionID: 10, metadataMatch: true },
      { containerID: 2, contributionID: 10, metadataMatch: false },
    ];
    assert.equal(new RelationIndex(links).getParentID(10), 4);
  });
});

describe("RelationIndex", () => {
  it("provides lookups in both directions", () => {
    const index = new RelationIndex([
      { containerID: 10, contributionID: 12 },
      { containerID: 10, contributionID: 11 },
      { containerID: 20, contributionID: 21 },
    ]);
    assert.equal(index.getParentID(11), 10);
    assert.deepEqual(index.getChildIDs(10), [11, 12]);
    assert.equal(index.isParent(10), true);
    assert.equal(index.isChild(10), false);
    assert.equal(index.linkCount, 3);
    assert.deepEqual([...index.parents.keys()].sort(), [10, 20]);
  });

  it("assigns a contribution with several volumes to the lowest volume ID", () => {
    const index = new RelationIndex([
      { containerID: 30, contributionID: 5 },
      { containerID: 7, contributionID: 5 },
    ]);
    assert.equal(index.getParentID(5), 7);
    assert.deepEqual(index.getChildIDs(30), []);
  });

  it("removes deleted contributions without leaving orphans", () => {
    const index = new RelationIndex([
      { containerID: 1, contributionID: 2 },
      { containerID: 1, contributionID: 3 },
    ]);
    assert.equal(index.removeItems([2]), true);
    assert.deepEqual(index.getChildIDs(1), [3]);
    assert.equal(index.removeItems([3]), true);
    assert.equal(index.isParent(1), false);
    assert.equal(index.removeItems([3]), false);
  });

  it("removes a deleted volume and unlinks its contributions", () => {
    const index = new RelationIndex([
      { containerID: 1, contributionID: 2 },
      { containerID: 1, contributionID: 3 },
    ]);
    assert.equal(index.removeItems([1]), true);
    assert.equal(index.getParentID(2), undefined);
    assert.equal(index.getParentID(3), undefined);
    assert.equal(index.linkCount, 0);
  });

  it("reports whether a rebuild changed any assignment", () => {
    const index = new RelationIndex([{ containerID: 1, contributionID: 2 }]);
    assert.equal(index.rebuild([{ containerID: 1, contributionID: 2 }]), false);
    assert.equal(index.rebuild([{ containerID: 3, contributionID: 2 }]), true);
    assert.equal(
      index.rebuild([
        { containerID: 3, contributionID: 2 },
        { containerID: 3, contributionID: 4 },
      ]),
      true,
    );
    assert.equal(index.rebuild([]), true);
  });

  it("replaces all links on rebuild", () => {
    const index = new RelationIndex([{ containerID: 1, contributionID: 2 }]);
    index.rebuild([{ containerID: 5, contributionID: 6 }]);
    assert.equal(index.has(1), false);
    assert.equal(index.getParentID(6), 5);
  });
});
