class App {
  constructor(options) {
    this.locationToastId = 'locationLookupToast';
    this.mode = 'select';
    this.selectedId = null;
    this.selectedType = null;
    this.selectedWaypointIds = new Set();
    this.lastWaypointAnchorId = null;
    this.touchRangeAnchorId = null;
    this.lastLoadedMissionFolder = '';
    this.activeWaypointTooltipId = null;
    this.activeWaypointPopup = null;
    this.mission = new Mission();
    this.ui = new PlannerUI({ mapElementId: options.mapElementId || 'map' });
    this.droneProfiles = {
      air3s: {
        id: 'air3s',
        label: 'DJI Air 3S',
        hfovDeg: 82,
        aspect: 16 / 9,
        droneEnumValue: 68,
        droneSubEnumValue: 0
      }
    };
    this.activeDroneConfig = null;

    this.onStatus = options.onStatus || null;
    this.onError = options.onError || (message => alert(message));
    this.waypointMarkers = new Map();
    this.poiMarkers = new Map();
    this.currentMissionDefaultSpeedMps = this.ui.getDefaultSpeed();

    this.mapController = new MapController(options.mapElementId || 'map');
    const fpvPanel = document.getElementById('fpv-panel');
    const graphOverlay = document.getElementById('ftGraphOverlay');
    const graphCanvas = document.getElementById('ftGraphCanvas');
    this.fpv = (typeof FPVController === 'function' && fpvPanel)
      ? new FPVController(fpvPanel, {
        graphOverlay,
        graphCanvas
      })
      : null;
    this.isFPVVisible = false;
    this.flythrough = typeof FlythroughController === 'function'
      ? new FlythroughController(this.mapController.map, {
        onProgress: (t, total) => {
          this.ui.updateFlythroughProgress(
            t,
            total,
            total > 0 ? t / total : 0
          );
          if (this.fpv) {
            this.fpv.updateGraphCursor(t, total);
          }
        },
        onComplete: () => {
          this.ui.setFlythroughStopped();
          if (this.flythrough && this.fpv) {
            this.fpv.updateGraphCursor(this.flythrough.totalTime, this.flythrough.totalTime);
          }
        },
        onFrame: frame => {
          if (this.fpv) {
            this.fpv.updateFrame(frame);
          }
        }
      })
      : null;

    this.locationService = new LocationService({
      onStatus: message => this.showStatus(message),
      onError: message => this.onError(message),
      onPending: isPending => {
        if (isPending) {
          this.ui.showToast('Please wait, finding your location', 'info', {
            id: this.locationToastId,
            persistent: true
          });
          return;
        }

        this.ui.hideToast(this.locationToastId);
      },
      onLocated: location => {
        this.ui.hideToast(this.locationToastId);
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
    this.elevationService = typeof ElevationService === 'function'
      ? new ElevationService({ onError: message => this.showStatus(message) })
      : null;
    this.heightAboveGroundByWaypointId = new Map();
    this.waypointGroundElevationById = new Map();
    this.takeoffGroundElevation = null;
    this.hagRefreshTimer = null;
    this.hagRefreshToken = 0;
    this.storage = new PersistentStorage({
      onStatus: message => this.showStatus(message),
      onError: message => this.onError(message)
    });

    this.bindMapEvents();
    this.bindUIEvents();
    this.applyDroneConfiguration(false);
    this.setMode('select');
    this.renderList();
    this.updateStats();
    this.showStatus(this.storage.getDescription());

    this.locateUser();
  }

  // Public methods

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

  getActiveDroneConfig() {
    const selectedProfileId = this.ui && typeof this.ui.getDroneProfileId === 'function'
      ? this.ui.getDroneProfileId()
      : 'air3s';

    if (selectedProfileId === 'custom') {
      const customHfov = this.ui && typeof this.ui.getCameraHfov === 'function'
        ? this.ui.getCameraHfov()
        : 82;
      const safeHfov = Number.isFinite(customHfov)
        ? Math.min(140, Math.max(30, customHfov))
        : 82;
      return {
        id: 'custom',
        label: 'Custom Camera',
        hfovDeg: safeHfov,
        aspect: 16 / 9,
        droneEnumValue: 68,
        droneSubEnumValue: 0
      };
    }

    return this.droneProfiles[selectedProfileId] || this.droneProfiles.air3s;
  }

  applyDroneConfiguration(showFeedback = true) {
    this.activeDroneConfig = this.getActiveDroneConfig();

    if (this.fpv && typeof this.fpv.setDroneConfig === 'function') {
      this.fpv.setDroneConfig(this.activeDroneConfig);
    }
    if (this.flythrough && typeof this.flythrough.setDroneConfig === 'function') {
      this.flythrough.setDroneConfig(this.activeDroneConfig);
    }

    if (showFeedback && this.activeDroneConfig) {
      const droneName = this.activeDroneConfig.label || 'DJI Air 3S';
      this.showStatus(`Drone profile set: ${droneName}`);
    }
  }

  handleDefaultSpeedChange() {
    const previousDefaultSpeed = this.currentMissionDefaultSpeedMps;
    const nextDefaultSpeed = this.ui.getDefaultSpeed();
    if (!Number.isFinite(nextDefaultSpeed)) {
      return;
    }

    const speedChanged = !Number.isFinite(previousDefaultSpeed)
      || Math.abs(nextDefaultSpeed - previousDefaultSpeed) > 0.0001;

    if (speedChanged && Number.isFinite(previousDefaultSpeed)) {
      this.waypoints.forEach(waypoint => {
        if (Math.abs(waypoint.speed - previousDefaultSpeed) <= 0.01) {
          waypoint.speed = nextDefaultSpeed;
        }
      });

      this.syncFlythroughMission();
      this.renderList();
      if (this.selectedId && this.selectedType) {
        this.showDetail(this.selectedId, this.selectedType);
      }
    }

    this.currentMissionDefaultSpeedMps = nextDefaultSpeed;
  }

  applyDefaultSpeedToAllWaypoints() {
    if (this.waypoints.length === 0) {
      this.showStatus('No waypoints to update.');
      return;
    }

    const speed = this.ui.getDefaultSpeed();
    if (!Number.isFinite(speed) || speed <= 0) {
      this.showStatus('Enter a valid default speed in km/h.');
      return;
    }

    this.waypoints.forEach(waypoint => {
      waypoint.speed = speed;
    });

    this.syncFlythroughMission();
    this.renderList();
    this.updateStats();
    if (this.selectedId && this.selectedType) {
      this.showDetail(this.selectedId, this.selectedType);
    }
    this.showStatus(`Applied ${Math.round(speed * 3.6)} km/h speed to ${this.waypoints.length} waypoints.`);
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
    this.mapController.refreshWaypointLabels(
      this.waypoints,
      waypoint => this.waypointMarkers.get(waypoint.id),
      {
        selectedId: this.selectedId,
        selectedType: this.selectedType,
        selectedWaypointIds: this.selectedWaypointIds
      }
    );

    this.mapController.refreshPOILabels(
      this.pois,
      poi => this.poiMarkers.get(poi.id),
      {
        selectedId: this.selectedId,
        selectedType: this.selectedType
      }
    );
  }

  addWaypointMarker(wp, idx) {
    const m = this.mapController.addWaypointMarker(wp, idx);
    m.on('click', () => this.onWaypointMarkerClick(wp.id));
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

  onWaypointMarkerClick(waypointId) {
    this.ui.closePOIOptionsDialog();
    if (this.selectedType === 'poi') {
      this.selectedId = null;
      this.selectedType = null;
    }

    const isSingleSelectedWaypoint =
      this.selectedType === 'wp'
      && this.selectedId === waypointId
      && this.selectedWaypointIds.size === 0;
    const isMultiSelectedWaypoint = this.selectedWaypointIds.has(waypointId);

    if (isSingleSelectedWaypoint) {
      this.closeWaypointTooltip();
      this.ui.closeWaypointOptionsDialog();
      this.clearSelection(true);
      return;
    }

    if (isMultiSelectedWaypoint) {
      this.selectedWaypointIds.delete(waypointId);
      if (this.lastWaypointAnchorId === waypointId) {
        const [nextAnchor] = this.selectedWaypointIds;
        this.lastWaypointAnchorId = nextAnchor || null;
      }
      this.closeWaypointTooltip();
      this.applyWaypointSelectionState();
      return;
    }

    if (this.selectedType === 'wp' && this.selectedId && this.selectedWaypointIds.size === 0) {
      this.selectedWaypointIds.add(this.selectedId);
    }

    this.selectedWaypointIds.add(waypointId);
    this.lastWaypointAnchorId = waypointId;
    this.applyWaypointSelectionState();
    this.showWaypointTooltip(waypointId);
  }

  closeWaypointTooltip() {
    this.activeWaypointTooltipId = null;
    if (this.activeWaypointPopup && this.mapController && this.mapController.map) {
      this.mapController.map.closePopup(this.activeWaypointPopup);
      this.activeWaypointPopup = null;
    }
  }

  formatWaypointTime(seconds) {
    const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  getWaypointMetrics(targetIndex) {
    let cumulativeDistance = 0;
    let cumulativeTime = 0;

    for (let index = 1; index <= targetIndex; index += 1) {
      const prev = this.waypoints[index - 1];
      const curr = this.waypoints[index];
      if (!prev || !curr) {
        continue;
      }

      const segmentDistance = this.mission.haversine(prev.lat, prev.lng, curr.lat, curr.lng);
      cumulativeDistance += segmentDistance;

      const prevSpeed = Number(prev.speed);
      const segmentSpeed = Number.isFinite(prevSpeed) && prevSpeed > 0 ? prevSpeed : 1;
      cumulativeTime += segmentDistance / segmentSpeed;
    }

    const totalDistance = this.mission.totalDistance();
    const progressPercent = totalDistance > 0
      ? Math.round((cumulativeDistance / totalDistance) * 100)
      : 0;

    return {
      cumulativeDistance,
      cumulativeTime,
      totalDistance,
      progressPercent
    };
  }

  showWaypointTooltip(waypointId) {
    const wp = this.mission.findWaypoint(waypointId);
    const marker = this.waypointMarkers.get(waypointId);
    if (!wp || !marker) {
      return;
    }

    const waypointIndex = this.waypoints.indexOf(wp);
    if (waypointIndex === -1) {
      return;
    }

    const metrics = this.getWaypointMetrics(waypointIndex);
    const previous = waypointIndex > 0 ? this.waypoints[waypointIndex - 1] : null;
    const next = waypointIndex < this.waypoints.length - 1 ? this.waypoints[waypointIndex + 1] : null;

    let course = 0;
    if (previous) {
      course = this.mission.bearing(previous.lat, previous.lng, wp.lat, wp.lng);
    } else if (next) {
      course = this.mission.bearing(wp.lat, wp.lng, next.lat, next.lng);
    }

    const wpSpeed = Number(wp.speed);
    const speedKmh = (Number.isFinite(wpSpeed) ? wpSpeed : 0) * 3.6;
    const hagMeters = this.heightAboveGroundByWaypointId.get(wp.id);
    const hagLabel = Number.isFinite(hagMeters) ? ` (${Math.round(hagMeters)})` : '';
    const assignedPoi = wp.poiId ? this.mission.findPOI(wp.poiId) : null;
    const poiLabel = assignedPoi
      ? Mission.formatPoiDisplayName(assignedPoi.name, '?')
      : 'None';
    const tooltipHtml = `
      <div class="wp-map-tooltip-content">
        <div class="wp-map-tooltip-title">Waypoint ${waypointIndex + 1}</div>
        <div>Position: ${(metrics.cumulativeDistance / 1000).toFixed(2)} km (${metrics.progressPercent}%)</div>
        <div>Time: ${this.formatWaypointTime(metrics.cumulativeTime)}</div>
        <div>Waypoint 1: ${Math.round(metrics.cumulativeDistance)} m</div>
        <div>POI: ${poiLabel}</div>
        <div>Course: ${Math.round(course)}°</div>
        <div>Altitude: ${Math.round(wp.alt)} m${hagLabel}</div>
        <div>Speed: ${Math.round(speedKmh)} kmh</div>
        <div>Gimbal Pitch: ${Number.isFinite(wp.gimbalPitch) ? wp.gimbalPitch.toFixed(1) : '0.0'}°</div>
        <button type="button" class="wp-map-tooltip-options">Tap for Options</button>
      </div>
    `;

    this.closeWaypointTooltip();

    const popup = L.popup({
      className: 'wp-map-popup',
      closeButton: false,
      autoClose: true,
      closeOnClick: true,
      offset: [0, -24]
    })
      .setLatLng(marker.getLatLng())
      .setContent(tooltipHtml)
      .openOn(this.mapController.map);

    this.activeWaypointTooltipId = waypointId;
    this.activeWaypointPopup = popup;

    requestAnimationFrame(() => {
      const popupElement = popup ? popup.getElement() : null;
      const button = popupElement ? popupElement.querySelector('.wp-map-tooltip-options') : null;
      if (!button) {
        return;
      }

      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.openWaypointOptionsDialog(waypointId);
      });
    });
  }

  openWaypointOptionsDialog(waypointId) {
    const wp = this.mission.findWaypoint(waypointId);
    if (!wp) {
      return;
    }

    const waypointIndex = this.waypoints.indexOf(wp);
    if (waypointIndex === -1) {
      return;
    }

    const metrics = this.getWaypointMetrics(waypointIndex);
    let initialDialogPosition = null;
    const popupElement = this.activeWaypointPopup && typeof this.activeWaypointPopup.getElement === 'function'
      ? this.activeWaypointPopup.getElement()
      : null;
    if (popupElement) {
      const popupRect = popupElement.getBoundingClientRect();
      initialDialogPosition = {
        left: popupRect.right + 10,
        top: popupRect.top
      };
    }

    this.ui.showWaypointOptionsDialog({
      waypointLabel: `Waypoint ${waypointIndex + 1}`,
      positionText: `Position: ${(metrics.cumulativeDistance / 1000).toFixed(2)} km (${metrics.progressPercent}%)`,
      initialAltitude: wp.alt,
      initialHeightAboveGround: this.heightAboveGroundByWaypointId.get(wp.id),
      initialSpeed: wp.speed,
      currentPoiId: wp.poiId,
      pois: this.pois,
      initialPosition: initialDialogPosition,
      onClose: () => this.ui.closeWaypointOptionsDialog(),
      onDelete: () => {
        this.ui.closeWaypointOptionsDialog();
        this.closeWaypointTooltip();
        this.deleteItem(waypointId, 'wp');
      },
      onPrevious: () => {
        const prev = this.waypoints[waypointIndex - 1];
        if (!prev) {
          return;
        }
        this.selectItem(prev.id, 'wp');
        this.showWaypointTooltip(prev.id);
        this.openWaypointOptionsDialog(prev.id);
      },
      onNext: () => {
        const next = this.waypoints[waypointIndex + 1];
        if (!next) {
          return;
        }
        this.selectItem(next.id, 'wp');
        this.showWaypointTooltip(next.id);
        this.openWaypointOptionsDialog(next.id);
      },
      onAltitudeChange: altitudeValue => {
        wp.alt = Number.isFinite(altitudeValue) ? altitudeValue : wp.alt;
        this.recomputePOI(wp);
        this.syncFlythroughMission();
        this.renderList();
        this.showWaypointTooltip(wp.id);
      },
      onSpeedChange: speedValue => {
        const speedKmh = parseFloat(speedValue);
        if (Number.isFinite(speedKmh) && speedKmh > 0) {
          wp.speed = Number((speedKmh / 3.6).toFixed(2));
          this.syncFlythroughMission();
          this.renderList();
          this.showWaypointTooltip(wp.id);
        }
      },
      onPoiChange: poiId => {
        wp.poiId = poiId || null;
        this.recomputePOI(wp);
        this.syncFlythroughMission();
        this.renderList();
        this.showWaypointTooltip(wp.id);
      }
    });
  }

  addPOIMarker(poi) {
    const poiIndex = this.pois.findIndex(item => item.id === poi.id);
    const m = this.mapController.addPOIMarker(poi, {
      index: poiIndex >= 0 ? poiIndex + 1 : (this.pois.length + 1)
    });
    m.on('click', () => {
      this.selectItem(poi.id, 'poi');
      this.openPOIOptionsDialog(poi.id);
    });
    m.on('dragend', e => {
      poi.lat = e.target.getLatLng().lat;
      poi.lng = e.target.getLatLng().lng;
      this.recomputeAllPOI();
      this.syncFlythroughMission();
      this.renderList();
      this.updateStats();
      if (this.selectedId === poi.id) {
        this.showDetail(poi.id, 'poi');
      }
    });
    return m;
  }

  openPOIOptionsDialog(poiId) {
    const poi = this.mission.findPOI(poiId);
    if (!poi) {
      return;
    }

    const poiIndex = this.pois.indexOf(poi);
    if (poiIndex === -1) {
      return;
    }

    const marker = this.poiMarkers.get(poiId);
    let initialDialogPosition = null;
    if (marker && typeof marker.getElement === 'function') {
      const markerElement = marker.getElement();
      if (markerElement) {
        const markerRect = markerElement.getBoundingClientRect();
        initialDialogPosition = {
          left: markerRect.right + 10,
          top: markerRect.top
        };
      }
    }

    this.ui.showPOIOptionsDialog({
      poiLabel: Mission.formatPoiDisplayName(poi.name, String(poiIndex + 1)),
      positionText: `${poi.lat.toFixed(6)}, ${poi.lng.toFixed(6)}`,
      initialName: poi.name,
      initialAltitude: poi.alt,
      initialPosition: initialDialogPosition,
      onClose: () => this.ui.closePOIOptionsDialog(),
      onDelete: () => {
        this.ui.closePOIOptionsDialog();
        this.deleteItem(poiId, 'poi');
      },
      onPrevious: () => {
        const prev = this.pois[poiIndex - 1];
        if (!prev) {
          return;
        }
        this.selectItem(prev.id, 'poi');
        this.openPOIOptionsDialog(prev.id);
      },
      onNext: () => {
        const next = this.pois[poiIndex + 1];
        if (!next) {
          return;
        }
        this.selectItem(next.id, 'poi');
        this.openPOIOptionsDialog(next.id);
      },
      onNameChange: nameValue => {
        poi.name = nameValue;
        this.renderList();
        if (this.selectedId === poi.id) {
          this.showDetail(poi.id, 'poi');
        }
      },
      onAltitudeChange: altitudeValue => {
        poi.alt = Number.isFinite(altitudeValue) ? altitudeValue : poi.alt;
        this.recomputeAllPOI();
        this.syncFlythroughMission();
        this.renderList();
        if (this.selectedId === poi.id) {
          this.showDetail(poi.id, 'poi');
        }
      }
    });
  }

  recomputePOI(wp) {
    this.mission.recomputePOI(wp);
  }

  recomputeAllPOI() {
    this.mission.recomputeAllPOI();
  }

  updateRoute() {
    this.mapController.updateRoute(this.waypoints, {
      onInsertWaypoint: (insertIndex, latlng) => this.insertWaypointAt(insertIndex, latlng)
    });
    this.syncFlythroughMission();
    this.scheduleHeightAboveGroundRefresh();
  }

  syncFlythroughMission() {
    if (!this.flythrough) {
      return;
    }

    this.flythrough.setMission(this.waypoints);
    if (this.isFPVVisible && typeof this.flythrough.showAtCurrentTime === 'function') {
      this.flythrough.showAtCurrentTime();
    }
    if (this.fpv) {
      this.fpv.setMission(this.waypoints, this.mission);
    }
    this.ui.updateFlythroughProgress(
      this.flythrough.currentTime,
      this.flythrough.totalTime,
      this.flythrough.totalTime > 0
        ? this.flythrough.currentTime / this.flythrough.totalTime
        : 0
    );
  }

  insertWaypointAt(index, latlng) {
    const safeIndex = Math.max(0, Math.min(index, this.waypoints.length));
    const wp = this.mission.createWaypoint(latlng.lat, latlng.lng, {
      altitude: this.ui.getDefaultAltitude(),
      speed: this.ui.getDefaultSpeed()
    });

    this.mission.insertWaypointAt(safeIndex, wp);
    const marker = this.addWaypointMarker(wp, safeIndex + 1);
    this.waypointMarkers.set(wp.id, marker);

    this.updateRoute();
    this.renderList();
    this.updateStats();
    this.refreshMarkerLabels();
    this.selectItem(wp.id, 'wp');
    this.showStatus(`Inserted waypoint ${safeIndex + 1}.`);
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
      } else if (this.mode === 'select') {
        const hasSelection = this.selectedId || this.selectedWaypointIds.size > 0;
        if (hasSelection) {
          this.closeWaypointTooltip();
          this.ui.closeWaypointOptionsDialog();
          this.ui.closePOIOptionsDialog();
          this.clearSelection(true);
        }
      }
    });

    this.mapController.onMouseMove(e => {
      this.ui.setCursor(e.latlng.lat, e.latlng.lng);
    });

    this.mapController.onZoomEnd(() => {
      this.refreshMarkerLabels();
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
    const speedKmh = parseFloat(speedValue);
    const applyAltitude = altitudeValue.trim() !== '' && Number.isFinite(altitude);
    const applySpeed = speedValue.trim() !== '' && Number.isFinite(speedKmh);
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
        wp.speed = Number((speedKmh / 3.6).toFixed(2));
      }
      if (applyPoi) {
        wp.poiId = poiValue === '__NONE__' ? null : poiValue;
      }
      this.recomputePOI(wp);
    });

