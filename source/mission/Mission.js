/**
 * Mission.js
 * Pure data model for a DJI waypoint mission.
 * Holds the waypoints and POIs arrays and provides all mutation methods.
 *
 * Responsibilities:
 *  - createWaypoint / addWaypoint / removeWaypoint / clearWaypoints
 *  - createPOI / addPOI / removePOI
 *  - Waypoint action CRUD: addWaypointAction, removeWaypointAction,
 *    moveWaypointActionUp, moveWaypointActionDown
 *  - recomputePOI / recomputeAllPOI: recalculates gimbal pitch,
 *    heading, and poiAlt for POI-assigned waypoints
 *  - calcGimbalPitch / calcHeading / haversine / bearing geometry helpers
 *  - totalDistance: sum of all inter-waypoint segment distances
 *  - clear: resets all waypoints and POIs
 *  No DOM or UI dependencies — safe to unit test in isolation.
 */
class Mission {
  constructor() {
    this.waypoints = [];
    this.pois = [];
    this.wpCounter = 0;
    this.poiCounter = 0;
    this.takeoffElevation = 0; // drone height above takeoff ground at launch (m)
  }

  // Public methods

  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  bearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
      Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }

  calcGimbalPitch(wp, poi) {
    const horizDist = this.haversine(wp.lat, wp.lng, poi.lat, poi.lng);
    const altDelta = (poi.alt || 0) - wp.alt;
    const pitch = Math.atan2(altDelta, horizDist) * 180 / Math.PI;
    return Math.max(-90, Math.min(30, pitch));
  }

  // FPV gimbal pitch is identical to the real DJI gimbal pitch.
  // The FPV scene is flat at y=0, so the center ray with this pitch intersects
  // the ground at: dist * alt/(alt-poi.alt) — naturally beyond the POI for
  // above-ground POIs and before it for underground ones, matching real camera geometry.
  calcFpvGimbalPitch(wp, poi) {
    return this.calcGimbalPitch(wp, poi);
  }

  calcHeading(wp, poi) {
    return this.bearing(wp.lat, wp.lng, poi.lat, poi.lng);
  }

  totalDistance() {
    let d = 0;
    for (let i = 1; i < this.waypoints.length; i++) {
      d += this.haversine(
        this.waypoints[i - 1].lat,
        this.waypoints[i - 1].lng,
        this.waypoints[i].lat,
        this.waypoints[i].lng
      );
    }
    return d;
  }

  static formatPoiDisplayName(name, fallback = '?') {
    const raw = typeof name === 'string' ? name.trim() : '';
    if (!raw) {
      return String(fallback ?? '?');
    }

    const legacyMatch = raw.match(/^poi\s*(\d+)$/i);
    return legacyMatch ? legacyMatch[1] : raw;
  }

  static isAutoPoiName(name) {
    const raw = typeof name === 'string' ? name.trim() : '';
    if (!raw) {
      return true;
    }
    if (/^poi\s*\d+$/i.test(raw)) {
      return true;
    }
    return /^\d+$/.test(raw);
  }

  createWaypoint(lat, lng, options = {}) {
    const altitude = Number.isFinite(options.altitude) ? options.altitude : 80;
    const speed = Number.isFinite(options.speed) ? options.speed : 8;
    return {
      id: 'wp_' + (++this.wpCounter),
      lat,
      lng,
      alt: altitude,
      speed,
      heading: 0,
      gimbalPitch: 0,
      fpvGimbalPitch: 0,
      poiId: null,
      poiAlt: 0,
      poiLat: null,
      poiLng: null,
      actions: []
    };
  }

  createPOI(lat, lng) {
    const poiNumber = ++this.poiCounter;
    return {
      id: 'poi_' + poiNumber,
      lat,
      lng,
      alt: 0,
      name: String(poiNumber)
    };
  }

  findWaypoint(id) {
    return this.waypoints.find(wp => wp.id === id);
  }

  findPOI(id) {
    return this.pois.find(poi => poi.id === id);
  }

  addWaypoint(wp) {
    this.waypoints.push(wp);
    this.recomputePOI(wp);
    return wp;
  }

  insertWaypointAt(index, wp) {
    const safeIndex = Math.max(0, Math.min(index, this.waypoints.length));
    this.waypoints.splice(safeIndex, 0, wp);
    this.recomputePOI(wp);
    return wp;
  }

  addPOI(poi) {
    const shouldRenumber = Mission.isAutoPoiName(poi && poi.name);
    this.pois.push(poi);
    if (shouldRenumber) {
      poi.name = String(this.pois.length);
    }
    return poi;
  }

  recomputePOI(wp) {
    if (!wp.poiId) {
      return;
    }
    const poi = this.findPOI(wp.poiId);
    if (!poi) {
      wp.poiId = null;
      return;
    }
    wp.heading = this.calcHeading(wp, poi);
    wp.gimbalPitch = this.calcGimbalPitch(wp, poi);
    wp.fpvGimbalPitch = this.calcFpvGimbalPitch(wp, poi);
    wp.poiAlt = poi.alt || 0;
    wp.poiLat = poi.lat;
    wp.poiLng = poi.lng;
  }

  recomputeAllPOI() {
    this.waypoints.forEach(wp => this.recomputePOI(wp));
  }

  deleteWaypoint(id) {
    const waypoint = this.findWaypoint(id);
    this.waypoints = this.waypoints.filter(wp => wp.id !== id);
    return waypoint;
  }

  deletePOI(id) {
    const poi = this.findPOI(id);
    this.pois = this.pois.filter(item => item.id !== id);
    this.pois.forEach((item, index) => {
      if (Mission.isAutoPoiName(item.name)) {
        item.name = String(index + 1);
      }
    });
    this.waypoints.forEach(wp => {
      if (wp.poiId === id) {
        wp.poiId = null;
        wp.heading = 0;
        wp.gimbalPitch = 0;
        wp.fpvGimbalPitch = 0;
        wp.poiAlt = 0;
        wp.poiLat = null;
        wp.poiLng = null;
      }
    });
    return poi;
  }

  clear() {
    this.waypoints = [];
    this.pois = [];
    this.wpCounter = 0;
    this.poiCounter = 0;
  }

  static _actionId() {
    return 'act_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  createAction(type, params = {}) {
    return { id: Mission._actionId(), type, params: { ...params } };
  }

  addWaypointAction(wpId, type, params = {}) {
    const wp = this.findWaypoint(wpId);
    if (!wp) return null;
    if (!Array.isArray(wp.actions)) wp.actions = [];
    const action = this.createAction(type, params);
    wp.actions.push(action);
    return action;
  }

  removeWaypointAction(wpId, actionId) {
    const wp = this.findWaypoint(wpId);
    if (!wp || !Array.isArray(wp.actions)) return;
    wp.actions = wp.actions.filter(a => a.id !== actionId);
  }

  updateWaypointAction(wpId, actionId, params) {
    const wp = this.findWaypoint(wpId);
    if (!wp) return;
    const action = wp.actions && wp.actions.find(a => a.id === actionId);
    if (!action) return;
    Object.assign(action.params, params);
  }

  moveWaypointActionUp(wpId, actionId) {
    const wp = this.findWaypoint(wpId);
    if (!wp || !Array.isArray(wp.actions)) return;
    const idx = wp.actions.findIndex(a => a.id === actionId);
    if (idx <= 0) return;
    [wp.actions[idx - 1], wp.actions[idx]] = [wp.actions[idx], wp.actions[idx - 1]];
  }

  moveWaypointActionDown(wpId, actionId) {
    const wp = this.findWaypoint(wpId);
    if (!wp || !Array.isArray(wp.actions)) return;
    const idx = wp.actions.findIndex(a => a.id === actionId);
    if (idx < 0 || idx >= wp.actions.length - 1) return;
    [wp.actions[idx], wp.actions[idx + 1]] = [wp.actions[idx + 1], wp.actions[idx]];
  }
}
