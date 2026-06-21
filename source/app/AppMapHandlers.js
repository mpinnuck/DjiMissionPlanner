/**
 * AppMapHandlers.js  —  App mixin: map markers and location
 * Mixed into App.prototype via App.js.
 *
 * Responsibilities:
 *  - updateStats / updateMobileStats
 *  - locateUser (triggers LocationService)
 *  - Waypoint and POI marker creation, refresh, and tooltip management
 *  - Waypoint/POI recompute helpers (heading, gimbal pitch, HAG)
 *  - addWaypointAction / deleteWaypointAction / moveWaypointAction*
 *  - POI options dialog trigger
 *  - syncFlythroughMission / updateRoute
 */
// AppMapHandlers.js
// Mixed into App.prototype in App.js
const AppMapHandlers = {
updateStats() {
  const distanceMeters = this.mission.totalDistance();
  const totalSeconds = this.flythrough ? this.flythrough.totalTime : 0;
  this.ui.updateStats({
    waypointCount: this.waypoints.length,
    poiCount: this.pois.length,
    distanceMeters
  });
  this.ui.updateMobileStats({
    wpCount: this.waypoints.length,
    distanceMeters,
    elapsedSeconds: totalSeconds
  });
},

locateUser() {
  this.locationService.locateUser();
},

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
},

addWaypointMarker(wp, idx) {
  const m = this.mapController.addWaypointMarker(wp, idx);

  let lastClickTime = 0;
  let singleClickTimer = null;
  const DOUBLE_TAP_MS = 350;

  m.on('click', event => {
    const now = Date.now();
    const gap = now - lastClickTime;
    lastClickTime = now;

    if (gap < DOUBLE_TAP_MS) {
      // Double-tap / double-click
      clearTimeout(singleClickTimer);
      singleClickTimer = null;
      if (event && event.originalEvent) {
        event.originalEvent.preventDefault();
        event.originalEvent.stopPropagation();
      }
      this.showWaypointTooltip(wp.id);
      this.selectItem(wp.id, 'wp');
      this.openWaypointOptionsDialog(wp.id);
    } else {
      // Defer single-click so a quick second tap can cancel it
      clearTimeout(singleClickTimer);
      singleClickTimer = setTimeout(() => {
        singleClickTimer = null;
        this.onWaypointMarkerClick(wp.id);
      }, DOUBLE_TAP_MS);
    }
  });

  m.on('dblclick', event => {
    // Prevent map zoom on native dblclick (desktop)
    if (event && event.originalEvent) {
      event.originalEvent.preventDefault();
      event.originalEvent.stopPropagation();
    }
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
},

onWaypointMarkerClick(waypointId) {
  if (this.isMobileScreen && this.mode === 'select') {
    this.selectedWaypointIds.add(waypointId);
    this.selectedId = null;
    this.selectedType = null;
    this.lastWaypointAnchorId = waypointId;
    // On mobile: just update highlight + status — don't auto-open any dialog
    this.renderList();
    this.ui.highlightSelectedItem(
      null,
      this.selectedWaypointIds,
      this.waypoints.findLast(wp => this.selectedWaypointIds.has(wp.id))?.id ?? null
    );
    this.showStatus(`${this.selectedWaypointIds.size} waypoints selected.`);
    return;
  }

  if (this.isMobileScreen) {
    // On mobile: single tap just selects/highlights — double-tap opens the dialog
    this.selectedWaypointIds.clear();
    this.selectedId = waypointId;
    this.selectedType = 'wp';
    this.lastWaypointAnchorId = waypointId;
    this.closeWaypointTooltip();
    this.ui.closeWaypointOptionsDialog();
    this.ui.closePOIOptionsDialog();
    this.ui.hideMobileSheet();
    this.renderList();
    this.ui.highlightSelectedItem(waypointId, this.selectedWaypointIds, waypointId);
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
  // Tooltip/options shown on long press, not single-click
},

closeWaypointTooltip() {
  this.activeWaypointTooltipId = null;
  if (this.activeWaypointPopup && this.mapController && this.mapController.map) {
    this.mapController.map.closePopup(this.activeWaypointPopup);
    this.activeWaypointPopup = null;
  }
},

closePOITooltip() {
  if (this.activePOIPopup && this.mapController && this.mapController.map) {
    this.mapController.map.closePopup(this.activePOIPopup);
    this.activePOIPopup = null;
  }
},

showPOITooltip(poiId) {
  const poi = this.mission.findPOI(poiId);
  const marker = this.poiMarkers.get(poiId);
  if (!poi || !marker) {
    return;
  }

  const poiIndex = this.pois.indexOf(poi);
  if (poiIndex === -1) {
    return;
  }

  const hagMeters = this.heightAboveGroundByPoiId.get(poi.id);
  const hagLabel = Number.isFinite(hagMeters) ? ` (${Math.round(hagMeters)})` : '';
  const tooltipHtml = `
    <div class="wp-map-tooltip-content">
      <div class="wp-map-tooltip-title">POI ${Mission.formatPoiDisplayName(poi.name, String(poiIndex + 1))}</div>
      <div>Position: ${poi.lat.toFixed(6)}, ${poi.lng.toFixed(6)}</div>
      <div>Altitude: ${Math.round(poi.alt)} m${hagLabel}</div>
      <button type="button" class="wp-map-tooltip-options">Tap for Options</button>
    </div>
  `;

  this.closePOITooltip();

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

  this.activePOIPopup = popup;

  requestAnimationFrame(() => {
    const popupElement = popup ? popup.getElement() : null;
    const button = popupElement ? popupElement.querySelector('.wp-map-tooltip-options') : null;
    if (!button) {
      return;
    }

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.openPOIOptionsDialog(poiId);
    });
  });
},

formatWaypointTime(seconds) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
},

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
},

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
},

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
    },
    actions: Array.isArray(wp.actions) ? wp.actions : [],
    onAddAction: (type, params) => {
      this.addWaypointAction(wp.id, type, params);
      this._refreshDialogActions(wp);
    },
    onDeleteAction: actionId => {
      this.deleteWaypointAction(wp.id, actionId);
      this._refreshDialogActions(wp);
    },
    onMoveActionUp: actionId => {
      this.moveWaypointActionUp(wp.id, actionId);
      this._refreshDialogActions(wp);
    },
    onMoveActionDown: actionId => {
      this.moveWaypointActionDown(wp.id, actionId);
      this._refreshDialogActions(wp);
    }
  });
}

};
