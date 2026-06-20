// AppSaveLoad.js
// Mixed into App.prototype in App.js
const AppSaveLoad = {
exportMissionJson() {
  return MissionSerializer.stringify({
    mission: this.mission,
    settings: this.ui.getMissionSettings()
  });
},

importMissionJson(jsonText) {
  const state = MissionSerializer.parse(jsonText);

  this.clearAllWithoutPrompt();
  this.ui.applyMissionSettings(state.settings);
  this.currentMissionDefaultSpeedMps = this.ui.getDefaultSpeed();
  this.applyDroneConfiguration(false);

  state.pois.forEach(poi => {
    const poiCopy = { ...poi };
    this.mission.addPOI(poiCopy);
    const marker = this.addPOIMarker(poiCopy);
    this.poiMarkers.set(poiCopy.id, marker);
  });

  state.waypoints.forEach(wp => {
    const waypointCopy = { ...wp };
    this.mission.addWaypoint(waypointCopy);
    const marker = this.addWaypointMarker(waypointCopy, this.waypoints.indexOf(waypointCopy) + 1);
    this.waypointMarkers.set(waypointCopy.id, marker);
  });

  this.mission.wpCounter = state.counters.waypoint;
  this.mission.poiCounter = state.counters.poi;

  this.refreshMarkerLabels();
  this.recomputeAllPOI();
  this.updateRoute();
  this.mapController.focusMission(this.waypoints, this.pois);
  this.renderList();
  this.updateStats();
  this.showStatus(`Mission loaded (${this.waypoints.length} WPs, ${this.pois.length} POIs)`);
},

doExport() {
  this.kmzExporter.export({
    waypoints: this.waypoints,
    missionName: this.ui.getMissionName(),
    finishAction: this.ui.getFinishAction(),
    rcLostAction: this.ui.getRcLostAction(),
    headingMode: this.ui.getHeadingMode(),
    defaultSpeed: this.ui.getDefaultSpeed(),
    droneConfig: this.activeDroneConfig
  });
},

exportKmzAs() {
  this.kmzExporter.exportAs({
    waypoints: this.waypoints,
    missionName: this.ui.getMissionName(),
    finishAction: this.ui.getFinishAction(),
    rcLostAction: this.ui.getRcLostAction(),
    headingMode: this.ui.getHeadingMode(),
    defaultSpeed: this.ui.getDefaultSpeed(),
    droneConfig: this.activeDroneConfig
  });
},

async doMobileExport() {
  const canChooseFolder = typeof this.kmzExporter.canChooseFolder === 'function'
    ? this.kmzExporter.canChooseFolder()
    : false;
  const action = await this.ui.showExportOptionsDialog({ canChooseFolder });
  if (!action) {
    return;
  }

  if (action === 'folder') {
    await this.changeExportFolder();
    return;
  }

  this.doExport();
},

async changeExportFolder() {
  try {
    const dirHandle = await this.kmzExporter.promptForFolder();
    if (dirHandle) {
      this.showStatus('Export folder updated. Next export will use this folder.');
    }
  } catch (err) {
    this.showStatus(`Failed to select export folder: ${err.message}`);
  }
},

doUnselectAll() {
  this.clearSelection(false);
},

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

_persistSaveFileHandle(handle) {
  // No-op: handle caching removed — navigator.share is used for iOS saves.
},

async doSaveMission() {
  try {
    // On mobile/iOS (showDirectoryPicker unavailable), save silently to localStorage.
    // Long-press Save (saveMissionToFiles via share sheet) is used to push to iCloud.
    if (
      typeof window !== 'undefined' &&
      !PersistentStorage.supportsFileSystemAccess()
    ) {
      const jsonText = this.exportMissionJson();
      const savedPath = await this.storage.save(this.ui.getMissionName(), jsonText);
      this.showStatus(`Saved: ${savedPath}`);
      this.ui.showToast('Mission saved', 'success');
      return;
    }

    // Desktop with full filesystem access: use the storage backend
    const jsonText = this.exportMissionJson();
    const savedPath = await this.storage.save(this.ui.getMissionName(), jsonText);
    this.showStatus(`Saved mission: ${savedPath}`);
    this.ui.showToast(`Saved mission: ${savedPath}`, 'success');
  } catch (error) {
    this.onError(error.message || 'Failed to save mission file.');
    this.ui.showToast(error.message || 'Failed to save mission file.', 'error');
  }
},
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
      // The resulting handle is persisted so that subsequent plain saves overwrite this file.
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
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

applyDefaultAltitudeToAllWaypoints() {
  if (this.waypoints.length === 0) {
    this.showStatus('No waypoints to update.');
    return;
  }

  const altitude = this.ui.getDefaultAltitude();
  if (!Number.isFinite(altitude) || altitude <= 0) {
    this.showStatus('Enter a valid default altitude in meters.');
    return;
  }

  this.waypoints.forEach(waypoint => {
    waypoint.alt = altitude;
    this.recomputePOI(waypoint);
  });

  this.syncFlythroughMission();
  this.renderList();
  this.updateStats();
  if (this.selectedId && this.selectedType) {
    this.showDetail(this.selectedId, this.selectedType);
  }
  this.showStatus(`Applied ${Math.round(altitude)} m altitude to ${this.waypoints.length} waypoints.`);
},

async applyConstantHeightAboveGround() {
  if (!this.elevationService) {
    this.showStatus('Elevation service unavailable.');
    return;
  }
  if (this.waypoints.length === 0) {
    this.showStatus('No waypoints to update.');
    return;
  }

  const targetHag = this.ui.getConstantHeightAboveGround();
  if (!Number.isFinite(targetHag) || targetHag <= 0) {
    this.showStatus('Enter a valid constant HAG value in meters.');
    return;
  }

  const explicitTakeoffPoi = this.getTakeoffPoi();
  const takeoffPoi = explicitTakeoffPoi || this.waypoints[0];
  if (!takeoffPoi) {
    this.showStatus('Add waypoints before applying constant HAG.');
    return;
  }

  if (!explicitTakeoffPoi) {
    this.ui.showToast('No POI 1 found — using first waypoint as takeoff reference.', 'warning', { duration: 4000 });
  }

  const points = [
    { key: '__takeoff__', lat: takeoffPoi.lat, lng: takeoffPoi.lng },
    ...this.waypoints.map(waypoint => ({ key: waypoint.id, lat: waypoint.lat, lng: waypoint.lng }))
  ];

  const elevations = await this.elevationService.getElevations(points);
  const takeoffGround = this.elevationService.getElevation(takeoffPoi.lat, takeoffPoi.lng, elevations);
  if (!Number.isFinite(takeoffGround)) {
    this.showStatus('Unable to resolve takeoff elevation.');
    return;
  }

  let updatedCount = 0;
  this.waypoints.forEach(waypoint => {
    const waypointGround = this.elevationService.getElevation(waypoint.lat, waypoint.lng, elevations);
    if (!Number.isFinite(waypointGround)) {
      return;
    }

    // Keep a constant height above ground:
    // HAG = wp.alt + takeoffGround + takeoffElevation - waypointGround
    // => wp.alt = targetHag + waypointGround - takeoffGround - takeoffElevation
    const takeoffElevation = this.ui && typeof this.ui.getTakeoffElevation === 'function'
      ? this.ui.getTakeoffElevation()
      : 0;
    waypoint.alt = Math.round((targetHag + waypointGround - takeoffGround - takeoffElevation) * 100) / 100;
    this.recomputePOI(waypoint);
    updatedCount += 1;
  });

  this.syncFlythroughMission();
  this.renderList();
  this.updateStats();
  if (this.selectedId && this.selectedType) {
    this.showDetail(this.selectedId, this.selectedType);
  }
  this.showStatus(`Applied ${targetHag} m HAG to ${updatedCount} waypoints.`);
},

isTypingInEditableControl() {
  const active = document.activeElement;
  if (!active) {
    return false;
  }

  const tag = active.tagName ? active.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return true;
  }

  return !!active.isContentEditable;
},

