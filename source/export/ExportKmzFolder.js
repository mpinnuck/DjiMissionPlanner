/**
 * ExportKmzFolder.js  —  ExportKmz mixin: export folder persistence
 * Mixed into ExportKmz.prototype via ExportKmz.js.
 *
 * Responsibilities:
 *  - IndexedDB open/read/write for the chosen export folder handle
 *  - persistFolderHandle / restoreFolderHandle / clearPersistedFolderHandle
 *  - loadFolderHandle: restores handle and verifies read permission
 *  - ensurePermission: requests readwrite permission on a directory handle
 *  - hasSavedFolder / canChooseFolder
 *  - promptForFolder: shows showDirectoryPicker and persists the result
 *  - clearSavedFolder / getExportFolder / getSavedExportFolder
 */
// ExportKmzFolder.js
// Mixed into ExportKmz.prototype

const ExportKmzFolder = {
async openHandleDatabase() {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(this.folderHandleStoreName, 1);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(this.folderHandleStore)) {
        db.createObjectStore(this.folderHandleStore);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open export handle database.'));
  });
},

async persistFolderHandle(handle) {
  if (!handle) {
    return;
  }

  const db = await this.openHandleDatabase();
  if (!db) {
    return;
  }

  await new Promise((resolve, reject) => {
    const tx = db.transaction(this.folderHandleStore, 'readwrite');
    tx.objectStore(this.folderHandleStore).put(handle, this.folderHandleDbKey);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Failed to persist export folder.'));
  });
  db.close();
},

async restoreFolderHandle() {
  const db = await this.openHandleDatabase();
  if (!db) {
    return null;
  }

  const handle = await new Promise((resolve, reject) => {
    const tx = db.transaction(this.folderHandleStore, 'readonly');
    const request = tx.objectStore(this.folderHandleStore).get(this.folderHandleDbKey);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Failed to read saved export folder.'));
  });
  db.close();
  return handle;
},

async clearPersistedFolderHandle() {
  const db = await this.openHandleDatabase();
  if (!db) {
    return;
  }

  await new Promise((resolve, reject) => {
    const tx = db.transaction(this.folderHandleStore, 'readwrite');
    tx.objectStore(this.folderHandleStore).delete(this.folderHandleDbKey);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Failed to clear saved export folder.'));
  });
  db.close();
},

async loadFolderHandle() {
  try {
    this.folderHandle = await this.restoreFolderHandle();
  } catch (error) {
    this.folderHandle = null;
  }

  return this.folderHandle;
},

async ensurePermission(handle) {
  const options = { mode: 'readwrite' };
  if (typeof handle?.queryPermission === 'function') {
    const queried = await handle.queryPermission(options);
    if (queried === 'granted') {
      return true;
    }
  }
  if (typeof handle?.requestPermission === 'function') {
    const requested = await handle.requestPermission(options);
    return requested === 'granted';
  }
  return !!handle;
},

hasSavedFolder() {
  return !!this.folderHandle || localStorage.getItem(this.folderHandleKey) !== null;
},

canChooseFolder() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
},

async promptForFolder() {
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const permissionGranted = await this.ensurePermission(dirHandle);
    if (!permissionGranted) {
      return null;
    }

    await this.persistFolderHandle(dirHandle);
    localStorage.setItem(this.folderHandleKey, 'true');
    this.folderHandle = dirHandle;
    return dirHandle;
  } catch (err) {
    if (err.name !== 'AbortError') {
      this.onError(`Failed to access folder: ${err.message}`);
    }
    return null;
  }
},

async clearSavedFolder() {
  localStorage.removeItem(this.folderHandleKey);
  this.folderHandle = null;
  try {
    await this.clearPersistedFolderHandle();
  } catch (error) {
    // Ignore IndexedDB cleanup failures and continue.
  }
},

async getExportFolder() {
  if (this.folderHandleRestorePromise) {
    await this.folderHandleRestorePromise;
    this.folderHandleRestorePromise = null;
  }

  if (this.folderHandle) {
    try {
      const granted = await this.ensurePermission(this.folderHandle);
      if (granted) {
        return this.folderHandle;
      }
    } catch (err) {
      this.folderHandle = null;
    }
  }

  if (!this.hasSavedFolder()) {
    return await this.promptForFolder();
  }

  await this.clearSavedFolder();
  return await this.promptForFolder();
},

async getSavedExportFolder() {
  if (this.folderHandleRestorePromise) {
    await this.folderHandleRestorePromise;
    this.folderHandleRestorePromise = null;
  }

  const hadSavedMarker = localStorage.getItem(this.folderHandleKey) !== null;
  if (!this.folderHandle && !hadSavedMarker) {
    return null;
  }

  if (!this.folderHandle && hadSavedMarker) {
    await this.clearSavedFolder();
    return null;
  }

  try {
    const granted = await this.ensurePermission(this.folderHandle);
    if (granted) {
      return this.folderHandle;
    }
  } catch (err) {
    // Ignore and clear stale handles below.
  }

  await this.clearSavedFolder();
  return null;

}
};
