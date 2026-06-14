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
    this._mobileScreenMql = typeof window !== 'undefined'
      ? window.matchMedia('(pointer: coarse) and ((max-width: 1024px) or (max-height: 820px))')
      : null;
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
      onExported: message => this.ui.showToast(message, 'success'),
      onError: message => this.onError(message)
    });
    this.elevationService = typeof ElevationService === 'function'
      ? new ElevationService({ onError: message => this.showStatus(message) })
      : null;
    this.heightAboveGroundByWaypointId = new Map();
    this.heightAboveGroundByPoiId = new Map();
    this.waypointGroundElevationById = new Map();
    this.takeoffGroundElevation = null;
    this.hagRefreshTimer = null;
    this.hagRefreshToken = 0;
    this.storage = new PersistentStorage({
      onStatus: message => this.showStatus(message),
      onError: message => this.onError(message)
    });
    this.lastLoadedMissionLocation = this.storage.getLastLoadedMissionLocation();
    this.lastLoadedMissionFolder = this.lastLoadedMissionLocation.folderPath || '';
    this.lastLoadedMissionRootLabel = this.lastLoadedMissionLocation.rootLabel || '';

    if (typeof window !== 'undefined') {
      window.__djiMissionPlannerDebug = window.__djiMissionPlannerDebug || {};
      window.__djiMissionPlannerDebug.getStorageContext = async () => this.storage.getDebugContext();
    }

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

  get isMobileScreen() {
    return this._mobileScreenMql ? this._mobileScreenMql.matches : false;
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
    this.ui.updateMobileStats({
      wpCount: this.waypoints.length,
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
    let singleClickTimer = null;
    m.on('click', () => {
      if (singleClickTimer) {
        // Second click within 220 ms — treat as double-tap on mobile
        // (mobile browsers don't fire a native dblclick event when tap:false)
        clearTimeout(singleClickTimer);
        singleClickTimer = null;
        if (this.isMobileScreen) {
          this.selectItem(wp.id, 'wp');
          this.showWaypointTooltip(wp.id);
          this.openWaypointOptionsDialog(wp.id);
        }
        // On desktop the native dblclick event handles it below
        return;
      }

      singleClickTimer = setTimeout(() => {
        singleClickTimer = null;
        this.onWaypointMarkerClick(wp.id);
      }, 220);
    });
    m.on('dblclick', event => {
      if (singleClickTimer) {
        clearTimeout(singleClickTimer);
        singleClickTimer = null;
      }

      if (event && event.originalEvent) {
        event.originalEvent.preventDefault();
        event.originalEvent.stopPropagation();
      }

      this.showWaypointTooltip(wp.id);
      this.selectItem(wp.id, 'wp');
      this.openWaypointOptionsDialog(wp.id);
    });
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
    if (this.isMobileScreen && this.mode === 'select') {
      this.selectedWaypointIds.add(waypointId);
      this.selectedId = null;
      this.selectedType = null;
      this.lastWaypointAnchorId = waypointId;
      this.renderList();
      this.showStatus(`${this.selectedWaypointIds.size} waypoints selected.`);
      return;
    }

    if (this.isMobileScreen) {
      this.selectedWaypointIds.clear();
      this.selectItem(waypointId, 'wp');
      return;
    }

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
    // Tooltip/options shown on double-click, not single-click
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

  openWaypointOptionsDialog(waypointId, options = {}) {
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
    const wpMarker = this.waypointMarkers.get(waypointId);
    if (!options.centered && wpMarker && typeof wpMarker.getElement === 'function') {
      const markerElement = wpMarker.getElement();
      if (markerElement) {
        const markerRect = markerElement.getBoundingClientRect();
        initialDialogPosition = {
          left: markerRect.right + 10,
          top: markerRect.top
        };
      }
    } else if (!options.centered) {
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
      onClose: () => {
        this.closeWaypointTooltip();
        this.ui.closeWaypointOptionsDialog();
      },
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
    m.on('dblclick', event => {
      if (event && event.originalEvent) {
        event.originalEvent.preventDefault();
        event.originalEvent.stopPropagation();
      }
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

  openPOIOptionsDialog(poiId, options = {}) {
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
    if (!options.centered && marker && typeof marker.getElement === 'function') {
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
      initialHeightAboveGround: this.heightAboveGroundByPoiId.get(poi.id),
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
      this.fpv.setMission(this.waypoints, this.mission, {
        heightAboveGroundByWaypointId: this.heightAboveGroundByWaypointId
      });
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
        if (this.isMobileScreen) {
          this.showStatus(`Waypoint ${this.waypoints.length} added.`);
        } else {
          this.selectItem(wp.id, 'wp');
        }
      } else if (this.mode === 'poi') {
        const poi = this.mission.createPOI(e.latlng.lat, e.latlng.lng);
        const marker = this.addPOIMarker(poi);
        this.poiMarkers.set(poi.id, marker);
        this.mission.addPOI(poi);
        this.renderList();
        this.updateStats();
        this._initPoiAltitudeToGroundLevel(poi).then(() => {
          this.scheduleHeightAboveGroundRefresh();
        });
        if (this.isMobileScreen) {
          this.showStatus(`POI ${this.pois.length} added.`);
        } else {
          this.selectItem(poi.id, 'poi');
        }
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
    this.ui.hideMobileSheet();
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
  }

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
  }

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
  }

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
  }

  applyBulkWaypointUpdate({ altitudeValue, speedValue, poiValue }, targetWaypoints = null) {
    const targets = targetWaypoints ?? this.waypoints.filter(wp => this.selectedWaypointIds.has(wp.id));
    this.applyBulkWaypointSettingsFromDialog({ altitudeValue, speedValue, hagValue: '', poiValue }, targets)
      .then(() => this.showBulkWaypointDetail());
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
      ...this._buildListCallbacks()
    });
    this.refreshMarkerLabels();
    this.scheduleHeightAboveGroundRefresh();
  }

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
    };
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

  async _initPoiAltitudeToGroundLevel(poi) {
    if (!this.elevationService) {
      return;
    }

    const takeoffRef = this.getTakeoffPoi() || this.waypoints[0];
    const isSelfRef = !takeoffRef || takeoffRef.id === poi.id;

    const points = [{ key: '__newpoi__', lat: poi.lat, lng: poi.lng }];
    if (!isSelfRef) {
      points.push({ key: '__takeoff__', lat: takeoffRef.lat, lng: takeoffRef.lng });
    }

    const elevations = await this.elevationService.getElevations(points);

    // Abort if the POI was deleted while we were fetching
    if (!this.mission.findPOI(poi.id)) {
      return;
    }

    const poiGround = this.elevationService.getElevation(poi.lat, poi.lng, elevations);
    if (!Number.isFinite(poiGround)) {
      return;
    }

    let takeoffGround;
    if (isSelfRef) {
      // This POI is its own takeoff reference — takeoff ground equals this POI's ground
      takeoffGround = poiGround;
    } else {
      const tg = this.elevationService.getElevation(takeoffRef.lat, takeoffRef.lng, elevations);
      takeoffGround = Number.isFinite(tg) ? tg : poiGround;
    }

    const takeoffElevation = this.ui && typeof this.ui.getTakeoffElevation === 'function'
      ? this.ui.getTakeoffElevation()
      : 0;

    // Set alt so HAG = 0 at this POI's location:
    // HAG = poi.alt + takeoffGround + takeoffElevation - poiGround = 0
    // => poi.alt = poiGround - takeoffGround - takeoffElevation
    poi.alt = Math.round((poiGround - takeoffGround - takeoffElevation) * 100) / 100;

    this.renderList();
    if (this.selectedId === poi.id) {
      this.showDetail(poi.id, 'poi');
    }
  }

  async refreshHeightAboveGround() {
    if (!this.elevationService || (this.waypoints.length === 0 && this.pois.length === 0)) {
      return;
    }

    const takeoffPoi = this.getTakeoffPoi() || this.waypoints[0];
    if (!takeoffPoi) {
      return;
    }

    const refreshToken = ++this.hagRefreshToken;
    const points = [
      { key: '__takeoff__', lat: takeoffPoi.lat, lng: takeoffPoi.lng },
      ...this.waypoints.map(waypoint => ({ key: waypoint.id, lat: waypoint.lat, lng: waypoint.lng })),
      ...this.pois.map(poi => ({ key: '__poi__' + poi.id, lat: poi.lat, lng: poi.lng }))
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
      // Takeoff ASL = takeoffGround + takeoffElevation  (takeoffElevation = drone height above ground at takeoff)
      // WP ASL      = Takeoff ASL + wp.alt
      // WP HAG      = WP ASL - waypointGround
      //             = wp.alt + takeoffGround + takeoffElevation - waypointGround
      const takeoffElevation = this.ui && typeof this.ui.getTakeoffElevation === 'function'
        ? this.ui.getTakeoffElevation()
        : 0;
      const groundRelativeToTakeoff = waypoint.alt + takeoffGround + takeoffElevation - waypointGround;
      const previous = this.heightAboveGroundByWaypointId.get(waypoint.id);
      if (!Number.isFinite(previous) || Math.abs(previous - groundRelativeToTakeoff) > 0.05) {
        this.heightAboveGroundByWaypointId.set(waypoint.id, groundRelativeToTakeoff);
        updated = true;
      }
    });

    this.pois.forEach(poi => {
      const poiGround = this.elevationService.getElevation(poi.lat, poi.lng, elevations);
      if (!Number.isFinite(poiGround)) {
        return;
      }
      // POI HAG = poi.alt + takeoffGround + takeoffElevation - poiGround
      const takeoffElevation = this.ui && typeof this.ui.getTakeoffElevation === 'function'
        ? this.ui.getTakeoffElevation()
        : 0;
      const poiHag = poi.alt + takeoffGround + takeoffElevation - poiGround;
      const previousPoiHag = this.heightAboveGroundByPoiId.get(poi.id);
      if (!Number.isFinite(previousPoiHag) || Math.abs(previousPoiHag - poiHag) > 0.05) {
        this.heightAboveGroundByPoiId.set(poi.id, poiHag);
        updated = true;
      }
    });

    if (updated) {
      if (this.fpv && typeof this.fpv.setGraphHeightAboveGround === 'function') {
        this.fpv.setGraphHeightAboveGround(this.heightAboveGroundByWaypointId);
      }

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
        ...this._buildListCallbacks()
      });
      this.refreshMarkerLabels();
    }
  }

  _showMobileDetail(id, type) {
    this.ui.closeMobileMissionSettings();
    if (type === 'wp') {
      this.openWaypointOptionsDialog(id);
      return;
    }
    this.openPOIOptionsDialog(id);
  }

  _renderDetail(id, type, targetElement = null) {
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
        targetElement,
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
      return;
    }

    const poi = this.mission.findPOI(id);
    if (!poi) {
      return;
    }
    this.ui.showPOIDetail({
      poi,
      targetElement,
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

  showDetail(id, type) {
    if (this.isMobileScreen) {
      this._showMobileDetail(id, type);
      return;
    }

    this.ui.hideMobileSheet();
    this._renderDetail(id, type);
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
    this.ui.setMobileModeActive(m);
  }

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
  }

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
    this.ui.hideMobileSheet();
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
  }

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
        const writable = await fileHandle.createWritable();
        await writable.write(jsonText);
        await writable.close();
        this.showStatus(`Saved mission file: ${filename}`);
        this.ui.showToast(`Saved to Files: ${filename}`, 'success');
        return;
      }

      const jsonFile = new File([jsonText], filename, { type: 'application/json' });
      let canShareFile = false;
      try {
        canShareFile = typeof navigator !== 'undefined'
          && typeof navigator.share === 'function'
          && typeof navigator.canShare === 'function'
          && navigator.canShare({ files: [jsonFile] });
      } catch (error) {
        canShareFile = false;
      }

      if (canShareFile) {
        try {
          await navigator.share({
            files: [jsonFile],
            title: filename,
            text: 'Mission JSON generated locally on this device.'
          });
          this.showStatus(`Mission ready in Share Sheet: ${filename}`);
          this.ui.showToast(`Mission ready: ${filename}`, 'success');
          return;
        } catch (error) {
          if (!error || error.name !== 'AbortError') {
            console.warn('Share failed, falling back to download flow:', error);
          }
        }
      }

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
      this.ui.showToast(`Downloaded mission: ${filename}`, 'success');
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return;
      }
      this.onError(error.message || 'Failed to save mission to files.');
      this.ui.showToast(error.message || 'Failed to save mission to files.', 'error');
    }
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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

  bindUIEvents() {
    this.ui.bindToolbarEvents({
      onAddWaypoint: () => this.setMode('wp'),
      onAddPOI: () => this.setMode('poi'),
      onSelectMode: () => this.handleSelectModeRequest(),
      onUnselectAll: () => this.doUnselectAll(),
      onLocate: () => this.locateUser(),
      onClearAll: () => this.clearAll(),
      onSaveMission: () => this.doSaveMission(),
      onSaveMissionAs: () => this.saveMissionToFiles(),
      onLoadMission: () => this.doLoadMission(),
      onExport: () => this.doExport(),
      onExportAs: () => this.exportKmzAs(),
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

    this.bindMobileUIEvents();
  }

  bindMobileUIEvents() {
    this.ui.bindMobileEvents({
      onMobileMissionSettings: () => this.ui.toggleMobileMissionSettings(),
      onMobileMissionDone: () => this.ui.closeMobileMissionSettings(),
      onMobileLoad: () => this.doLoadMission(),
      onMobileSave: () => this.doSaveMission(),
      onMobileExport: () => this.doExport(),
      onMobileSaveAs: () => this.saveMissionToFiles(),
      onMobileExportAs: () => this.exportKmzAs(),
      onMobilePlay: () => {
        if (!this.flythrough) {
          return;
        }

        if (this.flythrough.isPlaying) {
          this.flythrough.pause();
          this.ui.setMobilePlayState('paused');
          return;
        }

        this.syncFlythroughMission();
        this.flythrough.play();
        this.ui.setMobilePlayState('playing');
      },
      onMobileAddWp: () => this.setMode('wp'),
      onMobileAddPoi: () => this.setMode('poi'),
      onMobileSelect: () => this.handleSelectModeRequest(),
      onMobileClearSel: () => this.doUnselectAll(),
      onMobileFPV: () => this.toggleFPV()
    });

    const applyScreenSm = () => {
      document.body.classList.toggle(
        'screen-sm',
        window.matchMedia('(pointer: coarse) and ((max-width: 1024px) or (max-height: 820px))').matches
      );
    };
    applyScreenSm();
    window.addEventListener('resize', applyScreenSm);
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
  }
}