async copySelectedWaypointsToClipboard() {
  const selectedWaypoints = this.waypoints.filter(waypoint => this.selectedWaypointIds.has(waypoint.id));
  if (selectedWaypoints.length < 2) {
    return false;
  }

  // Internal IDs are excluded; all other authored fields are preserved.
  // heading and gimbalPitch are included so manually-set values survive paste.
  const clipboardPayload = {
    schema: 'dji-mission-planner/waypoint-copy-v1',
    copiedAt: Date.now(),
    waypoints: selectedWaypoints.map(waypoint => ({
      lat: waypoint.lat,
      lng: waypoint.lng,
      alt: waypoint.alt,
      speed: waypoint.speed,
      heading: waypoint.heading,
      gimbalPitch: waypoint.gimbalPitch,
      actions: Array.isArray(waypoint.actions) && waypoint.actions.length > 0
        ? waypoint.actions.map(a => ({ ...a }))
        : undefined
    }))
  };
  const payload = JSON.stringify(clipboardPayload, null, 2);

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(payload);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = payload;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!copied) {
        throw new Error('Clipboard copy command was rejected.');
      }
    }

    this.showStatus(`Copied ${selectedWaypoints.length} waypoints to clipboard.`);
    this.ui.showToast(`Copied ${selectedWaypoints.length} waypoints`, 'success');
    return true;
  } catch (error) {
    this.showStatus(`Unable to copy waypoints: ${error.message}`);
    this.ui.showToast('Unable to copy selected waypoints.', 'error');
    return false;
  }
},

