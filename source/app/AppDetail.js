/**
 * AppDetail.js  —  App mixin: item detail, mode control, and clear
 * Mixed into App.prototype via App.js.
 *
 * Responsibilities:
 *  - showDetail: routes to _showMobileDetail or _renderDetail based on screen
 *  - deleteItem: removes a waypoint or POI and refreshes the map
 *  - setMode: switches between 'select', 'addWaypoint', 'addPOI' modes
 *  - clearAll / clearAllWithoutPrompt: prompts then calls _doClear
 *  - _doClear: removes all markers, clears mission data and UI state
 */
// AppDetail.js
// Mixed into App.prototype in App.js
const AppDetail = {
/**
 * Routes item detail display to mobile bottom sheet or desktop detail panel based on screen size.
 *
 * @param {string} id
 * @param {string} type
 */
showDetail(id, type) {
  if (this.isMobileScreen) {
    this._showMobileDetail(id, type);
    return;
  }

  this.ui.hideMobileSheet();
  this._renderDetail(id, type);
},

/**
 * Removes a waypoint or POI, cleans up its marker, and refreshes the UI.
 *
 * @param {string} id
 * @param {string} type
 */
deleteItem(id, type) {
  if (type === 'wp') {
    this.mission.deleteWaypoint(id);
    this.selectedWaypointIds.delete(id);
    if (this.lastWaypointAnchorId === id) {
      this.lastWaypointAnchorId = null;
    }
    const marker = this.waypointMarkers.get(id);
    if (marker) {
      this.mapController.removeLayer(marker);
      this.waypointMarkers.delete(id);
    }
    this.refreshMarkerLabels();
    this.updateRoute();
  } else {
    this.mission.deletePOI(id);
    const marker = this.poiMarkers.get(id);
    if (marker) {
      this.mapController.removeLayer(marker);
      this.poiMarkers.delete(id);
    }
  }
  if (this.selectedId === id) {
    this.selectedId = null;
    this.selectedType = null;
    this.ui.showNothingSelected();
  }
  this.renderList();
  this.updateStats();
  if (this.selectedWaypointIds.size > 1) {
    this.showBulkWaypointDetail();
  } else if (this.selectedWaypointIds.size === 1) {
    const [onlyId] = this.selectedWaypointIds;
    this.selectedId = onlyId;
    this.selectedType = 'wp';
    this.showDetail(onlyId, 'wp');
  } else if (this.selectedId && this.selectedType) {
    this.showDetail(this.selectedId, this.selectedType);
  }
},

/**
 * Sets the interaction mode (select / addWaypoint / addPOI) and updates the UI.
 *
 * @param {L.Map} m
 */
setMode(m) {
  this.mode = m;
  this.ui.setMode(m);
  this.ui.setMobileModeActive(m);
},

/**
 * Prompts for confirmation then clears all waypoints and POIs from the mission.
 *
 * @returns {Promise<void>}
 */
async clearAll() {
  const confirmed = await this.ui.showConfirmDialog({
    title: 'Clear Mission?',
    message: 'Clear all waypoints and POIs?',
    confirmLabel: 'Clear All',
    cancelLabel: 'Cancel',
    tone: 'danger'
  });

  if (!confirmed) {
    return;
  }

  this._doClear();
},

/**
 * Immediately clears all waypoints and POIs without a confirmation dialog.
 */
clearAllWithoutPrompt() {
  this._doClear();
},
/**
 * Removes all markers, resets all mission state, and refreshes the UI.
 */
_doClear() {
  this.waypointMarkers.forEach(marker => this.mapController.removeLayer(marker));
  this.poiMarkers.forEach(marker => this.mapController.removeLayer(marker));
  this.waypointMarkers.clear();
  this.poiMarkers.clear();
  this.heightAboveGroundByWaypointId.clear();
  this.heightAboveGroundByPoiId.clear();
  this.waypointGroundElevationById.clear();
  this.takeoffGroundElevation = null;
  this.mission.clear();
  this.mapController.clearRoute();
  this.syncFlythroughMission();
  this.selectedId = null;
  this.selectedType = null;
  this.selectedWaypointIds.clear();
  this.lastWaypointAnchorId = null;
  this.touchRangeAnchorId = null;
  this.ui.showNothingSelected();
  this.renderList();
  this.updateStats();
},

};
