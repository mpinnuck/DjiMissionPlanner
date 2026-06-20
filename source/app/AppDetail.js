// AppDetail.js
// Mixed into App.prototype in App.js
const AppDetail = {
showDetail(id, type) {
  if (this.isMobileScreen) {
    this._showMobileDetail(id, type);
    return;
  }

  this.ui.hideMobileSheet();
  this._renderDetail(id, type);
},

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

setMode(m) {
  this.mode = m;
  this.ui.setMode(m);
  this.ui.setMobileModeActive(m);
},

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

clearAllWithoutPrompt() {
  this._doClear();
},
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