deleteSelectionFromKeyboard() {
  if (this.selectedWaypointIds.size >= 1) {
    const waypointIds = [...this.selectedWaypointIds];
    waypointIds.forEach(waypointId => this.deleteItem(waypointId, 'wp'));
    this.showStatus(`Deleted ${waypointIds.length} waypoint${waypointIds.length === 1 ? '' : 's'}.`);
    return true;
  }

  if (this.selectedId && this.selectedType) {
    this.deleteItem(this.selectedId, this.selectedType);
    return true;
  }

  return false;
},

async openLoadMissionDialog() {
  try {
    if (!this.lastLoadedMissionFolder) {
      this.lastLoadedMissionLocation = this.storage.getLastLoadedMissionLocation();
      this.lastLoadedMissionFolder = this.lastLoadedMissionLocation.folderPath || '';
      this.lastLoadedMissionRootLabel = this.lastLoadedMissionLocation.rootLabel || '';
    }

    const tree = await this.storage.listTree(this.lastLoadedMissionLocation.rootLabel || '');
    const initialExpandedPath = tree.rootLabel === this.lastLoadedMissionRootLabel
      ? this.lastLoadedMissionFolder
      : '';
    this.ui.showMissionLoadDialog({
      rootLabel: tree.rootLabel,
      nodes: tree.nodes,
      initialExpandedPath,
      onCancel: () => this.ui.closeMissionLoadDialog(),
      onSelectFile: async node => {
        try {
          const jsonText = await this.storage.load(node.path);
          this.importMissionJson(jsonText);
          this.lastLoadedMissionLocation = {
            rootLabel: tree.rootLabel,
            folderPath: this.getMissionFolderPath(node.path, tree.rootLabel)
          };
          this.lastLoadedMissionFolder = this.lastLoadedMissionLocation.folderPath;
          this.lastLoadedMissionRootLabel = this.lastLoadedMissionLocation.rootLabel;
          this.storage.setLastLoadedMissionLocation(this.lastLoadedMissionLocation);
          const loadedDisplayPath = this.getLoadedMissionDisplayPath(node.path, tree.rootLabel);
          this.ui.closeMissionLoadDialog();
          this.showStatus(`Loaded mission file: ${loadedDisplayPath}`);
          this.ui.showToast(`Loaded mission: ${loadedDisplayPath}`, 'success', { id: 'missionLoadToast' });
        } catch (error) {
          this.onError(error.message || 'Failed to load mission file.');
          this.ui.showToast(error.message || 'Failed to load mission file.', 'error');
        }
      },
      onDeleteFile: async node => {
        const confirmed = await this.ui.showConfirmDialog({
          title: 'Delete Mission File?',
          message: `Delete mission file?\n\n${node.path}`,
          confirmLabel: 'Delete',
          cancelLabel: 'Cancel',
          tone: 'danger'
        });
        if (!confirmed) {
          return;
        }

        try {
          await this.storage.delete(node.path);
          this.showStatus(`Deleted mission file: ${node.path}`);
          this.ui.showToast(`Deleted mission: ${node.path}`, 'success');
          this.openLoadMissionDialog();
        } catch (error) {
          this.onError(error.message || 'Failed to delete mission file.');
          this.ui.showToast(error.message || 'Failed to delete mission file.', 'error');
        }
      },
      onRefresh: () => {
        this.openLoadMissionDialog();
      },
      onChooseFolder: this.storage.canChooseRootDirectory() ? async () => {
        try {
          await this.storage.chooseRootDirectory();
          this.openLoadMissionDialog();
        } catch (error) {
          this.onError(error.message || 'Folder selection was cancelled.');
        }
      } : null,
      onOpenFromFiles: async file => {
        try {
          const jsonText = await file.text();
          this.importMissionJson(jsonText);
          this.ui.closeMissionLoadDialog();
          this.showStatus(`Loaded mission file: ${file.name}`);
          this.ui.showToast(`Loaded mission: ${file.name}`, 'success', { id: 'missionLoadToast' });
        } catch (error) {
          const message = error && error.message ? error.message : 'Failed to read mission file.';
          this.onError(message);
          this.ui.showToast(message, 'error');
        }
      }
    });
  } catch (error) {
    this.onError(error.message || 'Failed to open mission load dialog.');
  }
},

