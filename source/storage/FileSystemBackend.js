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

    const rootLabel = handle && handle.name ? handle.name : '';
    const specificKey = this.directoryHandleKeyForRootLabel(rootLabel);

    await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, this.directoryHandleKey);
      if (specificKey) {
        tx.objectStore('handles').put(handle, specificKey);
      }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Failed to persist selected folder.'));
    });
    db.close();
  }

  async restoreRootDirectoryHandle(rootLabel = '') {
    const db = await this.openHandleDatabase();
    if (!db) {
      return null;
    }

    const lookupKey = rootLabel ? this.directoryHandleKeyForRootLabel(rootLabel) : this.directoryHandleKey;

    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readonly');
      const request = tx.objectStore('handles').get(lookupKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Failed to read saved folder.'));
    });
    db.close();
    return handle;
  }

  async clearPersistedRootDirectoryHandle(rootLabel = '') {
    const db = await this.openHandleDatabase();
    if (!db) {
      return;
    }

    const lookupKey = rootLabel ? this.directoryHandleKeyForRootLabel(rootLabel) : this.directoryHandleKey;

    await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').delete(lookupKey);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Failed to clear saved folder.'));
    });
    db.close();
  }

  async persistLastLoadedRootDirectoryHandle(handle) {
    if (!handle) {
      return;
    }

    const db = await this.openHandleDatabase();
    if (!db) {
      return;
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, this.lastLoadedDirectoryHandleKey);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Failed to persist last loaded folder handle.'));
    });
    db.close();
  }

  async restoreLastLoadedRootDirectoryHandle() {
    const db = await this.openHandleDatabase();
    if (!db) {
      return null;
    }

    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readonly');
      const request = tx.objectStore('handles').get(this.lastLoadedDirectoryHandleKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Failed to read last loaded folder handle.'));
    });
    db.close();
    return handle;
  }

  async persistLastLoadedFileHandle(fileHandle) {
    if (!fileHandle) {
      return;
    }

    const db = await this.openHandleDatabase();
    if (!db) {
      return;
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(fileHandle, this.lastLoadedFileHandleKey);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Failed to persist last loaded mission file handle.'));
    });
    db.close();
  }

  async restoreLastLoadedFileHandle() {
    const db = await this.openHandleDatabase();
    if (!db) {
      return null;
    }

    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readonly');
      const request = tx.objectStore('handles').get(this.lastLoadedFileHandleKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Failed to read last loaded mission file handle.'));
    });
    db.close();
    return handle;
  }

  directoryHandleKeyForRootLabel(rootLabel) {
    const normalized = String(rootLabel || '').trim();
    if (!normalized) {
      return this.directoryHandleKey;
    }

    return `${this.directoryHandleKey}::${encodeURIComponent(normalized)}`;
  }

  canChooseRootDirectory() {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
  }

  canOpenMissionFileDialog() {
    return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
  }

  getLastLoadedMissionFolder() {
    return this.getLastLoadedMissionLocation().folderPath;
  }

  setLastLoadedMissionFolder(path) {
    this.setLastLoadedMissionLocation({
      rootLabel: this.rootLabel,
      folderPath: path
    });
  }

  getLastLoadedMissionRootLabel() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return '';
    }

    return String(window.localStorage.getItem(this.lastLoadedRootLabelKey) || '').trim();
  }

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
  }

  getLastLoadedMissionLocation() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { rootLabel: '', folderPath: '' };
    }

    return {
      rootLabel: this.getLastLoadedMissionRootLabel(),
      folderPath: this.normalizeFolderPath(window.localStorage.getItem(this.lastLoadedFolderKey))
    };
  }

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
  }

  async markCurrentRootAsLastLoadedRoot() {
    if (!this.rootDirectoryHandle) {
      return;
    }

    await this.persistLastLoadedRootDirectoryHandle(this.rootDirectoryHandle);
  }

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
  }

  normalizeFolderPath(path) {
    return String(path || '')
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .join('/');
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

  async chooseRootDirectory() {
    if (!this.canChooseRootDirectory()) {
      throw new Error('This browser does not support folder access. Use Chrome, Edge, or another Chromium browser over localhost/HTTPS.');
    }

    this.rootDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await this.ensurePermission(this.rootDirectoryHandle, 'readwrite');
    this.rootLabel = this.rootDirectoryHandle && this.rootDirectoryHandle.name
      ? this.rootDirectoryHandle.name
      : 'Mission Files';
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

  async ensureRootDirectory(preferredRootLabel = '') {
    if (preferredRootLabel) {
      const currentLabel = this.rootDirectoryHandle && this.rootDirectoryHandle.name
        ? this.rootDirectoryHandle.name
        : '';
      if (!this.rootDirectoryHandle || currentLabel !== preferredRootLabel) {
        try {
          const lastLocation = this.getLastLoadedMissionLocation();
          if (lastLocation.rootLabel === preferredRootLabel) {
            this.rootDirectoryHandle = await this.restoreLastLoadedRootDirectoryHandle();
          }
          if (!this.rootDirectoryHandle) {
            this.rootDirectoryHandle = await this.restoreRootDirectoryHandle(preferredRootLabel);
          }
        } catch (error) {
          this.rootDirectoryHandle = null;
        }
      }
    }

    if (!this.rootDirectoryHandle) {
      try {
        this.rootDirectoryHandle = await this.restoreRootDirectoryHandle(preferredRootLabel);
      } catch (error) {
        this.rootDirectoryHandle = null;
      }

      if (!this.rootDirectoryHandle) {
        await this.chooseRootDirectory();
      }
    }

    let granted;
    try {
      granted = await this.ensurePermission(this.rootDirectoryHandle, 'readwrite');
    } catch (error) {
      if (error && error.name === 'NotFoundError') {
        this.rootDirectoryHandle = null;
        try {
          await this.clearPersistedRootDirectoryHandle();
        } catch (cleanupError) {
          // Ignore persistence cleanup failures and continue with folder selection.
        }
        await this.chooseRootDirectory();
        granted = await this.ensurePermission(this.rootDirectoryHandle, 'readwrite');
      } else {
        throw error;
      }
    }

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

  async openMissionFileDialog(preferredRootLabel = '') {
    if (!this.canOpenMissionFileDialog()) {
      throw new Error('This browser does not support file picker dialogs.');
    }

    const preferredLocation = this.getLastLoadedMissionLocation();
    let startRootHandle = null;

    const preferredRoot = preferredRootLabel || preferredLocation.rootLabel;
    if (preferredRoot && preferredLocation.rootLabel === preferredRoot) {
      try {
        startRootHandle = await this.restoreLastLoadedRootDirectoryHandle();
        if (startRootHandle) {
          const granted = await this.ensurePermission(startRootHandle, 'readwrite');
          if (!granted) {
            startRootHandle = null;
          }
        }
      } catch (error) {
        startRootHandle = null;
      }
    }

    if (!startRootHandle && preferredRoot) {
      try {
        startRootHandle = await this.restoreRootDirectoryHandle(preferredRoot);
        if (startRootHandle) {
          const granted = await this.ensurePermission(startRootHandle, 'readwrite');
          if (!granted) {
            startRootHandle = null;
          }
        }
      } catch (error) {
        startRootHandle = null;
      }
    }

    if (!startRootHandle) {
      await this.ensureRootDirectory(preferredRoot);
      startRootHandle = this.rootDirectoryHandle;
    }

    let startDirectoryHandle = startRootHandle;
    let startDirectoryPath = '';

    if (preferredLocation.folderPath && preferredLocation.rootLabel) {
      try {
        startDirectoryHandle = await this.resolveDirectoryHandleFromPath(preferredLocation.folderPath, false, startRootHandle);
        startDirectoryPath = this.normalizeFolderPath(preferredLocation.folderPath);
      } catch (error) {
        startDirectoryHandle = startRootHandle;
        startDirectoryPath = this.normalizeFolderPath(preferredLocation.folderPath);
      }
    }

    let startIn;
    let startInSource = 'directory';
    try {
      startIn = await this.restoreLastLoadedFileHandle() || undefined;
    } catch (_) {}
    if (startIn) {
      startInSource = 'file';
    }
    if (!startIn) {
      startIn = startDirectoryHandle || startRootHandle || this.rootDirectoryHandle || undefined;
    }

    let handles;
    try {
      handles = await window.showOpenFilePicker({
        multiple: false,
        startIn,
        types: [
          {
            description: 'Mission JSON',
            accept: {
              'application/json': ['.json']
            }
          }
        ]
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('Mission file selection was cancelled.');
      }
      throw error;
    }

    const [fileHandle] = Array.isArray(handles) ? handles : [];
    if (!fileHandle) {
      throw new Error('No mission file was selected.');
    }

    this.persistLastLoadedFileHandle(fileHandle).catch(() => {});

    const file = await fileHandle.getFile();
    const jsonText = await file.text();

    let resolvedPath = fileHandle.name || file.name || 'mission.json';
    let resolvedDirectoryPath = '';
    let resolvedRootLabel = '';
    let resolvedAgainstStartRoot = false;
    if (startRootHandle && typeof startRootHandle.resolve === 'function') {
      try {
        const relativeSegments = await startRootHandle.resolve(fileHandle);
        if (Array.isArray(relativeSegments) && relativeSegments.length > 0) {
          resolvedPath = relativeSegments.join('/');
          resolvedDirectoryPath = relativeSegments.slice(0, -1).join('/');
          resolvedRootLabel = startRootHandle.name || this.rootLabel;
          resolvedAgainstStartRoot = true;
        }
      } catch (error) {
        // Ignore resolve failures and fall back to filename only.
      }
    }

    if (!resolvedRootLabel && startRootHandle && startRootHandle.name) {
      resolvedRootLabel = startRootHandle.name;
    }

    if (!resolvedDirectoryPath && startDirectoryPath) {
      resolvedDirectoryPath = startDirectoryPath;
    }

    if (!resolvedAgainstStartRoot && resolvedDirectoryPath) {
      resolvedPath = `${resolvedDirectoryPath}/${fileHandle.name || file.name || 'mission.json'}`;
    }

    if (resolvedRootLabel && startRootHandle) {
      this.setLastLoadedMissionLocation({
        rootLabel: resolvedRootLabel,
        folderPath: resolvedDirectoryPath
      });
      this.rootDirectoryHandle = startRootHandle;
      this.rootLabel = resolvedRootLabel;
      try {
        await this.persistRootDirectoryHandle(startRootHandle);
        await this.persistLastLoadedRootDirectoryHandle(startRootHandle);
      } catch (error) {
        // Ignore persistence failures for the file picker root handle.
      }
    }

    return {
      path: resolvedPath,
      name: fileHandle.name || file.name || 'mission.json',
      directoryPath: resolvedDirectoryPath,
      startDirectoryPath,
      rootLabel: resolvedRootLabel,
      startRootLabel: startRootHandle && startRootHandle.name ? startRootHandle.name : '',
      startInSource,
      resolvedAgainstRoot: resolvedAgainstStartRoot,
      jsonText
    };
  }

  async resolveDirectoryHandleFromPath(relativePath, create = false, baseDirectoryHandle = null) {
    const missionDir = baseDirectoryHandle || await this.getMissionDirectoryHandle(create);
    const normalized = this.normalizeFolderPath(relativePath);
    if (!normalized) {
      return missionDir;
    }

    let directory = missionDir;
    const parts = normalized.split('/').filter(Boolean);
    for (const part of parts) {
      directory = await directory.getDirectoryHandle(part, { create });
    }
    return directory;
  }

  async getMissionDirectoryHandle(create = true, preferredRootLabel = '') {
    const root = await this.ensureRootDirectory(preferredRootLabel);
    this.rootLabel = root && root.name ? root.name : this.rootLabel;
    return root;
  }

  async resolveDirectoryForPath(relativePath, create = true, preferredRootLabel = '') {
    const missionDir = await this.getMissionDirectoryHandle(create, preferredRootLabel);
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
    if (this.rootDirectoryHandle) {
      this.persistLastLoadedRootDirectoryHandle(this.rootDirectoryHandle).catch(() => {});
    }
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

  async listTree(preferredRootLabel = '') {
    const missionDir = await this.getMissionDirectoryHandle(true, preferredRootLabel);
    const nodes = await this.readDirectoryTree(missionDir, '');
    return {
      rootLabel: this.rootLabel,
      nodes
    };
  }

  joinPath(parent, child) {
    return parent ? `${parent}/${child}` : child;
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
      const path = this.joinPath(relativePath, entry.name);
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
      path: this.joinPath(relativePath, entry.name)
    }));

    return [...directoryNodes, ...fileNodes];
  }
}
