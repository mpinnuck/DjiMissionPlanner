// AppSelection2.js
// Mixed into App.prototype in App.js

const AppSelection = {
selectItem(id, type, interaction = {}) {
  if (type === 'wp' && interaction.shiftKey && this.lastWaypointAnchorId) {
    this.applyWaypointRangeSelection(this.lastWaypointAnchorId, id, true);
    this.lastWaypointAnchorId = id;
    this.applyWaypointSelectionState();
    return;
  }

  this.selectedWaypointIds.clear();
  this.selectedId = id;
  this.selectedType = type;
  if (type !== 'wp') {
    this.closeWaypointTooltip();
    this.ui.closeWaypointOptionsDialog();
  }
  if (type !== 'poi') {
    this.ui.closePOIOptionsDialog();
  }
  if (type === 'wp') {
    this.lastWaypointAnchorId = id;
  }
  this.ui.highlightSelectedItem(id, this.selectedWaypointIds);
  this.refreshMarkerLabels();
  this.showDetail(id, type);
},

toggleWaypointMultiSelect(id, isSelected, options = {}) {
  if (options.shiftKey && this.lastWaypointAnchorId) {
    this.applyWaypointRangeSelection(this.lastWaypointAnchorId, id, isSelected);
  } else if (isSelected) {
    this.selectedWaypointIds.add(id);
  } else {
    this.selectedWaypointIds.delete(id);
  }

  this.lastWaypointAnchorId = id;
  this.applyWaypointSelectionState();
},

startWaypointTouchRange(anchorId) {
  this.touchRangeAnchorId = anchorId;
  this.applyWaypointRangeSelection(anchorId, anchorId, true);
  this.lastWaypointAnchorId = anchorId;
  this.applyWaypointSelectionState();
},

moveWaypointTouchRange(anchorId, targetId, isSelected = true) {
  if (!this.touchRangeAnchorId) {
    return;
  }
  const sourceAnchor = anchorId || this.touchRangeAnchorId;
  this.applyWaypointRangeSelection(sourceAnchor, targetId, isSelected);
  this.lastWaypointAnchorId = targetId;
  this.applyWaypointSelectionState();
},

endWaypointTouchRange() {
  this.touchRangeAnchorId = null;
},

applyWaypointRangeSelection(anchorId, targetId, isSelected) {
  const orderedWaypointIds = this.waypoints.map(wp => wp.id);
  const startIndex = orderedWaypointIds.indexOf(anchorId);
  const endIndex = orderedWaypointIds.indexOf(targetId);

  if (startIndex === -1 || endIndex === -1) {
    return;
  }

  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);
  for (let index = from; index <= to; index += 1) {
    const waypointId = orderedWaypointIds[index];
    if (isSelected) {
      this.selectedWaypointIds.add(waypointId);
    } else {
      this.selectedWaypointIds.delete(waypointId);
    }
  }
},

applyWaypointSelectionState() {
  if (this.selectedWaypointIds.size > 1) {
    this.selectedId = null;
    this.selectedType = null;
    this.renderList();
  this.ui.highlightSelectedItem(null, this.selectedWaypointIds,
      this.waypoints.findLast(wp => this.selectedWaypointIds.has(wp.id))?.id ?? null);
    this.showBulkWaypointDetail();
    return;
  }

  if (this.selectedWaypointIds.size === 1) {
    const [onlyId] = this.selectedWaypointIds;
    this.selectedId = onlyId;
    this.selectedType = 'wp';
    this.renderList();
    this.ui.highlightSelectedItem(onlyId, this.selectedWaypointIds, onlyId);
    this.showDetail(onlyId, 'wp');
    return;
  }

  if (this.selectedId && this.selectedType && this.selectedType !== 'wp') {
    this.renderList();
    this.showDetail(this.selectedId, this.selectedType);
    return;
  }

  this.selectedId = null;
  this.selectedType = null;
  this.renderList();
  this.ui.showNothingSelected();
  this.ui.hideMobileSheet();
},

clearWaypointMultiSelection() {
  this.selectedWaypointIds.clear();
  this.touchRangeAnchorId = null;
  this.lastWaypointAnchorId = null;
  this.renderList();
  if (this.selectedId && this.selectedType) {
    this.showDetail(this.selectedId, this.selectedType);
  } else {
    this.ui.showNothingSelected();
  }
},

showBulkWaypointDetail() {
  const selectedWaypoints = this.waypoints.filter(wp => this.selectedWaypointIds.has(wp.id));
  if (selectedWaypoints.length < 2) {
    return;
  }

  if (this.isMobileScreen) {
    this.ui.showMobileDetailSheet('Bulk Edit');
  }

  this.ui.showBulkWaypointDetail({
    selectedCount: selectedWaypoints.length,
    pois: this.pois,
    targetElement: this.isMobileScreen ? this.ui.mobileSheetBody : null,
    onApply: values => this.applyBulkWaypointUpdate(values),
    onApplyAll: values => this.applyBulkWaypointUpdate(values, this.waypoints),
    onClearSelection: () => this.clearWaypointMultiSelection()
  });
},

async openBulkWaypointSettingsDialog() {
  const selectedWaypoints = this.waypoints.filter(wp => this.selectedWaypointIds.has(wp.id));
  if (selectedWaypoints.length === 0) {
    this.showStatus('No waypoints selected.');
    return;
  }

  const values = await this.ui.showBulkWaypointActionDialog({
    selectedCount: selectedWaypoints.length,
    pois: this.pois
  });
  if (!values) {
    return;
  }

  const targets = values.applyAll ? this.waypoints : selectedWaypoints;
  await this.applyBulkWaypointSettingsFromDialog(values, targets);
},

