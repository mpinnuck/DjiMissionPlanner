/**
 * AppDetailRender.js  —  App mixin: detail panel rendering
 * Mixed into App.prototype via App.js.
 *
 * Responsibilities:
 *  - _showMobileDetail: opens the appropriate mobile bottom sheet for a
 *    waypoint or POI (delegates to openWaypointOptionsDialog / POI dialog)
 *  - _renderDetail: renders the desktop detail panel for the selected item,
 *    or clears it when nothing is selected
 */
// AppDetailRender.js
// Mixed into App.prototype in App.js

const AppDetailRender = {
_showMobileDetail(id, type) {
  this.ui.closeMobileMissionSettings();
  if (type === 'wp') {
    this.openWaypointOptionsDialog(id);
    return;
  }
  this.openPOIOptionsDialog(id);
},

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

};
