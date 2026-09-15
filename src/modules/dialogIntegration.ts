import { ALL_CSS_CLASSES, DIALOG_URLS } from "./constants";
import type { GroupColors } from "./groupColors";
import type { GroupSorter } from "./groupSorter";
import type { RelationCache } from "./relationCache";
import type { SettingsStore } from "./settings";
import {
  applyCSSVariables,
  applyGroupStyle,
  clearGroupStyle,
  registerStylesheet,
  unregisterStylesheet,
} from "./styles";
import type { SortCollation, TreeIntegration } from "./treeIntegration";

interface DialogState {
  observer: MutationObserver | null;
  onUnload: () => void;
}

/**
 * Integration with "Add/Edit Citation" and "Edit Bibliography".
 *
 * - Library mode / bibliography dialog: item trees are handled by
 *   TreeIntegration (same patches as the main window, per dialog window).
 * - Citation dialog list mode: results are plain `.item` nodes rendered by
 *   Layout.refreshItemsList() (integration/citationDialog.js), which replaces
 *   the children of `#list-layout .search-items` on every refresh. A
 *   MutationObserver on that container regroups the nodes afterwards; no
 *   dialog function is patched, so citation insertion itself is untouched.
 */
export class DialogIntegration {
  private dialogs = new Map<Window, DialogState>();
  private windowListener: object | null = null;
  private destroyed = false;

  constructor(
    private readonly trees: TreeIntegration,
    private readonly sorter: GroupSorter,
    private readonly relations: RelationCache,
    private readonly settings: SettingsStore,
    private readonly colors: GroupColors,
  ) {}

  register(): void {
    if (this.windowListener) {
      return;
    }
    this.destroyed = false;
    this.windowListener = {
      onOpenWindow: (xulWindow: any) => {
        const win = xulWindow.docShell?.domWindow as Window | undefined;
        win?.addEventListener("load", () => this.handleWindow(win), {
          once: true,
        });
      },
      onCloseWindow: () => {},
    };
    Services.wm.addListener(this.windowListener as nsIWindowMediatorListener);

    // Dialogs that were already open when the plugin started
    const getEnumerator = Services.wm.getEnumerator as unknown as (
      type: string | null,
    ) => Iterable<Window>;
    const open = getEnumerator.call(Services.wm, null);
    for (const win of open) {
      if (win.document?.readyState === "complete") {
        this.handleWindow(win);
      }
    }
  }

  unregister(): void {
    // Load listeners of dialogs still opening may fire later
    this.destroyed = true;
    if (this.windowListener) {
      Services.wm.removeListener(
        this.windowListener as nsIWindowMediatorListener,
      );
      this.windowListener = null;
    }
    for (const win of [...this.dialogs.keys()]) {
      this.detach(win);
    }
  }

  /** Re-apply CSS variables in all dialogs. */
  applyCSSVariables(): void {
    for (const win of this.dialogs.keys()) {
      applyCSSVariables(win, this.settings.current);
    }
  }

  /** Regroup list-mode results in all dialogs. */
  refreshLists(): void {
    for (const win of this.dialogs.keys()) {
      this.groupList(win);
    }
  }

  private handleWindow(win: Window): void {
    const href = win.location?.href ?? "";
    if (
      this.destroyed ||
      this.dialogs.has(win) ||
      !DIALOG_URLS.some((url) => href.startsWith(url))
    ) {
      return;
    }
    registerStylesheet(win, this.settings.current);
    this.trees.attach(win);

    const container = win.document.querySelector("#list-layout .search-items");
    const observer = container
      ? new win.MutationObserver(() => this.groupList(win))
      : null;
    observer?.observe(container!, { childList: true });
    const onUnload = () => this.detach(win);
    win.addEventListener("unload", onUnload, { once: true });
    this.dialogs.set(win, { observer, onUnload });
  }

  private detach(win: Window): void {
    const state = this.dialogs.get(win);
    if (!state) {
      return;
    }
    this.dialogs.delete(win);
    state.observer?.disconnect();
    this.trees.detach(win);
    if (!Components.utils.isDeadWrapper(win) && !win.closed) {
      win.removeEventListener("unload", state.onUnload);
      const selector = ALL_CSS_CLASSES.map(
        (name) => `#list-layout .${name}`,
      ).join(", ");
      for (const element of win.document.querySelectorAll<HTMLElement>(
        selector,
      )) {
        clearGroupStyle(element);
      }
      unregisterStylesheet(win);
    }
  }

