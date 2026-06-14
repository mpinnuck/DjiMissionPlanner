/**
 * FlythroughController
 *
 * Animates the drone along the mission spline on the Leaflet map.
 * Produces a heading-aware drone icon and a camera FOV ground footprint.
 *
 * DJI Air 3S camera: HFOV 82°, 16:9 video → VFOV ≈ 52.1°
 *
 * Integration (App.js):
 *   this.flythrough = new FlythroughController(this.mapController.map, {
 *     onProgress: (t, total) => this.ui.updateFlythroughProgress(t, total),
 *     onComplete:  ()        => this.ui.setFlythroughStopped()
 *   });
 *
 *   // Call whenever waypoints change:
 *   this.flythrough.setMission(this.mission.waypoints);
 *
 *   // Wire UI buttons to:
 *   //   this.flythrough.play()
 *   //   this.flythrough.pause()
 *   //   this.flythrough.stop()
 *   //   this.flythrough.setSpeed(n)
 *   //   this.flythrough.setShowFOV(bool)
 *   //   this.flythrough.seekTo(fraction)   ← 0.0 – 1.0
 */
class FlythroughController {

  // ── Default camera constants (Air 3S, 16:9 video) ──────────────────────
  static DEFAULT_HFOV_DEG = 82;
  static DEFAULT_ASPECT = 16 / 9;
  static EARTH_R  = 6371000;

  constructor(leafletMap, options = {}) {
    this._map       = leafletMap;
    this.onProgress = options.onProgress || null;  // fn(currentTimeSec, totalTimeSec)
    this.onComplete = options.onComplete  || null;
    this.onFrame    = options.onFrame     || null;

    this._droneLayer = null;   // L.Marker
    this._telemetryPopup = null; // L.Popup
    this._fovLayer   = null;   // L.Polygon
    this._fovCenterLineLayer = null; // L.Polyline
    this._fovCenterPointLayer = null; // L.CircleMarker
    this._showFOV    = false;
    this._activeFrame = null;
    this._draggingDrone = false;
    this._hfovDeg = FlythroughController.DEFAULT_HFOV_DEG;
    this._vfovDeg = 2 * Math.atan(
      Math.tan(FlythroughController.DEFAULT_HFOV_DEG * 0.5 * Math.PI / 180)
      / FlythroughController.DEFAULT_ASPECT
    ) * 180 / Math.PI;

    this.setDroneConfig(options.droneConfig || null);

    this._timeline   = [];     // [{time, lat, lng, heading, alt, gimbalPitch}]
    this._totalTime  = 0;      // seconds

    this._playing    = false;
    this._speed      = 1.0;    // playback multiplier
    this._missionTime = 0;     // current mission time (seconds)
    this._wallStart  = null;   // performance.now() reference when play started
    this._rafHandle  = null;
  }

  // Public methods

  /**
   * Precompute the animation timeline from the waypoints array.
   * Call whenever waypoints change.
   * @returns {boolean} false if fewer than 2 waypoints
   */
  setMission(waypoints) {
    this.stop();
    this._timeline  = [];
    this._totalTime = 0;
    if (!waypoints || waypoints.length < 2) return false;
    this._timeline  = this._buildTimeline(waypoints);
    this._totalTime = this._timeline.length
      ? this._timeline[this._timeline.length - 1].time
      : 0;
    return true;
  }

  get totalTime()   { return this._totalTime; }
  get currentTime() { return this._missionTime; }
  get isPlaying()   { return this._playing; }

  play() {
    if (!this._timeline.length || this._playing) return;
    this.showAtCurrentTime();
    this._closeTelemetryPopup();
    if (this._totalTime <= 0) {
      this._missionTime = 0;
      const frame = this._augmentFrame({ ...this._timeline[0] });
      this._updateDisplay(frame);
      if (this.onFrame) this.onFrame(frame);
      if (this.onProgress) this.onProgress(0, 0);
      if (this.onComplete) this.onComplete();
      return;
    }

    // If at end, restart
    if (this._missionTime >= this._totalTime) this._missionTime = 0;
    this._playing   = true;
    this._wallStart = performance.now() - (this._missionTime / this._speed) * 1000;
    this._rafHandle = requestAnimationFrame(ts => this._tick(ts));
  }

  pause() {
    if (!this._playing) return;
    this._playing = false;
    cancelAnimationFrame(this._rafHandle);
    this._rafHandle = null;
  }

  stop() {
    this.pause();
    this._missionTime = 0;
    this._clearLayers();
  }

  showAtCurrentTime() {
    if (!this._timeline.length) {
      return;
    }

    const frame = this._augmentFrame(this._getFrame(this._missionTime));
    this._updateDisplay(frame);
    if (this.onFrame) {
      this.onFrame(frame);
    }
  }

  /** Seek to a fractional position in the mission (0.0 = start, 1.0 = end) */
  seekTo(fraction) {
    const wasPlaying = this._playing;
    if (wasPlaying) this.pause();
    const safeFraction = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
    this._missionTime = safeFraction * this._totalTime;
    if (this._timeline.length) {
      const frame = this._augmentFrame(this._getFrame(this._missionTime));
      this._updateDisplay(frame);
      if (this.onFrame) this.onFrame(frame);
    }
    if (this.onProgress) this.onProgress(this._missionTime, this._totalTime);
    if (wasPlaying) this.play();
  }

