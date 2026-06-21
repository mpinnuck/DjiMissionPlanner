/**
 * LocalStorageBackend.js
 * localStorage-based storage backend for mission files.
 * Used on iOS Safari and other browsers where the File System Access API
 * directory picker (showDirectoryPicker) is unavailable.
 *
 * Responsibilities:
 *  - save / load / delete / list: CRUD operations on localStorage keys
 *    prefixed with 'djiMission:'
 *  - getDescription: returns a human-readable backend description
 *  - canChooseRootDirectory / canOpenMissionFileDialog: always false
 *    (iOS uses Share Sheet for file delivery instead)
 */
class LocalStorageBackend {
  constructor(options = {}) {
    this.onStatus = options.onStatus || null;
    this.onError = options.onError || null;
    this.storage = window.localStorage;
    this.storagePrefix = 'djiMissionPlanner:missions:';
    this.rootLabel = 'settings/missions';
  }

  // Public methods

  canChooseRootDirectory() {
    return false;
  }

  getDescription() {
    return 'Browser storage';
  }

  async chooseRootDirectory() {
    return null;
  }

  sanitizeMissionName(name) {
    const base = (name || 'Mission').trim();
    const sanitized = base
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return sanitized || 'Mission';
  }

  normalizePath(name) {
    const raw = String(name || '').trim().replace(/\\/g, '/');
    if (!raw) {
      return `${this.rootLabel}/Mission.json`;
    }
    if (raw.startsWith(`${this.rootLabel}/`)) {
      return raw;
    }

    if (raw.toLowerCase().endsWith('.json')) {
      return `${this.rootLabel}/${raw}`;
    }

    if (raw.includes('/')) {
      return raw.endsWith('.json') ? raw : `${raw}.json`;
    }
    const safeName = this.sanitizeMissionName(raw);
    return `${this.rootLabel}/${safeName}.json`;
  }

  keyForPath(path) {
    return `${this.storagePrefix}${path}`;
  }

  async save(name, jsonText) {
    const path = this.normalizePath(name);
    this.storage.setItem(this.keyForPath(path), jsonText);
    return path;
  }

  async load(name) {
    const path = this.normalizePath(name);
    const jsonText = this.storage.getItem(this.keyForPath(path));
    if (jsonText === null) {
      throw new Error(`Mission not found: ${path}`);
    }
    return jsonText;
  }

  async delete(name) {
    const path = this.normalizePath(name);
    this.storage.removeItem(this.keyForPath(path));
  }

  async list() {
    const paths = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (key && key.startsWith(this.storagePrefix)) {
        paths.push(key.slice(this.storagePrefix.length));
      }
    }
    return paths.sort((left, right) => left.localeCompare(right));
  }

  async listTree() {
    const paths = await this.list();
    const relativePaths = paths
      .filter(path => path.startsWith(`${this.rootLabel}/`))
      .map(path => path.slice(`${this.rootLabel}/`.length));

    return {
      rootLabel: this.rootLabel,
      nodes: this.buildTreeNodes(relativePaths, this.rootLabel)
    };
  }

  buildTreeNodes(relativePaths, rootPrefix) {
    const root = { directories: new Map(), files: [] };

    relativePaths.forEach(relativePath => {
      const parts = relativePath.split('/').filter(Boolean);
      if (parts.length === 0) {
        return;
      }

      let cursor = root;
      parts.forEach((part, index) => {
        const isFile = index === parts.length - 1;
        if (isFile) {
          cursor.files.push(part);
          return;
        }
        if (!cursor.directories.has(part)) {
          cursor.directories.set(part, { directories: new Map(), files: [] });
        }
        cursor = cursor.directories.get(part);
      });
    });

    const emitNodes = (node, prefix) => {
      const directoryNodes = [...node.directories.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, child]) => {
          const path = prefix ? `${prefix}/${name}` : name;
          return {
            type: 'directory',
            name,
            path: `${rootPrefix}/${path}`,
            children: emitNodes(child, path)
          };
        });

      const fileNodes = [...node.files]
        .sort((left, right) => left.localeCompare(right))
        .map(name => {
          const path = prefix ? `${prefix}/${name}` : name;
          return {
            type: 'file',
            name,
            path: `${rootPrefix}/${path}`
          };
        });

      return [...directoryNodes, ...fileNodes];
    };

    return emitNodes(root, '');
  }
}
