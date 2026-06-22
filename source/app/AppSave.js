/**
 * AppSave.js  —  App mixin: mission file save
 * Mixed into App.prototype via App.js.
 *
 * Responsibilities:
 *  - doUnselectAll / clearSelection
 *  - _persistSaveFileHandle: stores a writable FileSystemFileHandle in memory
 *  - doSaveMission: saves mission JSON to the filesystem or via Share Sheet
 *  - doMobileSave: mobile-specific save flow (Share Sheet on iOS)
 *  - saveMissionToFiles: shows showSaveFilePicker (desktop) or Share Sheet (iOS)
 *  - changeSaveMissionFolder: lets user choose a new save folder
 *  - applyDefaultAltitudeToAllWaypoints / applyConstantHeightAboveGround
 */
// AppSave.js
// Mixed into App.prototype in App.js

const AppSave = {
/**
 * Do unselect all.
 */
doUnselectAll() {
  this.clearSelection(false);
},

/**
 * Clear selection.
 *
 * @param {boolean} silent [default: false]
 */
clearSelection(silent = false) {
  this.closeWaypointTooltip();
  this.ui.closeWaypointOptionsDialog();
  this.ui.closePOIOptionsDialog();
  this.selectedWaypointIds.clear();
  this.selectedId = null;
  this.selectedType = null;
  this.lastWaypointAnchorId = null;
  this.touchRangeAnchorId = null;
  this.renderList();
  this.ui.showNothingSelected();
  this.ui.hideMobileSheet();
  if (!silent) {
    this.showStatus('Selection cleared.');
  }
},

/**
 * Persist save file handle.
 *
 * @param {FileSystemHandle} handle
 */
_persistSaveFileHandle(handle) {
  // No-op: handle caching removed — navigator.share is used for iOS saves.
},

/**
 * Do save mission.
 *
 * @returns {Promise<void>}
 */
async doSaveMission() {
  try {
    // On iOS/mobile where the File System Access API is unavailable,
    // always show the share sheet so the user can save back to iCloud.
    if (
      typeof window !== 'undefined' &&
      !PersistentStorage.supportsFileSystemAccess()
    ) {
      await this.saveMissionToFiles();
      return;
    }

    const jsonText = this.exportMissionJson();

    // Chrome's FileSystemDirectoryHandle.resolve() fails on handles restored
    // from IndexedDB, so directory-based path resolution writes to the wrong
    // folder. Instead, write directly to the persisted file handle from the
    // last load — it retains write capability without needing directory traversal.
    const missionName = this.ui.getMissionName();
    const expectedFileName = missionName.toLowerCase().endsWith('.json')
      ? missionName
      : `${missionName}.json`;

    const lastFileHandle = await this.storage.getLastLoadedFileHandle();
    if (lastFileHandle && lastFileHandle.name === expectedFileName) {
      try {
        const writable = await lastFileHandle.createWritable({ keepExistingData: false });
        await writable.write(jsonText);
        await writable.close();
        this.showStatus(`Saved mission: ${lastFileHandle.name}`);
        this.ui.showToast(`Saved mission: ${lastFileHandle.name}`, 'success');
        return;
      } catch (err) {
        // Permission may have lapsed — fall through to normal directory-based save.
        console.warn('[SaveMission] Direct file handle write failed, falling back:', err);
      }
    }

    const savedPath = await this.storage.save(missionName, jsonText);
    this.showStatus(`Saved mission: ${savedPath}`);
    this.ui.showToast(`Saved mission: ${savedPath}`, 'success');
  } catch (error) {
    this.onError(error.message || 'Failed to save mission file.');
    this.ui.showToast(error.message || 'Failed to save mission file.', 'error');
  }
},

/**
 * Do mobile save.
 *
 * @returns {Promise<void>}
 */
async doMobileSave() {
  const action = await this.ui.showSaveOptionsDialog({
    canChooseFolder: this.storage.canChooseRootDirectory(),
    canSaveToFiles: true
  });
  if (!action) {
    return;
  }

  if (action === 'folder') {
    await this.changeSaveMissionFolder();
    return;
  }

  if (action === 'files') {
    await this.saveMissionToFiles();
    return;
  }

  await this.doSaveMission();
},

/**
 * Save mission to files.
 *
 * @returns {Promise<void>}
 */
async saveMissionToFiles() {
  try {
    const jsonText = this.exportMissionJson();
    const safeBaseName = String(this.ui.getMissionName() || 'Mission')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Mission';
    const filename = safeBaseName.toLowerCase().endsWith('.json')
      ? safeBaseName
      : `${safeBaseName}.json`;

    if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
      // Save As — always show the picker so the user can choose a new location/name.
      // startIn is set to the last loaded file handle so the picker opens in the
      // mission folder rather than the last-used picker location (e.g. KMZ folder).
      let startIn;
      try {
        startIn = await this.storage.getLastLoadedFileHandle() || undefined;
      } catch (e) {
        startIn = undefined;
      }
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
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
      await this._persistSaveFileHandle(fileHandle);
      const writable = await fileHandle.createWritable();
      await writable.write(jsonText);
      await writable.close();
      this.showStatus(`Saved mission file: ${fileHandle.name}`);
      this.ui.showToast(`Saved to Files: ${fileHandle.name}`, 'success');
      return;
    }

    const jsonFile = new File([jsonText], filename, { type: 'application/json' });

    // Try the Web Share API (files only — no text: property which creates a rogue text file).
    // On iOS this shows the share sheet; the user can tap "Save to Files" to save to iCloud.
    let canShareFile = false;
    try {
      canShareFile = typeof navigator !== 'undefined'
        && typeof navigator.share === 'function'
        && typeof navigator.canShare === 'function'
        && navigator.canShare({ files: [jsonFile] });
    } catch (e) {
      canShareFile = false;
    }

    if (canShareFile) {
      try {
        await navigator.share({ files: [jsonFile] });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        console.warn('Share failed, falling back to download:', e);
      }
    }

    // Final fallback: browser download
    const url = URL.createObjectURL(new Blob([jsonText], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    this.showStatus(`Downloaded mission file: ${filename}`);
    this.ui.showToast(`Downloaded: ${filename}`, 'success');
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return;
    }
    this.onError(error.message || 'Failed to save mission to files.');
    this.ui.showToast(error.message || 'Failed to save mission to files.', 'error');
  }
},

/**
 * Change save mission folder.
 *
 * @returns {Promise<void>}
 */
async changeSaveMissionFolder() {
  if (!this.storage.canChooseRootDirectory()) {
    this.showStatus('Folder selection is not available in this browser.');
    return;
  }

  try {
    await this.storage.chooseRootDirectory();
    this.lastLoadedMissionLocation = this.storage.getLastLoadedMissionLocation();
    this.lastLoadedMissionFolder = this.lastLoadedMissionLocation.folderPath || '';
    this.lastLoadedMissionRootLabel = this.lastLoadedMissionLocation.rootLabel || '';
    this.showStatus('Mission folder updated. Next save will use this location.');
    this.ui.showToast('Mission save folder updated.', 'success');
  } catch (error) {
    this.showStatus(error.message || 'Folder selection was cancelled.');
  }
},

};
