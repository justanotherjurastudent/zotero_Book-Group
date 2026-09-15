/**
 * Pure ordering logic for grouped sorting. No Zotero API calls.
 */

/** String comparison function, e.g. a locale collation. */
export type StringCompare = (a: string, b: string) => number;

/**
 * Everything needed to position one top-level item in grouped order.
 *
 * - Edited volumes and standalone items are their own group root (rank 0).
 * - Contributions use their volume as root (rank 1) and are ordered inside
 *   the group by first page, then title.
 */
export interface GroupEntry {
  id: number;
  rootID: number;
  /** Base sort key of the group root (e.g. [creator, year, title]). */
  rootKey: readonly string[];
  rank: 0 | 1;
  pageStart: number | null;
  title: string;
}

const ROMAN_VALUES: Record<string, number> = {
  i: 1,
  v: 5,
  x: 10,
  l: 50,
  c: 100,
  d: 500,
  m: 1000,
};

/**
 * Parse a lowercase Roman numeral. Returns null for invalid input.
 */
export function parseRoman(input: string): number | null {
  if (!/^[ivxlcdm]+$/.test(input)) {
    return null;
  }
  let total = 0;
  for (let i = 0; i < input.length; i++) {
    const value = ROMAN_VALUES[input[i]];
    const next = ROMAN_VALUES[input[i + 1]] ?? 0;
    total += value < next ? -value : value;
  }
  return total > 0 ? total : null;
}

/** Offset that places Roman-numbered front matter before Arabic pages. */
const ROMAN_OFFSET = -100000;

/**
 * Extract the first page of a Zotero `pages` value.
 *
 * Examples: "12-34" → 12, "S. 101–120" → 101, "xii–xv" → front matter
 * (sorted before page 1), "" → null.
 */
export function parsePageStart(
  pages: string | null | undefined,
): number | null {
  if (!pages) {
    return null;
  }
  const text = String(pages).trim().toLowerCase();

  // An explicit page marker wins: "Bd. 2, S. 45" → 45
  const marked = text.match(
    /(?:^|[^a-z])(?:s|p|pp|seiten?|pages?)\.?\s*(\d+|[ivxlcdm]+)(?=$|[^a-z0-9])/,
  );
  if (marked) {
    const value = pageValue(marked[1]);
    if (value !== null) {
      return value;
    }
  }

  const arabic = text.match(/\d+/);
  const roman = text.match(/(?:^|[^a-z])([ivxlcdm]{2,}|[ivx])(?=$|[^a-z])/);
  if (arabic && (!roman || (roman.index ?? 0) > (arabic.index ?? 0))) {
    return parseInt(arabic[0], 10);
  }
  const romanValue = roman ? pageValue(roman[1]) : null;
  if (romanValue !== null) {
    return romanValue;
  }
  return arabic ? parseInt(arabic[0], 10) : null;
}

/** Numeric sort value of one page token (Arabic or Roman front matter). */
function pageValue(token: string): number | null {
  if (/^\d+$/.test(token)) {
    return parseInt(token, 10);
  }
  const roman = parseRoman(token);
  return roman === null ? null : ROMAN_OFFSET + roman;
}

/**
 * Compare two key tuples component by component; empty values sort last.
 */
export function compareKeyTuples(
  a: readonly string[],
  b: readonly string[],
  compare: StringCompare,
): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const valueA = a[i] ?? "";
    const valueB = b[i] ?? "";
    if (valueA === valueB) {
      continue;
    }
    if (valueA === "") {
      return 1;
    }
    if (valueB === "") {
      return -1;
    }
    const result = compare(valueA, valueB);
    if (result !== 0) {
      return result;
    }
  }
  return 0;
}

/**
 * Order two contributions of the same group: first page, then title, then ID.
 * Contributions without pages follow those with pages.
 */
export function compareWithinGroup(
  a: GroupEntry,
  b: GroupEntry,
  compare: StringCompare,
): number {
  if (a.rank !== b.rank) {
    return a.rank - b.rank;
  }
  if (a.pageStart !== b.pageStart) {
    if (a.pageStart === null) {
      return 1;
    }
    if (b.pageStart === null) {
      return -1;
    }
    return a.pageStart - b.pageStart;
  }
  return compare(a.title, b.title) || a.id - b.id;
}

/**
 * Compare two entries for the item tree's sort.
 *
 * Zotero's row provider multiplies a field comparison by the sort direction
 * (`_compareRows()` in itemTree.js). Groups follow that direction, but the
 * order inside a group must not flip (the volume always comes first), so the
 * inner result is pre-multiplied by `direction` to cancel it out.
 *
 * @param direction 1 (ascending) or -1 (descending), as used by Zotero
 * @return value to be multiplied by `direction` by the caller
 */
export function compareGroupEntries(
  a: GroupEntry,
  b: GroupEntry,
  direction: number,
  compare: StringCompare,
): number {
  if (a.id === b.id) {
    return 0;
  }
  const byRoot = compareKeyTuples(a.rootKey, b.rootKey, compare);
  if (byRoot !== 0) {
    return byRoot;
  }
  if (a.rootID !== b.rootID) {
    return a.rootID - b.rootID;
  }
  return compareWithinGroup(a, b, compare) * (direction < 0 ? -1 : 1);
}

/**
 * Convert HSL (h in degrees, s/l in percent) to a `#rrggbb` string.
 */
export function hslToHex(h: number, s: number, l: number): string {
  const saturation = s / 100;
  const lightness = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const value = lightness - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/**
 * Create a random but readable group color (distinct hue, medium tone).
 *
 * @param random source of randomness in [0, 1), injectable for tests
 */
export function randomGroupColor(random: () => number = Math.random): string {
  const hue = Math.floor(random() * 360);
  const saturation = 55 + Math.floor(random() * 20);
  const lightness = 45 + Math.floor(random() * 12);
  return hslToHex(hue, saturation, lightness);
}

/** True for a `#rrggbb` color string. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