  /** @param {number} multiplier e.g. 0.5, 1, 2, 5, 10 */
  setSpeed(multiplier) {
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return;
    }

    const wasPlaying = this._playing;
    if (wasPlaying) this.pause();
    this._speed = multiplier;
    if (wasPlaying) this.play();
  }

  setShowFOV(show) {
    this._showFOV = show;
    if (!show) {
      if (this._fovLayer) {
        this._map.removeLayer(this._fovLayer);
        this._fovLayer = null;
      }
      return;
    }

    if (show && this._timeline.length) {
      const frame = this._augmentFrame(this._getFrame(this._missionTime));
      this._updateDisplay(frame);
      if (this.onFrame) this.onFrame(frame);
    }
  }

  setDroneConfig(droneConfig) {
    const hfov = Number(droneConfig && droneConfig.hfovDeg);
    const aspect = Number(droneConfig && droneConfig.aspect);
    const safeHfov = Number.isFinite(hfov) && hfov > 10 && hfov < 170
      ? hfov
      : FlythroughController.DEFAULT_HFOV_DEG;
    const safeAspect = Number.isFinite(aspect) && aspect > 0.2 && aspect < 5
      ? aspect
      : FlythroughController.DEFAULT_ASPECT;

    this._hfovDeg = safeHfov;
    this._vfovDeg = 2 * Math.atan(
      Math.tan(safeHfov * 0.5 * Math.PI / 180) / safeAspect
    ) * 180 / Math.PI;

    if (Array.isArray(this._timeline) && this._timeline.length) {
      const frame = this._augmentFrame(this._getFrame(this._missionTime));
      this._updateDisplay(frame);
      if (this.onFrame) this.onFrame(frame);
    }
  }

  destroy() {
    this.stop();
    this._clearLayers();
    this._timeline = [];
  }

  // Private members

  // ── Animation loop ──────────────────────────────────────────────────────

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
  }

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
  }

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
  }

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
    const fov = this._computeFOV(lat, lng, alt, heading, gimbalPitch);
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
  }

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
  }

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
  }

  _attachTelemetryPopupActions() {
    if (!this._telemetryPopup) {
      return;
    }

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
  }

  _closeTelemetryPopup() {
    if (this._telemetryPopup) {
      this._map.closePopup(this._telemetryPopup);
    }
  }

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
  }

  _formatTime(totalSeconds) {
    const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

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
  }

  // ── Camera FOV ground projection ────────────────────────────────────────
  //
  // Projects the four corners of the camera frame onto the ground plane
  // using the drone altitude, heading and gimbal pitch.
  //
  // Returns null when the pitch is too shallow (footprint becomes enormous).

  _computeFOV(lat, lng, altM, headingDeg, gimbalPitchDeg) {
    if (!Number.isFinite(altM) || altM <= 0) return null;

    // Keep a visible, bounded footprint even when gimbal is near horizontal.
    const safePitch = Number.isFinite(gimbalPitchDeg) ? gimbalPitchDeg : -45;
    const effectivePitchDeg = Math.min(safePitch, -5.0001);

    // Always intersect the y=0 ground plane (takeoff elevation reference).
    // gimbalPitch already encodes the POI altitude, so the center ray intersection
    // naturally lands on/before/beyond the POI depending on its elevation.
    const h     = altM;
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

  _buildTimeline(waypoints) {
    const SAMPLES  = 20;
    const pts      = waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng }));
    const spline   = CubicSplinePath.build(pts, SAMPLES).map(p => [p.lat, p.lng]);
    const n        = waypoints.length;
    const timeline = [];
    let   mT       = 0;
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

      timeline.push({
        time: mT,
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
      });
    });

    return timeline;
  }

  // ── Geometry helpers ────────────────────────────────────────────────────

  _haversine(lat1, lon1, lat2, lon2) {
    const R = FlythroughController.EARTH_R;
    const dLat = (lat2-lat1) * Math.PI/180;
    const dLon = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  _bearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2-lon1) * Math.PI/180;
    const y = Math.sin(dLon) * Math.cos(lat2*Math.PI/180);
    const x = Math.cos(lat1*Math.PI/180) * Math.sin(lat2*Math.PI/180)
            - Math.sin(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180/Math.PI + 360) % 360;
  }

  /** Interpolate between two angles, taking the shortest arc */
  _lerpAngle(a, b, t) {
    const diff = ((b - a + 540) % 360) - 180;
    return (a + diff * t + 360) % 360;
  }

  /** Offset a lat/lng by northM metres north and eastM metres east */
  _offsetLatLng(lat, lng, northM, eastM) {
    const R    = FlythroughController.EARTH_R;
    const dLat = northM / R * (180 / Math.PI);
    const dLng = eastM  / (R * Math.cos(lat * Math.PI / 180)) * (180 / Math.PI);
    return [lat + dLat, lng + dLng];
  }

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
}