async doLoadMission() {
  if (this.storage.canOpenMissionFileDialog()) {
    try {
      const selected = await this.storage.openMissionFileDialog();
      this.importMissionJson(selected.jsonText);
      const loadedPath = selected.path || selected.name || 'mission.json';
      if (selected.rootLabel) {
        this.lastLoadedMissionLocation = {
          rootLabel: selected.rootLabel,
          folderPath: selected.directoryPath || this.getMissionFolderPath(loadedPath, '')
        };
        this.lastLoadedMissionFolder = this.lastLoadedMissionLocation.folderPath;
        this.lastLoadedMissionRootLabel = this.lastLoadedMissionLocation.rootLabel;
        this.storage.setLastLoadedMissionLocation(this.lastLoadedMissionLocation);
      }
      let postLoadDebugContext = null;
      try {
        postLoadDebugContext = await this.storage.getDebugContext();
      } catch (error) {
        postLoadDebugContext = null;
      }

      const loadedDisplayPath = this.getLoadedMissionDisplayPathForPicker(selected, loadedPath, postLoadDebugContext);
      this.showStatus(`Loaded mission file: ${loadedDisplayPath}`);
      this.ui.showToast(`Loaded mission: ${loadedDisplayPath}`, 'success', { id: 'missionLoadToast' });
      return;
    } catch (error) {
      const message = error && error.message ? error.message : 'Failed to load mission file.';
      if (message === 'Mission file selection was cancelled.') {
        return;
      }

      this.onError(message);
      this.ui.showToast(message, 'error');
      return;
    }
  }

  this.openLoadMissionDialog();
},

getMissionFolderPath(path, rootLabel) {
  const normalizedPath = String(path || '').replace(/\\/g, '/');
  const normalizedRoot = String(rootLabel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const prefix = normalizedRoot ? `${normalizedRoot}/` : '';
  const relative = prefix && normalizedPath.startsWith(prefix)
    ? normalizedPath.slice(prefix.length)
    : normalizedPath;
  const parts = relative.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
},

normalizeCloudDisplayPath(pathValue) {
  const normalized = String(pathValue || '').replace(/\\/g, '/').trim();
  if (!normalized) {
    return '';
  }

  const iCloudPatterns = [
    /^\/Users\/[^/]+\/Library\/Mobile Documents\/com~apple~CloudDocs\/?(.*)$/i,
    /^\/Users\/[^/]+\/Library\/Mobile Documents\/comappleCloudDocs\/?(.*)$/i,
    /^\/Users\/[^/]+\/Library\/Mobile Documents\/com\.apple\.CloudDocs\/?(.*)$/i
  ];

  for (const pattern of iCloudPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const suffix = String(match[1] || '').replace(/^\/+|\/+$/g, '');
      return suffix ? `iCloud/${suffix}` : 'iCloud';
    }
  }

  const cloudStorageMatch = normalized.match(/^\/Users\/[^/]+\/Library\/CloudStorage\/([^/]+)\/?(.*)$/i);
  if (cloudStorageMatch) {
    const volumeName = String(cloudStorageMatch[1] || '');
    const suffix = String(cloudStorageMatch[2] || '').replace(/^\/+|\/+$/g, '');
    const lowerVolume = volumeName.toLowerCase();

    let providerLabel = volumeName;
    if (lowerVolume.startsWith('googledrive')) {
      providerLabel = 'Google Drive';
    } else if (lowerVolume.startsWith('onedrive')) {
      providerLabel = 'OneDrive';
    }

    return suffix ? `${providerLabel}/${suffix}` : providerLabel;
  }

  return normalized;
},

