/**
 * FileSystemBackendDir.js  —  FileSystemBackend mixin: directory operations
 * Mixed into FileSystemBackend.prototype via FileSystemBackend.js.
 *
 * Responsibilities:
 *  - chooseRootDirectory: shows showDirectoryPicker and persists the handle
 *  - ensurePermission: requests readwrite permission on a directory handle
 *  - ensureRootDirectory: restores or prompts for the root directory,
 *    with optional preferred root label for multi-root setups
 *  - openMissionFileDialog: shows the full mission load dialog with
 *    folder tree navigation and file selection
 *  - resolveDirectoryHandleFromPath / getMissionDirectoryHandle /
 *    resolveDirectoryForPath: navigate the directory tree to a sub-path
 */
// FileSystemBackendDir.js
// Mixed into FileSystemBackend.prototype

const FileSystemBackendDir = {

/**
 * Choose root directory.
 *
 * @returns {Promise<*>}
 */
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
},

/**
 * Ensure permission.
 *
 * @param {FileSystemHandle} handle
 * @param {string} mode
 *
 * @returns {Promise<*>}
 */
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
},

/**
 * Ensure root directory.
 *
 * @param {string} preferredRootLabel [default: '']
 *
 * @returns {Promise<void>}
 */
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
},

/**
 * Open mission file dialog.
 *
 * @param {string} preferredRootLabel [default: '']
 *
 * @returns {Promise<void>}
 */
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
},

/**
 * Resolve directory handle from path.
 *
 * @param {string} relativePath
 * @param {boolean} create [default: false]
 * @param {*} baseDirectoryHandle [default: null]
 *
 * @returns {Promise<*>}
 */
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
},

/**
 * Get mission directory handle.
 *
 * @param {boolean} create [default: true]
 * @param {string} preferredRootLabel [default: '']
 *
 * @returns {Promise<*>}
 */
async getMissionDirectoryHandle(create = true, preferredRootLabel = '') {
  const root = await this.ensureRootDirectory(preferredRootLabel);
  this.rootLabel = root && root.name ? root.name : this.rootLabel;
  return root;
},

/**
 * Resolve directory for path.
 *
 * @param {string} relativePath
 * @param {boolean} create [default: true]
 * @param {string} preferredRootLabel [default: '']
 *
 * @returns {Promise<Object>}
 */
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
};
