/**
 * ExportKmz.js
 * KMZ/WPML export class for DJI waypoint missions.
 * Constructor accepts status/error/exported callbacks and initialises the
 * IndexedDB-backed export folder handle.  All export methods are mixed in
 * from the ExportKmz* mixin files via Object.assign at the bottom of this file.
 *
 *  ExportKmzFolder  — folder persistence and selection
 *  ExportKmzBuilder — WPML XML / KMZ zip construction
 *  ExportKmzShare   — share sheet, download, export API surface
 */
class ExportKmz {
  constructor(options) {
    this.onStatus = options.onStatus || null;
    this.onExported = options.onExported || null;
    this.onError = options.onError || (message => alert(message));
    this.folderHandleKey = 'djiMissionPlanner:exportFolderHandle';
    this.folderHandleStoreName = 'djiMissionPlannerFsHandles';
    this.folderHandleStore = 'handles';
    this.folderHandleDbKey = 'exportFolderHandle';
    this.folderHandle = null;
    this.folderHandleRestorePromise = this.loadFolderHandle();
  }

  // Public methods

  // ── Mixin method groups ─────────────────────────────
  // Load: ExportKmzFolder → ExportKmzBuilder → ExportKmzShare
  //   → ExportKmz.js
}

Object.assign(
  ExportKmz.prototype,
  ExportKmzFolder,
  ExportKmzBuilder,
  ExportKmzShare
);

// Re-expose static helpers for external callers
ExportKmz._buildUserActionXml = ExportKmz.prototype._buildUserActionXml;
ExportKmz._esc = ExportKmz.prototype._esc;
