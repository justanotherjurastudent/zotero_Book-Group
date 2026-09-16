import { getString } from "../utils/locale";
import type { ItemTreeLike, TreeIntegration } from "./treeIntegration";

/** Class of every menu element the plugin inserts (for cleanup). */
export const MENU_CLASS = "bookgroup-menu";

/**
 * Create the "Group by Edited Volume" checkbox for a tree, used in
 * View → Sort By and in the column header context menu.
 */
export function createGroupSortMenuItem(
	doc: Document,
	tree: ItemTreeLike,
	trees: TreeIntegration,
): Element {
	const item = doc.createXULElement("menuitem");
	item.classList.add(MENU_CLASS);
	item.setAttribute("type", "checkbox");
	item.setAttribute("label", getString("menu-sort-by-group", "label"));
	item.setAttribute("checked", String(trees.isGroupSorted(tree)));
	item.addEventListener("command", () => {
		if (trees.isGroupSorted(tree)) {
			trees.deactivate(tree);
		} else {
			trees.activate(tree);
		}
	});
	return item;
}

/** Separator carrying the plugin's menu class. */
export function createMenuSeparator(doc: Document): Element {
	const separator = doc.createXULElement("menuseparator");
	separator.classList.add(MENU_CLASS);
	return separator;
}
