/**
 * AppTerrain.js  —  App mixin: height-above-ground and terrain elevation
 * Mixed into App.prototype via App.js.
 *
 * Responsibilities:
 *  - getTakeoffPoi: identifies the reference POI used as takeoff datum
 *  - scheduleHeightAboveGroundRefresh: debounced HAG recalculation trigger
 *  - _initPoiAltitudeToGroundLevel: fetches terrain elevation for a POI
 *    and sets poi.alt relative to the takeoff datum
 *  - refreshHeightAboveGround: fetches elevation for all waypoints and POIs,
 *    populates heightAboveGroundByWaypointId / heightAboveGroundByPoiId maps
 */
// AppTerrain.js
// Mixed into App.prototype in App.js

const AppTerrain = {
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
},

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
},

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

  this.recomputeAllPOI();
  this.syncFlythroughMission();

  this.renderList();
  if (this.selectedId === poi.id) {
    this.showDetail(poi.id, 'poi');
  }
},

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
      selectedType: this.selectedType,
      selectedWaypointIds: this.selectedWaypointIds,
      heightAboveGroundByWaypointId: this.heightAboveGroundByWaypointId,
      heightAboveGroundByPoiId: this.heightAboveGroundByPoiId,
      onSelect: (id, type, interaction) => this.selectItem(id, type, interaction),
      onDelete: (id, type) => this.deleteItem(id, type),
      ...this._buildListCallbacks()
    });
    this.refreshMarkerLabels();
  }
},

};
