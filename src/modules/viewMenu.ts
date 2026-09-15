import {
  MENU_CLASS,
  createGroupSortMenuItem,
  createMenuSeparator,
} from "./groupSortMenu";
import type { SettingsStore } from "./settings";
import type { TreeIntegration, ItemTreeLike } from "./treeIntegration";

/**
 * Adds "Group by Edited Volume" to View → Sort By in the main window.
 *
 * Zotero rebuilds that popup on every `popupshowing` via the inline handler
 * on `#sort-submenu` (zoteroPane.xhtml → ItemTreeMenuBar.handleItemTreeMenuShowing,
 * which calls menupopup.replaceChildren()). Hidden columns are not listed
 * there (ItemTree.buildSortMenu filters them), so the entry is appended by a
 * listener on the same <menu> element, which runs after the inline handler.
 */
export class ViewMenu {
  private handlers = new Map<Window, (event: Event) => void>();

  constructor(
    private readonly trees: TreeIntegration,
    private readonly settings: SettingsStore,
  ) {}

  attach(win: Window): void {
    const menu = win.document.getElementById("sort-submenu");
    if (!menu || this.handlers.has(win)) {
      return;
    }
    const handler = (event: Event) => {
      const popup = menu.querySelector(":scope > menupopup");
      if (popup && event.target === popup) {
        this.populate(win, popup);
      }
    };
    menu.addEventListener("popupshowing", handler);
    this.handlers.set(win, handler);
  }

  detach(win: Window): void {
    const handler = this.handlers.get(win);
    if (!handler) {
      return;
    }
    this.handlers.delete(win);
    const menu = win.document.getElementById("sort-submenu");
    menu?.removeEventListener("popupshowing", handler);
    for (const element of win.document.querySelectorAll(`.${MENU_CLASS}`)) {
      element.remove();
    }
  }

  private populate(win: Window, popup: Element): void {
    for (const element of popup.querySelectorAll(`.${MENU_CLASS}`)) {
      element.remove();
    }
    const scope = win as unknown as {
      ZoteroPane?: { itemsView?: ItemTreeLike };
    };
    const tree = scope.ZoteroPane?.itemsView;
    if (!this.settings.current.enable || !tree || !this.trees.columnKey) {
      return;
    }
    const doc = win.document;
    const item = createGroupSortMenuItem(doc, tree, this.trees);
    item.id = "bookgroup-menuitem-sort";
    popup.append(createMenuSeparator(doc), item);
  }
}
