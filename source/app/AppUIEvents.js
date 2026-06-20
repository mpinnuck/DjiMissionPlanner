// AppUIEvents.js
// Mixed into App.prototype in App.js
const AppUIEvents = {
bindUIEvents() {
  this.ui.bindToolbarEvents({
    onAddWaypoint: () => this.setMode('wp'),
    onAddPOI: () => this.setMode('poi'),
    onSelectMode: () => this.handleSelectModeRequest(),
    onUnselectAll: () => this.doUnselectAll(),
    onLocate: () => this.locateUser(),
    onClearAll: () => this.clearAll(),
    onSaveMission: () => this.doSaveMission(),
    onSaveMissionAs: () => this.saveMissionToFiles(),
    onChangeMissionFolder: () => this.changeSaveMissionFolder(),
    onLoadMission: () => this.doLoadMission(),
    onExport: () => this.doExport(),
    onExportAs: () => this.exportKmzAs(),
    onChangeExportFolder: () => this.changeExportFolder(),
    onToggleFPV: () => this.toggleFPV(),
    onApplyDefaultAltitude: () => this.applyDefaultAltitudeToAllWaypoints(),
    onApplyDefaultSpeed: () => this.applyDefaultSpeedToAllWaypoints(),
    onApplyConstantHag: () => this.applyConstantHeightAboveGround(),
    onDroneConfigChange: () => this.applyDroneConfiguration(),
    onDefaultSpeedChange: () => this.handleDefaultSpeedChange()
  });

  this.ui.bindFlythroughEvents({
    onFlythroughPlayPause: () => {
      if (!this.flythrough) return;
      if (this.flythrough.isPlaying) {
        this.flythrough.pause();
        this.ui.setFlythroughPlayState('paused');
      } else {
        this.flythrough.play();
        this.ui.setFlythroughPlayState('playing');
      }
    },
    onFlythroughPlayFromStart: () => {
      if (this.flythrough) {
        this.syncFlythroughMission();
        this.flythrough.playFromStart();
        this.ui.setFlythroughPlayState('playing');
      }
    },
    onFlythroughStop: () => {
      if (this.flythrough) {
        this.flythrough.stop();
        // After stop(), missionTime=0 but totalTime is still correct
        this.ui.updateFlythroughProgress(0, this.flythrough.totalTime, 0);
        this.ui.setFlythroughPlayState('stopped');
      }
    },
    onFlythroughSpeedChange: speedValue => {
      if (!this.flythrough) {
        return;
      }
      const speed = parseFloat(speedValue);
      if (Number.isFinite(speed) && speed > 0) {
        this.flythrough.setSpeed(speed);
      }
    },
    onFlythroughFovToggle: isEnabled => {
      if (this.flythrough) {
        this.flythrough.setShowFOV(!!isEnabled);
      }
    },
    onFlythroughSeek: seekValue => {
      if (!this.flythrough) {
        return;
      }
      const raw = parseFloat(seekValue);
      const fraction = Number.isFinite(raw) ? raw / 1000 : 0;
      this.flythrough.seekTo(fraction);
    }
  });

  window.addEventListener('keydown', async event => {
    const isCopyShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'c';
    const isDeleteShortcut = !event.metaKey && !event.ctrlKey && !event.altKey
      && (event.key === 'Delete' || event.key === 'Backspace');
    const isEditingInput = this.isTypingInEditableControl();

    if (isCopyShortcut) {
      if (this.selectedWaypointIds.size < 2 || isEditingInput) {
        return;
      }

      event.preventDefault();
      await this.copySelectedWaypointsToClipboard();
      return;
    }

    if (isDeleteShortcut) {
      if (isEditingInput) {
        return;
      }
      const deleted = this.deleteSelectionFromKeyboard();
      if (deleted) {
        event.preventDefault();
      }
    }
  });

  window.addEventListener('resize', () => {
    if (this.fpv && this.isFPVVisible) {
      this.fpv.resize();
    }
  });

  this.bindMobileUIEvents();
},

bindMobileUIEvents() {
  this.ui.bindMobileEvents({
    onMobileMissionSettings: () => this.ui.toggleMobileMissionSettings(),
    onMobileMissionDone: () => this.ui.closeMobileMissionSettings(),
    onMobileLoad: () => this.doLoadMission(),
    onMobileSave: () => this.doSaveMission(),
    onMobileExport: () => this.doExport(),
    onMobileSaveAs: () => this.saveMissionToFiles(),
    onMobileExportAs: () => this.exportKmzAs(),
    onMobilePlay: () => {
      if (!this.flythrough) {
        return;
      }

      if (this.flythrough.isPlaying) {
        this.flythrough.pause();
        this.ui.setMobilePlayState('paused');
        return;
      }

      this.flythrough.play();
      this.ui.setMobilePlayState('playing');
    },
    onMobileAddWp: () => this.setMode('wp'),
    onMobileAddPoi: () => this.setMode('poi'),
    onMobileSelect: () => this.handleSelectModeRequest(),
    onMobileClearSel: () => this.doUnselectAll(),
    onMobileFPV: () => this.toggleFPV()
  });

  document.getElementById('wp-list')?.addEventListener('tree-expand', () => {
    this.renderList();
  });

  const applyScreenSm = () => {
    document.body.classList.toggle(
      'screen-sm',
      window.matchMedia('(pointer: coarse) and ((max-width: 1024px) or (max-height: 820px))').matches
    );
  };
  applyScreenSm();
  window.addEventListener('resize', applyScreenSm);
},

toggleFPV() {
  if (!this.fpv) {
    this.showStatus('FPV view unavailable (Three.js not loaded).');
    return;
  }

  this.isFPVVisible = !this.isFPVVisible;
  if (this.isFPVVisible) {
    this.fpv.show();
    if (this.flythrough) {
      this.syncFlythroughMission();
    }
    this.showStatus('FPV view enabled.');
  } else {
    this.fpv.hide();
    this.showStatus('FPV view hidden.');
  }
},

addWaypointAction(wpId, type, params) {
  const action = this.mission.addWaypointAction(wpId, type, params);
  if (!action) return;
  if (this.ui._expandedWpIds) {
    this.ui._expandedWpIds.add(wpId);
  }
  this.renderList();
  this.syncFlythroughMission();
  this.updateStats();
  this.showStatus(`Action '${type}' added to waypoint.`);
},

deleteWaypointAction(wpId, actionId) {
  this.mission.removeWaypointAction(wpId, actionId);
  this.renderList();
  this.syncFlythroughMission();
  this.updateStats();
  this.showStatus('Action removed.');
},

moveWaypointActionUp(wpId, actionId) {
  this.mission.moveWaypointActionUp(wpId, actionId);
  this.renderList();
  this.syncFlythroughMission();
  this.updateStats();
},

moveWaypointActionDown(wpId, actionId) {
  this.mission.moveWaypointActionDown(wpId, actionId);
  this.renderList();
  this.syncFlythroughMission();
  this.updateStats();
},

_refreshDialogActions(wp) {

}
};
