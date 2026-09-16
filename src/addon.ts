import { config } from "../package.json";
import hooks from "./hooks";
import type { DialogIntegration } from "./modules/dialogIntegration";
import type { GroupColors } from "./modules/groupColors";
import type { GroupSorter } from "./modules/groupSorter";
import type { RelationCache } from "./modules/relationCache";
import type { SettingsStore } from "./modules/settings";
import type { TreeIntegration } from "./modules/treeIntegration";
import type { ViewMenu } from "./modules/viewMenu";
import { createZToolkit } from "./utils/ztoolkit";

/** Runtime services, created in hooks.onStartup(). */
export interface BookGroupServices {
	settings: SettingsStore;
	relations: RelationCache;
	sorter: GroupSorter;
	colors: GroupColors;
	trees: TreeIntegration;
	dialogs: DialogIntegration;
	viewMenu: ViewMenu;
	/** Zotero.Notifier observer IDs to unregister on shutdown. */
	observerIDs: string[];
	/** Zotero.Prefs observer IDs (Zotero's own prefs) to unregister. */
	prefObserverIDs: symbol[];
	/** Grouping of the main tree still has to be restored after an update. */
	pendingRestore: boolean;
}

class Addon {
	public data: {
		alive: boolean;
		config: typeof config;
		env: "development" | "production";
		initialized?: boolean;
		ztoolkit: ZToolkit;
		locale?: {
			current: any;
		};
		services?: BookGroupServices;
	};
	public hooks: typeof hooks;
	/** Public API, e.g. for tests or other plugins. */
	public api: {
		getServices: () => BookGroupServices | undefined;
	};

	constructor() {
		this.data = {
			alive: true,
			config,
			env: __env__,
			initialized: false,
			ztoolkit: createZToolkit(),
		};
		this.hooks = hooks;
		this.api = {
			getServices: () => this.data.services,
		};
	}
}

export default Addon;
