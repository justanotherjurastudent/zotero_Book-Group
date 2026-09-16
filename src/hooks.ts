import type { BookGroupServices } from "./addon";
import { registerGroupColumn, unregisterGroupColumn } from "./modules/column";
import { DIALOG_TREE_IDS, MAIN_TREE_ID } from "./modules/constants";
import { DialogIntegration } from "./modules/dialogIntegration";
import { GroupColors } from "./modules/groupColors";
import { GroupSorter } from "./modules/groupSorter";
import { initPreferencePane, registerPreferencePane } from "./modules/preferencePane";
import { RelationCache } from "./modules/relationCache";
import { SettingsStore, type SettingKey } from "./modules/settings";
import { applyCSSVariables, registerStylesheet, unregisterStylesheet } from "./modules/styles";
import { TreeIntegration } from "./modules/treeIntegration";
import { ViewMenu } from "./modules/viewMenu";
import { initLocale } from "./utils/locale";
import { warn } from "./utils/log";

async function onStartup() {
	await Promise.all([Zotero.initializationPromise, Zotero.unlockPromise, Zotero.uiReadyPromise]);

	initLocale();

	const settings = new SettingsStore();
	const relations = new RelationCache();
	const sorter = new GroupSorter(relations, settings);
	const colors = new GroupColors();
	const trees = new TreeIntegration(settings, sorter, colors);
	const dialogs = new DialogIntegration(trees, sorter, relations, settings, colors);
	const viewMenu = new ViewMenu(trees, settings);
	const services: BookGroupServices = {
		settings,
		relations,
		sorter,
		colors,
		trees,
		dialogs,
		viewMenu,
		observerIDs: [],
		prefObserverIDs: [],
		pendingRestore: false,
	};
	addon.data.services = services;

	registerPreferencePane();
	settings.register();
	settings.onChange((key) => onSettingChanged(key));

	trees.columnKey = registerGroupColumn(sorter);
	if (!trees.columnKey) {
		warn("sort column could not be registered");
	}

	// Sort keys depend on item fields; drop them before the item tree observer
	// (priority 50) re-sorts modified rows.
	const itemObserverID = Zotero.Notifier.registerObserver(
		{
			notify: (event: string, _type: string, ids: unknown[], extraData: any) => {
				sorter.invalidate();
				if (event === "delete") {
					colors.forget(
						ids
							.map((id) => extraData?.[id as number])
							.filter((data) => data && data.key),
					);
				}
			},
		},
		["item"],
		"bookgroup-items",
		39,
	);

	// After the item tree observer (priority 50) has updated rows or columns:
	// - removed rows are not re-sorted by Zotero, but contributions of a removed
	//   volume must move to their own position
	// - `itemtree` refreshes rebuild columns, e.g. restoring a persisted sort by
	//   the grouping column only once it has been registered
	const viewObserverID = Zotero.Notifier.registerObserver(
		{
			notify: (event: string, type: string) => {
				if (type === "itemtree" && services.pendingRestore) {
					restoreGroupSort(services);
				}
				if (
					type !== "item" ||
					event === "delete" ||
					event === "trash" ||
					event === "remove"
				) {
					trees.scheduleResort();
				}
			},
		},
		["item", "collection-item", "itemtree"],
		"bookgroup-view",
		60,
	);
	services.observerIDs.push(itemObserverID, viewObserverID);

	// The creator sort key mirrors this Zotero preference
	services.prefObserverIDs.push(
		Zotero.Prefs.registerObserver("sortCreatorAsString", () => {
			sorter.invalidate();
			trees.scheduleResort();
		}),
	);

	relations.onChange(() => {
		sorter.invalidate();
		trees.refresh({ resort: true }).catch((e) => Zotero.logError(e));
		dialogs.refreshLists();
	});

	// Load relations first, so attaching windows sorts with a complete index
	await relations.init();
	for (const win of Zotero.getMainWindows()) {
		await onMainWindowLoad(win);
	}
	dialogs.register();

	// Re-apply grouping that was switched off by a previous shutdown
	if (SettingsStore.getRaw("restoreGroupSort")) {
		SettingsStore.setRaw("restoreGroupSort", false);
		services.pendingRestore = true;
		restoreGroupSort(services);
	}

	addon.data.initialized = true;
}

