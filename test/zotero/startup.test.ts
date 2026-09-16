import { assert } from "chai";
import { config } from "../../package.json";

describe("startup", function () {
	it("should have plugin instance defined", function () {
		// @ts-expect-error - Plugin instance is not typed
		assert.isNotEmpty(Zotero[config.addonInstance]);
	});

	it("registers the preference pane", function () {
		const panes = (Zotero.PreferencePanes as any).pluginPanes as Array<{
			pluginID: string;
		}>;
		assert.isTrue(panes.some((pane) => pane.pluginID === config.addonID));
	});

	it("injects the stylesheet and CSS variables into the main window", function () {
		const doc = Zotero.getMainWindow().document;
		assert.isNotNull(doc.getElementById("bookgroup-stylesheet"));
		assert.equal(
			(doc.documentElement as HTMLElement).style.getPropertyValue("--bookgroup-indent"),
			"16px",
		);
	});

	it("logs no errors from the plugin", function () {
		const errors = (Zotero.getErrors(true) as string[]).filter((error) =>
			/bookgroup|book group/i.test(String(error)),
		);
		assert.deepEqual(errors, []);
	});
});
