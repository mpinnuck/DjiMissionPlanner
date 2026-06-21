// FileSystemBackendMeta.js
// Mixed into FileSystemBackend.prototype

const FileSystemBackendMeta = {

directoryHandleKeyForRootLabel(rootLabel) {
  const normalized = String(rootLabel || '').trim();
  if (!normalized) {
    return this.directoryHandleKey;
  }

  return `${this.directoryHandleKey}::${encodeURIComponent(normalized)}`;
},

canChooseRootDirectory() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
},

canOpenMissionFileDialog() {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
},

getLastLoadedMissionFolder() {
  return this.getLastLoadedMissionLocation().folderPath;
},

setLastLoadedMissionFolder(path) {
  this.setLastLoadedMissionLocation({
    rootLabel: this.rootLabel,
    folderPath: path
  });
},

getLastLoadedMissionRootLabel() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return '';
  }

  return String(window.localStorage.getItem(this.lastLoadedRootLabelKey) || '').trim();
},

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

getLastLoadedMissionLocation() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { rootLabel: '', folderPath: '' };
  }

  return {
    rootLabel: this.getLastLoadedMissionRootLabel(),
    folderPath: this.normalizeFolderPath(window.localStorage.getItem(this.lastLoadedFolderKey))
  };
},

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

async markCurrentRootAsLastLoadedRoot() {
  if (!this.rootDirectoryHandle) {
    return;
  }

  await this.persistLastLoadedRootDirectoryHandle(this.rootDirectoryHandle);
},

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

normalizeFolderPath(path) {
  return String(path || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/');
},

getDescription() {
  return 'Filesystem storage';
},

sanitizeMissionName(name) {
  const base = (name || 'Mission').trim();
  const sanitized = base
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'Mission';
},

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
