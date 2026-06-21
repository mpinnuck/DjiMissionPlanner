// FlythroughTimeline.js
// Mixed into FlythroughController.prototype

const FlythroughTimeline = {
_actionsDwellTime(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return 0;
  let t = 0;
  for (const act of actions) {
    const p = act.params || {};
    switch (act.type) {
      case 'hover':        t += Math.max(0, Number(p.hoverTime) || 3);  break;
      case 'panoShot':     t += p.panoShotSubMode === 'panoShot_180' ? 10 : 25; break;
      case 'gimbalRotate': t += 2;  break;
      case 'rotateYaw':    t += 4;  break;
      case 'takePhoto':    t += 1;  break;
      default: break;
    }
  }
  // Add 1 s per stop to account for deceleration and acceleration
  return t > 0 ? t + 1 : 0;
},

_buildTimeline(waypoints) {
  const SAMPLES  = 20;
  const pts      = waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng }));
  const spline   = CubicSplinePath.build(pts, SAMPLES).map(p => [p.lat, p.lng]);
  const n        = waypoints.length;
  const timeline = [];
  let   mT       = 0;
  let   dwellOffset = 0;
  let   cumulativeDistance = 0;

  spline.forEach((pt, idx) => {
    // Which segment are we in?  Segment k spans spline indices [k*S .. (k+1)*S]
    const segIdx = Math.min(Math.floor(idx / SAMPLES), n - 2);
    const wp0    = waypoints[segIdx];
    const wp1    = waypoints[segIdx + 1];
    const frac   = (idx - segIdx * SAMPLES) / SAMPLES;  // 0..1 within segment
    const segmentSpeed = Number.isFinite(waypoints[segIdx].speed) && waypoints[segIdx].speed > 0
      ? waypoints[segIdx].speed
      : 1;

    // Accumulate mission time using the source waypoint's speed
    if (idx > 0) {
      const prev    = spline[idx - 1];
      const stepDistance = this._haversine(prev[0], prev[1], pt[0], pt[1]);
      cumulativeDistance += stepDistance;
      mT += stepDistance / segmentSpeed;
    }

    // Altitude and gimbal pitch: linear interpolation between waypoints
    const alt             = wp0.alt + frac * (wp1.alt - wp0.alt);
    const gimbalPitch     = (wp0.gimbalPitch    || 0) + frac * ((wp1.gimbalPitch    || 0) - (wp0.gimbalPitch    || 0));
    const fpvGimbalPitch  = (wp0.fpvGimbalPitch || 0) + frac * ((wp1.fpvGimbalPitch || 0) - (wp0.fpvGimbalPitch || 0));
    const poiAlt          = (wp0.poiAlt         || 0) + frac * ((wp1.poiAlt         || 0) - (wp0.poiAlt         || 0));
    // POI lat/lng: only interpolate when both waypoints share a POI, otherwise use wp0's values
    const poiLat = (wp0.poiLat != null && wp1.poiLat != null)
      ? wp0.poiLat + frac * (wp1.poiLat - wp0.poiLat)
      : (wp0.poiLat != null ? wp0.poiLat : null);
    const poiLng = (wp0.poiLng != null && wp1.poiLng != null)
      ? wp0.poiLng + frac * (wp1.poiLng - wp0.poiLng)
      : (wp0.poiLng != null ? wp0.poiLng : null);

    // Heading: tangent along spline, overridden by POI heading when assigned
    let heading;
    if (idx < spline.length - 1) {
      heading = this._bearing(pt[0], pt[1], spline[idx + 1][0], spline[idx + 1][1]);
    } else {
      heading = this._bearing(spline[idx - 1][0], spline[idx - 1][1], pt[0], pt[1]);
    }
    if (wp0.poiId || wp1.poiId) {
      const h0 = wp0.poiId ? wp0.heading : heading;
      const h1 = wp1.poiId ? wp1.heading : heading;
      heading  = this._lerpAngle(h0, h1, frac);
    }

    const entry = {
      time: mT + dwellOffset,
      lat: pt[0],
      lng: pt[1],
      heading,
      alt,
      gimbalPitch,
      fpvGimbalPitch,
      poiAlt,
      poiLat,
      poiLng,
      poiId: wp0.poiId || null,
      speed: segmentSpeed,
      distance: cumulativeDistance,
      segmentIndex: segIdx
    };
    timeline.push(entry);

    // If this index falls exactly on a waypoint, add dwell time for its actions.
    // idx === 0  → actions at the departure waypoint (executed before first flight leg)
    // idx % SAMPLES === 0 && idx > 0 → arrival at waypoint idx/SAMPLES
    const isWpBoundary = idx === 0 || (idx > 0 && idx % SAMPLES === 0);
    if (isWpBoundary) {
      const wpIdx = idx === 0 ? 0 : idx / SAMPLES;
      const dwell = this._actionsDwellTime(waypoints[wpIdx].actions);
      if (dwell > 0) {
        // Push a stationary "end of dwell" entry at the same position
        timeline.push({ ...entry, time: mT + dwellOffset + dwell });
        dwellOffset += dwell;
      }
    }
  });

  return timeline;
},

// ── Geometry helpers ────────────────────────────────────────────────────

_haversine(lat1, lon1, lat2, lon2) {
  const R = FlythroughController.EARTH_R;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLon = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
},

_bearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2-lon1) * Math.PI/180;
  const y = Math.sin(dLon) * Math.cos(lat2*Math.PI/180);
  const x = Math.cos(lat1*Math.PI/180) * Math.sin(lat2*Math.PI/180)
          - Math.sin(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180/Math.PI + 360) % 360;
},

/** Interpolate between two angles, taking the shortest arc */
_lerpAngle(a, b, t) {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
},

/** Offset a lat/lng by northM metres north and eastM metres east */
_offsetLatLng(lat, lng, northM, eastM) {
  const R    = FlythroughController.EARTH_R;
  const dLat = northM / R * (180 / Math.PI);
  const dLng = eastM  / (R * Math.cos(lat * Math.PI / 180)) * (180 / Math.PI);
  return [lat + dLat, lng + dLng];
},

// ── Cleanup ─────────────────────────────────────────────────────────────

_clearLayers() {
  this._closeTelemetryPopup();
  if (this._droneLayer) { this._map.removeLayer(this._droneLayer); this._droneLayer = null; }
  if (this._fovLayer)   { this._map.removeLayer(this._fovLayer);   this._fovLayer   = null; }
  if (this._fovCenterLineLayer) {
    this._map.removeLayer(this._fovCenterLineLayer);
    this._fovCenterLineLayer = null;
  }
  if (this._fovCenterPointLayer) {
    this._map.removeLayer(this._fovCenterPointLayer);
    this._fovCenterPointLayer = null;
  }
  this._telemetryPopup = null;
  this._activeFrame = null;
  this._draggingDrone = false;

}
};