    this.syncFlythroughMission();

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
      resolveWaypointHeightAboveGround: waypoint => this.heightAboveGroundByWaypointId.get(waypoint.id),
      resolveWaypointGroundElevation: waypoint => this.waypointGroundElevationById.get(waypoint.id),
      resolveTakeoffGroundElevation: () => this.takeoffGroundElevation,
      resolveWaypointLegDistance: (waypoint, index) => {
        if (index <= 0) {
          return 0;
        }

        let accumulated = 0;
        for (let waypointIndex = 1; waypointIndex <= index; waypointIndex += 1) {
          const previous = this.waypoints[waypointIndex - 1];
          const current = this.waypoints[waypointIndex];
          if (!previous || !current) {
            continue;
          }
          accumulated += this.mission.haversine(previous.lat, previous.lng, current.lat, current.lng);
        }
        return accumulated;
      },
      onSelect: (id, type, interaction) => this.selectItem(id, type, interaction),
      onDelete: (id, type) => this.deleteItem(id, type),
      onToggleWaypointMultiSelect: (id, selected, options) => this.toggleWaypointMultiSelect(id, selected, options),
      onRangeWaypointMultiSelect: (anchorId, targetId, isSelected) => this.moveWaypointTouchRange(anchorId, targetId, isSelected),
      onStartWaypointTouchRange: anchorId => this.startWaypointTouchRange(anchorId),
      onEndWaypointTouchRange: () => this.endWaypointTouchRange()
    });
    this.refreshMarkerLabels();
    this.scheduleHeightAboveGroundRefresh();
  }

  getTakeoffPoi() {
    const poi1 = this.pois.find(poi => poi.id === 'poi_1');
    if (poi1) {
      return poi1;
    }

    const namedPoi1 = this.pois.find(poi => {
      return Mission.formatPoiDisplayName(poi.name, '') === '1';
    });
    if (namedPoi1) {
      return namedPoi1;
    }

    return this.pois[0] || null;
  }

  scheduleHeightAboveGroundRefresh() {
    if (!this.elevationService) {
      return;
    }

    if (this.hagRefreshTimer) {
      clearTimeout(this.hagRefreshTimer);
    }

    this.hagRefreshTimer = setTimeout(() => {
      this.hagRefreshTimer = null;
      this.refreshHeightAboveGround();
    }, 120);
  }

  async refreshHeightAboveGround() {
    if (!this.elevationService || this.waypoints.length === 0) {
      return;
    }

    const takeoffPoi = this.getTakeoffPoi();
    if (!takeoffPoi) {
      return;
    }

    const refreshToken = ++this.hagRefreshToken;
    const points = [
      { key: '__takeoff__', lat: takeoffPoi.lat, lng: takeoffPoi.lng },
      ...this.waypoints.map(waypoint => ({ key: waypoint.id, lat: waypoint.lat, lng: waypoint.lng }))
    ];

    const elevations = await this.elevationService.getElevations(points);
    if (refreshToken !== this.hagRefreshToken) {
      return;
    }

    const takeoffGround = this.elevationService.getElevation(takeoffPoi.lat, takeoffPoi.lng, elevations);
    if (!Number.isFinite(takeoffGround)) {
      return;
    }

    let updated = false;

    if (!Number.isFinite(this.takeoffGroundElevation) || Math.abs(this.takeoffGroundElevation - takeoffGround) > 0.05) {
      this.takeoffGroundElevation = takeoffGround;
      updated = true;
    }

    this.waypoints.forEach(waypoint => {
      const waypointGround = this.elevationService.getElevation(waypoint.lat, waypoint.lng, elevations);
      if (!Number.isFinite(waypointGround)) {
        return;
      }

      const previousGround = this.waypointGroundElevationById.get(waypoint.id);
      if (!Number.isFinite(previousGround) || Math.abs(previousGround - waypointGround) > 0.05) {
        this.waypointGroundElevationById.set(waypoint.id, waypointGround);
        updated = true;
      }

      // Height above local ground (HAG):
      // HAG = (takeoffGround + wp.alt) - waypointGround
      //     = wp.alt + takeoffGround - waypointGround
      // wp.alt is relative-to-start-point height used by mission execution.
      const groundRelativeToTakeoff = waypoint.alt + takeoffGround - waypointGround;
      const previous = this.heightAboveGroundByWaypointId.get(waypoint.id);
      if (!Number.isFinite(previous) || Math.abs(previous - groundRelativeToTakeoff) > 0.05) {
        this.heightAboveGroundByWaypointId.set(waypoint.id, groundRelativeToTakeoff);
        updated = true;
      }
    });

    if (updated) {
      this.ui.renderList({
        waypoints: this.waypoints,
        pois: this.pois,
        selectedId: this.selectedId,
        selectedWaypointIds: this.selectedWaypointIds,
        resolvePoiName: poiId => (this.mission.findPOI(poiId) || { name: '?' }).name,
        resolveWaypointHeightAboveGround: waypoint => this.heightAboveGroundByWaypointId.get(waypoint.id),
        resolveWaypointGroundElevation: waypoint => this.waypointGroundElevationById.get(waypoint.id),
        resolveTakeoffGroundElevation: () => this.takeoffGroundElevation,
        resolveWaypointLegDistance: (waypoint, index) => {
          if (index <= 0) {
            return 0;
          }

          let accumulated = 0;
          for (let waypointIndex = 1; waypointIndex <= index; waypointIndex += 1) {
            const previous = this.waypoints[waypointIndex - 1];
            const current = this.waypoints[waypointIndex];
            if (!previous || !current) {
              continue;
            }
            accumulated += this.mission.haversine(previous.lat, previous.lng, current.lat, current.lng);
          }
          return accumulated;
        },
        onSelect: (id, type, interaction) => this.selectItem(id, type, interaction),
        onDelete: (id, type) => this.deleteItem(id, type),
        onToggleWaypointMultiSelect: (id, selected, options) => this.toggleWaypointMultiSelect(id, selected, options),
        onRangeWaypointMultiSelect: (anchorId, targetId, isSelected) => this.moveWaypointTouchRange(anchorId, targetId, isSelected),
        onStartWaypointTouchRange: anchorId => this.startWaypointTouchRange(anchorId),
        onEndWaypointTouchRange: () => this.endWaypointTouchRange()
      });
      this.refreshMarkerLabels();
    }
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
          this.syncFlythroughMission();
          this.renderList();
          if (wp.poiId) {
            this.showDetail(id, 'wp');
          }
        },
        onSpeedChange: value => {
          wp.speed = parseFloat(value) || 8;
          this.syncFlythroughMission();
          this.renderList();
        },
        onPoiChange: value => {
          wp.poiId = value || null;
          this.recomputePOI(wp);
          this.syncFlythroughMission();
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
          this.renderList();
        },
        onAltitudeChange: value => {
          poi.alt = parseFloat(value) || 0;
          this.recomputeAllPOI();
          this.syncFlythroughMission();
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
    } else if (this.selectedId && this.selectedType) {
      this.showDetail(this.selectedId, this.selectedType);
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
  }

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
  }

  async changeExportFolder() {
    try {
      const dirHandle = await this.kmzExporter.promptForFolder();
      if (dirHandle) {
        this.showStatus('Export folder updated. Next export will use this folder.');
      }
    } catch (err) {
      this.showStatus(`Failed to select export folder: ${err.message}`);
    }
  }

  doUnselectAll() {
    this.clearSelection(false);
  }

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
    if (!silent) {
      this.showStatus('Selection cleared.');
    }
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
  }

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

    const takeoffPoi = this.getTakeoffPoi();
    if (!takeoffPoi) {
      this.showStatus('Add POI "1" (takeoff reference) before applying constant HAG.');
      return;
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
      // HAG = wp.alt + waypointGround - takeoffGround
      // => wp.alt = targetHag + waypointGround - takeoffGround
      waypoint.alt = Math.round((targetHag + waypointGround - takeoffGround) * 100) / 100;
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
  }

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
  }

  async copySelectedWaypointsToClipboard() {
    const selectedWaypoints = this.waypoints.filter(waypoint => this.selectedWaypointIds.has(waypoint.id));
    if (selectedWaypoints.length < 2) {
      return false;
    }

    // Clipboard format intentionally excludes internal IDs and derived fields.
    // Future paste can generate fresh IDs and recompute heading/gimbal from POI links.
    const clipboardPayload = {
      schema: 'dji-mission-planner/waypoint-copy-v1',
      copiedAt: Date.now(),
      waypoints: selectedWaypoints.map(waypoint => ({
        lat: waypoint.lat,
        lng: waypoint.lng,
        alt: waypoint.alt,
        speed: waypoint.speed
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
  }

  deleteSelectionFromKeyboard() {
    if (this.selectedWaypointIds.size > 1) {
      const waypointIds = [...this.selectedWaypointIds];
      waypointIds.forEach(waypointId => this.deleteItem(waypointId, 'wp'));
      this.showStatus(`Deleted ${waypointIds.length} waypoints.`);
      return true;
    }

    if (this.selectedId && this.selectedType) {
      this.deleteItem(this.selectedId, this.selectedType);
      return true;
    }

    return false;
  }

  async openLoadMissionDialog() {
    try {
      const tree = await this.storage.listTree();
      this.ui.showMissionLoadDialog({
        rootLabel: tree.rootLabel,
        nodes: tree.nodes,
        initialExpandedPath: this.lastLoadedMissionFolder,
        onCancel: () => this.ui.closeMissionLoadDialog(),
        onSelectFile: async node => {
          try {
            const jsonText = await this.storage.load(node.path);
            this.importMissionJson(jsonText);
            this.lastLoadedMissionFolder = this.getMissionFolderPath(node.path, tree.rootLabel);
            this.ui.closeMissionLoadDialog();
            this.showStatus(`Loaded mission file: ${node.path}`);
            this.ui.showToast(`Loaded mission: ${node.path}`, 'success');
          } catch (error) {
            this.onError(error.message || 'Failed to load mission file.');
            this.ui.showToast(error.message || 'Failed to load mission file.', 'error');
          }
        },
        onDeleteFile: async node => {
          const confirmed = window.confirm(`Delete mission file?\n\n${node.path}`);
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
        } : null
      });
    } catch (error) {
      this.onError(error.message || 'Failed to open mission load dialog.');
    }
  }

  doLoadMission() {
    this.openLoadMissionDialog();
  }

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
      onExport: () => this.doExport(),
      onExportChangeFolder: () => this.changeExportFolder(),
      onToggleFPV: () => this.toggleFPV(),
      onApplyDefaultAltitude: () => this.applyDefaultAltitudeToAllWaypoints(),
      onApplyDefaultSpeed: () => this.applyDefaultSpeedToAllWaypoints(),
      onApplyConstantHag: () => this.applyConstantHeightAboveGround(),
      onDroneConfigChange: () => this.applyDroneConfiguration(),
      onDefaultSpeedChange: () => this.handleDefaultSpeedChange()
    });

    this.ui.bindFlythroughEvents({
      onFlythroughPlay: () => {
        if (this.flythrough) {
          this.syncFlythroughMission();
          this.flythrough.play();
        }
      },
      onFlythroughPause: () => {
        if (this.flythrough) {
          this.flythrough.pause();
        }
      },
      onFlythroughStop: () => {
        if (this.flythrough) {
          this.flythrough.stop();
          this.ui.setFlythroughStopped();
        }
      },
      onFlythroughSpeedChange: speedValue => {
        if (!this.flythrough) {
          return;
        }
        const speed = parseFloat(speedValue);
        if (Number.isFinite(speed) && speed > 0) {
          this.flythrough.setSpeed(speed);
        }
      },
      onFlythroughFovToggle: isEnabled => {
        if (this.flythrough) {
          this.flythrough.setShowFOV(!!isEnabled);
        }
      },
      onFlythroughSeek: seekValue => {
        if (!this.flythrough) {
          return;
        }
        const raw = parseFloat(seekValue);
        const fraction = Number.isFinite(raw) ? raw / 1000 : 0;
        this.flythrough.seekTo(fraction);
      }
    });

    window.addEventListener('keydown', async event => {
      const isCopyShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'c';
      const isDeleteShortcut = !event.metaKey && !event.ctrlKey && !event.altKey
        && (event.key === 'Delete' || event.key === 'Backspace');
      const isEditingInput = this.isTypingInEditableControl();

      if (isCopyShortcut) {
        if (this.selectedWaypointIds.size < 2 || isEditingInput) {
          return;
        }

        event.preventDefault();
        await this.copySelectedWaypointsToClipboard();
        return;
      }

      if (isDeleteShortcut) {
        if (isEditingInput) {
          return;
        }
        const deleted = this.deleteSelectionFromKeyboard();
        if (deleted) {
          event.preventDefault();
        }
      }
    });

    window.addEventListener('resize', () => {
      if (this.fpv && this.isFPVVisible) {
        this.fpv.resize();
      }
    });
  }

  toggleFPV() {
    if (!this.fpv) {
      this.showStatus('FPV view unavailable (Three.js not loaded).');
      return;
    }

    this.isFPVVisible = !this.isFPVVisible;
    if (this.isFPVVisible) {
      this.fpv.show();
      if (this.flythrough) {
        this.syncFlythroughMission();
      }
      this.showStatus('FPV view enabled.');
    } else {
      this.fpv.hide();
      this.showStatus('FPV view hidden.');
    }
  }

  // Private members

  _doClear() {
    this.waypointMarkers.forEach(marker => this.mapController.removeLayer(marker));
    this.poiMarkers.forEach(marker => this.mapController.removeLayer(marker));
    this.waypointMarkers.clear();
    this.poiMarkers.clear();
    this.heightAboveGroundByWaypointId.clear();
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
  }
}
