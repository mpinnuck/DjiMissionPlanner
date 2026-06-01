class FileSystemBackend {
  constructor(options = {}) {
    this.onStatus = options.onStatus || null;
    this.onError = options.onError || null;
    this.rootDirectoryHandle = null;
    this.rootLabel = 'missions';
    this.directoryHandleStoreName = 'djiMissionPlannerFsHandles';
    this.directoryHandleKey = 'rootDirectoryHandle';
  }

  async openHandleDatabase() {
    if (typeof indexedDB === 'undefined') {
      return null;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.directoryHandleStoreName, 1);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to open handle database.'));
    });
  }

  async persistRootDirectoryHandle(handle) {
    if (!handle) {
      return;
    }

    const db = await this.openHandleDatabase();
    if (!db) {
      return;
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, this.directoryHandleKey);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Failed to persist selected folder.'));
    });
    db.close();
  }

  async restoreRootDirectoryHandle() {
    const db = await this.openHandleDatabase();
    if (!db) {
      return null;
    }

    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readonly');
      const request = tx.objectStore('handles').get(this.directoryHandleKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Failed to read saved folder.'));
    });
    db.close();
    return handle;
  }

  async clearPersistedRootDirectoryHandle() {
    const db = await this.openHandleDatabase();
    if (!db) {
      return;
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').delete(this.directoryHandleKey);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Failed to clear saved folder.'));
    });
    db.close();
  }

  canChooseRootDirectory() {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
  }

  getDescription() {
    return 'Filesystem storage';
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
    if (raw.includes('/')) {
      return raw.endsWith('.json') ? raw : `${raw}.json`;
    }
    const safeName = this.sanitizeMissionName(raw);
    return `${this.rootLabel}/${safeName}.json`;
  }

  async chooseRootDirectory() {
    if (!this.canChooseRootDirectory()) {
      throw new Error('This browser does not support folder access. Use Chrome, Edge, or another Chromium browser over localhost/HTTPS.');
    }

    this.rootDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await this.ensurePermission(this.rootDirectoryHandle, 'readwrite');
    this.rootLabel = this.rootDirectoryHandle && this.rootDirectoryHandle.name
      ? this.rootDirectoryHandle.name
      : 'missions';
    await this.persistRootDirectoryHandle(this.rootDirectoryHandle);
    return this.rootDirectoryHandle;
  }

  async ensurePermission(handle, mode) {
    const options = { mode };
    if (typeof handle.queryPermission === 'function') {
      const queried = await handle.queryPermission(options);
      if (queried === 'granted') {
        return true;
      }
    }
    if (typeof handle.requestPermission === 'function') {
      const requested = await handle.requestPermission(options);
      return requested === 'granted';
    }
    return false;
  }

  async ensureRootDirectory() {
    if (!this.rootDirectoryHandle) {
      try {
        this.rootDirectoryHandle = await this.restoreRootDirectoryHandle();
      } catch (error) {
        this.rootDirectoryHandle = null;
      }

      if (!this.rootDirectoryHandle) {
        await this.chooseRootDirectory();
      }
    }

    let granted = await this.ensurePermission(this.rootDirectoryHandle, 'readwrite');
    if (!granted) {
      this.rootDirectoryHandle = null;
      try {
        await this.clearPersistedRootDirectoryHandle();
      } catch (error) {
        // Ignore persistence cleanup failures and continue with folder selection.
      }
      await this.chooseRootDirectory();
      granted = await this.ensurePermission(this.rootDirectoryHandle, 'readwrite');
      if (!granted) {
        throw new Error('Folder permission was not granted.');
      }
    }

    this.rootLabel = this.rootDirectoryHandle && this.rootDirectoryHandle.name
      ? this.rootDirectoryHandle.name
      : this.rootLabel;
    return this.rootDirectoryHandle;
  }

  async getMissionDirectoryHandle(create = true) {
    const root = await this.ensureRootDirectory();
    this.rootLabel = root && root.name ? root.name : this.rootLabel;
    return root;
  }

  async resolveDirectoryForPath(relativePath, create = true) {
    const missionDir = await this.getMissionDirectoryHandle(create);
    const normalized = this.normalizePath(relativePath);
    const stripped = normalized.startsWith(`${this.rootLabel}/`)
      ? normalized.slice(`${this.rootLabel}/`.length)
      : normalized;
    const parts = stripped.split('/').filter(Boolean);
    const fileName = parts.pop();
    let directory = missionDir;
    for (const part of parts) {
      directory = await directory.getDirectoryHandle(part, { create });
    }
    return { directory, fileName };
  }

  async save(name, jsonText) {
    const normalized = this.normalizePath(name);
    const { directory, fileName } = await this.resolveDirectoryForPath(normalized, true);
    const fileHandle = await directory.getFileHandle(fileName, { create: true });
    const writer = await fileHandle.createWritable();
    await writer.write(jsonText);
    await writer.close();
    return normalized;
  }

  async load(name) {
    const normalized = this.normalizePath(name);
    const { directory, fileName } = await this.resolveDirectoryForPath(normalized, false);
    const fileHandle = await directory.getFileHandle(fileName, { create: false });
    const file = await fileHandle.getFile();
    return file.text();
  }

  async delete(name) {
    const normalized = this.normalizePath(name);
    const { directory, fileName } = await this.resolveDirectoryForPath(normalized, false);
    await directory.removeEntry(fileName);
  }

  async list() {
    const tree = await this.listTree();
    return this.flattenTree(tree.nodes);
  }

  flattenTree(nodes) {
    const results = [];
    nodes.forEach(node => {
      if (node.type === 'file') {
        results.push(node.path);
        return;
      }
      results.push(...this.flattenTree(node.children || []));
    });
    return results;
  }

  async listTree() {
    const missionDir = await this.getMissionDirectoryHandle(true);
    const nodes = await this.readDirectoryTree(missionDir, this.rootLabel);
    return {
      rootLabel: this.rootLabel,
      nodes
    };
  }

  async readDirectoryTree(directoryHandle, relativePath) {
    const directories = [];
    const files = [];

    for await (const [name, handle] of directoryHandle.entries()) {
      if (handle.kind === 'directory') {
        directories.push({ name, handle });
      } else if (handle.kind === 'file' && name.toLowerCase().endsWith('.json')) {
        files.push({ name, handle });
      }
    }

    directories.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    const directoryNodes = [];
    for (const entry of directories) {
      const path = `${relativePath}/${entry.name}`;
      directoryNodes.push({
        type: 'directory',
        name: entry.name,
        path,
        children: await this.readDirectoryTree(entry.handle, path)
      });
    }

    const fileNodes = files.map(entry => ({
      type: 'file',
      name: entry.name,
      path: `${relativePath}/${entry.name}`
    }));

    return [...directoryNodes, ...fileNodes];
  }
}
