import { BasicTool, unregister } from "zotero-plugin-toolkit";
import { config } from "../../package.json";

export { createZToolkit };

/**
 * Only the basic toolkit is used (logging, globals); the full ZoteroToolkit
 * would add UI helpers this plugin does not need.
 */
class BookGroupToolkit extends BasicTool {
	unregisterAll() {
		unregister(this);
	}
}

function createZToolkit() {
	const toolkit = new BookGroupToolkit();
	toolkit.basicOptions.log.prefix = `[${config.addonName}]`;
	toolkit.basicOptions.log.disableConsole = __env__ === "production";
	toolkit.basicOptions.api.pluginID = config.addonID;
	return toolkit;
}
