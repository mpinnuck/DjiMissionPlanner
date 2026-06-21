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
