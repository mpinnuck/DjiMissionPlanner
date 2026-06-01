class App {
  constructor(options) {
    this.mode = 'select';
    this.selectedId = null;
    this.selectedType = null;
    this.selectedWaypointIds = new Set();
    this.lastWaypointAnchorId = null;
    this.touchRangeAnchorId = null;
    this.mission = new Mission();
    this.ui = new PlannerUI({ mapElementId: options.mapElementId || 'map' });

    this.onStatus = options.onStatus || null;
    this.onError = options.onError || (message => alert(message));
    this.waypointMarkers = new Map();
    this.poiMarkers = new Map();

    this.mapController = new MapController(options.mapElementId || 'map');
    this.locationService = new LocationService({
      onStatus: message => this.showStatus(message),
      onError: message => this.onError(message),
      onLocated: location => {
        this.mapController.showUserLocation(location.lat, location.lng, location.accuracy);
        const accText = location.accuracy && Number.isFinite(location.accuracy)
          ? ` (accuracy approx. ${Math.round(location.accuracy)} m)`
          : '';
        this.showStatus(`Location updated${accText}`);
      }
    });

    this.kmzExporter = new ExportKmz({
      onStatus: message => this.showStatus(message),
      onError: message => this.onError(message)
    });
    this.storage = new PersistentStorage({
      onStatus: message => this.showStatus(message),
      onError: message => this.onError(message)
    });

    this.bindMapEvents();
    this.bindUIEvents();
    this.setMode('select');
    this.renderList();
    this.updateStats();
    this.showStatus(this.storage.getDescription());

    setTimeout(() => this.locateUser(), 0);
  }

  get waypoints() {
    return this.mission.waypoints;
  }

  get pois() {
    return this.mission.pois;
  }

  showStatus(message) {
    this.ui.setStatus(message);
    if (this.onStatus) {
      this.onStatus(message);
    }
  }

  updateStats() {
    this.ui.updateStats({
      waypointCount: this.waypoints.length,
      poiCount: this.pois.length,
      distanceMeters: this.mission.totalDistance()
    });
  }

  locateUser() {
    this.locationService.locateUser();
  }

  refreshMarkerLabels() {
    this.mapController.refreshWaypointLabels(this.waypoints, waypoint => this.waypointMarkers.get(waypoint.id));
  }

  addWaypointMarker(wp, idx) {
    const m = this.mapController.addWaypointMarker(wp, idx);
    m.on('click', () => this.selectItem(wp.id, 'wp'));
    m.on('dragend', e => {
      wp.lat = e.target.getLatLng().lat;
      wp.lng = e.target.getLatLng().lng;
      this.recomputePOI(wp);
      this.updateRoute();
      this.renderList();
      this.updateStats();
      if (this.selectedId === wp.id) {
        this.showDetail(wp.id, 'wp');
      }
    });
    return m;
  }

  addPOIMarker(poi) {
    const m = this.mapController.addPOIMarker(poi);
    m.on('click', () => this.selectItem(poi.id, 'poi'));
    m.on('dragend', e => {
      poi.lat = e.target.getLatLng().lat;
      poi.lng = e.target.getLatLng().lng;
      this.recomputeAllPOI();
      this.renderList();
      this.updateStats();
      if (this.selectedId === poi.id) {
        this.showDetail(poi.id, 'poi');
      }
    });
    return m;
  }

  recomputePOI(wp) {
    this.mission.recomputePOI(wp);
  }

  recomputeAllPOI() {
    this.mission.recomputeAllPOI();
  }

  updateRoute() {
    this.mapController.updateRoute(this.waypoints);
  }

  bindMapEvents() {
    this.mapController.onClick(e => {
      if (this.mode === 'wp') {
        const wp = this.mission.createWaypoint(e.latlng.lat, e.latlng.lng, {
          altitude: this.ui.getDefaultAltitude(),
          speed: this.ui.getDefaultSpeed()
        });
        const marker = this.addWaypointMarker(wp, this.waypoints.length + 1);
        this.waypointMarkers.set(wp.id, marker);
        this.mission.addWaypoint(wp);
        this.updateRoute();
        this.renderList();
        this.updateStats();
        this.selectItem(wp.id, 'wp');
      } else if (this.mode === 'poi') {
        const poi = this.mission.createPOI(e.latlng.lat, e.latlng.lng);
        const marker = this.addPOIMarker(poi);
        this.poiMarkers.set(poi.id, marker);
        this.mission.addPOI(poi);
        this.renderList();
        this.updateStats();
        this.selectItem(poi.id, 'poi');
      }
    });

    this.mapController.onMouseMove(e => {
      this.ui.setCursor(e.latlng.lat, e.latlng.lng);
    });
  }

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
    if (type === 'wp') {
      this.lastWaypointAnchorId = id;
    }
    this.ui.highlightSelectedItem(id, this.selectedWaypointIds);
    this.showDetail(id, type);
  }

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
  }

  startWaypointTouchRange(anchorId) {
    this.touchRangeAnchorId = anchorId;
    this.applyWaypointRangeSelection(anchorId, anchorId, true);
    this.lastWaypointAnchorId = anchorId;
    this.applyWaypointSelectionState();
  }

  moveWaypointTouchRange(anchorId, targetId, isSelected = true) {
    if (!this.touchRangeAnchorId) {
      return;
    }
    const sourceAnchor = anchorId || this.touchRangeAnchorId;
    this.applyWaypointRangeSelection(sourceAnchor, targetId, isSelected);
    this.lastWaypointAnchorId = targetId;
    this.applyWaypointSelectionState();
  }

  endWaypointTouchRange() {
    this.touchRangeAnchorId = null;
  }

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
  }

  applyWaypointSelectionState() {
    if (this.selectedWaypointIds.size > 1) {
      this.selectedId = null;
      this.selectedType = null;
      this.renderList();
      this.showBulkWaypointDetail();
      return;
    }

    if (this.selectedWaypointIds.size === 1) {
      const [onlyId] = this.selectedWaypointIds;
      this.selectedId = onlyId;
      this.selectedType = 'wp';
      this.renderList();
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
  }

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
  }

  showBulkWaypointDetail() {
    const selectedWaypoints = this.waypoints.filter(wp => this.selectedWaypointIds.has(wp.id));
    if (selectedWaypoints.length < 2) {
      return;
    }

    this.ui.showBulkWaypointDetail({
      selectedCount: selectedWaypoints.length,
      pois: this.pois,
      onApply: values => this.applyBulkWaypointUpdate(values),
      onClearSelection: () => this.clearWaypointMultiSelection()
    });
  }

  applyBulkWaypointUpdate({ altitudeValue, speedValue, poiValue }) {
    const altitude = parseFloat(altitudeValue);
    const speed = parseFloat(speedValue);
    const applyAltitude = altitudeValue.trim() !== '' && Number.isFinite(altitude);
    const applySpeed = speedValue.trim() !== '' && Number.isFinite(speed);
    const applyPoi = poiValue !== '__KEEP__';

    if (!applyAltitude && !applySpeed && !applyPoi) {
      this.showStatus('No bulk changes applied.');
      return;
    }

    const targetWaypoints = this.waypoints.filter(wp => this.selectedWaypointIds.has(wp.id));
    targetWaypoints.forEach(wp => {
      if (applyAltitude) {
        wp.alt = altitude;
      }
      if (applySpeed) {
        wp.speed = speed;
      }
      if (applyPoi) {
        wp.poiId = poiValue === '__NONE__' ? null : poiValue;
      }
      this.recomputePOI(wp);
    });

    this.renderList();
    this.updateStats();
    this.showBulkWaypointDetail();
    this.showStatus(`Updated ${targetWaypoints.length} waypoints.`);
  }

  renderList() {
    this.ui.renderList({
      waypoints: this.waypoints,
      pois: this.pois,
      selectedId: this.selectedId,
      selectedWaypointIds: this.selectedWaypointIds,
      resolvePoiName: poiId => (this.mission.findPOI(poiId) || { name: '?' }).name,
      onSelect: (id, type, interaction) => this.selectItem(id, type, interaction),
      onDelete: (id, type) => this.deleteItem(id, type),
      onToggleWaypointMultiSelect: (id, selected, options) => this.toggleWaypointMultiSelect(id, selected, options),
      onRangeWaypointMultiSelect: (anchorId, targetId, isSelected) => this.moveWaypointTouchRange(anchorId, targetId, isSelected),
      onStartWaypointTouchRange: anchorId => this.startWaypointTouchRange(anchorId),
      onEndWaypointTouchRange: () => this.endWaypointTouchRange()
    });
  }

  showDetail(id, type) {
    if (type === 'wp') {
      const wp = this.mission.findWaypoint(id);
      if (!wp) {
        return;
      }
      const poi = wp.poiId ? this.mission.findPOI(wp.poiId) : null;
      const distanceText = poi ? this.mission.haversine(wp.lat, wp.lng, poi.lat, poi.lng).toFixed(0) + 'm' : '?';
      this.ui.showWaypointDetail({
        wp,
        waypointIndex: this.waypoints.indexOf(wp) + 1,
        pois: this.pois,
        distanceText,
        onAltitudeChange: value => {
          wp.alt = parseFloat(value) || 50;
          this.recomputePOI(wp);
          this.renderList();
          if (wp.poiId) {
            this.showDetail(id, 'wp');
          }
        },
        onSpeedChange: value => {
          wp.speed = parseFloat(value) || 8;
          this.renderList();
        },
        onPoiChange: value => {
          wp.poiId = value || null;
          this.recomputePOI(wp);
          this.renderList();
          this.showDetail(id, 'wp');
        }
      });
    } else {
      const poi = this.mission.findPOI(id);
      if (!poi) {
        return;
      }
      this.ui.showPOIDetail({
        poi,
        onNameChange: value => {
          poi.name = value;
          const marker = this.poiMarkers.get(poi.id);
          if (marker) {
            this.mapController.updatePOILabel(marker, poi.name);
          }
          this.renderList();
        },
        onAltitudeChange: value => {
          poi.alt = parseFloat(value) || 0;
          this.recomputeAllPOI();
          this.renderList();
        }
      });
    }
  }

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
    }
  }

  setMode(m) {
    this.mode = m;
    this.ui.setMode(m);
  }

  clearAll() {
    if (!confirm('Clear all waypoints and POIs?')) {
      return;
    }
    this._doClear();
  }

  clearAllWithoutPrompt() {
    this._doClear();
  }

  _doClear() {
    this.waypointMarkers.forEach(marker => this.mapController.removeLayer(marker));
    this.poiMarkers.forEach(marker => this.mapController.removeLayer(marker));
    this.waypointMarkers.clear();
    this.poiMarkers.clear();
    this.mission.clear();
    this.mapController.clearRoute();
    this.selectedId = null;
    this.selectedType = null;
    this.selectedWaypointIds.clear();
    this.lastWaypointAnchorId = null;
    this.touchRangeAnchorId = null;
    this.ui.showNothingSelected();
    this.renderList();
    this.updateStats();
  }

  exportMissionJson() {
    return MissionSerializer.stringify({
      mission: this.mission,
      settings: this.ui.getMissionSettings()
    });
  }

  importMissionJson(jsonText) {
    const state = MissionSerializer.parse(jsonText);

    this.clearAllWithoutPrompt();
    this.ui.applyMissionSettings(state.settings);

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
    this.renderList();
    this.updateStats();
    this.showStatus(`Mission loaded (${this.waypoints.length} WPs, ${this.pois.length} POIs)`);
  }

  doExport() {
    this.kmzExporter.export({
      waypoints: this.waypoints,
      missionName: this.ui.getMissionName(),
      finishAction: this.ui.getFinishAction(),
      rcLostAction: this.ui.getRcLostAction(),
      headingMode: this.ui.getHeadingMode(),
      defaultSpeed: this.ui.getDefaultSpeed()
    });
  }

  doUnselectAll() {
    this.selectedWaypointIds.clear();
    this.selectedId = null;
    this.selectedType = null;
    this.lastWaypointAnchorId = null;
    this.touchRangeAnchorId = null;
    this.renderList();
    this.ui.showNothingSelected();
    this.showStatus('Selection cleared.');
  }

  async doSaveMission() {
    try {
      const jsonText = this.exportMissionJson();
      const savedPath = await this.storage.save(this.ui.getMissionName(), jsonText);
      this.showStatus(`Saved mission: ${savedPath}`);
      this.ui.showToast(`Saved mission: ${savedPath}`, 'success');
    } catch (error) {
      this.onError(error.message || 'Failed to save mission file.');
      this.ui.showToast(error.message || 'Failed to save mission file.', 'error');
    }
  }

  async openLoadMissionDialog() {
    try {
      const tree = await this.storage.listTree();
      this.ui.showMissionLoadDialog({
        rootLabel: tree.rootLabel,
        nodes: tree.nodes,
        onCancel: () => this.ui.closeMissionLoadDialog(),
        onSelectFile: async node => {
          try {
            const jsonText = await this.storage.load(node.path);
            this.importMissionJson(jsonText);
            this.ui.closeMissionLoadDialog();
            this.showStatus(`Loaded mission file: ${node.path}`);
            this.ui.showToast(`Loaded mission: ${node.path}`, 'success');
          } catch (error) {
            this.onError(error.message || 'Failed to load mission file.');
            this.ui.showToast(error.message || 'Failed to load mission file.', 'error');
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
        } : null
      });
    } catch (error) {
      this.onError(error.message || 'Failed to open mission load dialog.');
    }
  }

  doLoadMission() {
    this.openLoadMissionDialog();
  }

  bindUIEvents() {
    this.ui.bindToolbarEvents({
      onAddWaypoint: () => this.setMode('wp'),
      onAddPOI: () => this.setMode('poi'),
      onSelectMode: () => this.setMode('select'),
      onUnselectAll: () => this.doUnselectAll(),
      onLocate: () => this.locateUser(),
      onClearAll: () => this.clearAll(),
      onSaveMission: () => this.doSaveMission(),
      onLoadMission: () => this.doLoadMission(),
      onExport: () => this.doExport()
    });
  }
}
