import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { COLUMN_DATA_KEY, DIALOG_TREE_IDS, MAIN_TREE_ID } from "./constants";
import type { GroupSorter } from "./groupSorter";

const PAGE_PLACEHOLDER = "PAGE";

/**
 * Register the grouping sort column.
 *
 * The column is hidden by default (Zotero hides new columns without
 * `defaultIn` when built-in columns declare one, see ItemTree._getColumns())
 * and can be shown via the column picker's "More Columns" submenu. Sorting by
 * it activates grouping; sorting by any other column deactivates it.
 *
 * @return the namespaced dataKey, or null if registration failed
 */
export function registerGroupColumn(sorter: GroupSorter): string | null {
  // Resolve the localized page label once instead of for every row.
  // Fluent wraps arguments in Unicode isolation marks; strip them.
  const pageTemplate = getString("page-abbreviation", {
    args: { page: PAGE_PLACEHOLDER },
  }).replace(/[⁨⁩]/g, "");
  const pageLabel = (pages: string) =>
    pageTemplate.replace(PAGE_PLACEHOLDER, pages);

  const key = Zotero.ItemTreeManager.registerColumn({
    dataKey: COLUMN_DATA_KEY,
    label: getString("column-label"),
    pluginID: config.addonID,
    enabledTreeIDs: [MAIN_TREE_ID, ...DIALOG_TREE_IDS],
    showInColumnPicker: true,
    columnPickerSubMenu: true,
    zoteroPersist: ["width", "hidden", "sortDirection"],
    dataProvider: (item: Zotero.Item) => {
      try {
        return sorter.describe(item, pageLabel);
      } catch (e) {
        Zotero.logError(e as Error);
        return "";
      }
    },
  } as Parameters<typeof Zotero.ItemTreeManager.registerColumn>[0]);
  return typeof key === "string" ? key : null;
}

export function unregisterGroupColumn(key: string | null): void {
  if (key) {
    Zotero.ItemTreeManager.unregisterColumn(key);
  }
}
