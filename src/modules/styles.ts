import { config } from "../../package.json";
import { ALL_CSS_CLASSES, CSS_CLASSES, GROUP_COLOR_PROPERTY, STYLESHEET_ID } from "./constants";
import type { GroupColors } from "./groupColors";
import type { Settings } from "./settings";

/**
 * - parent: the edited volume row (background + contour)
 * - child: a contribution or one of its attachments/notes (indent + contour)
 * - member: an attachment/note of the volume (contour only)
 */
export type GroupRole = "parent" | "child" | "member";

const ROOT_PROPERTIES = ["--bookgroup-indent", "--bookgroup-bg-color", "--bookgroup-contour-color"];

/** Insert the plugin stylesheet into a window (idempotent). */
export function registerStylesheet(win: Window, settings: Settings): void {
	const doc = win.document;
	if (!doc.getElementById(STYLESHEET_ID)) {
		const link = doc.createElementNS("http://www.w3.org/1999/xhtml", "link");
		link.id = STYLESHEET_ID;
		link.setAttribute("rel", "stylesheet");
		link.setAttribute("type", "text/css");
		link.setAttribute("href", `chrome://${config.addonRef}/content/bookgroup.css`);
		doc.documentElement!.appendChild(link);
	}
	applyCSSVariables(win, settings);
}

export function unregisterStylesheet(win: Window): void {
	const doc = win.document;
	doc.getElementById(STYLESHEET_ID)?.remove();
	for (const property of ROOT_PROPERTIES) {
		(doc.documentElement as HTMLElement).style.removeProperty(property);
	}
}

/** Push indentation and fixed colors to the window as CSS variables. */
export function applyCSSVariables(win: Window, settings: Settings): void {
	const style = (win.document.documentElement as HTMLElement).style;
	style.setProperty("--bookgroup-indent", `${settings.indent}px`);
	style.setProperty("--bookgroup-bg-color", settings.bgColor);
	style.setProperty("--bookgroup-contour-color", settings.contourColor);
}

/** Remove all grouping classes/properties from a (possibly recycled) node. */
export function clearGroupStyle(element: HTMLElement): void {
	element.classList.remove(...ALL_CSS_CLASSES);
	element.style.removeProperty(GROUP_COLOR_PROPERTY);
}

/**
 * Apply grouping classes to a row or list node. Classes carry all static
 * styling; only the random group color is set as a custom property.
 */
export function applyGroupStyle(
	element: HTMLElement,
	role: GroupRole,
	rootID: number,
	settings: Settings,
	colors: GroupColors,
): void {
	if (role === "parent") {
		element.classList.add(CSS_CLASSES.parent);
	} else if (role === "child") {
		element.classList.add(CSS_CLASSES.child);
	}
	if (settings.contourEnabled) {
		element.classList.add(CSS_CLASSES.contour);
	}
	if (role === "parent" && settings.bgEnabled) {
		element.classList.add(CSS_CLASSES.background);
	}
	if (settings.colorMode === "random" && (settings.contourEnabled || settings.bgEnabled)) {
		const color = colors.getColor(rootID);
		if (color) {
			element.style.setProperty(GROUP_COLOR_PROPERTY, color);
		}
	}
}
