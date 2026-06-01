class Mission {
  constructor(options = {}) {
    this.settingsRoot = options.settingsRoot || document;
    this.waypoints = [];
    this.pois = [];
    this.wpCounter = 0;
    this.poiCounter = 0;
  }

  getDefaultAltitude() {
    return parseFloat(this.settingsRoot.getElementById('defAlt').value) || 50;
  }

  getDefaultSpeed() {
    return parseFloat(this.settingsRoot.getElementById('defSpeed').value) || 8;
  }

  getMissionName() {
    return this.settingsRoot.getElementById('missionName').value || 'Mission';
  }

  getFinishAction() {
    return this.settingsRoot.getElementById('defFinish').value;
  }

  getHeadingMode() {
    return this.settingsRoot.getElementById('defHeading').value;
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

  createWaypoint(lat, lng) {
    return {
      id: 'wp_' + (++this.wpCounter),
      lat,
      lng,
      alt: this.getDefaultAltitude(),
      speed: this.getDefaultSpeed(),
      heading: 0,
      gimbalPitch: 0,
      poiId: null,
      marker: null
    };
  }

  createPOI(lat, lng) {
    return {
      id: 'poi_' + (++this.poiCounter),
      lat,
      lng,
      alt: 0,
      name: 'POI ' + this.poiCounter,
      marker: null
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
