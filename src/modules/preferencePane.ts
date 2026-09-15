import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { isHexColor } from "./core/groupOrder";
import { SettingsStore, type SettingKey } from "./settings";

/** Colors offered by the pickers (first entry is the default color). */
export const COLOR_PALETTE = [
  "#4f8ff7",
  "#2ea8e5",
  "#009980",
  "#5fb236",
  "#e0b400",
  "#ff8c19",
  "#ff6666",
  "#a6507b",
  "#a28ae5",
  "#999999",
] as const;

const COLOR_PICKER_SCRIPT = "chrome://zotero/content/elements/colorPicker.js";

/** Zotero's <color-picker> custom element (elements/colorPicker.js). */
interface ColorPickerElement extends XULElement {
  color: string;
  colors: string[];
  colorLabels: string[];
}

/** Register the preference pane (Zotero removes it on plugin shutdown). */
export function registerPreferencePane(): void {
  Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${config.addonRef}/content/icons/favicon.svg`,
    stylesheets: [`chrome://${config.addonRef}/content/preferences.css`],
  } as Parameters<typeof Zotero.PreferencePanes.register>[0]);
}

/**
 * Wire up the dynamic parts of the pane. Most values are bound through
 * `preference="…"` attributes and synced by Zotero's preferences.js; the
 * color pickers have no such binding and are synced here.
 *
 * @param onResetColors called when "Assign new random colors" is clicked
 */
export function initPreferencePane(
  win: Window,
  onResetColors: () => void,
): void {
  const doc = win.document;
  const byID = <T extends Element>(suffix: string) =>
    doc.getElementById(`${config.addonRef}-pref-${suffix}`) as T | null;

  const indent = byID<HTMLInputElement>("indent");
  const indentValue = byID<HTMLElement>("indent-value");
  const bgEnabled = byID<XUL.Checkbox>("bg-enabled");
  const contourEnabled = byID<XUL.Checkbox>("contour-enabled");
  const colorMode = byID<XUL.RadioGroup>("color-mode");
  const resetColors = byID<XUL.Button>("reset-colors");
  if (!indent || !bgEnabled || !contourEnabled || !colorMode) {
    return;
  }

  const bgColor = setupColorPicker(win, byID("bg-color"), "bgColor");
  const contourColor = setupColorPicker(
    win,
    byID("contour-color"),
    "contourColor",
  );

  const update = () => {
    const random = colorMode.value === "random";
    if (indentValue) {
      indentValue.textContent = `${indent.value} px`;
    }
    setPickerDisabled(bgColor, !bgEnabled.checked || random);
    setPickerDisabled(contourColor, !contourEnabled.checked || random);
    if (resetColors) {
      resetColors.disabled = !random;
    }
  };

  indent.addEventListener("input", update);
  for (const element of [indent, bgEnabled, contourEnabled, colorMode]) {
    element.addEventListener("syncfrompreference", update);
    element.addEventListener("command", update);
  }
  resetColors?.addEventListener("command", onResetColors);
  // Zotero syncs preference values in a setTimeout after insertion
  win.setTimeout(update);
}

/**
 * Turn a <color-picker> placeholder into a palette picker bound to a color
 * preference. The element is not registered in the preferences window, so
 * its script is loaded on demand (as tagColorChooser.xhtml does).
 */
function setupColorPicker(
  win: Window,
  element: Element | null,
  key: Extract<SettingKey, "bgColor" | "contourColor">,
): ColorPickerElement | null {
  if (!element) {
    return null;
  }
  try {
    if (!win.customElements.get("color-picker")) {
      Services.scriptloader.loadSubScript(COLOR_PICKER_SCRIPT, win);
    }
  } catch (e) {
    Zotero.logError(e as Error);
    return null;
  }

  const picker = element as ColorPickerElement;
  const labels = getString("color-names")
    .split(",")
    .map((label) => label.trim());
  picker.setAttribute("cols", "5");
  picker.colors = [...COLOR_PALETTE];
  picker.colorLabels = COLOR_PALETTE.map((color, i) => labels[i] || color);

  const readPref = () => {
    const value = SettingsStore.getRaw(key);
    return isHexColor(value) ? value.toLowerCase() : COLOR_PALETTE[0];
  };
  // Set only after the element is upgraded: its attributeChangedCallback
  // expects the button that connectedCallback inserts.
  picker.color = readPref();

  // The picker fires no event; it only updates its `color` attribute.
  const mutationObserver = new win.MutationObserver(() => {
    const color = picker.color.toLowerCase();
    if (isHexColor(color) && color !== readPref()) {
      SettingsStore.setRaw(key, color);
    }
  });
  mutationObserver.observe(picker, {
    attributes: true,
    attributeFilter: ["color"],
  });

  const prefObserverID = Zotero.Prefs.registerObserver(
    `${config.prefsPrefix}.${key}`,
    () => {
      const color = readPref();
      if (picker.color.toLowerCase() !== color) {
        picker.color = color;
      }
    },
    true,
  );
  win.addEventListener(
    "unload",
    () => {
      mutationObserver.disconnect();
      Zotero.Prefs.unregisterObserver(prefObserverID);
    },
    { once: true },
  );
  return picker;
}

/**
 * The picker's own `disabled` setter does not reach its button
 * (colorPicker.js observes no `disabled` attribute), so set it directly.
 */
function setPickerDisabled(
  picker: ColorPickerElement | null,
  disabled: boolean,
): void {
  const button = picker?.querySelector("button");
  if (button) {
    button.disabled = disabled;
  }
}