/**
 * Sort main trees by the grouping column again. Stays pending until it
 * succeeds (the column may not be part of the tree's columns yet).
 */
function restoreGroupSort(services: BookGroupServices): void {
	const { trees } = services;
	let done = true;
	trees.forEachTree((tree) => {
		if (tree.props?.id === MAIN_TREE_ID && trees.isTreeActive(tree)) {
			done = trees.activate(tree) && done;
		}
	});
	services.pendingRestore = !done;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
	const services = addon.data.services;
	if (!services) {
		return;
	}
	registerStylesheet(win, services.settings.current);
	services.trees.attach(win);
	services.viewMenu.attach(win);
	await services.trees.refresh({ resort: true });
}

async function onMainWindowUnload(win: Window): Promise<void> {
	const services = addon.data.services;
	if (!services) {
		return;
	}
	// onShutdown() is skipped when Zotero quits, so persist colors here
	services.colors.flush();
	services.viewMenu.detach(win);
	services.trees.detach(win);
	unregisterStylesheet(win);
}

function onShutdown(): void {
	const services = addon.data.services;
	if (services) {
		const { trees, dialogs, relations, settings, colors } = services;
		// Leave no tree sorted by a column that is about to disappear, but
		// remember the main view's state so a plugin update can restore it.
		// (Not reached on app quit: bootstrap.js returns early on APP_SHUTDOWN.)
		let mainGrouped = false;
		trees.forEachTree((tree) => {
			if (tree.props?.id === MAIN_TREE_ID && trees.isGroupSorted(tree)) {
				mainGrouped = true;
			}
			trees.deactivate(tree);
		});
		SettingsStore.setRaw("restoreGroupSort", mainGrouped);
		dialogs.unregister();
		for (const win of Zotero.getMainWindows()) {
			onMainWindowUnload(win);
		}
		for (const id of services.observerIDs) {
			Zotero.Notifier.unregisterObserver(id);
		}
		for (const id of services.prefObserverIDs) {
			Zotero.Prefs.unregisterObserver(id);
		}
		const columnKey = trees.columnKey;
		trees.destroy();
		relations.destroy();
		settings.unregister();
		colors.flush();
		unregisterGroupColumn(columnKey);
		addon.data.services = undefined;
	}
	ztoolkit.unregisterAll();
	addon.data.alive = false;
	// @ts-expect-error - Plugin instance is not typed
	delete Zotero[addon.data.config.addonInstance];
}

/**
 * Dispatch preference changes so that every change takes effect immediately.
 */
function onSettingChanged(key: SettingKey): void {
	const services = addon.data.services;
	if (!services) {
		return;
	}
	const { settings, trees, dialogs, sorter, colors } = services;
	const current = settings.current;
	const isDialogTree = (id: string) => (DIALOG_TREE_IDS as readonly string[]).includes(id);

	switch (key) {
		case "enable":
		case "citationDialog":
			// Enabling sorts affected trees by the grouping column; disabling
			// switches them back to title order and removes all decorations.
			trees.forEachTree((tree) => {
				if (key === "citationDialog" && !isDialogTree(tree.props?.id)) {
					return;
				}
				if (trees.isTreeActive(tree)) {
					trees.activate(tree);
				} else {
					trees.deactivate(tree);
				}
			});
			break;

		case "baseSort":
			sorter.invalidate();
			trees.refresh({ resort: true }).catch((e) => Zotero.logError(e));
			dialogs.refreshLists();
			return;

		case "indent":
		case "bgColor":
		case "contourColor":
			for (const win of Zotero.getMainWindows()) {
				applyCSSVariables(win, current);
			}
			dialogs.applyCSSVariables();
			return;

		case "groupColors":
			if (!colors.onPreferenceChanged()) {
				return; // our own write
			}
			break;
	}
	trees.refresh().catch((e) => Zotero.logError(e));
	dialogs.refreshLists();
}

async function onPrefsEvent(type: string, data: { [key: string]: any }) {
	if (type !== "load") {
		return;
	}
	initPreferencePane(data.window as Window, () => {
		const services = addon.data.services;
		if (!services) {
			return;
		}
		services.colors.reset();
		services.trees.refresh().catch((e) => Zotero.logError(e));
		services.dialogs.refreshLists();
	});
}

export default {
	onStartup,
	onShutdown,
	onMainWindowLoad,
	onMainWindowUnload,
	onPrefsEvent,
};
