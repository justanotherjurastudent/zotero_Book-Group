import { config } from "../../package.json";
import { isHexColor } from "./core/groupOrder";

export type BaseSort = "creator" | "title";
export type ColorMode = "fixed" | "random";

export interface Settings {
  enable: boolean;
  citationDialog: boolean;
  baseSort: BaseSort;
  indent: number;
  bgEnabled: boolean;
  bgColor: string;
  contourEnabled: boolean;
  contourColor: string;
  colorMode: ColorMode;
}

/**
 * Preference keys: user settings, persisted group colors (both observed) and
 * the internal restoreGroupSort flag (not observed).
 */
export type SettingKey = keyof Settings | "groupColors" | "restoreGroupSort";

const OBSERVED_KEYS: SettingKey[] = [
  "enable",
  "citationDialog",
  "baseSort",
  "indent",
  "bgEnabled",
  "bgColor",
  "contourEnabled",
  "contourColor",
  "colorMode",
  "groupColors",
];

const DEFAULT_COLOR = "#4f8ff7";

function prefName(key: SettingKey): string {
  return `${config.prefsPrefix}.${key}`;
}

function readPref(key: SettingKey): unknown {
  return Zotero.Prefs.get(prefName(key), true);
}

/**
 * Cached, validated view of the plugin preferences.
 *
 * Rendering code reads settings for every visible row, so values are cached
 * and only re-read when a preference observer fires.
 */
export class SettingsStore {
  private cached: Settings | null = null;
  private observerIDs: symbol[] = [];
  private listeners = new Set<(key: SettingKey) => void>();

  get current(): Settings {
    if (!this.cached) {
      this.cached = SettingsStore.read();
    }
    return this.cached;
  }

  static read(): Settings {
    const indent = parseInt(String(readPref("indent")), 10);
    const bgColor = readPref("bgColor");
    const contourColor = readPref("contourColor");
    return {
      enable: readPref("enable") !== false,
      citationDialog: readPref("citationDialog") !== false,
      baseSort: readPref("baseSort") === "title" ? "title" : "creator",
      indent: Number.isFinite(indent) ? Math.min(Math.max(indent, 0), 64) : 16,
      bgEnabled: readPref("bgEnabled") !== false,
      bgColor: isHexColor(bgColor) ? bgColor : DEFAULT_COLOR,
      contourEnabled: readPref("contourEnabled") !== false,
      contourColor: isHexColor(contourColor) ? contourColor : DEFAULT_COLOR,
      colorMode: readPref("colorMode") === "random" ? "random" : "fixed",
    };
  }

  static getRaw(key: SettingKey): unknown {
    return readPref(key);
  }

  static setRaw(key: SettingKey, value: string | number | boolean): void {
    Zotero.Prefs.set(prefName(key), value, true);
  }

  /** Subscribe to preference changes. @return unsubscribe function */
  onChange(listener: (key: SettingKey) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  register(): void {
    if (this.observerIDs.length) {
      return;
    }
    for (const key of OBSERVED_KEYS) {
      const id = Zotero.Prefs.registerObserver(
        prefName(key),
        () => {
          this.cached = null;
          for (const listener of this.listeners) {
            try {
              listener(key);
            } catch (e) {
              Zotero.logError(e as Error);
            }
          }
        },
        true,
      );
      this.observerIDs.push(id);
    }
  }

  unregister(): void {
    for (const id of this.observerIDs) {
      Zotero.Prefs.unregisterObserver(id);
    }
    this.observerIDs = [];
    this.listeners.clear();
  }
}
