/**
 * FileSystemBackendMeta.js  —  FileSystemBackend mixin: capabilities and metadata
 * Mixed into FileSystemBackend.prototype via FileSystemBackend.js.
 *
 * Responsibilities:
 *  - canChooseRootDirectory / canOpenMissionFileDialog: capability flags
 *  - getLastLoadedMissionFolder / setLastLoadedMissionFolder (localStorage)
 *  - getLastLoadedMissionRootLabel / setLastLoadedMissionRootLabel
 *  - getLastLoadedMissionLocation / setLastLoadedMissionLocation
 *  - markCurrentRootAsLastLoadedRoot
 *  - getDebugContext: returns a diagnostic snapshot of all stored handles
 *  - normalizeFolderPath / getDescription / sanitizeMissionName / normalizePath
 */
// FileSystemBackendMeta.js
// Mixed into FileSystemBackend.prototype

const FileSystemBackendMeta = {

/**
 * Directory handle key for root label.
 *
 * @param {string} rootLabel
 *
 * @returns {*}
 */
directoryHandleKeyForRootLabel(rootLabel) {
  const normalized = String(rootLabel || '').trim();
  if (!normalized) {
    return this.directoryHandleKey;
  }

  return `${this.directoryHandleKey}::${encodeURIComponent(normalized)}`;
},

/**
 * Can choose root directory.
 *
 * @returns {*}
 */
canChooseRootDirectory() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
},

/**
 * Can open mission file dialog.
 *
 * @returns {*}
 */
canOpenMissionFileDialog() {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
},

/**
 * Get last loaded mission folder.
 *
 * @returns {*}
 */
getLastLoadedMissionFolder() {
  return this.getLastLoadedMissionLocation().folderPath;
},

/**
 * Set last loaded mission folder.
 *
 * @param {string} path
 *
 * @returns {string}
 */
setLastLoadedMissionFolder(path) {
  this.setLastLoadedMissionLocation({
    rootLabel: this.rootLabel,
    folderPath: path
  });
},

/**
 * Get last loaded mission root label.
 *
 * @returns {string}
 */
getLastLoadedMissionRootLabel() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return '';
  }

  return String(window.localStorage.getItem(this.lastLoadedRootLabelKey) || '').trim();
},

/**
 * Set last loaded mission root label.
 *
 * @param {string} rootLabel
 *
 * @returns {Object}
 */
setLastLoadedMissionRootLabel(rootLabel) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  const normalized = String(rootLabel || '').trim();
  if (!normalized) {
    window.localStorage.removeItem(this.lastLoadedRootLabelKey);
    return;
  }

  window.localStorage.setItem(this.lastLoadedRootLabelKey, normalized);
},

/**
 * Get last loaded mission location.
 *
 * @returns {Object}
 */
getLastLoadedMissionLocation() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { rootLabel: '', folderPath: '' };
  }

  return {
    rootLabel: this.getLastLoadedMissionRootLabel(),
    folderPath: this.normalizeFolderPath(window.localStorage.getItem(this.lastLoadedFolderKey))
  };
},

/**
 * Set last loaded mission location.
 *
 * @param {Object} location [default: {}]
 *
 * @returns {Object}
 */
setLastLoadedMissionLocation(location = {}) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  const rootLabel = String(location.rootLabel || '').trim();
  const folderPath = this.normalizeFolderPath(location.folderPath);

  if (rootLabel) {
    window.localStorage.setItem(this.lastLoadedRootLabelKey, rootLabel);
  } else {
    window.localStorage.removeItem(this.lastLoadedRootLabelKey);
  }

  if (folderPath) {
    window.localStorage.setItem(this.lastLoadedFolderKey, folderPath);
    return;
  }

  window.localStorage.removeItem(this.lastLoadedFolderKey);
  return;
},

/**
 * Mark current root as last loaded root.
 *
 * @returns {Promise<Object>}
 */
async markCurrentRootAsLastLoadedRoot() {
  if (!this.rootDirectoryHandle) {
    return;
  }

  await this.persistLastLoadedRootDirectoryHandle(this.rootDirectoryHandle);
},

/**
 * Get debug context.
 *
 * @returns {Promise<Object>}
 */
async getDebugContext() {
  const savedLocation = this.getLastLoadedMissionLocation();
  const genericHandle = await this.restoreRootDirectoryHandle('');
  const preferredHandle = savedLocation.rootLabel
    ? await this.restoreRootDirectoryHandle(savedLocation.rootLabel)
    : null;
  const lastLoadedHandle = await this.restoreLastLoadedRootDirectoryHandle();
  const lastLoadedFileHandle = await this.restoreLastLoadedFileHandle();

  return {
    backend: 'filesystem',
    currentRootLabel: this.rootLabel || '',
    currentRootHandleName: this.rootDirectoryHandle && this.rootDirectoryHandle.name
      ? this.rootDirectoryHandle.name
      : '',
    savedLocation,
    handles: {
      genericRootHandleName: genericHandle && genericHandle.name ? genericHandle.name : '',
      preferredRootHandleName: preferredHandle && preferredHandle.name ? preferredHandle.name : '',
      lastLoadedRootHandleName: lastLoadedHandle && lastLoadedHandle.name ? lastLoadedHandle.name : '',
      lastLoadedFileHandleName: lastLoadedFileHandle && lastLoadedFileHandle.name ? lastLoadedFileHandle.name : ''
    }
  };
},

/**
 * Normalize folder path.
 *
 * @param {string} path
 *
 * @returns {string}
 */
normalizeFolderPath(path) {
  return String(path || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/');
},

/**
 * Returns a human-readable description of the active storage backend.
 *
 * @returns {string}
 */
getDescription() {
  return 'Filesystem storage';
},

/**
 * Sanitize mission name.
 *
 * @param {string} name
 *
 * @returns {*}
 */
sanitizeMissionName(name) {
  const base = (name || 'Mission').trim();
  const sanitized = base
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'Mission';
},

/**
 * Normalize path.
 *
 * @param {string} name
 *
 * @returns {string}
 */
normalizePath(name) {
  const raw = String(name || '').trim().replace(/\\/g, '/');
  if (!raw) {
    return 'Mission.json';
  }

  const rootPrefix = `${this.rootLabel}/`;
  const withoutRootPrefix = raw.startsWith(rootPrefix)
    ? raw.slice(rootPrefix.length)
    : raw;

  if (withoutRootPrefix.toLowerCase().endsWith('.json')) {
    return withoutRootPrefix;
  }

  if (withoutRootPrefix.includes('/')) {
    return withoutRootPrefix.endsWith('.json') ? withoutRootPrefix : `${withoutRootPrefix}.json`;
  }

  const safeName = this.sanitizeMissionName(withoutRootPrefix);
  return `${safeName}.json`;

}
};
