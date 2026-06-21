/**
 * FlythroughMarkers.js  —  FlythroughController mixin: map markers and UI
 * Mixed into FlythroughController.prototype via FlythroughController.js.
 *
 * Responsibilities:
 *  - _buildDroneIcon: creates the SVG drone Leaflet marker
 *  - _bindDroneInteractions: hover tooltip and drag-to-seek on drone marker
 *  - _attachTelemetryPopupActions: wires close/seek buttons in the popup
 *  - _closeTelemetryPopup / _buildTelemetryHtml: telemetry overlay
 *  - _formatTime: mm:ss time formatter
 *  - _findNearestFrame: binary search for the closest timeline frame to a time
 *  - _computeFOV: calculates and renders the camera field-of-view cone polygon
 *  - _clearLayers: removes all Leaflet layers owned by the controller
 */
// FlythroughMarkers.js
// Mixed into FlythroughController.prototype

const FlythroughMarkers = {
/**
 * Build drone icon.
 *
 * @returns {*}
 */
_buildDroneIcon() {
  // Created once — rotation is applied via CSS transform on .ft-drone-inner.
  return L.divIcon({
    className: '',
    html: `
      <div class="ft-drone-handle">
        <div class="ft-drone-inner">
          <svg class="ft-drone-plane" viewBox="0 0 30 30" width="30" height="30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <polygon points="15,14.8 6.2,5.4 14.9,27.5"
              fill="#f3a21b" stroke="#f8d18a" stroke-width="1.05" stroke-linejoin="round"/>
            <polygon points="15,14.8 23.8,5.4 15.1,27.5"
              fill="#f3a21b" stroke="#f8d18a" stroke-width="1.05" stroke-linejoin="round"/>
            <path d="M15 15 L15 26.7" stroke="#fff3d8" stroke-width="0.95" stroke-linecap="round" opacity="0.95"/>
          </svg>
        </div>
      </div>`,
    iconSize:   [30, 30],
    iconAnchor: [15, 15],
  });
},

/**
 * Bind drone interactions.
 */
_bindDroneInteractions() {
  if (!this._droneLayer) {
    return;
  }

  this._droneLayer.on('click', () => {
    if (!this._activeFrame) {
      return;
    }

    if (this._playing) {
      this.pause();
      this._showTelemetryPopup(this._activeFrame);
      return;
    }

    if (this._telemetryPopup && this._telemetryPopup.isOpen()) {
      this._closeTelemetryPopup();
      if (this._timeline.length && this._missionTime < this._totalTime) {
        this.play();
      }
      return;
    }

    this._showTelemetryPopup(this._activeFrame);
  });

  this._droneLayer.on('dragstart', () => {
    this._draggingDrone = true;
    this.pause();
    if (this._activeFrame) {
      this._showTelemetryPopup(this._activeFrame);
    }
  });

  this._droneLayer.on('drag', event => {
    const nearestFrame = this._augmentFrame(this._findNearestFrame(event.target.getLatLng()));
    if (!nearestFrame) {
      return;
    }
    this._missionTime = nearestFrame.time;
    this._updateDisplay(nearestFrame);
    if (this.onProgress) {
      this.onProgress(this._missionTime, this._totalTime);
    }
  });

  this._droneLayer.on('dragend', event => {
    this._draggingDrone = false;
    const nearestFrame = this._augmentFrame(this._findNearestFrame(event.target.getLatLng()));
    if (!nearestFrame) {
      return;
    }
    this._missionTime = nearestFrame.time;
    this._updateDisplay(nearestFrame);
    this._showTelemetryPopup(nearestFrame);
    if (this.onProgress) {
      this.onProgress(this._missionTime, this._totalTime);
    }
  });
},

/**
 * Show telemetry popup.
 *
 * @param {Object} frame
 */
_showTelemetryPopup(frame) {
  if (!frame || !this._droneLayer) {
    return;
  }

  if (!this._telemetryPopup) {
    this._telemetryPopup = L.popup({
      className: 'ft-telemetry-popup',
      closeButton: false,
      autoClose: false,
      closeOnClick: false,
      offset: [0, -16]
    });
  }

  this._telemetryPopup
    .setLatLng(this._droneLayer.getLatLng())
    .setContent(this._buildTelemetryHtml(frame))
    .openOn(this._map);

  this._attachTelemetryPopupActions();
},

/**
 * Attach telemetry popup actions.
 *
 * @returns {string}
 */
_attachTelemetryPopupActions() {
  if (!this._telemetryPopup) {
    return;
  }

  /**
   * Request animation frame.
   *
   * @param {*} () [default: > {
      const popupElement = this._telemetryPopup ? this._telemetryPopup.getElement() : null;
      const startButton = popupElement ? popupElement.querySelector('.ft-telemetry-start') : null;
      if (!startButton]
   *
   * @returns {string}
   */
  requestAnimationFrame(() => {
    const popupElement = this._telemetryPopup ? this._telemetryPopup.getElement() : null;
    const startButton = popupElement ? popupElement.querySelector('.ft-telemetry-start') : null;
    if (!startButton) {
      return;
    }

    startButton.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      this._closeTelemetryPopup();
      this.play();
    };
  });
},

/**
 * Close telemetry popup.
 *
 * @returns {string}
 */
_closeTelemetryPopup() {
  if (this._telemetryPopup) {
    this._map.closePopup(this._telemetryPopup);
  }
},

/**
 * Build telemetry html.
 *
 * @param {Object} frame
 *
 * @returns {string}
 */
