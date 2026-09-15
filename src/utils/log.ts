import { config } from "../../package.json";

/**
 * Log a non-fatal problem (feature unavailable, patch not applied) to the
 * Zotero debug output at warning level.
 */
export function warn(message: string): void {
  Zotero.debug(`[${config.addonName}] ${message}`, 2);
}
