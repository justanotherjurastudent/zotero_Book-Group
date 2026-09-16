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
	private _colors: Record<string, string> | null = null;
	private _saveTimer: ReturnType<typeof setTimeout> | null = null;
	private _writing = false;

	/**
	 * Color for the volume with the given item ID, created on first use.
	 *
	 * @param itemID The item ID to get the color for
	 * @return The assigned color or null
	 */
	getColor(itemID: number): string | null {
		const item = safeGetItem(itemID);
		if (!item) {
			return null;
		}
		const colors = this._load();
		const key = `${item.libraryID}/${item.key}`;
		let color = colors[key];
		if (!isHexColor(color)) {
			color = randomGroupColor();
			colors[key] = color;
			this._scheduleSave();
		}
		return color;
	}

	/**
	 * Drop colors of deleted volumes.
	 *
	 * @param entries The deleted items
	 */
	forget(entries: Array<{ libraryID: number; key: string }>): void {
		const colors = this._load();
		let changed = false;
		for (const { libraryID, key } of entries) {
			const mapKey = `${libraryID}/${key}`;
			if (mapKey in colors) {
				delete colors[mapKey];
				changed = true;
			}
		}
		if (changed) {
			this._scheduleSave();
		}
	}

	/**
	 * Assign new colors to all volumes (on next render).
	 */
	reset(): void {
		this._cancelSave();
		this._colors = {};
		this._save();
	}

	/**
	 * Handle a change of the `groupColors` preference.
	 *
	 * @return true if the change came from outside this object (e.g. a manual
	 *   edit), i.e. rendered colors may be outdated
	 */
	onPreferenceChanged(): boolean {
		if (this._writing) {
			return false;
		}
		// Our own pending write wins; otherwise reload lazily.
		if (!this._saveTimer) {
			this._colors = null;
		}
		return true;
	}

	/**
	 * Write pending changes immediately (window unload, shutdown).
	 */
	flush(): void {
		if (this._saveTimer) {
			this._cancelSave();
			this._save();
		}
	}

	private _load(): Record<string, string> {
		if (!this._colors) {
			try {
				const parsed = JSON.parse(String(SettingsStore.getRaw("groupColors") || "{}"));
				this._colors =
					parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
			} catch {
				this._colors = {};
			}
		}
		return this._colors!;
	}

	private _scheduleSave(): void {
		if (this._saveTimer) {
			return;
		}
		this._saveTimer = setTimeout(() => {
			this._saveTimer = null;
			this._save();
		}, SAVE_DELAY);
	}

	private _cancelSave(): void {
		if (this._saveTimer) {
			clearTimeout(this._saveTimer);
			this._saveTimer = null;
		}
	}

	private _save(): void {
		this._writing = true;
		try {
			SettingsStore.setRaw("groupColors", JSON.stringify(this._colors ?? {}));
		} finally {
			this._writing = false;
		}
	}
}