_buildTelemetryHtml(frame) {
  const totalDistance = this._timeline.length ? this._timeline[this._timeline.length - 1].distance : 0;
  const distance = Number.isFinite(frame.distance) ? frame.distance : 0;
  const progressPercent = totalDistance > 0 ? Math.round((distance / totalDistance) * 100) : 0;
  const speedKmh = (Number.isFinite(frame.speed) ? frame.speed : 0) * 3.6;
  const segmentFrom = Number.isFinite(frame.segmentIndex) ? frame.segmentIndex + 1 : 1;
  const segmentTo = Math.min(segmentFrom + 1, Math.max(1, this._timeline.length));

  return `
    <div class="ft-telemetry-card">
      <div class="ft-telemetry-title">Aircraft Telemetry</div>
      <div class="ft-telemetry-line">Position: ${Math.round(distance)} m (${progressPercent}%)</div>
      <div class="ft-telemetry-line">Time: ${this._formatTime(frame.time || 0)}</div>
      <div class="ft-telemetry-line">Course: ${Math.round(frame.heading || 0)}°</div>
      <div class="ft-telemetry-line">Altitude: ${Math.round(frame.alt || 0)} m</div>
      <div class="ft-telemetry-line">Speed: ${Math.round(speedKmh)} kmh</div>
      <div class="ft-telemetry-gap"></div>
      <div class="ft-telemetry-line">Segment: ${segmentFrom}->${segmentTo}</div>
      <div class="ft-telemetry-line">Pitch: ${Number.isFinite(frame.gimbalPitch) ? frame.gimbalPitch.toFixed(1) : '0.0'}°</div>
      <div class="ft-telemetry-line">Yaw: ${Math.round(frame.heading || 0)}° (Absolute)</div>
      <button type="button" class="ft-telemetry-start">Tap to start from current position</button>
    </div>
  `;
},

/**
 * Format time.
 *
 * @param {*} totalSeconds
 *
 * @returns {string}
 */
_formatTime(totalSeconds) {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
},

/**
 * Find nearest frame.
 *
 * @param {*} latlng
 *
 * @returns {*}
 */
_findNearestFrame(latlng) {
  if (!latlng || !this._timeline.length) {
    return null;
  }

  let nearestFrame = this._timeline[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const frame of this._timeline) {
    const distance = this._haversine(latlng.lat, latlng.lng, frame.lat, frame.lng);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearestFrame = frame;
    }
  }
  return nearestFrame;
},

// ── Camera FOV ground projection ────────────────────────────────────────
//
// Projects the four corners of the camera frame onto the ground plane
// using the drone altitude, heading and gimbal pitch.
//
// Returns null when the pitch is too shallow (footprint becomes enormous).

/**
 * Compute f o v.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {*} altM
 * @param {*} headingDeg
 * @param {*} gimbalPitchDeg
 * @param {number} poiAlt [default: 0]
 */
_computeFOV(lat, lng, altM, headingDeg, gimbalPitchDeg, poiAlt = 0) {
  if (!Number.isFinite(altM) || altM <= 0) return null;

  // Keep a visible, bounded footprint even when gimbal is near horizontal.
  const safePitch = Number.isFinite(gimbalPitchDeg) ? gimbalPitchDeg : -45;
  const effectivePitchDeg = Math.min(safePitch, -5.0001);

  // Intersect the POI terrain plane (z = poiAlt above takeoff).
  // Using h_eff = altM - poiAlt means the center ray lands exactly on the POI
  // ground level when gimbalPitch was computed from the same geometry.
  const h     = altM - (Number.isFinite(poiAlt) ? poiAlt : 0);
  if (h <= 0) return null;
  const ψ     = headingDeg    * Math.PI / 180;  // yaw
  const γ     = effectivePitchDeg * Math.PI / 180;  // pitch (negative = down)
  const tanH  = Math.tan((this._hfovDeg / 2) * Math.PI / 180);
  const tanV  = Math.tan((this._vfovDeg / 2) * Math.PI / 180);
  const maxT  = h * 60; // cap projection at 60× altitude

  // Camera basis vectors in ENU (East, North, Up)
  const fwd   = { e:  Math.sin(ψ) * Math.cos(γ),   n: Math.cos(ψ) * Math.cos(γ),   u: Math.sin(γ)  };
  const right = { e:  Math.cos(ψ),                  n: -Math.sin(ψ),                 u: 0            };
  const up    = { e: -Math.sin(ψ) * Math.sin(γ),   n: -Math.cos(ψ) * Math.sin(γ),  u: Math.cos(γ)  };

  // Frame corners in order: BL, BR, TR, TL  (h_sign, v_sign)
  const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
  const pts = [];

  for (const [hs, vs] of corners) {
    const ray = {
      e: fwd.e + hs * tanH * right.e + vs * tanV * up.e,
      n: fwd.n + hs * tanH * right.n + vs * tanV * up.n,
      u: fwd.u + hs * tanH * right.u + vs * tanV * up.u,
    };

    // t where ray hits ground (z=0, drone is at z=h)
    const t = ray.u < -0.001
      ? Math.min(-h / ray.u, maxT)
      : maxT;  // clip near-horizontal rays

    pts.push(this._offsetLatLng(lat, lng, t * ray.n, t * ray.e));
  }
  const centerRay = {
    e: fwd.e,
    n: fwd.n,
    u: fwd.u,
  };
  const centerT = centerRay.u < -0.001
    ? Math.min(-h / centerRay.u, maxT)
    : maxT;
  const center = this._offsetLatLng(lat, lng, centerT * centerRay.n, centerT * centerRay.e);

  return { corners: pts, center };
}

// ── Timeline builder ────────────────────────────────────────────────────

/**
 * Returns the total dwell time (seconds) contributed by a waypoint's actions.
 * Called from both FlythroughController and FlightGraph.
 */

};
