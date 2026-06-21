/**
 * PlannerUIFlythrough.js  —  PlannerUI mixin: flythrough progress UI
 * Mixed into PlannerUI.prototype via PlannerUI.js.
 *
 * Responsibilities:
 *  - updateFlythroughProgress: updates the seek bar, time label, and
 *    mobile stats strip during playback
 *  - setFlythroughPlayState: switches play/pause/stopped button states
 *  - setMobilePlayState: updates the mobile toolbar play button appearance
 *  - updateStats / updateMobileStats: refreshes waypoint count,
 *    total distance, and elapsed time displays
 */
// PlannerUIFlythrough.js
// Mixed into PlannerUI.prototype in PlannerUI.js

const PlannerUIFlythrough = {
/**
 * Update flythrough progress.
 *
 * @param {*} currentSeconds
 * @param {*} totalSeconds
 * @param {*} progressFraction [default: null]
 */
updateFlythroughProgress(currentSeconds, totalSeconds, progressFraction = null) {
  const current = this.formatFlythroughTime(currentSeconds);
  const total = this.formatFlythroughTime(totalSeconds);

  if (this.ftProgress) {
    this.ftProgress.textContent = `${current} / ${total}`;
  }

  if (this.ftSeekInput && Number.isFinite(progressFraction)) {
    const clamped = Math.max(0, Math.min(1, progressFraction));
    this.ftSeekInput.value = String(Math.round(clamped * 1000));
  }
},

/**
 * Set flythrough stopped.
 */
setFlythroughStopped() {
  this.updateFlythroughProgress(0, 0, 0);
},

/**
 * Refreshes the desktop stats strip and mobile stats bar with current waypoint count, distance, and elapsed time.
 *
 * @param {Object} options - Named options object.
 */
updateStats({ waypointCount, poiCount, distanceMeters }) {
  this.statWP.textContent = waypointCount;
  this.statPOI.textContent = poiCount;
  this.statDist.textContent = distanceMeters >= 1000
    ? (distanceMeters / 1000).toFixed(2) + ' km'
    : Math.round(distanceMeters) + ' m';
},

/**
 * Update mobile stats.
 *
 * @param {Object} options - Named options object.
 */
updateMobileStats({ wpCount, distanceMeters, elapsedSeconds } = {}) {
  if (this.mbStatWP && Number.isFinite(wpCount)) {
    this.mbStatWP.textContent = `WP ${wpCount}`;
  }
  if (this.mbStatDist && Number.isFinite(distanceMeters)) {
    this.mbStatDist.textContent = distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toFixed(1)} km`
      : `${Math.round(distanceMeters)} m`;
  }
  if (this.mbStatTime && Number.isFinite(elapsedSeconds)) {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = Math.floor(elapsedSeconds % 60);
    this.mbStatTime.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
  }
},

/**
 * Sets the interaction mode (select / addWaypoint / addPOI) and updates the UI.
 *
 * @param {string} mode
 */
setMode(mode) {
  this.mapElement.classList.toggle('placing-wp', mode === 'wp');
  this.mapElement.classList.toggle('placing-poi', mode === 'poi');
  this.btnAddWP.className = mode === 'wp' ? 'active-mode button' : 'ghost';
  this.btnAddPOI.className = mode === 'poi' ? 'active-mode-poi button' : 'ghost';
  this.btnSelect.className = mode === 'select' ? 'accent2' : 'ghost';
  const labels = { wp: 'PLACING WAYPOINTS', poi: 'PLACING POI', select: 'SELECT' };
  const classes = { wp: 'status-warn', poi: 'status-warn', select: 'status-ok' };
  this.sbMode.textContent = 'MODE: ' + labels[mode];
  this.sbMode.className = classes[mode];
},

/**
 * Set mobile mode active.
 *
 * @param {string} mode
 */
setMobileModeActive(mode) {
  const map = { wp: this.mbAddWp, poi: this.mbAddPoi, select: this.mbSelect };
  [this.mbAddWp, this.mbAddPoi, this.mbSelect].forEach(button => {
    if (button) {
      button.classList.remove('mb-active');
    }
  });
  if (map[mode]) {
    map[mode].classList.add('mb-active');
  }
},

/**
 * Set flythrough play state.
 *
 * @param {*} state
 */
setFlythroughPlayState(state) {
  if (!this.btnFTPlay) {
    return;
  }
  if (state === 'playing') {
    this.btnFTPlay.textContent = '⏸ Pause';
    this.btnFTPlay.title = 'Pause flythrough (double-click to play from start)';
  } else {
    this.btnFTPlay.textContent = '▶ Play';
    this.btnFTPlay.title = 'Play from current position (double-click to play from start)';
  }
},

/**
 * Set mobile play state.
 *
 * @param {*} state
 */
setMobilePlayState(state) {
  if (!this.mbPlay) {
    return;
  }

  this.mbPlay.classList.remove('playing', 'paused');
  if (state === 'playing') {
    this.mbPlay.textContent = '⏸';
    this.mbPlay.classList.add('playing');
    return;
  }
  if (state === 'paused') {
    this.mbPlay.textContent = '▶';
    this.mbPlay.classList.add('paused');
    return;
  }
  this.mbPlay.textContent = '▶';

}
};
