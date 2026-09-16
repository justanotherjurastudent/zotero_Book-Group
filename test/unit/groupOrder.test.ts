import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	compareGroupEntries,
	compareKeyTuples,
	hslToHex,
	isHexColor,
	parsePageStart,
	parseRoman,
	randomGroupColor,
	type GroupEntry,
} from "../../src/modules/core/groupOrder.ts";

const collator = new Intl.Collator("de", {
	numeric: true,
	sensitivity: "base",
});
const compare = (a: string, b: string) => collator.compare(a, b);

function entry(partial: Partial<GroupEntry> & { id: number }): GroupEntry {
	return {
		rootID: partial.id,
		rootKey: [],
		rank: 0,
		pageStart: null,
		title: "",
		...partial,
	};
}

/**
 * Mimic Zotero's ItemTreeRowProvider._compareRows(): field result × direction.
 */
function sortLikeZotero(entries: GroupEntry[], direction: number): number[] {
	return [...entries]
		.sort((a, b) => compareGroupEntries(a, b, direction, compare) * direction)
		.map((e) => e.id);
}

describe("parsePageStart", () => {
	it("reads the first Arabic page", () => {
		assert.equal(parsePageStart("12-34"), 12);
		assert.equal(parsePageStart("S. 101–120"), 101);
		assert.equal(parsePageStart("7 f."), 7);
		assert.equal(parsePageStart(" 305 "), 305);
	});

	it("places Roman front matter before Arabic pages", () => {
		const roman = parsePageStart("xii–xv");
		assert.ok(roman !== null && roman < 1);
		assert.ok(parsePageStart("iv")! < parsePageStart("xii")!);
	});

	it("prefers an explicit page marker over other numbers", () => {
		assert.equal(parsePageStart("Bd. 2, S. 45-60"), 45);
		assert.equal(parsePageStart("vol. 3, pp. 17–30"), 17);
		const frontMatter = parsePageStart("S. xii");
		assert.ok(frontMatter !== null && frontMatter < 1);
	});

	it("does not read single letters like 'c.' as Roman numerals", () => {
		assert.equal(parsePageStart("c. 12"), 12);
		assert.equal(parsePageStart("d 5"), 5);
	});

	it("returns null for empty or non-numeric values", () => {
		assert.equal(parsePageStart(""), null);
		assert.equal(parsePageStart(null), null);
		assert.equal(parsePageStart("passim"), null);
	});

	it("parses Roman numerals", () => {
		assert.equal(parseRoman("xiv"), 14);
		assert.equal(parseRoman("mcmxc"), 1990);
		assert.equal(parseRoman("abc"), null);
	});
});

describe("compareKeyTuples", () => {
	it("compares component-wise and sorts empty values last", () => {
		assert.ok(compareKeyTuples(["Adam", "2020"], ["Adam", "2021"], compare) < 0);
		assert.ok(compareKeyTuples(["", "2020"], ["Zeller"], compare) > 0);
		assert.equal(compareKeyTuples(["a"], ["A"], compare), 0);
	});

	it("uses natural number order of the collation", () => {
		assert.ok(compareKeyTuples(["Band 2"], ["Band 10"], compare) < 0);
	});
});

describe("compareGroupEntries", () => {
	// Volume "Müller" (id 1) with two chapters; standalone "Adam" and "Zeller".
	const volume = entry({ id: 1, rootKey: ["Müller", "2020", "Handbuch"] });
	const chapterLate = entry({
		id: 2,
		rootID: 1,
		rootKey: volume.rootKey,
		rank: 1,
		pageStart: 200,
		title: "Kapitel B",
	});
	const chapterEarly = entry({
		id: 3,
		rootID: 1,
		rootKey: volume.rootKey,
		rank: 1,
		pageStart: 15,
		title: "Kapitel A",
	});
	const chapterNoPages = entry({
		id: 4,
		rootID: 1,
		rootKey: volume.rootKey,
		rank: 1,
		title: "Anhang",
	});
	const adam = entry({ id: 5, rootKey: ["Adam", "2019", "Aufsatz"] });
	const zeller = entry({ id: 6, rootKey: ["Zeller", "2018", "Monographie"] });
	const all = [zeller, chapterNoPages, chapterLate, adam, volume, chapterEarly];

	it("places contributions directly after their volume, ascending", () => {
		assert.deepEqual(sortLikeZotero(all, 1), [5, 1, 3, 2, 4, 6]);
	});

	it("reverses groups but keeps the volume first when descending", () => {
		assert.deepEqual(sortLikeZotero(all, -1), [6, 1, 3, 2, 4, 5]);
	});

	it("keeps two volumes with identical keys apart", () => {
		const volumeA = entry({ id: 10, rootKey: ["Same"] });
		const volumeB = entry({ id: 20, rootKey: ["Same"] });
		const childA = entry({ id: 11, rootID: 10, rootKey: ["Same"], rank: 1 });
		const childB = entry({ id: 21, rootID: 20, rootKey: ["Same"], rank: 1 });
		assert.deepEqual(sortLikeZotero([childB, volumeB, childA, volumeA], 1), [10, 11, 20, 21]);
	});

	it("is antisymmetric and returns 0 only for the same item", () => {
		for (const a of all) {
			for (const b of all) {
				const ab = compareGroupEntries(a, b, 1, compare);
				const ba = compareGroupEntries(b, a, 1, compare);
				assert.equal(Math.sign(ab) + Math.sign(ba), 0);
				assert.equal(ab === 0, a.id === b.id);
			}
		}
	});
});

describe("colors", () => {
	it("converts HSL to hex", () => {
		assert.equal(hslToHex(0, 100, 50), "#ff0000");
		assert.equal(hslToHex(120, 100, 50), "#00ff00");
		assert.equal(hslToHex(240, 100, 50), "#0000ff");
	});

	it("creates valid random colors", () => {
		let seed = 0.1;
		const random = () => (seed = (seed * 9301 + 0.49297) % 1);
		for (let i = 0; i < 20; i++) {
			assert.ok(isHexColor(randomGroupColor(random)));
		}
		assert.equal(isHexColor("#12345g"), false);
	});
});
