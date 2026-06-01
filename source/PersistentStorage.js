class PersistentStorage {
  constructor(options = {}) {
    this.onStatus = options.onStatus || null;
    this.onError = options.onError || null;
    this.backend = this.createBackend(options.backend);
  }

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

  chooseRootDirectory() {
    if (typeof this.backend.chooseRootDirectory !== 'function') {
      return Promise.resolve(null);
    }
    return this.backend.chooseRootDirectory();
  }

  getDescription() {
    return typeof this.backend.getDescription === 'function'
      ? this.backend.getDescription()
      : 'Persistent storage';
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

  async listTree() {
    return this.backend.listTree();
  }
}
