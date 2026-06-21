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
