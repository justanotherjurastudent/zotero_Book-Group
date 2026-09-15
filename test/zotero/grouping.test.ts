import { assert } from "chai";
import { config } from "../../package.json";

/* Integration tests, run inside Zotero by `npm test` (zotero-plugin-scaffold). */

function getServices() {
  // @ts-expect-error - Plugin instance is not typed
  return Zotero[config.addonInstance].api.getServices();
}

/** Diagnostic state shown when a wait times out (set per suite). */
let describeState: () => string = () => "timed out";

async function waitFor(condition: () => boolean, timeout = 10000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      // The scaffold reporter shows expected/received, not error messages
      assert.equal(describeState(), "condition met");
    }
    await Zotero.Promise.delay(50);
  }
}

async function createItem(type: string, fields: Record<string, string>) {
  const item = new Zotero.Item(type as _ZoteroTypes.Item.ItemType);
  item.libraryID = Zotero.Libraries.userLibraryID;
  for (const [field, value] of Object.entries(fields)) {
    item.setField(field as _ZoteroTypes.Item.ItemField, value);
  }
  await item.saveTx();
  return item;
}

async function relate(a: Zotero.Item, b: Zotero.Item) {
  a.addRelatedItem(b);
  await a.saveTx();
  b.addRelatedItem(a);
  await b.saveTx();
}

