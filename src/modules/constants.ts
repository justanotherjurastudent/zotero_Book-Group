/** Item types that act as edited volume (group root). */
export const CONTAINER_TYPES = ["book"] as const;

/** Item types that are grouped below a container. */
export const CONTRIBUTION_TYPES = [
  "bookSection",
  "encyclopediaArticle",
] as const;

/** Unprefixed dataKey of the sort column; Zotero namespaces it on register. */
export const COLUMN_DATA_KEY = "groupSortKey";

/** Item tree of the main window (`ZoteroPane.itemsView`). */
export const MAIN_TREE_ID = "main";

/**
 * Item trees of the integration dialogs:
 * - `citationDialog`: "Add/Edit Citation" (integration/citationDialog.js)
 * - `select-items-dialog`: "Edit Bibliography". editBibliographyDialog.js
 *   sets `io.itemTreeID = "edit-bib-select-item-dialog"` only *after*
 *   `doLoad()` created the tree with `io.itemTreeID || "select-items-dialog"`
 *   (selectItemsDialog.js), so the effective ID is the generic one. Both are
 *   listed; TreeIntegration additionally checks the dialog URL, because the
 *   generic ID is shared by every "Select Items" dialog.
 */
export const DIALOG_TREE_IDS = [
  "citationDialog",
  "select-items-dialog",
  "edit-bib-select-item-dialog",
] as const;

/** Dialog documents the plugin integrates with. */
export const DIALOG_URLS = [
  "chrome://zotero/content/integration/citationDialog.xhtml",
  "chrome://zotero/content/integration/editBibliographyDialog.xhtml",
] as const;

export const CSS_CLASSES = {
  parent: "bookgroup-parent",
  child: "bookgroup-child",
  contour: "bookgroup-contour",
  background: "bookgroup-bg",
} as const;

export const ALL_CSS_CLASSES = Object.values(CSS_CLASSES);

/** Per-row custom property carrying the group's random color. */
export const GROUP_COLOR_PROPERTY = "--bookgroup-group-color";

export const STYLESHEET_ID = "bookgroup-stylesheet";

/** Delay before relation changes trigger a cache rebuild (ms). */
export const REBUILD_DELAY = 300;

/** Delay for coalescing re-sorts after view/column changes (ms). */
export const RESORT_DELAY = 50;
