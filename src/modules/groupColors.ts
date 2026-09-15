import { isHexColor, randomGroupColor } from "./core/groupOrder";
import { safeGetItem } from "./itemTypes";
import { SettingsStore } from "./settings";

/** Short, because bootstrap.js skips onShutdown() when Zotero quits. */
const SAVE_DELAY = 250;

/**
 * Random, persistent color per edited volume.
 *
 * Colors are stored in the `groupColors` preference as JSON, keyed by
 * `libraryID/itemKey` (stable across restarts and sync, unlike item IDs).
 */
export class GroupColors {
  private colors: Record<string, string> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private writing = false;

  /** Color for the volume with the given item ID, created on first use. */
  getColor(itemID: number): string | null {
    const item = safeGetItem(itemID);
    if (!item) {
      return null;
    }
    const colors = this.load();
    const key = `${item.libraryID}/${item.key}`;
    let color = colors[key];
    if (!isHexColor(color)) {
      color = randomGroupColor();
      colors[key] = color;
      this.scheduleSave();
    }
    return color;
  }

  /** Drop colors of deleted volumes. */
  forget(entries: Array<{ libraryID: number; key: string }>): void {
    const colors = this.load();
    let changed = false;
    for (const { libraryID, key } of entries) {
      const mapKey = `${libraryID}/${key}`;
      if (mapKey in colors) {
        delete colors[mapKey];
        changed = true;
      }
    }
    if (changed) {
      this.scheduleSave();
    }
  }

  /** Assign new colors to all volumes (on next render). */
  reset(): void {
    this.cancelSave();
    this.colors = {};
    this.save();
  }

  /**
   * Handle a change of the `groupColors` preference.
   *
   * @return true if the change came from outside this object (e.g. a manual
   *   edit), i.e. rendered colors may be outdated
   */
  onPreferenceChanged(): boolean {
    if (this.writing) {
      return false;
    }
    // Our own pending write wins; otherwise reload lazily.
    if (!this.saveTimer) {
      this.colors = null;
    }
    return true;
  }

  /** Write pending changes immediately (window unload, shutdown). */
  flush(): void {
    if (this.saveTimer) {
      this.cancelSave();
      this.save();
    }
  }

  private load(): Record<string, string> {
    if (!this.colors) {
      try {
        const parsed = JSON.parse(
          String(SettingsStore.getRaw("groupColors") || "{}"),
        );
        this.colors =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
      } catch {
        this.colors = {};
      }
    }
    return this.colors!;
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      return;
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, SAVE_DELAY);
  }

  private cancelSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private save(): void {
    this.writing = true;
    try {
      SettingsStore.setRaw("groupColors", JSON.stringify(this.colors ?? {}));
    } finally {
      this.writing = false;
    }
  }
}
