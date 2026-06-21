/**
 * AppLoad.js  —  App mixin: mission file load, clipboard, and keyboard
 * Mixed into App.prototype via App.js.
 *
 * Responsibilities:
 *  - isTypingInEditableControl: guards keyboard shortcuts from firing in inputs
 *  - copySelectedWaypointsToClipboard / deleteSelectionFromKeyboard
 *  - openLoadMissionDialog: shows the mission load UI with folder tree or picker
 *  - doLoadMission: loads a JSON file from the filesystem backend
 *  - applyBulkWaypointSettingsFromDialog: applies altitude/speed/POI to selection
 */
// AppLoad.js
// Mixed into App.prototype in App.js

const AppLoad = {
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

};
