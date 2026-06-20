// AppMission.js
// Mixed into App.prototype in App.js
const AppMission = {
addPOIMarker(poi) {
  const poiIndex = this.pois.findIndex(item => item.id === poi.id);
  const m = this.mapController.addPOIMarker(poi, {
    index: poiIndex >= 0 ? poiIndex + 1 : (this.pois.length + 1)
  });
  let lastPoiClickTime = 0;
  let poiSingleClickTimer = null;
  const DOUBLE_TAP_MS = 350;

  m.on('click', event => {
    const now = Date.now();
    const gap = now - lastPoiClickTime;
    lastPoiClickTime = now;

    if (gap < DOUBLE_TAP_MS) {
      clearTimeout(poiSingleClickTimer);
      poiSingleClickTimer = null;
      if (event && event.originalEvent) {
        event.originalEvent.preventDefault();
        event.originalEvent.stopPropagation();
      }
      this.selectItem(poi.id, 'poi');
      this.openPOIOptionsDialog(poi.id);
    } else {
      clearTimeout(poiSingleClickTimer);
      poiSingleClickTimer = setTimeout(() => {
        poiSingleClickTimer = null;
        this.selectItem(poi.id, 'poi');
      }, DOUBLE_TAP_MS);
    }
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
},

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
},

recomputePOI(wp) {
  this.mission.recomputePOI(wp);
},

recomputeAllPOI() {
  this.mission.recomputeAllPOI();
},

updateRoute() {
  this.mapController.updateRoute(this.waypoints, {
    onInsertWaypoint: (insertIndex, latlng) => this.insertWaypointAt(insertIndex, latlng)
  });
  this.syncFlythroughMission();
  this.scheduleHeightAboveGroundRefresh();
},

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
},

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
},

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

};
