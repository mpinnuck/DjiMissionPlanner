class MissionStorage {
  constructor(options = {}) {
    this.rootDirectoryHandle = null;
    this.onStatus = options.onStatus || null;
    this.onError = options.onError || null;
  }

  supportsFileSystemAccess() {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
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

  async pickRootDirectory() {
    if (!this.supportsFileSystemAccess()) {
      throw new Error('This browser does not support folder access. Use a Chromium browser over http://localhost.');
    }

    this.rootDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await this.ensurePermission(this.rootDirectoryHandle, 'readwrite');
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

  async getRootDirectoryHandle() {
    if (!this.rootDirectoryHandle) {
      await this.pickRootDirectory();
    }
    const granted = await this.ensurePermission(this.rootDirectoryHandle, 'readwrite');
    if (!granted) {
      throw new Error('Folder permission was not granted.');
    }
    return this.rootDirectoryHandle;
  }

  async getMissionDirectoryHandle(create = true) {
    const root = await this.getRootDirectoryHandle();
    const settingsDir = await root.getDirectoryHandle('settings', { create });
    return settingsDir.getDirectoryHandle('missions', { create });
  }

  async saveMissionJson({ missionName, jsonText }) {
    const missionDir = await this.getMissionDirectoryHandle(true);
    const safeName = this.sanitizeMissionName(missionName);
    const fileName = `${safeName}.json`;
    const fileHandle = await missionDir.getFileHandle(fileName, { create: true });
    const writer = await fileHandle.createWritable();
    await writer.write(jsonText);
    await writer.close();
    return `settings/missions/${fileName}`;
  }

  async listMissionTree() {
    const missionDir = await this.getMissionDirectoryHandle(true);
    const nodes = await this.readDirectoryTree(missionDir, '');
    return {
      rootLabel: 'settings/missions',
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

    const dirNodes = [];
    for (const dir of directories) {
      const path = relativePath ? `${relativePath}/${dir.name}` : dir.name;
      dirNodes.push({
        type: 'directory',
        name: dir.name,
        path,
        children: await this.readDirectoryTree(dir.handle, path)
      });
    }

    const fileNodes = files.map(file => {
      const path = relativePath ? `${relativePath}/${file.name}` : file.name;
      return {
        type: 'file',
        name: file.name,
        path,
        handle: file.handle
      };
    });

    return [...dirNodes, ...fileNodes];
  }

  async readMissionFile(fileHandle) {
    const granted = await this.ensurePermission(fileHandle, 'read');
    if (!granted) {
      throw new Error('Read permission for mission file was denied.');
    }
    const file = await fileHandle.getFile();
    return file.text();
  }
}
