class Mission {
  constructor() {
    this.waypoints = [];
    this.pois = [];
    this.wpCounter = 0;
    this.poiCounter = 0;
  }

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

  createWaypoint(lat, lng, options = {}) {
    const altitude = Number.isFinite(options.altitude) ? options.altitude : 50;
    const speed = Number.isFinite(options.speed) ? options.speed : 8;
    return {
      id: 'wp_' + (++this.wpCounter),
      lat,
      lng,
      alt: altitude,
      speed,
      heading: 0,
      gimbalPitch: 0,
      poiId: null
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
    this.pois.push(poi);
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
    this.waypoints.forEach(wp => {
      if (wp.poiId === id) {
        wp.poiId = null;
        wp.heading = 0;
        wp.gimbalPitch = 0;
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
}
