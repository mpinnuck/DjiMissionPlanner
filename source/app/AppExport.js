/**
 * AppExport.js  —  App mixin: mission JSON serialisation and KMZ export
 * Mixed into App.prototype via App.js.
 *
 * Responsibilities:
 *  - exportMissionJson / importMissionJson: serialise/deserialise mission
 *    state to/from JSON via MissionSerializer
 *  - doExport: triggers KMZ export via kmzExporter.export()
 *  - exportKmzAs / doMobileExport: KMZ "save as" and mobile export flows
 *  - changeExportFolder: prompts user to choose a new KMZ export folder
 */
// AppExport.js
// Mixed into App.prototype in App.js

const AppExport = {
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

};
