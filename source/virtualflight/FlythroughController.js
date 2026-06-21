/**
 * FlythroughController.js
 * Orchestrates the virtual flythrough animation along the mission path.
 * Constructor and public playback API are defined here; all implementation
 * methods are mixed in from the Flythrough* mixin files.
 *
 *  FlythroughPlayback — animation loop, frame interpolation, display update
 *  FlythroughMarkers  — drone icon, telemetry popup, FOV cone
 *  FlythroughTimeline — timeline builder, spline sampling, math utilities
 *
 * Public API: setMission, play, playFromStart, pause, stop, seekTo,
 *             setSpeed, setShowFOV, setDroneConfig, destroy
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

  /**
   * Resets the playhead to zero and starts playback from the beginning.
   */
  playFromStart() {
    this._missionTime = 0;
    this.play();
  }

  /**
   * Starts or resumes flythrough playback from the current position.
   */
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

  /**
   * Pauses flythrough playback at the current position.
   */
  pause() {
    if (!this._playing) return;
    this._playing = false;
    cancelAnimationFrame(this._rafHandle);
    this._rafHandle = null;
  }

  /**
   * Stops playback and removes the drone marker from the map.
   */
  stop() {
    this.pause();
    this._missionTime = 0;
    this._clearLayers();
  }

  /**
   * Renders the drone at its current timeline position without starting playback.
   */
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

  /**
   * Toggles visibility of the camera field-of-view cone on the map.
   *
   * @param {*} show
   */
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

  /**
   * Updates the drone profile (HFOV, aspect ratio) used for FOV cone rendering.
   *
   * @param {*} droneConfig
   */
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

  /**
   * Stops playback and removes all flythrough layers from the map.
   */
  destroy() {
    this.stop();
    this._clearLayers();
    this._timeline = [];
  }

  // Private members

  // ── Animation loop ──────────────────────────────────────────────────────

  // ── Mixin method groups ─────────────────────────────
  // Load order: FlythroughPlayback → FlythroughMarkers
  //   → FlythroughTimeline → FlythroughController.js
}

Object.assign(
  FlythroughController.prototype,
  FlythroughPlayback,
  FlythroughMarkers,
  FlythroughTimeline
);

// Re-expose as static so FlightGraph can call FlythroughController._actionsDwellTime()
FlythroughController._actionsDwellTime = FlythroughController.prototype._actionsDwellTime;
