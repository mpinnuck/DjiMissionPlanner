/**
 * FileSystemBackend.js
 * File System Access API storage backend for mission files.
 * Used on desktop browsers (Chrome/Edge) where showDirectoryPicker is available.
 * The constructor is defined here; all methods are mixed in from the
 * FileSystemBackend* mixin files via Object.assign at the bottom of this file.
 *
 *  FileSystemBackendDB   — IndexedDB handle persistence
 *  FileSystemBackendMeta — capabilities, location metadata, path helpers
 *  FileSystemBackendDir  — directory selection, permission, and resolution
 *  FileSystemBackendIO   — file read/write/delete/list and directory tree
 */
class FileSystemBackend {
  constructor(options = {}) {
    this.onStatus = options.onStatus || null;
    this.onError = options.onError || null;
    this.rootDirectoryHandle = null;
    this.rootLabel = 'Mission Files';
    this.directoryHandleStoreName = 'djiMissionPlannerFsHandles';
    this.directoryHandleKey = 'rootDirectoryHandle';
    this.lastLoadedDirectoryHandleKey = 'lastLoadedRootDirectoryHandle';
    this.lastLoadedFileHandleKey = 'lastLoadedFileHandle';
    this.lastLoadedFolderKey = 'lastLoadedMissionFolder';
    this.lastLoadedRootLabelKey = 'lastLoadedMissionRootLabel';
  }

  // Public methods

  // ── Mixin method groups ─────────────────────────────
  // Load: BackendDB → BackendMeta → BackendDir → BackendIO
  //   → FileSystemBackend.js
}

Object.assign(
  FileSystemBackend.prototype,
  FileSystemBackendDB,
  FileSystemBackendMeta,
  FileSystemBackendDir,
  FileSystemBackendIO
);
