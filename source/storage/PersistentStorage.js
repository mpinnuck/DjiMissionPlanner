class PersistentStorage {
  constructor(options = {}) {
    this.onStatus = options.onStatus || null;
    this.onError = options.onError || null;
    this.backend = this.createBackend(options.backend);
  }

  // Public methods

  createBackend(backendMode) {
    if (backendMode === 'filesystem') {
      return new FileSystemBackend({ onStatus: this.onStatus, onError: this.onError });
    }
    if (backendMode === 'localStorage') {
      return new LocalStorageBackend({ onStatus: this.onStatus, onError: this.onError });
    }

    if (PersistentStorage.supportsFileSystemAccess()) {
      return new FileSystemBackend({ onStatus: this.onStatus, onError: this.onError });
    }

    return new LocalStorageBackend({ onStatus: this.onStatus, onError: this.onError });
  }

  static supportsFileSystemAccess() {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      const isAppleMobile = /iPad|iPhone|iPod/.test(ua)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isAppleMobile) return false;
    }
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
  }

  static normalizeMissionName(name) {
    const base = (name || 'Mission').trim();
    const sanitized = base
      .replace(/[\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return sanitized || 'Mission';
  }

  static normalizePath(path) {
    return String(path || '')
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .join('/');
  }

  static normalizeMissionPath(name) {
    const normalized = PersistentStorage.normalizePath(name);
    if (!normalized) {
      return `${PersistentStorage.normalizeMissionName('Mission')}.json`;
    }

    const segments = normalized.split('/');
    const fileName = segments.pop();
    const safeFileName = fileName.toLowerCase().endsWith('.json')
      ? fileName
      : `${PersistentStorage.normalizeMissionName(fileName)}.json`;

    const safeSegments = segments.map(segment => PersistentStorage.normalizeMissionName(segment));
    return [...safeSegments, safeFileName].join('/');
  }

  static flattenTree(nodes, prefix = []) {
    const results = [];
    nodes.forEach(node => {
      if (node.type === 'file') {
        results.push([...prefix, node.name].join('/'));
      } else if (node.type === 'directory') {
        results.push(...PersistentStorage.flattenTree(node.children || [], [...prefix, node.name]));
      }
    });
    return results;
  }

  static buildTreeFromPaths(paths) {
    const root = new Map();

    const addPath = (segments, fileName) => {
      let current = root;
      for (const segment of segments) {
        if (!current.has(segment)) {
          current.set(segment, { type: 'directory', name: segment, children: new Map() });
        }
        current = current.get(segment).children;
      }
      current.set(fileName, { type: 'file', name: fileName, path: [...segments, fileName].join('/') });
    };

    paths.forEach(path => {
      const normalized = PersistentStorage.normalizePath(path);
      if (!normalized || !normalized.toLowerCase().endsWith('.json')) {
        return;
      }
      const segments = normalized.split('/');
      const fileName = segments.pop();
      addPath(segments, fileName);
    });

    const mapToNodes = map => {
      return [...map.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(node => {
          if (node.type === 'file') {
            return node;
          }
          return {
            type: 'directory',
            name: node.name,
            path: node.name,
            children: mapToNodes(node.children)
          };
        });
    };

    return mapToNodes(root);
  }

  get backendName() {
    return this.backend && this.backend.constructor ? this.backend.constructor.name : 'UnknownBackend';
  }

  canChooseRootDirectory() {
    return typeof this.backend.canChooseRootDirectory === 'function' && this.backend.canChooseRootDirectory();
  }

  canOpenMissionFileDialog() {
    return typeof this.backend.canOpenMissionFileDialog === 'function' && this.backend.canOpenMissionFileDialog();
  }

  chooseRootDirectory() {
    if (typeof this.backend.chooseRootDirectory !== 'function') {
      return Promise.resolve(null);
    }
    return this.backend.chooseRootDirectory();
  }

  openMissionFileDialog() {
    if (typeof this.backend.openMissionFileDialog !== 'function') {
      return Promise.reject(new Error('Mission file picker is not available with the current storage backend.'));
    }
    return this.backend.openMissionFileDialog();
  }

  getLastLoadedMissionFolder() {
    if (typeof this.backend.getLastLoadedMissionFolder !== 'function') {
      return '';
    }
    return this.backend.getLastLoadedMissionFolder();
  }

  setLastLoadedMissionFolder(path) {
    if (typeof this.backend.setLastLoadedMissionFolder !== 'function') {
      return;
    }
    this.backend.setLastLoadedMissionFolder(path);
  }

  getLastLoadedMissionLocation() {
    if (typeof this.backend.getLastLoadedMissionLocation !== 'function') {
      return { rootLabel: '', folderPath: '' };
    }
    return this.backend.getLastLoadedMissionLocation();
  }

  setLastLoadedMissionLocation(location) {
    if (typeof this.backend.setLastLoadedMissionLocation !== 'function') {
      return;
    }
    this.backend.setLastLoadedMissionLocation(location);
  }

  markCurrentRootAsLastLoadedRoot() {
    if (typeof this.backend.markCurrentRootAsLastLoadedRoot !== 'function') {
      return Promise.resolve();
    }
    return this.backend.markCurrentRootAsLastLoadedRoot();
  }

  async getDebugContext() {
    if (typeof this.backend.getDebugContext === 'function') {
      return this.backend.getDebugContext();
    }

    return {
      backend: this.backendName,
      savedLocation: this.getLastLoadedMissionLocation()
    };
  }

  getDescription() {
    return typeof this.backend.getDescription === 'function'
      ? this.backend.getDescription()
      : 'Persistent storage';
  }

  async getLastLoadedFileHandle() {
    if (typeof this.backend.restoreLastLoadedFileHandle !== 'function') {
      return null;
    }
    return this.backend.restoreLastLoadedFileHandle();
  }

  async save(name, jsonText) {
    return this.backend.save(name, jsonText);
  }

  async load(name) {
    return this.backend.load(name);
  }

  async delete(name) {
    return this.backend.delete(name);
  }

  async list() {
    return this.backend.list();
  }

  async listTree(preferredRootLabel = '') {
    return this.backend.listTree(preferredRootLabel);
  }
}
