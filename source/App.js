class App {
  constructor(options) {
    this.mode = 'select';
    this.selectedId = null;
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
    this.missionStorage = new MissionStorage({
      onStatus: message => this.showStatus(message),
      onError: message => this.onError(message)
    });

    this.bindMapEvents();
    this.bindUIEvents();
    this.setMode('select');
    this.renderList();
    this.updateStats();

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

  selectItem(id, type) {
    this.selectedId = id;
    this.ui.highlightSelectedItem(id);
    this.showDetail(id, type);
  }

  renderList() {
    this.ui.renderList({
      waypoints: this.waypoints,
      pois: this.pois,
      selectedId: this.selectedId,
      resolvePoiName: poiId => (this.mission.findPOI(poiId) || { name: '?' }).name,
      onSelect: (id, type) => this.selectItem(id, type),
      onDelete: (id, type) => this.deleteItem(id, type)
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
      this.ui.showNothingSelected();
    }
    this.renderList();
    this.updateStats();
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
      headingMode: this.ui.getHeadingMode(),
      defaultSpeed: this.ui.getDefaultSpeed()
    });
  }

  async doSaveMission() {
    try {
      const jsonText = this.exportMissionJson();
      const savedPath = await this.missionStorage.saveMissionJson({
        missionName: this.ui.getMissionName(),
        jsonText
      });
      this.showStatus(`Saved mission: ${savedPath}`);
    } catch (error) {
      this.onError(error.message || 'Failed to save mission file.');
    }
  }

  async openLoadMissionDialog() {
    try {
      const tree = await this.missionStorage.listMissionTree();
      this.ui.showMissionLoadDialog({
        rootLabel: tree.rootLabel,
        nodes: tree.nodes,
        onCancel: () => this.ui.closeMissionLoadDialog(),
        onSelectFile: async node => {
          try {
            const jsonText = await this.missionStorage.readMissionFile(node.handle);
            this.importMissionJson(jsonText);
            this.ui.closeMissionLoadDialog();
            this.showStatus(`Loaded mission file: ${node.path}`);
          } catch (error) {
            this.onError(error.message || 'Failed to load mission file.');
          }
        },
        onRefresh: () => {
          this.openLoadMissionDialog();
        },
        onChooseFolder: async () => {
          try {
            await this.missionStorage.pickRootDirectory();
            this.openLoadMissionDialog();
          } catch (error) {
            this.onError(error.message || 'Folder selection was cancelled.');
          }
        }
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
      onLocate: () => this.locateUser(),
      onClearAll: () => this.clearAll(),
      onSaveMission: () => this.doSaveMission(),
      onLoadMission: () => this.doLoadMission(),
      onExport: () => this.doExport()
    });
  }
}