describe("Book Group", function () {
  this.timeout(30000);

  let volume: Zotero.Item;
  let chapterLate: Zotero.Item;
  let chapterEarly: Zotero.Item;
  let standalone: Zotero.Item;

  before(async function () {
    volume = await createItem("book", {
      title: "BG Zeta Handbuch",
      date: "2020",
    });
    chapterLate = await createItem("bookSection", {
      title: "BG Alpha Kapitel",
      pages: "200-230",
    });
    chapterEarly = await createItem("bookSection", {
      title: "BG Omega Kapitel",
      pages: "15-40",
    });
    standalone = await createItem("journalArticle", {
      title: "BG Beta Aufsatz",
    });
    await relate(volume, chapterLate);
    await relate(chapterEarly, volume);

    const { relations } = getServices();
    await waitFor(
      () =>
        relations.index.getParentID(chapterLate.id) === volume.id &&
        relations.index.getParentID(chapterEarly.id) === volume.id,
    );
  });

  after(async function () {
    for (const item of [volume, chapterLate, chapterEarly, standalone]) {
      if (item && Zotero.Items.get(item.id)) {
        await item.eraseTx();
      }
    }
  });

  it("detects relations between volume and contributions", function () {
    const { relations } = getServices();
    assert.deepEqual(
      [...relations.index.getChildIDs(volume.id)].sort(),
      [chapterLate.id, chapterEarly.id].sort(),
    );
    assert.isUndefined(relations.index.getParentID(standalone.id));
  });

  it("registers the grouping column", function () {
    assert.isString(getServices().trees.columnKey);
  });

  it("orders contributions after their volume by first page", function () {
    const { sorter } = getServices();
    const collation = Zotero.getLocaleCollation();
    const items = [chapterLate, standalone, chapterEarly, volume];
    items.sort((a, b) =>
      sorter.compare(
        a,
        b,
        1,
        (x: string, y: string) => collation.compareString(1, x, y),
        () => true,
      )!,
    );
    const ids = items.map((item) => item.id);
    const volumeIndex = ids.indexOf(volume.id);
    assert.deepEqual(ids.slice(volumeIndex, volumeIndex + 3), [
      volume.id,
      chapterEarly.id,
      chapterLate.id,
    ]);
  });

  describe("main item tree", function () {
    // Titles are chosen so that plain title order differs from grouped order:
    // "BG Alpha Kapitel" (late chapter) < "BG Beta Aufsatz" < "BG Omega Kapitel"
    // (early chapter) < "BG Zeta Handbuch" (volume)
    let tree: any;
    let win: _ZoteroTypes.MainWindow;

    const isGrouped = () => {
      const ids: number[] = tree.getSortedItems(true);
      const index = ids.indexOf(volume.id);
      return (
        index >= 0 &&
        ids[index + 1] === chapterEarly.id &&
        ids[index + 2] === chapterLate.id
      );
    };
    const rowElement = (item: Zotero.Item) =>
      win.document.getElementById(
        `${tree.id}-row-${tree.getRowIndexByID(item.id)}`,
      );

    before(async function () {
      win = Zotero.getMainWindow();
      await win.ZoteroPane.collectionsView.selectLibrary(
        Zotero.Libraries.userLibraryID,
      );
      tree = win.ZoteroPane.itemsView;
      await tree.waitForLoad();
      describeState = () => {
        const ids: number[] = tree.getSortedItems(true);
        const name = (id: number) =>
          ({
            [volume.id]: "volume",
            [chapterEarly.id]: "early",
            [chapterLate.id]: "late",
            [standalone.id]: "standalone",
          })[id] ?? String(id);
        return JSON.stringify({
          sortField: tree.getSortField(),
          direction: tree.getSortDirection(),
          order: ids.map(name),
          earlyClasses: rowElement(chapterEarly)?.className,
          attached: getServices().trees.windows?.size,
        });
      };
    });

    after(function () {
      getServices().trees.deactivate(tree);
    });

    it("is not grouped when sorted by title", async function () {
      const { trees } = getServices();
      trees.deactivate(tree);
      await waitFor(() => tree.getSortField() === "title");
      await waitFor(() => !isGrouped());
    });

    it("groups and decorates rows when sorted by the grouping column", async function () {
      const { trees } = getServices();
      assert.isTrue(trees.activate(tree));
      await waitFor(isGrouped);
      await waitFor(
        () =>
          !!rowElement(chapterEarly)?.classList.contains("bookgroup-child") &&
          !!rowElement(volume)?.classList.contains("bookgroup-parent"),
      );
      assert.isFalse(
        rowElement(standalone)?.classList.contains("bookgroup-child") ?? false,
      );
    });

    it("removes grouping when the plugin is disabled", async function () {
      const prefKey = `${config.prefsPrefix}.enable`;
      Zotero.Prefs.set(prefKey, false, true);
      try {
        await waitFor(() => tree.getSortField() === "title");
        await waitFor(
          () =>
            !rowElement(chapterEarly)?.classList.contains("bookgroup-child"),
        );
      } finally {
        Zotero.Prefs.set(prefKey, true, true);
      }
      // Enabling again re-activates grouping immediately
      await waitFor(isGrouped);
    });

    it("keeps groups intact next to standalone notes", async function () {
      // Title "BG Mitte" sorts between the chapters and the volume; mixing
      // title and group order used to make the comparator intransitive.
      const note = new Zotero.Item("note");
      note.libraryID = Zotero.Libraries.userLibraryID;
      note.setNote("<p>BG Mitte Notiz</p>");
      await note.saveTx();
      try {
        await getServices().trees.refresh({ resort: true });
        await waitFor(isGrouped);
      } finally {
        await note.eraseTx();
      }
    });

    it("keeps the group together when the volume is re-sorted alone", async function () {
      // A field change makes Zotero sort only the modified row (_sort(ids))
      volume.setField("title", "BG Aaa Handbuch");
      await volume.saveTx();
      await waitFor(isGrouped);
      volume.setField("title", "BG Zeta Handbuch");
      await volume.saveTx();
      await waitFor(isGrouped);
    });

    it("keeps the volume first when sorting descending", async function () {
      const { trees } = getServices();
      assert.isTrue(trees.activate(tree));
      // Set the direction explicitly: Columns.toggleSort() derives it from the
      // table's own column state, which may lag behind programmatic changes
      const index = tree
        ._getColumns()
        .findIndex((column: any) => column.dataKey === trees.columnKey);
      await tree._handleColumnSort(index, -1);
      try {
        assert.equal(tree._sortedColumn.sortDirection, -1);
        await waitFor(isGrouped);
        // Groups are reversed: the untitled-year article now precedes the volume
        const ids: number[] = tree.getSortedItems(true);
        assert.isBelow(ids.indexOf(standalone.id), ids.indexOf(volume.id));
      } finally {
        await tree._handleColumnSort(index, 1);
      }
    });

    it("decorates rows again after the window is re-attached", async function () {
      const { trees } = getServices();
      trees.detach(win);
      await waitFor(
        () => !rowElement(chapterEarly)?.classList.contains("bookgroup-child"),
      );
      assert.isTrue(trees.attach(win));
      // No sort toggle here: attach() alone must re-render with the patch
      await waitFor(
        () => !!rowElement(chapterEarly)?.classList.contains("bookgroup-child"),
      );
    });
  });

  describe("column header context menu", function () {
    let tree: any;
    let win: _ZoteroTypes.MainWindow;

    // Same popup ItemTree._displayColumnPickerMenu() builds on right-click
    const buildPicker = () => {
      const popup = win.document.createXULElement("menupopup");
      popup.id = "zotero-column-picker";
      tree.buildColumnPickerMenu(popup);
      return popup;
    };

    before(async function () {
      win = Zotero.getMainWindow();
      tree = win.ZoteroPane.itemsView;
      await tree.waitForLoad();
    });

    after(function () {
      getServices().trees.deactivate(tree);
    });

    it("offers grouping before the secondary sort submenu", async function () {
      const { trees } = getServices();
      trees.deactivate(tree);
      await waitFor(() => tree.getSortField() === "title");

      const popup = buildPicker();
      const item = popup.querySelector("#bookgroup-column-picker-sort");
      assert.isNotNull(item);
      assert.notEqual(item!.getAttribute("checked"), "true");
      assert.equal(
        item!.nextElementSibling?.getAttribute("anonid"),
        "zotero-column-picker-sort-menu",
      );

      item!.dispatchEvent(new win.Event("command"));
      await waitFor(() => trees.isGroupSorted(tree));
      assert.equal(
        buildPicker()
          .querySelector("#bookgroup-column-picker-sort")!
          .getAttribute("checked"),
        "true",
      );
    });

    it("is not added to View → Columns or when disabled", function () {
      const other = win.document.createXULElement("menupopup");
      tree.buildColumnPickerMenu(other);
      assert.isNull(other.querySelector("#bookgroup-column-picker-sort"));

      const prefKey = `${config.prefsPrefix}.enable`;
      Zotero.Prefs.set(prefKey, false, true);
      try {
        assert.isNull(
          buildPicker().querySelector("#bookgroup-column-picker-sort"),
        );
      } finally {
        Zotero.Prefs.set(prefKey, true, true);
      }
    });
  });

  describe("dialogs", function () {
    const fakeTree = (id: string, href: string) => ({
      props: { id },
      domEl: { ownerGlobal: { location: { href } } },
    });

    it("recognizes the Edit Bibliography item tree by ID and URL", function () {
      const { trees } = getServices();
      assert.isTrue(
        trees.isDialogTree(
          fakeTree(
            "select-items-dialog",
            "chrome://zotero/content/integration/editBibliographyDialog.xhtml",
          ),
        ),
      );
      assert.isTrue(
        trees.isDialogTree(
          fakeTree(
            "citationDialog",
            "chrome://zotero/content/integration/citationDialog.xhtml",
          ),
        ),
      );
    });

    it("ignores generic Select Items dialogs", function () {
      const { trees } = getServices();
      assert.isFalse(
        trees.isDialogTree(
          fakeTree(
            "select-items-dialog",
            "chrome://zotero/content/selectItemsDialog.xhtml",
          ),
        ),
      );
    });
  });

  describe("contribution linked to several volumes", function () {
    const created: Zotero.Item[] = [];
    const editor = (lastName: string) => ({
      firstName: "Eva",
      lastName,
      creatorType: "editor" as const,
    });

    async function createWithEditors(
      type: string,
      fields: Record<string, string>,
      editors: string[],
    ) {
      const item = new Zotero.Item(type as _ZoteroTypes.Item.ItemType);
      item.libraryID = Zotero.Libraries.userLibraryID;
      for (const [field, value] of Object.entries(fields)) {
        item.setField(field as _ZoteroTypes.Item.ItemField, value);
      }
      item.setCreators(editors.map(editor));
      await item.saveTx();
      created.push(item);
      return item;
    }

    after(async function () {
      for (const item of created) {
        if (Zotero.Items.get(item.id)) {
          await item.eraseTx();
        }
      }
    });

    it("prefers the volume with the same title and a shared editor", async function () {
      const { relations } = getServices();
      // Lower ID, but different title → must not win
      const otherVolume = await createWithEditors(
        "book",
        { title: "BG Festschrift" },
        ["Weber"],
      );
      const matchingVolume = await createWithEditors(
        "book",
        { title: "BG Kommentar" },
        ["Weber", "Klein"],
      );
      const section = await createWithEditors(
        "bookSection",
        { title: "BG Paragraph 1", bookTitle: "BG Kommentar" },
        ["Klein"],
      );
      await relate(otherVolume, section);
      await relate(matchingVolume, section);
      await waitFor(
        () => relations.index.getParentID(section.id) === matchingVolume.id,
      );
    });

    it("falls back to the lowest item ID without a match", async function () {
      const { relations } = getServices();
      const first = await createWithEditors("book", { title: "BG Band A" }, [
        "Adler",
      ]);
      const second = await createWithEditors("book", { title: "BG Band B" }, [
        "Berg",
      ]);
      const section = await createWithEditors(
        "bookSection",
        { title: "BG Beitrag", bookTitle: "BG Band C" },
        ["Adler"],
      );
      await relate(second, section);
      await relate(first, section);
      await waitFor(
        () =>
          relations.index.getParentID(section.id) ===
          Math.min(first.id, second.id),
      );
    });
  });

  describe("preference pane", function () {
    let prefsWindow: Window | null = null;

    after(function () {
      prefsWindow?.close();
    });

    it("offers a palette color picker bound to the preference", async function () {
      const pane = (Zotero.PreferencePanes as any).pluginPanes.find(
        (p: { pluginID: string }) => p.pluginID === config.addonID,
      );
      (Zotero.Utilities.Internal as any).openPreferences(pane.id);
      await waitFor(() => {
        prefsWindow = Services.wm.getMostRecentWindow("zotero:pref");
        return !!prefsWindow?.document.querySelector(
          "#bookgroup-pref-bg-color button",
        );
      });
      const picker = prefsWindow!.document.getElementById(
        "bookgroup-pref-bg-color",
      ) as any;
      const prefKey = `${config.prefsPrefix}.bgColor`;
      const initial = Zotero.Prefs.get(prefKey, true);

      assert.equal(picker.colors.length, 10);
      const button = picker.querySelector("button") as HTMLElement;
      const rect = button.getBoundingClientRect();
      assert.equal(Math.round(rect.width), Math.round(rect.height));

      try {
        picker.openPopup();
        const tiles = picker.querySelectorAll(".grid-tile");
        assert.equal(tiles.length, 10);
        (tiles[6] as HTMLElement).click();
        await waitFor(() => Zotero.Prefs.get(prefKey, true) === "#ff6666");
      } finally {
        Zotero.Prefs.set(prefKey, initial, true);
      }
      await waitFor(() => picker.color.toLowerCase() === initial);
    });
  });

  // Runs last: nested describes execute after the outer `it` blocks
  describe("cache maintenance", function () {
    it("drops deleted contributions from the cache immediately", async function () {
      const { relations } = getServices();
      const id = chapterLate.id;
      await chapterLate.eraseTx();
      assert.isUndefined(relations.index.getParentID(id));
      assert.notInclude([...relations.index.getChildIDs(volume.id)], id);
    });
  });
});
