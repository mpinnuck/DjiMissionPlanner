// PlannerUIFlythrough.js
// Mixed into PlannerUI.prototype in PlannerUI.js

const PlannerUIFlythrough = {
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

setFlythroughStopped() {
  this.updateFlythroughProgress(0, 0, 0);
},

updateStats({ waypointCount, poiCount, distanceMeters }) {
  this.statWP.textContent = waypointCount;
  this.statPOI.textContent = poiCount;
  this.statDist.textContent = distanceMeters >= 1000
    ? (distanceMeters / 1000).toFixed(2) + ' km'
    : Math.round(distanceMeters) + ' m';
},

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