  /**
   * Move contributions directly after their volume within each result section
   * and mark both. Keyboard navigation and range selection in the dialog use
   * DOM order, so they follow the new order automatically.
   *
   * Runs after Layout.refreshItemsList() has already focused a node and
   * pre-selected the first item (markPreSelected), so both are carried over.
   */
  private groupList(win: Window): void {
    if (this.destroyed) {
      return;
    }
    const doc = win.document;
    const firstItemSelector = "#list-layout .item:not([disabled])";
    const focused = doc.activeElement as HTMLElement | null;
    const firstBefore = doc.querySelector<HTMLElement>(firstItemSelector);
    const preSelected =
      !!firstBefore?.classList.contains("current") &&
      doc.querySelectorAll("#list-layout .item.selected").length <= 1;

    this.groupContainers(doc);

    const firstAfter = doc.querySelector<HTMLElement>(firstItemSelector);
    if (
      preSelected &&
      firstBefore &&
      firstAfter &&
      firstBefore !== firstAfter
    ) {
      firstBefore.classList.remove("current", "selected");
      firstAfter.classList.add("current", "selected");
      (
        win as unknown as { listLayout?: { updateSelectedItems?(): void } }
      ).listLayout?.updateSelectedItems?.();
    }
    if (focused?.isConnected && doc.activeElement !== focused) {
      focused.focus();
    }
  }

  private groupContainers(doc: Document): void {
    const settings = this.settings.current;
    const active = settings.enable && settings.citationDialog;
    const index = this.relations.index;
    const collation = Zotero.getLocaleCollation() as unknown as SortCollation;
    const compare = (a: string, b: string) => collation.compareString(1, a, b);

    for (const container of doc.querySelectorAll(
      "#list-layout .itemsContainer",
    )) {
      const nodes = [...container.children].filter(
        (node): node is HTMLElement => node.classList.contains("item"),
      );
      nodes.forEach(clearGroupStyle);
      // The collapsible "selected items" deck is laid out as a stack
      if (!active || container.closest(".section.expandable")) {
        continue;
      }

      const byID = new Map<number, HTMLElement>();
      for (const node of nodes) {
        const id = Number(node.getAttribute("itemID"));
        if (Number.isInteger(id) && !byID.has(id)) {
          byID.set(id, node);
        }
      }
      const isVisible = (id: number) => byID.has(id);

      const ordered: HTMLElement[] = [];
      const placed = new Set<HTMLElement>();
      for (const node of nodes) {
        if (placed.has(node)) {
          continue;
        }
        const id = Number(node.getAttribute("itemID"));
        const parentID = index.getParentID(id);
        if (parentID !== undefined && byID.has(parentID)) {
          continue; // placed together with its volume
        }
        ordered.push(node);
        placed.add(node);

        const childIDs = index.getChildIDs(id).filter(isVisible);
        if (!childIDs.length) {
          continue;
        }
        applyGroupStyle(node, "parent", id, settings, this.colors);
        for (const childID of this.sorter.sortContributions(
          childIDs,
          compare,
          isVisible,
        )) {
          const child = byID.get(childID)!;
          if (!placed.has(child)) {
            applyGroupStyle(child, "child", id, settings, this.colors);
            ordered.push(child);
            placed.add(child);
          }
        }
      }
      // Nodes that could not be placed (should not happen) keep their position
      for (const node of nodes) {
        if (!placed.has(node)) {
          ordered.push(node);
        }
      }
      // Move only misplaced nodes, keeping unaffected ones (and focus) in place
      const anchor = nodes[0]?.previousElementSibling ?? null;
      let previous: Element | null = anchor;
      for (const node of ordered) {
        const expected = previous
          ? previous.nextElementSibling
          : container.firstElementChild;
        if (expected !== node) {
          container.insertBefore(node, expected);
        }
        previous = node;
      }
    }
  }
}
