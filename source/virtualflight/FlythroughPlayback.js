/**
 * FlythroughPlayback.js  —  FlythroughController mixin: animation loop
 * Mixed into FlythroughController.prototype via FlythroughController.js.
 *
 * Responsibilities:
 *  - _tick: requestAnimationFrame callback — advances playhead, calls _getFrame
 *  - _getFrame: interpolates position/heading/gimbal/FOV from the timeline
 *    at a given time using the cubic spline sample points
 *  - _augmentFrame: recomputes gimbal pitch dynamically from the drone's
 *    actual spline position to the assigned POI (more accurate than stored value)
 *  - _updateDisplay: pushes the current frame to the map drone marker,
 *    FPV camera, and flight graph cursor
 */
// FlythroughPlayback.js
// Mixed into FlythroughController.prototype

const FlythroughPlayback = {

_tick(wallNow) {
  if (!this._playing) return;

  this._missionTime = (wallNow - this._wallStart) * this._speed / 1000;

  if (this._missionTime >= this._totalTime) {
    this._missionTime = this._totalTime;
    const frame = this._augmentFrame(this._getFrame(this._missionTime));
    this._updateDisplay(frame);
    if (this.onFrame) this.onFrame(frame);
    this._playing = false;
    this._rafHandle = null;
    if (this.onProgress) this.onProgress(this._missionTime, this._totalTime);
    if (this.onComplete) this.onComplete();
    return;
  }

  const frame = this._augmentFrame(this._getFrame(this._missionTime));
  this._updateDisplay(frame);
  if (this.onFrame) this.onFrame(frame);
  if (this.onProgress) this.onProgress(this._missionTime, this._totalTime);

  this._rafHandle = requestAnimationFrame(ts => this._tick(ts));
},

// ── Frame interpolation ─────────────────────────────────────────────────

_getFrame(t) {
  const tl = this._timeline;
  if (t <= tl[0].time)               return { ...tl[0] };
  if (t >= tl[tl.length - 1].time)  return { ...tl[tl.length - 1] };

  // Binary search for surrounding entries
  let lo = 0, hi = tl.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tl[mid].time <= t) lo = mid; else hi = mid;
  }
  const a = tl[lo], b = tl[hi];
  const timeSpan = b.time - a.time;
  const f = timeSpan > 0 ? (t - a.time) / timeSpan : 0;

  return {
    time:        t,
    lat:         a.lat         + f * (b.lat         - a.lat),
    lng:         a.lng         + f * (b.lng         - a.lng),
    alt:         a.alt         + f * (b.alt         - a.alt),
    heading:     this._lerpAngle(a.heading, b.heading, f),
    gimbalPitch: a.gimbalPitch + f * (b.gimbalPitch - a.gimbalPitch),
    fpvGimbalPitch: a.fpvGimbalPitch + f * (b.fpvGimbalPitch - a.fpvGimbalPitch),
    poiAlt:      (a.poiAlt || 0) + f * ((b.poiAlt || 0) - (a.poiAlt || 0)),
    poiLat:      (a.poiLat != null && b.poiLat != null) ? a.poiLat + f * (b.poiLat - a.poiLat) : (a.poiLat != null ? a.poiLat : null),
    poiLng:      (a.poiLng != null && b.poiLng != null) ? a.poiLng + f * (b.poiLng - a.poiLng) : (a.poiLng != null ? a.poiLng : null),
    poiId:       f < 0.5 ? a.poiId : b.poiId,
    speed:       a.speed       + f * (b.speed       - a.speed),
    distance:    a.distance    + f * (b.distance    - a.distance),
    segmentIndex: f < 1 ? a.segmentIndex : b.segmentIndex,
  };
},

// ── Display update ──────────────────────────────────────────────────────

