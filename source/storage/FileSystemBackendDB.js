/**
 * FileSystemBackendDB.js  —  FileSystemBackend mixin: IndexedDB persistence
 * Mixed into FileSystemBackend.prototype via FileSystemBackend.js.
 *
 * Responsibilities:
 *  - openHandleDatabase: opens the 'djiMissionPlannerFS' IndexedDB store
 *  - persistRootDirectoryHandle / restoreRootDirectoryHandle /
 *    clearPersistedRootDirectoryHandle: store and retrieve the chosen
 *    root mission folder handle keyed by rootLabel
 *  - persistLastLoadedRootDirectoryHandle / restoreLastLoadedRootDirectoryHandle
 *  - persistLastLoadedFileHandle / restoreLastLoadedFileHandle:
 *    stores the handle of the most recently opened mission JSON file
 *  - directoryHandleKeyForRootLabel: generates the IndexedDB key for a label
 */
// FileSystemBackendDB.js
// Mixed into FileSystemBackend.prototype

const FileSystemBackendDB = {
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
},

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
},

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
},

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
},

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
},

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
},

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
},

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
};
