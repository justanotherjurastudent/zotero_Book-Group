import { CONTAINER_TYPES, CONTRIBUTION_TYPES } from "./constants";
import type { ItemKind } from "./core/relationIndex";

let typeKinds: Map<number, ItemKind> | null = null;

/**
 * Map itemTypeID → kind for the grouping types. Encyclopedias are recorded
 * as `book` in Zotero, so encyclopedia articles group under books. Type names
 * missing from the running schema are skipped instead of failing.
 */
export function getTypeKinds(): Map<number, ItemKind> {
  if (!typeKinds) {
    const kinds = new Map<number, ItemKind>();
    const add = (names: readonly string[], kind: ItemKind) => {
      for (const name of names) {
        const id = Zotero.ItemTypes.getID(name);
        if (typeof id === "number") {
          kinds.set(id, kind);
        }
      }
    };
    add(CONTAINER_TYPES, "container");
    add(CONTRIBUTION_TYPES, "contribution");
    typeKinds = kinds;
  }
  return typeKinds;
}

/**
 * `Zotero.Items.get()` throws `UnloadedDataException` for IDs that exist but
 * are not loaded (xpcom/data/dataObjects.js, DataObjects.prototype.get), and
 * returns false for unknown IDs. Rendering and sorting must never throw, so
 * both cases map to null here.
 */
export function safeGetItem(id: number): Zotero.Item | null {
  try {
    return (Zotero.Items.get(id) as Zotero.Item | false) || null;
  } catch {
    return null;
  }
}