// Dynamically recomputes gimbalPitch and fpvGimbalPitch from the actual drone
// position at this frame moment, so the FOV projection and FPV view are exact
// even when the spline places the drone slightly off the waypoint radius.
_augmentFrame(frame) {
  const { lat, lng, alt, poiLat, poiLng, poiAlt } = frame;
  if (!Number.isFinite(poiLat) || !Number.isFinite(poiLng)) return frame;
  const horizDist = this._haversine(lat, lng, poiLat, poiLng);
  if (horizDist < 0.1) return frame;
  // gimbalPitch = real DJI angle, aimed at poi.alt above the takeoff datum.
  // Using this for the FPV camera (flat scene at y=0) means the center ray
  // intersects y=0 at dist * alt/(alt-poi.alt):
  //   poi.alt = 0  → lands exactly on the POI marker ✓
  //   poi.alt > 0  → overshoots the POI (POI is below centre of frame) ✓
  //   poi.alt < 0  → undershoots the POI (POI is above centre of frame) ✓
  const gimbalPitch = Math.max(-90, Math.min(30, Math.atan2((poiAlt || 0) - alt, horizDist) * 180 / Math.PI));
  return { ...frame, gimbalPitch, fpvGimbalPitch: gimbalPitch };
},

_updateDisplay({ lat, lng, heading, alt, gimbalPitch, fpvGimbalPitch, poiAlt }) {
  this._activeFrame = {
    ...this._getFrame(this._missionTime),
    lat,
    lng,
    heading,
    alt,
    gimbalPitch,
    fpvGimbalPitch,
    poiAlt
  };

  // ── Drone marker ───
  if (!this._droneLayer) {
    this._droneLayer = L.marker([lat, lng], {
      icon:          this._buildDroneIcon(),
      zIndexOffset:  1000,
      interactive:   true,
      draggable:     true,
      bubblingMouseEvents: false,
    }).addTo(this._map);
    this._bindDroneInteractions();
  } else {
    this._droneLayer.setLatLng([lat, lng]);
  }
  // Rotate existing element — much faster than setIcon() every frame
  const el = this._droneLayer.getElement();
  if (el) {
    const inner = el.querySelector('.ft-drone-inner');
    if (inner) inner.style.transform = `rotate(${(heading + 180).toFixed(1)}deg)`;
  }

  if (this._telemetryPopup && this._telemetryPopup.isOpen()) {
    this._telemetryPopup
      .setLatLng([lat, lng])
      .setContent(this._buildTelemetryHtml(this._activeFrame));
    this._attachTelemetryPopupActions();
  }

  // ── Camera projection ───
  const fov = this._computeFOV(lat, lng, alt, heading, gimbalPitch, poiAlt);
  if (fov) {
    if (this._showFOV) {
      if (!this._fovLayer) {
        this._fovLayer = L.polygon(fov.corners, {
          color:       '#00d4ff',
          weight:      1.5,
          fillColor:   '#00d4ff',
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(this._map);
      } else {
        this._fovLayer.setLatLngs(fov.corners);
      }
    } else if (this._fovLayer) {
      this._map.removeLayer(this._fovLayer);
      this._fovLayer = null;
    }

    const centerLine = [[lat, lng], fov.center];
    if (!this._fovCenterLineLayer) {
      this._fovCenterLineLayer = L.polyline(centerLine, {
        color:       '#00d4ff',
        weight:      1.75,
        opacity:     0.95,
        interactive: false,
      }).addTo(this._map);
    } else {
      this._fovCenterLineLayer.setLatLngs(centerLine);
    }

    if (!this._fovCenterPointLayer) {
      this._fovCenterPointLayer = L.circleMarker(fov.center, {
        radius:      5,
        color:       '#00d4ff',
        weight:      1.5,
        fillColor:   '#00d4ff',
        fillOpacity: 0.9,
        interactive: false,
      }).addTo(this._map);
    } else {
      this._fovCenterPointLayer.setLatLng(fov.center);
    }
  } else {
    if (this._fovLayer) {
      // Camera cannot be projected — hide polygon
      this._fovLayer.setLatLngs([[0,0],[0,0],[0,0]]);
    }
    if (this._fovCenterLineLayer) {
      this._fovCenterLineLayer.setLatLngs([[0,0],[0,0]]);
    }
    if (this._fovCenterPointLayer) {
      this._fovCenterPointLayer.setLatLng([0, 0]);
    }
  }

}
};