async applyBulkWaypointSettingsFromDialog({ altitudeValue, speedValue, hagValue, poiValue }, selectedWaypoints) {
  const altitude = parseFloat(altitudeValue);
  const speedKmh = parseFloat(speedValue);
  const targetHag = parseFloat(hagValue);
  const applyAltitude = String(altitudeValue || '').trim() !== '' && Number.isFinite(altitude);
  const applySpeed = String(speedValue || '').trim() !== '' && Number.isFinite(speedKmh);
  const applyHag = String(hagValue || '').trim() !== '' && Number.isFinite(targetHag) && targetHag > 0;
  const applyPoi = poiValue !== '__KEEP__';

  if (!applyAltitude && !applySpeed && !applyHag && !applyPoi) {
    this.showStatus('No bulk changes applied.');
    return;
  }

  selectedWaypoints.forEach(waypoint => {
    if (applyAltitude) {
      waypoint.alt = altitude;
    }
    if (applySpeed) {
      waypoint.speed = Number((speedKmh / 3.6).toFixed(2));
    }
    if (applyPoi) {
      waypoint.poiId = poiValue === '__NONE__' ? null : poiValue;
    }
    this.recomputePOI(waypoint);
  });

  if (applyHag && this.elevationService) {
    const takeoffPoi = this.getTakeoffPoi() || this.waypoints[0];
    if (takeoffPoi) {
      const points = [
        { key: '__takeoff__', lat: takeoffPoi.lat, lng: takeoffPoi.lng },
        ...selectedWaypoints.map(waypoint => ({ key: waypoint.id, lat: waypoint.lat, lng: waypoint.lng }))
      ];
      const elevations = await this.elevationService.getElevations(points);
      const takeoffGround = this.elevationService.getElevation(takeoffPoi.lat, takeoffPoi.lng, elevations);
      const takeoffElevation = this.ui && typeof this.ui.getTakeoffElevation === 'function'
        ? this.ui.getTakeoffElevation()
        : 0;
      if (Number.isFinite(takeoffGround)) {
        selectedWaypoints.forEach(waypoint => {
          const waypointGround = this.elevationService.getElevation(waypoint.lat, waypoint.lng, elevations);
          if (!Number.isFinite(waypointGround)) {
            return;
          }
          // WP HAG = wp.alt + takeoffGround + takeoffElevation - waypointGround
          // => wp.alt = targetHag + waypointGround - takeoffGround - takeoffElevation
          waypoint.alt = Math.round((targetHag + waypointGround - takeoffGround - takeoffElevation) * 100) / 100;
          this.recomputePOI(waypoint);
        });
      }
    }
  }

  this.syncFlythroughMission();
  this.renderList();
  this.updateStats();
  this.showStatus(`Updated ${selectedWaypoints.length} waypoints.`);
},

handleSelectModeRequest() {
  if (this.mode === 'select') {
    if (this.selectedWaypointIds.size > 0) {
      this.openBulkWaypointSettingsDialog();
      return;
    }
    if (this.selectedType === 'wp' && this.selectedId) {
      this.openWaypointOptionsDialog(this.selectedId, { centered: true });
      return;
    }
    if (this.selectedType === 'poi' && this.selectedId) {
      this.openPOIOptionsDialog(this.selectedId, { centered: true });
      return;
    }
  }

  this.setMode('select');
},

applyBulkWaypointUpdate({ altitudeValue, speedValue, poiValue }, targetWaypoints = null) {
  const targets = targetWaypoints ?? this.waypoints.filter(wp => this.selectedWaypointIds.has(wp.id));
  this.applyBulkWaypointSettingsFromDialog({ altitudeValue, speedValue, hagValue: '', poiValue }, targets)
    .then(() => this.showBulkWaypointDetail());
},

renderList() {
  this.ui.renderList({
    waypoints: this.waypoints,
    pois: this.pois,
    selectedId: this.selectedId,
    selectedType: this.selectedType,
    selectedWaypointIds: this.selectedWaypointIds,
    heightAboveGroundByWaypointId: this.heightAboveGroundByWaypointId,
    heightAboveGroundByPoiId: this.heightAboveGroundByPoiId,
    onSelect: (id, type, interaction) => this.selectItem(id, type, interaction),
    onDelete: (id, type) => this.deleteItem(id, type),
    ...this._buildListCallbacks()
  });
  this.refreshMarkerLabels();
  this.scheduleHeightAboveGroundRefresh();
},

_buildListCallbacks() {
  const allow = this.mode === 'select';
  return {
    onToggleWaypointMultiSelect: allow
      ? (id, selected, options) => this.toggleWaypointMultiSelect(id, selected, options)
      : null,
    onRangeWaypointMultiSelect: allow
      ? (anchorId, targetId, isSelected) => this.moveWaypointTouchRange(anchorId, targetId, isSelected)
      : null,
    onStartWaypointTouchRange: allow
      ? anchorId => this.startWaypointTouchRange(anchorId)
      : null,
    onEndWaypointTouchRange: allow
      ? () => this.endWaypointTouchRange()
      : null,
    onAddAction:      (wpId, type, params) => this.addWaypointAction(wpId, type, params),
    onDeleteAction:   (wpId, actionId)     => this.deleteWaypointAction(wpId, actionId),
    onMoveActionUp:   (wpId, actionId)     => this.moveWaypointActionUp(wpId, actionId),
    onMoveActionDown: (wpId, actionId)     => this.moveWaypointActionDown(wpId, actionId),
  };
},

};