getLoadedMissionDisplayPath(path, rootLabel) {
  const normalizedPath = this.normalizeCloudDisplayPath(path).replace(/^\/+/, '');
  const normalizedRoot = this.normalizeCloudDisplayPath(rootLabel).replace(/^\/+|\/+$/g, '');
  if (!normalizedRoot) {
    return normalizedPath || 'mission.json';
  }

  if (!normalizedPath) {
    return normalizedRoot;
  }

  if (normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath;
  }

  return `${normalizedRoot}/${normalizedPath}`;
},

getLoadedMissionDisplayPathForPicker(selected, fallbackPath, debugContext = null) {
  const loadedPath = String(fallbackPath || selected?.path || selected?.name || 'mission.json');
  const rootLabel = this.normalizeCloudDisplayPath(selected?.rootLabel || selected?.startRootLabel || '');
  const directoryPath = String(selected?.directoryPath || selected?.startDirectoryPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  const fileName = String(selected?.name || loadedPath.split('/').pop() || 'mission.json');

  if (rootLabel && directoryPath) {
    return `${rootLabel}/${directoryPath}/${fileName}`;
  }

  if (rootLabel) {
    return this.getLoadedMissionDisplayPath(loadedPath, rootLabel);
  }

  const savedLocation = debugContext && debugContext.savedLocation && typeof debugContext.savedLocation === 'object'
    ? debugContext.savedLocation
    : null;
  const savedRoot = savedLocation && savedLocation.rootLabel
    ? this.normalizeCloudDisplayPath(savedLocation.rootLabel)
    : '';
  const savedFolder = savedLocation && savedLocation.folderPath
    ? String(savedLocation.folderPath).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    : '';

  if (savedRoot && savedFolder) {
    return `${savedRoot}/${savedFolder}/${fileName}`;
  }

  if (savedRoot) {
    return this.getLoadedMissionDisplayPath(loadedPath, savedRoot);
  }

  return loadedPath;
},

getLoadPickerContextText(debugContext) {
  if (!debugContext || typeof debugContext !== 'object') {
    return '';
  }

  const handles = debugContext.handles && typeof debugContext.handles === 'object'
    ? debugContext.handles
    : {};
  const savedLocation = debugContext.savedLocation && typeof debugContext.savedLocation === 'object'
    ? debugContext.savedLocation
    : {};

  const rootLabelRaw = handles.lastLoadedRootHandleName
    || handles.preferredRootHandleName
    || savedLocation.rootLabel
    || handles.currentRootHandleName
    || 'unknown root';
  const rootLabel = this.normalizeCloudDisplayPath(rootLabelRaw);
  const folderPath = savedLocation.folderPath || '/';
  const lastFileName = handles.lastLoadedFileHandleName || 'none';

  return `${rootLabel} | ${folderPath} | last file: ${lastFileName}`;
},

getLoadPickerContextSuffix(selected, debugContext = null) {
  const source = selected && selected.startInSource ? String(selected.startInSource) : 'unknown';
  const selectedRoot = this.normalizeCloudDisplayPath(selected?.rootLabel || selected?.startRootLabel || '');
  const selectedFolder = String(selected?.directoryPath || selected?.startDirectoryPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  const relativePath = String(selected?.path || selected?.name || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');

  const savedLocation = debugContext && debugContext.savedLocation && typeof debugContext.savedLocation === 'object'
    ? debugContext.savedLocation
    : null;
  const handles = debugContext && debugContext.handles && typeof debugContext.handles === 'object'
    ? debugContext.handles
    : {};

  const savedRoot = savedLocation && savedLocation.rootLabel
    ? this.normalizeCloudDisplayPath(savedLocation.rootLabel)
    : '';
  const savedFolder = savedLocation && savedLocation.folderPath
    ? String(savedLocation.folderPath).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    : '';
  const handleRoot = this.normalizeCloudDisplayPath(
    handles.lastLoadedRootHandleName || handles.preferredRootHandleName || handles.currentRootHandleName || ''
  );
  const lastFileName = String(handles.lastLoadedFileHandleName || selected?.name || '').trim();

  const root = selectedRoot || savedRoot || handleRoot;
  const folder = selectedFolder || savedFolder;

  const parts = [`picker=${source}`];
  if (root) {
    parts.push(`root=${root}`);
  }
  if (folder) {
    parts.push(`folder=${folder}`);
  }
  if (relativePath) {
    parts.push(`relative=${relativePath}`);
  }
  if (lastFileName) {
    parts.push(`file=${lastFileName}`);
  }

  return ` [${parts.join(' | ')}]`;
}

};
