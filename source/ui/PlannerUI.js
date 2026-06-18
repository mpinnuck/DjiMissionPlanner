const ACTION_META = {
  takePhoto:    { icon: '📷', label: 'Take Photo',    params: [
    { key: 'fileSuffix', label: 'File suffix', type: 'text', default: '' }
  ]},
  startRecord:  { icon: '🎬', label: 'Start Record',  params: [],
    warning: 'DJI Fly does not support auto-start recording on Air 3S' },
  stopRecord:   { icon: '⏹', label: 'Stop Record',   params: [] },
  hover:        { icon: '⏱', label: 'Hover',          params: [
    { key: 'hoverTime', label: 'Duration', type: 'number', unit: 's', min: 1, max: 300, default: 3 }
  ]},
  rotateYaw:    { icon: '🔄', label: 'Rotate Yaw',    params: [
    { key: 'heading',  label: 'Heading',   type: 'number', unit: '°', min: -180, max: 180, default: 0 },
    { key: 'turnDir',  label: 'Direction', type: 'select',
      options: [['clockwise','Clockwise'],['counterClockwise','Counter-clockwise'],['followPath','Follow Path']],
      default: 'clockwise' }
  ]},
  gimbalRotate: { icon: '🎥', label: 'Gimbal Rotate', params: [
    { key: 'pitch',      label: 'Pitch', type: 'number', unit: '°', min: -90, max: 30, default: -45 },
    { key: 'rotateMode', label: 'Mode',  type: 'select',
      options: [['absoluteAngle','Absolute'],['relativeAngle','Relative']],
      default: 'absoluteAngle' }
  ]},
  zoom:         { icon: '🔍', label: 'Zoom',           params: [
    { key: 'focalLength', label: 'Focal length', type: 'number', unit: 'mm', min: 1, max: 200, default: 24 }
  ]},
  focus:        { icon: '🎯', label: 'Focus',          params: [
    { key: 'isInfiniteFocus', label: 'Infinite focus', type: 'checkbox', default: false }
  ]},
  panoShot:     { icon: '🌐', label: 'Pano Shot',      params: [
    { key: 'panoShotSubMode', label: 'Mode', type: 'select',
      options: [
        ['panoShot_360','360°'],['panoShot_sphere','Sphere'],
        ['panoShot_cylinder','Cylinder'],['panoShot_180','180°']
      ],
      default: 'panoShot_360' }
  ]},
};

function _actionSummary(action) {
  const p = action.params || {};
  switch (action.type) {
    case 'hover':        return `${p.hoverTime || 1}s`;
    case 'gimbalRotate': return `${p.pitch || 0}°`;
    case 'rotateYaw':    return `${p.heading || 0}°`;
    case 'zoom':         return `${p.focalLength || 24}mm`;
    case 'panoShot':     return (p.panoShotSubMode || '').replace('panoShot_', '');
    default:             return '';
  }
}

class PlannerUI {
  constructor(options = {}) {
    this.mapElement = document.getElementById(options.mapElementId || 'map');
    this.wpList = document.getElementById('wp-list');
    this.emptyState = document.getElementById('emptyState');
    this.detailContent = document.getElementById('detail-content');
    this.statWP = document.getElementById('statWP');
    this.statPOI = document.getElementById('statPOI');
    this.statDist = document.getElementById('statDist');
    this.mbStatWP = document.getElementById('mbStatWP');
    this.mbStatDist = document.getElementById('mbStatDist');
    this.mbStatTime = document.getElementById('mbStatTime');
    this.sbMode = document.getElementById('sbMode');
    this.sbCursor = document.getElementById('sbCursor');
    this.sbStatus = document.getElementById('sbStatus');
    this.btnAddWP = document.getElementById('btnAddWP');
    this.btnAddPOI = document.getElementById('btnAddPOI');
    this.btnSelect = document.getElementById('btnSelect');
    this.btnUnselectAll = document.getElementById('btnUnselectAll');
    this.btnLocate = document.getElementById('btnLocate');
    this.btnClear = document.getElementById('btnClear');
    this.btnSaveMission = document.getElementById('btnSaveMission');
    this.btnLoadMission = document.getElementById('btnLoadMission');
    this.btnExport = document.getElementById('btnExport');
    this.mbMission = document.getElementById('mbMission');
    this.mbMissionDone = document.getElementById('mbMissionDone');
    this.mbLoad = document.getElementById('mbLoad');
    this.mbSave = document.getElementById('mbSave');
    this.mbExport = document.getElementById('mbExport');
    this.mbPlay = document.getElementById('mbPlay');
    this.mbAddWp = document.getElementById('mbAddWp');
    this.mbAddPoi = document.getElementById('mbAddPoi');
    this.mbSelect = document.getElementById('mbSelect');
    this.mbClearSel = document.getElementById('mbClearSel');
    this.mbFPV = document.getElementById('mbFPV');
    this.btnFPV = document.getElementById('btnFPV');
    this.btnFTPlay = document.getElementById('btnFTPlay');
    this.btnFTStop = document.getElementById('btnFTStop');
    this.ftSpeedSelect = document.getElementById('ftSpeed');
    this.mbftSpeedSelect = document.getElementById('mbftSpeed');
    this.ftFovCheckbox = document.getElementById('chkFTFov');
    this.ftSeekInput = document.getElementById('ftSeek');
    this.ftProgress = document.getElementById('ftProgress');
    this.missionNameInput = document.getElementById('missionName');
    this.defaultAltitudeInput = document.getElementById('defAlt');
    this.btnApplyDefaultAlt = document.getElementById('btnApplyDefaultAlt');
    this.defaultSpeedInput = document.getElementById('defSpeed');
    this.btnApplyDefaultSpeed = document.getElementById('btnApplyDefaultSpeed');
    this.droneProfileSelect = document.getElementById('defDrone');
    this.cameraHfovInput = document.getElementById('defHfov');
    this.takeoffElevationInput = document.getElementById('defTakeoffElevation');
    this.defaultConstHagInput = document.getElementById('defConstHag');
    this.btnApplyConstHag = document.getElementById('btnApplyConstHag');
    this.finishActionSelect = document.getElementById('defFinish');
    this.rcLostActionSelect = document.getElementById('defRCLost');
    this.headingModeSelect = document.getElementById('defHeading');
    this.mobileSheet = document.getElementById('mobileSheet');
    this.mobileSheetBody = document.getElementById('mobileSheetBody');
    this.mobileSheetOvl = document.getElementById('mobileSheetOverlay');
    this.touchRangeSelection = null;
    this._expandedWpIds = new Set();
    this._wpSectionOpen = true;
    this._poiSectionOpen = true;

    this.updateDroneInputsState();
  }

  // Public methods

  getMissionName() {
    return this.missionNameInput.value || 'Mission';
  }

  getDefaultAltitude() {
    return parseFloat(this.defaultAltitudeInput.value) || 80;
  }

  getDefaultSpeed() {
    const speedKmh = parseFloat(this.defaultSpeedInput.value);
    return Number.isFinite(speedKmh) ? Number((speedKmh / 3.6).toFixed(2)) : 8;
  }

  getTakeoffElevation() {
    const v = parseFloat(this.takeoffElevationInput?.value);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }

  getConstantHeightAboveGround() {
    return parseFloat(this.defaultConstHagInput?.value);
  }

  getDroneProfileId() {
    return this.droneProfileSelect ? this.droneProfileSelect.value : 'air3s';
  }

  getCameraHfov() {
    const value = parseFloat(this.cameraHfovInput?.value);
    return Number.isFinite(value) ? value : 82;
  }

  updateDroneInputsState() {
    if (!this.cameraHfovInput) {
      return;
    }
    const isCustom = this.getDroneProfileId() === 'custom';
    this.cameraHfovInput.disabled = !isCustom;
    if (!isCustom) {
      this.cameraHfovInput.value = '82';
    }
  }

  getFinishAction() {
    return this.finishActionSelect.value;
  }

  getHeadingMode() {
    return this.headingModeSelect.value;
  }

  getRcLostAction() {
    return this.rcLostActionSelect.value;
  }

  getMissionSettings() {
    return {
      missionName: this.getMissionName(),
      defaultAltitude: this.getDefaultAltitude(),
      defaultSpeed: this.getDefaultSpeed(),
      droneProfile: this.getDroneProfileId(),
      cameraHfov: this.getCameraHfov(),
      finishAction: this.getFinishAction(),
      rcLostAction: this.getRcLostAction(),
      headingMode: this.getHeadingMode(),
      takeoffElevation: this.getTakeoffElevation()
    };
  }

  applyMissionSettings(settings = {}) {
    if (typeof settings.missionName === 'string') {
      this.missionNameInput.value = settings.missionName;
    }
    if (Number.isFinite(settings.defaultAltitude)) {
      this.defaultAltitudeInput.value = settings.defaultAltitude;
    }
    if (Number.isFinite(settings.defaultSpeed)) {
      this.defaultSpeedInput.value = String(Math.round(settings.defaultSpeed * 3.6));
    }
    if (typeof settings.droneProfile === 'string' && this.droneProfileSelect) {
      this.droneProfileSelect.value = settings.droneProfile;
    }
    if (Number.isFinite(settings.cameraHfov) && this.cameraHfovInput) {
      this.cameraHfovInput.value = String(Math.round(settings.cameraHfov));
    }
    if (typeof settings.finishAction === 'string') {
      this.finishActionSelect.value = settings.finishAction;
    }
    if (typeof settings.rcLostAction === 'string') {
      this.rcLostActionSelect.value = settings.rcLostAction;
    }
    if (typeof settings.headingMode === 'string') {
      this.headingModeSelect.value = settings.headingMode;
    }
    if (Number.isFinite(settings.takeoffElevation) && this.takeoffElevationInput) {
      this.takeoffElevationInput.value = String(settings.takeoffElevation);
    }

    this.updateDroneInputsState();
  }

  bindToolbarEvents(handlers) {
    this.btnAddWP.addEventListener('click', handlers.onAddWaypoint);
    this.btnAddPOI.addEventListener('click', handlers.onAddPOI);
    this.btnSelect.addEventListener('click', handlers.onSelectMode);
    this.btnUnselectAll.addEventListener('click', handlers.onUnselectAll);
    this.btnLocate.addEventListener('click', handlers.onLocate);
    this.btnClear.addEventListener('click', handlers.onClearAll);
    this.btnSaveMission.addEventListener('click', handlers.onSaveMission);
    this.btnLoadMission.addEventListener('click', handlers.onLoadMission);
    this.btnExport.addEventListener('click', handlers.onExport);
    if (this.btnFPV && typeof handlers.onToggleFPV === 'function') {
      this.btnFPV.addEventListener('click', handlers.onToggleFPV);
    }
    if (this.btnApplyConstHag && typeof handlers.onApplyConstantHag === 'function') {
      this.btnApplyConstHag.addEventListener('click', handlers.onApplyConstantHag);
    }
    if (this.btnApplyDefaultAlt && typeof handlers.onApplyDefaultAltitude === 'function') {
      this.btnApplyDefaultAlt.addEventListener('click', handlers.onApplyDefaultAltitude);
    }
    if (this.btnApplyDefaultSpeed && typeof handlers.onApplyDefaultSpeed === 'function') {
      this.btnApplyDefaultSpeed.addEventListener('click', handlers.onApplyDefaultSpeed);
    }
    if (typeof handlers.onDroneConfigChange === 'function') {
      if (this.droneProfileSelect) {
        this.droneProfileSelect.addEventListener('change', () => {
          this.updateDroneInputsState();
          handlers.onDroneConfigChange();
        });
      }
      if (this.cameraHfovInput) {
        this.cameraHfovInput.addEventListener('change', () => handlers.onDroneConfigChange());
      }
    }
    if (typeof handlers.onDefaultSpeedChange === 'function' && this.defaultSpeedInput) {
      this.defaultSpeedInput.addEventListener('blur', () => handlers.onDefaultSpeedChange());
    }

    // Right-click or double-click on Save = Save As (pick a new location)
    if (typeof handlers.onSaveMissionAs === 'function') {
      this.btnSaveMission.addEventListener('contextmenu', event => {
        event.preventDefault();
        handlers.onSaveMissionAs();
      });
      this.btnSaveMission.addEventListener('dblclick', event => {
        event.preventDefault();
        handlers.onSaveMissionAs();
      });
    }

    // Right-click or double-click on Export = Export As (pick a new location)
    if (typeof handlers.onExportAs === 'function') {
      this.btnExport.addEventListener('contextmenu', e => {
        e.preventDefault();
        handlers.onExportAs();
      });
      this.btnExport.addEventListener('dblclick', e => {
        e.preventDefault();
        handlers.onExportAs();
      });
    }

    // Desktop long-press (hold ≥ 500 ms) on Save = change mission folder
    // Desktop long-press on Export = change KMZ export folder
    const addDesktopLongPress = (el, longFn) => {
      if (!el || typeof longFn !== 'function') return;
      let timer = null;
      let longFired = false;
      el.addEventListener('mousedown', e => {
        if (e.button !== 0) return; // left button only
        longFired = false;
        timer = setTimeout(() => {
          longFired = true;
          longFn();
        }, 500);
      });
      const cancel = () => {
        if (timer) { clearTimeout(timer); timer = null; }
      };
      el.addEventListener('mouseup', cancel);
      el.addEventListener('mouseleave', cancel);
      // Suppress the click that fires after a long press
      el.addEventListener('click', e => {
        if (longFired) { longFired = false; e.stopImmediatePropagation(); }
      }, true);
    };
    addDesktopLongPress(this.btnSaveMission, handlers.onChangeMissionFolder);
    addDesktopLongPress(this.btnExport, handlers.onChangeExportFolder);
  }

  bindFlythroughEvents(handlers = {}) {
    if (this.btnFTPlay) {
      let _clickTimer = null;
      this.btnFTPlay.addEventListener('click', () => {
        if (_clickTimer !== null) {
          // Second click of a double-click: cancel and let dblclick handle it
          clearTimeout(_clickTimer);
          _clickTimer = null;
          return;
        }
        _clickTimer = setTimeout(() => {
          _clickTimer = null;
          if (typeof handlers.onFlythroughPlayPause === 'function') {
            handlers.onFlythroughPlayPause();
          }
        }, 250);
      });
      this.btnFTPlay.addEventListener('dblclick', () => {
        if (_clickTimer !== null) {
          clearTimeout(_clickTimer);
          _clickTimer = null;
        }
        if (typeof handlers.onFlythroughPlayFromStart === 'function') {
          handlers.onFlythroughPlayFromStart();
        }
      });
    }
    if (this.btnFTStop && typeof handlers.onFlythroughStop === 'function') {
      this.btnFTStop.addEventListener('click', handlers.onFlythroughStop);
    }
    if (this.ftSpeedSelect && typeof handlers.onFlythroughSpeedChange === 'function') {
      this.ftSpeedSelect.addEventListener('change', event => {
        handlers.onFlythroughSpeedChange(event.target.value);
      });
    }
    if (this.mbftSpeedSelect && typeof handlers.onFlythroughSpeedChange === 'function') {
      // On iOS, focusing a <select> causes the viewport to scroll up even when the
      // element is position:fixed.  Save the scroll offset on focus and restore it
      // after the picker is dismissed so the layout snaps back immediately.
      let _savedScrollY = 0;
      this.mbftSpeedSelect.addEventListener('focus', () => {
        _savedScrollY = window.pageYOffset || 0;
      }, { passive: true });
      this.mbftSpeedSelect.addEventListener('change', event => {
        handlers.onFlythroughSpeedChange(event.target.value);
        event.target.blur();
      });
      this.mbftSpeedSelect.addEventListener('blur', () => {
        window.scrollTo(0, _savedScrollY);
      }, { passive: true });
    }
    if (this.ftFovCheckbox && typeof handlers.onFlythroughFovToggle === 'function') {
      this.ftFovCheckbox.addEventListener('change', event => {
        handlers.onFlythroughFovToggle(event.target.checked);
      });
    }
    if (this.ftSeekInput && typeof handlers.onFlythroughSeek === 'function') {
      this.ftSeekInput.addEventListener('input', event => {
        handlers.onFlythroughSeek(event.target.value);
      });
    }
  }

  bindMobileEvents(handlers = {}) {
    const wire = (el, fn) => el && fn && el.addEventListener('click', fn);
    wire(this.mbMission, handlers.onMobileMissionSettings);
    wire(this.mbMissionDone, handlers.onMobileMissionDone);
    wire(this.mbLoad, handlers.onMobileLoad);
    // addTapLongPress: single tap = tapFn, hold ≥ 500ms = longFn.
    // longFn is called from touchend (not the timer) so navigator.share() stays
    // within the iOS user-gesture chain.
    const addTapLongPress = (el, tapFn, longFn) => {
      if (!el) return;
      let timer = null;
      let longFired = false;
      el.addEventListener('touchstart', () => {
        longFired = false;
        if (typeof longFn === 'function') {
          timer = setTimeout(() => { longFired = true; }, 500);
        }
      }, { passive: true });
      el.addEventListener('touchend', (e) => {
        if (timer) { clearTimeout(timer); timer = null; }
        if (longFired) {
          e.preventDefault(); // suppress synthetic click
          if (typeof longFn === 'function') longFn();
        }
      });
      el.addEventListener('touchcancel', () => {
        if (timer) { clearTimeout(timer); timer = null; }
        longFired = false;
      });
      if (typeof tapFn === 'function') {
        el.addEventListener('click', () => {
          if (longFired) { longFired = false; return; }
          tapFn();
        });
      }
    };
    addTapLongPress(this.mbSave, handlers.onMobileSave, handlers.onMobileSaveAs);
    addTapLongPress(this.mbExport, handlers.onMobileExport, handlers.onMobileExportAs);

    wire(this.mbPlay, handlers.onMobilePlay);
    wire(this.mbAddWp, handlers.onMobileAddWp);
    wire(this.mbAddPoi, handlers.onMobileAddPoi);
    wire(this.mbSelect, handlers.onMobileSelect);
    wire(this.mbClearSel, handlers.onMobileClearSel);
    wire(this.mbFPV, handlers.onMobileFPV);

    if (this.mobileSheetOvl) {
      this.mobileSheetOvl.addEventListener('click', () => this.hideMobileSheet());
    }
    if (this.mobileSheet) {
      let startY = 0;
      this.mobileSheet.addEventListener('touchstart', e => {
        if (!e.touches || e.touches.length === 0) {
          return;
        }
        startY = e.touches[0].clientY;
      }, { passive: true });
      this.mobileSheet.addEventListener('touchend', e => {
        if (!e.changedTouches || e.changedTouches.length === 0) {
          return;
        }
        if (e.changedTouches[0].clientY - startY > 60) {
          this.hideMobileSheet();
        }
      }, { passive: true });
    }
  }

  closeMissionLoadDialog() {
    const existing = document.getElementById('missionLoadModal');
    if (existing) {
      existing.remove();
    }
  }

  closeExportOptionsDialog() {
    const existing = document.getElementById('exportOptionsModal');
    if (existing) {
      existing.remove();
    }
  }

  showExportOptionsDialog({ canChooseFolder = true } = {}) {
    this.closeExportOptionsDialog();

    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.id = 'exportOptionsModal';
      overlay.className = 'mission-modal-overlay';

      const modal = document.createElement('div');
      modal.className = 'confirm-modal export-options-modal';

      const header = document.createElement('div');
      header.className = 'confirm-modal-header';
      header.textContent = 'Export KMZ';

      const body = document.createElement('div');
      body.className = 'confirm-modal-body';
      body.textContent = canChooseFolder
        ? 'Choose where to export, or export now to the last selected folder.'
        : 'Export now. Folder selection is not supported in this browser.';

      const footer = document.createElement('div');
      footer.className = 'confirm-modal-footer export-options-footer';

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'ghost';
      cancelButton.textContent = 'Cancel';

      const exportButton = document.createElement('button');
      exportButton.type = 'button';
      exportButton.className = 'accent2';
      exportButton.textContent = 'Export KMZ';

      const finish = result => {
        overlay.remove();
        resolve(result);
      };

      cancelButton.addEventListener('click', () => finish(null));
      exportButton.addEventListener('click', () => finish('export'));

      if (canChooseFolder) {
        const folderButton = document.createElement('button');
        folderButton.type = 'button';
        folderButton.className = 'ghost';
        folderButton.textContent = 'Open Folder...';
        folderButton.addEventListener('click', () => finish('folder'));
        footer.appendChild(folderButton);
      }

      footer.appendChild(cancelButton);
      footer.appendChild(exportButton);

      overlay.addEventListener('click', event => {
        if (event.target === overlay) {
          finish(null);
        }
      });

      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    });
  }

  closeSaveOptionsDialog() {
    const existing = document.getElementById('saveOptionsModal');
    if (existing) {
      existing.remove();
    }
  }

  showSaveOptionsDialog({ canChooseFolder = true, canSaveToFiles = true } = {}) {
    this.closeSaveOptionsDialog();

    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.id = 'saveOptionsModal';
      overlay.className = 'mission-modal-overlay';

      const modal = document.createElement('div');
      modal.className = 'confirm-modal export-options-modal';

      const header = document.createElement('div');
      header.className = 'confirm-modal-header';
      header.textContent = 'Save Mission';

      const body = document.createElement('div');
      body.className = 'confirm-modal-body';
      body.textContent = canChooseFolder
        ? 'Save to the current folder, open a different folder first, or save to Files.'
        : 'Folder selection is not supported in this browser. Use Save to Files or save to browser storage.';

      const footer = document.createElement('div');
      footer.className = 'confirm-modal-footer save-options-footer';

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'ghost';
      cancelButton.textContent = 'Cancel';

      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'accent2';
      saveButton.textContent = 'Save Mission';

      const finish = result => {
        overlay.remove();
        resolve(result);
      };

      cancelButton.addEventListener('click', () => finish(null));
      saveButton.addEventListener('click', () => finish('save'));

      if (canSaveToFiles) {
        const filesButton = document.createElement('button');
        filesButton.type = 'button';
        filesButton.className = 'ghost';
        filesButton.textContent = 'Save to Files...';
        filesButton.addEventListener('click', () => finish('files'));
        footer.appendChild(filesButton);
      }

      if (canChooseFolder) {
        const folderButton = document.createElement('button');
        folderButton.type = 'button';
        folderButton.className = 'ghost';
        folderButton.textContent = 'Open Folder...';
        folderButton.addEventListener('click', () => finish('folder'));
        footer.appendChild(folderButton);
      }

      footer.appendChild(cancelButton);
      footer.appendChild(saveButton);

      overlay.addEventListener('click', event => {
        if (event.target === overlay) {
          finish(null);
        }
      });

      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    });
  }

  closeWaypointOptionsDialog() {
    const existing = document.getElementById('waypointOptionsModal');
    if (existing) {
      existing.remove();
    }
  }

  closePOIOptionsDialog() {
    const existing = document.getElementById('poiOptionsModal');
    if (existing) {
      existing.remove();
    }
  }

  closeConfirmDialog() {
    const existing = document.getElementById('confirmModal');
    if (existing) {
      existing.remove();
    }
  }

  showConfirmDialog({
    title = 'Confirm',
    message = '',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'danger'
  } = {}) {
    this.closeConfirmDialog();

    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.id = 'confirmModal';
      overlay.className = 'mission-modal-overlay';

      const modal = document.createElement('div');
      modal.className = 'confirm-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');

      const header = document.createElement('div');
      header.className = 'confirm-modal-header';
      header.textContent = title;

      const body = document.createElement('div');
      body.className = 'confirm-modal-body';
      body.textContent = message;

      const footer = document.createElement('div');
      footer.className = 'confirm-modal-footer';

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'ghost';
      cancelButton.textContent = cancelLabel;

      const confirmButton = document.createElement('button');
      confirmButton.type = 'button';
      confirmButton.className = tone === 'danger' ? 'danger' : 'accent2';
      confirmButton.textContent = confirmLabel;

      const finish = result => {
        document.removeEventListener('keydown', onKeyDown, true);
        overlay.remove();
        resolve(result);
      };

      const onKeyDown = event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          finish(true);
        }
      };

      cancelButton.addEventListener('click', () => finish(false));
      confirmButton.addEventListener('click', () => finish(true));

      overlay.addEventListener('click', event => {
        if (event.target === overlay) {
          finish(false);
        }
      });

      footer.appendChild(cancelButton);
      footer.appendChild(confirmButton);

      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      document.addEventListener('keydown', onKeyDown, true);
      cancelButton.focus();
    });
  }

  closeBulkWaypointActionDialog() {
    const existing = document.getElementById('bulkWaypointActionModal');
    if (existing) {
      existing.remove();
    }
  }

  showBulkWaypointActionDialog({ selectedCount, pois = [] }) {
    this.closeBulkWaypointActionDialog();

    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.id = 'bulkWaypointActionModal';
      overlay.className = 'mission-modal-overlay';

      const modal = document.createElement('div');
      modal.className = 'confirm-modal bulk-waypoint-modal';

      const header = document.createElement('div');
      header.className = 'confirm-modal-header';
      header.textContent = `Bulk Waypoint Settings (${selectedCount})`;

      const body = document.createElement('div');
      body.className = 'confirm-modal-body';
      body.innerHTML = `
        <div class="field-row" style="margin-bottom:8px;">
          <label>Altitude</label>
          <input id="bulkDlgAlt" type="number" min="1" max="500" step="1" placeholder="Leave blank" />
          <span class="unit">m</span>
        </div>
        <div class="field-row" style="margin-bottom:8px;">
          <label>Speed</label>
          <input id="bulkDlgSpeed" type="number" min="4" max="54" step="1" placeholder="Leave blank" />
          <span class="unit">km/h</span>
        </div>
        <div class="field-row" style="margin-bottom:0;">
          <label>HAG</label>
          <input id="bulkDlgHag" type="number" min="1" max="500" step="1" placeholder="Leave blank" />
          <span class="unit">m</span>
        </div>
      `;

      const poiRow = document.createElement('div');
      poiRow.className = 'field-row';
      poiRow.style.marginTop = '8px';
      poiRow.style.marginBottom = '0';

      const poiLabel = document.createElement('label');
      poiLabel.textContent = 'POI';

      const poiSelect = document.createElement('select');
      poiSelect.id = 'bulkDlgPoi';

      const keepOption = document.createElement('option');
      keepOption.value = '__KEEP__';
      keepOption.textContent = 'Keep Existing';
      poiSelect.appendChild(keepOption);

      const noneOption = document.createElement('option');
      noneOption.value = '__NONE__';
      noneOption.textContent = 'None';
      poiSelect.appendChild(noneOption);

      pois.forEach(poi => {
        if (!poi || !poi.id) {
          return;
        }
        const option = document.createElement('option');
        option.value = poi.id;
        option.textContent = poi.name || poi.id;
        poiSelect.appendChild(option);
      });

      const poiUnit = document.createElement('span');
      poiUnit.className = 'unit';
      poiUnit.textContent = '';

      poiRow.appendChild(poiLabel);
      poiRow.appendChild(poiSelect);
      poiRow.appendChild(poiUnit);
      body.appendChild(poiRow);

      const footer = document.createElement('div');
      footer.className = 'confirm-modal-footer';

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'ghost';
      cancelButton.textContent = 'Cancel';

      const applyButton = document.createElement('button');
      applyButton.type = 'button';
      applyButton.className = 'accent2';
      applyButton.textContent = 'Apply';

      const applyAllButton = document.createElement('button');
      applyAllButton.type = 'button';
      applyAllButton.className = 'ghost';
      applyAllButton.textContent = 'Apply all';

      const finish = result => {
        overlay.remove();
        resolve(result);
      };

      const getValues = (applyAll = false) => ({
        altitudeValue: body.querySelector('#bulkDlgAlt').value,
        speedValue: body.querySelector('#bulkDlgSpeed').value,
        hagValue: body.querySelector('#bulkDlgHag').value,
        poiValue: body.querySelector('#bulkDlgPoi').value,
        applyAll
      });

      cancelButton.addEventListener('click', () => finish(null));
      applyButton.addEventListener('click', () => finish(getValues(false)));
      applyAllButton.addEventListener('click', () => finish(getValues(true)));

      overlay.addEventListener('click', event => {
        if (event.target === overlay) {
          finish(null);
        }
      });

      footer.appendChild(cancelButton);
      footer.appendChild(applyAllButton);
      footer.appendChild(applyButton);
      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    });
  }

  showPOIOptionsDialog({
    poiLabel,
    positionText,
    initialName,
    initialAltitude,
    initialHeightAboveGround,
    initialPosition,
    onClose,
    onDelete,
    onPrevious,
    onNext,
    onNameChange,
    onAltitudeChange
  }) {
    this.closePOIOptionsDialog();

    const overlay = document.createElement('div');
    overlay.id = 'poiOptionsModal';
    overlay.className = 'wp-options-overlay';

    const modal = document.createElement('div');
    modal.className = 'wp-options-modal poi-options-modal';

    const header = document.createElement('div');
    header.className = 'wp-options-header';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'wp-options-delete';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => onDelete());

    const doneButton = document.createElement('button');
    doneButton.type = 'button';
    doneButton.className = 'wp-options-done';
    doneButton.textContent = 'Done';
    doneButton.addEventListener('click', () => onClose());

    header.appendChild(deleteButton);
    header.appendChild(doneButton);

    const body = document.createElement('div');
    body.className = 'wp-options-body';
    body.innerHTML = `
      <div class="wp-options-position">${positionText}</div>
      <div class="wp-options-title">POI ${poiLabel}</div>
      <div class="wp-options-section">Height</div>
    `;

    const hasInitialHag = Number.isFinite(initialHeightAboveGround);
    // hagOffset = takeoffGround + takeoffElevation - poiGround (constant for this dialog opening)
    const hagOffset = hasInitialHag ? (initialHeightAboveGround - initialAltitude) : null;
    const altToHag = alt => Number.isFinite(hagOffset) ? alt + hagOffset : null;
    const hagToAlt = hag => Number.isFinite(hagOffset) ? hag - hagOffset : null;

    // Altitude row — always shown
    const altitudeEditRow = document.createElement('div');
    altitudeEditRow.className = 'wp-options-edit-row';
    altitudeEditRow.innerHTML = `
      <label>Altitude</label>
      <input type="number" min="-500" max="500" step="1" value="${Math.max(-500, Math.min(500, Math.round(initialAltitude)))}" />
      <span>m</span>
    `;
    const altitudeInput = altitudeEditRow.querySelector('input');
    body.appendChild(altitudeEditRow);

    // HAG row — shown disabled when no elevation data available
    const hagEditRow = document.createElement('div');
    hagEditRow.className = 'wp-options-edit-row';
    const initialHagDisplay = hasInitialHag ? Math.round(initialHeightAboveGround) : '';
    hagEditRow.innerHTML = `
      <label>HAG</label>
      <input type="number" min="-500" max="500" step="1"
        value="${initialHagDisplay}"
        ${hasInitialHag ? '' : 'disabled placeholder="No data"'} />
      <span>m</span>
    `;
    const hagInput = hagEditRow.querySelector('input');
    body.appendChild(hagEditRow);

    const altitudeBlock = document.createElement('div');
    altitudeBlock.className = 'wp-options-altitude-block';

    const valueRow = document.createElement('div');
    valueRow.className = 'wp-options-altitude-values';

    const formatAltitudeLabel = altitudeMeters => {
      if (!Number.isFinite(altitudeMeters)) {
        return '0 m';
      }
      return `${Math.round(altitudeMeters)} m`;
    };

    valueRow.innerHTML = `
      <span>-500 m</span>
      <strong id="poiOptionsAltitudeValue">${formatAltitudeLabel(initialAltitude)}</strong>
      <span>500 m</span>
    `;

    const controls = document.createElement('div');
    controls.className = 'wp-options-altitude-controls';

    const minusButton = document.createElement('button');
    minusButton.type = 'button';
    minusButton.className = 'wp-options-step';
    minusButton.textContent = '−';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '-500';
    slider.max = '500';
    slider.step = '1';
    slider.value = String(Math.max(-500, Math.min(500, Math.round(initialAltitude))));

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
    plusButton.className = 'wp-options-step';
    plusButton.textContent = '+';

    // Apply an altitude value: updates slider, altitude input, HAG input, and fires callback.
    const applyAlt = alt => {
      const clamped = Math.max(-500, Math.min(500, Math.round(alt)));
      slider.value = String(clamped);
      if (document.activeElement !== altitudeInput) {
        altitudeInput.value = String(clamped);
      }
      const valueLabel = valueRow.querySelector('#poiOptionsAltitudeValue');
      if (valueLabel) {
        valueLabel.textContent = formatAltitudeLabel(clamped);
      }
      if (Number.isFinite(hagOffset) && document.activeElement !== hagInput) {
        const hag = altToHag(clamped);
        hagInput.value = Number.isFinite(hag) ? String(Math.round(hag)) : '';
      }
      onAltitudeChange(clamped);
    };

    // Apply a HAG value: converts to altitude then delegates to applyAlt.
    const applyHag = hag => {
      const alt = hagToAlt(hag);
      if (!Number.isFinite(alt)) return;
      applyAlt(alt);
      if (document.activeElement !== hagInput) {
        hagInput.value = String(Math.round(hag));
      }
    };

    slider.addEventListener('input', () => applyAlt(parseFloat(slider.value)));
    minusButton.addEventListener('click', () => applyAlt(parseFloat(slider.value) - 1));
    plusButton.addEventListener('click', () => applyAlt(parseFloat(slider.value) + 1));

    altitudeInput.addEventListener('input', () => {
      const v = parseFloat(altitudeInput.value);
      if (Number.isFinite(v)) applyAlt(v);
    });
    altitudeInput.addEventListener('blur', () => {
      const v = parseFloat(altitudeInput.value);
      applyAlt(Number.isFinite(v) ? v : parseFloat(slider.value));
      altitudeInput.value = slider.value;
    });

    hagInput.addEventListener('input', () => {
      const v = parseFloat(hagInput.value);
      if (Number.isFinite(v)) applyHag(v);
    });
    hagInput.addEventListener('blur', () => {
      const v = parseFloat(hagInput.value);
      if (Number.isFinite(v)) {
        applyHag(v);
        hagInput.value = String(Math.round(v));
      }
    });

    controls.appendChild(minusButton);
    controls.appendChild(slider);
    controls.appendChild(plusButton);

    altitudeBlock.appendChild(valueRow);
    altitudeBlock.appendChild(controls);
    body.appendChild(altitudeBlock);

    const nameRow = document.createElement('div');
    nameRow.className = 'wp-options-edit-row';
    nameRow.innerHTML = `
      <label>Name</label>
      <input type="text" value="${initialName || ''}" />
      <span></span>
    `;
    const nameInput = nameRow.querySelector('input');
    nameInput.addEventListener('input', () => onNameChange(nameInput.value));
    body.appendChild(nameRow);

    const footer = document.createElement('div');
    footer.className = 'wp-options-footer';

    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.className = 'wp-options-nav';
    prevButton.textContent = 'Previous';
    prevButton.addEventListener('click', () => onPrevious());

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'wp-options-nav';
    nextButton.textContent = 'Next';
    nextButton.addEventListener('click', () => onNext());

    footer.appendChild(prevButton);
    footer.appendChild(nextButton);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const dragPadding = 10;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const positionModalWithinViewport = (desiredLeft, desiredTop) => {
      const rect = modal.getBoundingClientRect();
      const maxLeft = Math.max(dragPadding, window.innerWidth - rect.width - dragPadding);
      const maxTop = Math.max(dragPadding, window.innerHeight - rect.height - dragPadding);
      modal.style.left = `${clamp(desiredLeft, dragPadding, maxLeft)}px`;
      modal.style.top = `${clamp(desiredTop, dragPadding, maxTop)}px`;
    };

    const initialRect = modal.getBoundingClientRect();
    const desiredInitialLeft = initialPosition && Number.isFinite(initialPosition.left)
      ? initialPosition.left
      : initialRect.left;
    const desiredInitialTop = initialPosition && Number.isFinite(initialPosition.top)
      ? initialPosition.top
      : initialRect.top;
    modal.style.position = 'fixed';
    modal.style.margin = '0';
    modal.style.left = `${desiredInitialLeft}px`;
    modal.style.top = `${desiredInitialTop}px`;
    positionModalWithinViewport(desiredInitialLeft, desiredInitialTop);

    let dragState = null;

    const stopDragging = event => {
      if (!dragState) {
        return;
      }
      if (event && typeof dragState.pointerId === 'number' && header.hasPointerCapture(dragState.pointerId)) {
        header.releasePointerCapture(dragState.pointerId);
      }
      dragState = null;
      header.classList.remove('is-dragging');
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', stopDragging, true);
      document.removeEventListener('pointercancel', stopDragging, true);
    };

    const onPointerMove = event => {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }
      const nextLeft = event.clientX - dragState.offsetX;
      const nextTop = event.clientY - dragState.offsetY;
      positionModalWithinViewport(nextLeft, nextTop);
    };

    header.addEventListener('pointerdown', event => {
      if (event.button !== 0) {
        return;
      }
      if (event.target.closest('button, input, select, textarea, a, label')) {
        return;
      }

      const rect = modal.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };

      header.classList.add('is-dragging');
      header.setPointerCapture(event.pointerId);
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', stopDragging, true);
      document.addEventListener('pointercancel', stopDragging, true);
      event.preventDefault();
    });

    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        stopDragging();
        onClose();
      }
    });
  }

  showWaypointOptionsDialog({
    waypointLabel,
    positionText,
    initialAltitude,
    initialHeightAboveGround,
    initialSpeed,
    currentPoiId,
    pois,
    actions = [],
    initialPosition,
    onClose,
    onDelete,
    onPrevious,
    onNext,
    onAltitudeChange,
    onSpeedChange,
    onPoiChange,
    onAddAction,
    onDeleteAction,
    onMoveActionUp,
    onMoveActionDown,
  }) {
    this.closeWaypointOptionsDialog();

    const overlay = document.createElement('div');
    overlay.id = 'waypointOptionsModal';
    overlay.className = 'wp-options-overlay';

    const modal = document.createElement('div');
    modal.className = 'wp-options-modal';

    const header = document.createElement('div');
    header.className = 'wp-options-header';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'wp-options-delete';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => onDelete());

    const doneButton = document.createElement('button');
    doneButton.type = 'button';
    doneButton.className = 'wp-options-done';
    doneButton.textContent = 'Done';
    doneButton.addEventListener('click', () => onClose());

    header.appendChild(deleteButton);
    header.appendChild(doneButton);

    const body = document.createElement('div');
    body.className = 'wp-options-body';
    body.innerHTML = `
      <div class="wp-options-title">${waypointLabel}</div>
      <div class="wp-options-position">${positionText}</div>
    `;

    const hasInitialHag = Number.isFinite(initialHeightAboveGround);
    // hagOffset = takeoffGround + takeoffElevation - waypointGround (constant for this waypoint opening)
    const hagOffset = hasInitialHag ? (initialHeightAboveGround - initialAltitude) : null;
    const altToHag = alt => Number.isFinite(hagOffset) ? alt + hagOffset : null;
    const hagToAlt = hag => Number.isFinite(hagOffset) ? hag - hagOffset : null;

    // Altitude row — always shown, always the value sent to the drone
    const altitudeEditRow = document.createElement('div');
    altitudeEditRow.className = 'wp-options-edit-row';
    altitudeEditRow.innerHTML = `
      <label>Altitude</label>
      <input type="number" min="-59" max="499" step="1" value="${Math.max(-59, Math.min(499, Math.round(initialAltitude)))}" />
      <span>m</span>
    `;
    const altitudeInput = altitudeEditRow.querySelector('input');
    body.appendChild(altitudeEditRow);

    // HAG row — always shown; editable when elevation data is available
    const hagEditRow = document.createElement('div');
    hagEditRow.className = 'wp-options-edit-row';
    const initialHagDisplay = hasInitialHag ? Math.round(initialHeightAboveGround) : '';
    hagEditRow.innerHTML = `
      <label>HAG</label>
      <input type="number" min="1" max="500" step="1"
        value="${initialHagDisplay}"
        ${hasInitialHag ? '' : 'disabled placeholder="No data"'} />
      <span>m</span>
    `;
    const hagInput = hagEditRow.querySelector('input');
    body.appendChild(hagEditRow);

    const altitudeBlock = document.createElement('div');
    altitudeBlock.className = 'wp-options-altitude-block';

    const valueRow = document.createElement('div');
    valueRow.className = 'wp-options-altitude-values';
    valueRow.innerHTML = `
      <span>-59 m</span>
      <strong id="wpOptionsAltitudeValue">${Math.max(-59, Math.min(499, Math.round(initialAltitude)))} m</strong>
      <span>499 m</span>
    `;

    const controls = document.createElement('div');
    controls.className = 'wp-options-altitude-controls';

    const minusButton = document.createElement('button');
    minusButton.type = 'button';
    minusButton.className = 'wp-options-step';
    minusButton.textContent = '\u2212';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '-59';
    slider.max = '499';
    slider.step = '1';
    slider.value = String(Math.max(-59, Math.min(499, Math.round(initialAltitude))));

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
    plusButton.className = 'wp-options-step';
    plusButton.textContent = '+';

    // Apply an altitude value: updates slider, altitude input, HAG input, and fires callback.
    const applyAlt = alt => {
      const clamped = Math.max(-59, Math.min(499, Math.round(alt)));
      slider.value = String(clamped);
      if (document.activeElement !== altitudeInput) {
        altitudeInput.value = String(clamped);
      }
      const lbl = valueRow.querySelector('#wpOptionsAltitudeValue');
      if (lbl) lbl.textContent = `${clamped} m`;
      if (Number.isFinite(hagOffset) && document.activeElement !== hagInput) {
        const hag = altToHag(clamped);
        hagInput.value = Number.isFinite(hag) ? String(Math.round(hag)) : '';
      }
      onAltitudeChange(clamped);
    };

    // Apply a HAG value: converts to altitude then delegates to applyAlt.
    const applyHag = hag => {
      const alt = hagToAlt(hag);
      if (!Number.isFinite(alt)) return;
      applyAlt(alt);
      if (document.activeElement !== hagInput) {
        hagInput.value = String(Math.round(hag));
      }
    };

    slider.addEventListener('input', () => applyAlt(parseFloat(slider.value)));
    minusButton.addEventListener('click', () => applyAlt(parseFloat(slider.value) - 1));
    plusButton.addEventListener('click', () => applyAlt(parseFloat(slider.value) + 1));

    altitudeInput.addEventListener('input', () => {
      const v = parseFloat(altitudeInput.value);
      if (Number.isFinite(v)) applyAlt(v);
    });
    altitudeInput.addEventListener('blur', () => {
      const v = parseFloat(altitudeInput.value);
      applyAlt(Number.isFinite(v) ? v : parseFloat(slider.value));
      altitudeInput.value = slider.value;
    });

    hagInput.addEventListener('input', () => {
      const v = parseFloat(hagInput.value);
      if (Number.isFinite(v)) applyHag(v);
    });
    hagInput.addEventListener('blur', () => {
      const v = parseFloat(hagInput.value);
      if (Number.isFinite(v)) {
        applyHag(v);
        hagInput.value = String(Math.round(v));
      }
    });

    controls.appendChild(minusButton);
    controls.appendChild(slider);
    controls.appendChild(plusButton);

    altitudeBlock.appendChild(valueRow);
    altitudeBlock.appendChild(controls);
    body.appendChild(altitudeBlock);

    const speedRow = document.createElement('div');
    speedRow.className = 'wp-options-edit-row';
    speedRow.innerHTML = `
      <label>Speed</label>
      <input type="number" min="4" max="54" step="1" value="${Number.isFinite(initialSpeed) ? Math.round(initialSpeed * 3.6) : 29}" />
      <span>km/h</span>
    `;
    const speedInput = speedRow.querySelector('input');
    speedInput.addEventListener('input', () => {
      const speedKmh = parseFloat(speedInput.value);
      if (!Number.isFinite(speedKmh)) {
        return;
      }
      onSpeedChange(speedKmh);
    });
    speedInput.addEventListener('blur', () => {
      const speedKmh = parseFloat(speedInput.value);
      if (!Number.isFinite(speedKmh)) {
        return;
      }
      const rounded = Math.round(speedKmh);
      const clamped = Math.max(4, Math.min(54, rounded));
      speedInput.value = String(clamped);
      onSpeedChange(clamped);
    });
    body.appendChild(speedRow);

    const poiRow = document.createElement('div');
    poiRow.className = 'wp-options-edit-row';
    const poiOptions = [
      '<option value="">- None -</option>',
      ...(Array.isArray(pois) ? pois.map((poi, index) => {
        const displayName = Mission.formatPoiDisplayName(poi.name, index + 1);
        return `<option value="${poi.id}" ${currentPoiId === poi.id ? 'selected' : ''}>${displayName}</option>`;
      }) : [])
    ].join('');
    poiRow.innerHTML = `
      <label>Point of Interest</label>
      <select>${poiOptions}</select>
    `;
    const poiSelect = poiRow.querySelector('select');
    poiSelect.addEventListener('change', () => onPoiChange(poiSelect.value));
    body.appendChild(poiRow);

    const footer = document.createElement('div');
    footer.className = 'wp-options-footer';

    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.className = 'wp-options-nav';
    prevButton.textContent = 'Previous';
    prevButton.addEventListener('click', () => onPrevious());

    const actionsButton = document.createElement('button');
    actionsButton.type = 'button';
    actionsButton.className = 'wp-options-nav wp-options-actions-btn';
    actionsButton.textContent = `Actions${actions.length ? ' (' + actions.length + ')' : ''}`;

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'wp-options-nav';
    nextButton.textContent = 'Next';
    nextButton.addEventListener('click', () => onNext());

    footer.appendChild(prevButton);
    footer.appendChild(actionsButton);
    footer.appendChild(nextButton);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    // ── Action side panels ────────────────────────────────────────────────────
    let actionListPanel = null;
    let actionEditPanel = null;
    let currentActions = Array.isArray(actions) ? [...actions] : [];

    const closeActionEditPanel = () => {
      if (actionEditPanel) { actionEditPanel.remove(); actionEditPanel = null; }
    };

    const closeActionListPanel = () => {
      closeActionEditPanel();
      if (actionListPanel) { actionListPanel.remove(); actionListPanel = null; }
      actionsButton.classList.remove('active');
    };

    const positionPanel = (panel, anchor) => {
      const rect = (anchor || modal).getBoundingClientRect();
      panel.style.position = 'fixed';
      panel.style.top = `${Math.max(10, rect.top)}px`;
      panel.style.left = `${rect.right + 8}px`;
    };

    const refreshActionListPanel = () => {
      if (!actionListPanel) return;
      const listEl = actionListPanel.querySelector('.wpa-list');
      if (!listEl) return;
      listEl.innerHTML = '';
      if (currentActions.length === 0) {
        listEl.innerHTML = '<div class="wpa-empty">No actions yet</div>';
      } else {
        currentActions.forEach(action => {
          const m = ACTION_META[action.type];
          const icon = m ? m.icon : '?';
          const label = m ? m.label : action.type;
          const summ = _actionSummary(action);
          const row = document.createElement('div');
          row.className = 'wpa-row';
          row.innerHTML = `
            <span class="wpa-icon">${icon}</span>
            <span class="wpa-label">${label}${summ ? ' · ' + summ : ''}</span>
            <button class="wpa-up" title="Move up">↑</button>
            <button class="wpa-dn" title="Move down">↓</button>
            <button class="wpa-del" title="Delete">✕</button>`;
          row.querySelector('.wpa-up').addEventListener('click', e => {
            e.stopPropagation();
            closeActionEditPanel();
            onMoveActionUp && onMoveActionUp(action.id);
          });
          row.querySelector('.wpa-dn').addEventListener('click', e => {
            e.stopPropagation();
            closeActionEditPanel();
            onMoveActionDown && onMoveActionDown(action.id);
          });
          row.querySelector('.wpa-del').addEventListener('click', e => {
            e.stopPropagation();
            closeActionEditPanel();
            onDeleteAction && onDeleteAction(action.id);
          });
          row.addEventListener('click', e => {
            if (e.target.closest('.wpa-up, .wpa-dn, .wpa-del')) return;
            openActionEditPanel(action);
          });
          listEl.appendChild(row);
        });
      }
      actionsButton.textContent = `Actions${currentActions.length ? ' (' + currentActions.length + ')' : ''}`;
    };

    const openActionEditPanel = (existingAction) => {
      closeActionEditPanel();
      const isNew = !existingAction;
      const types = Object.keys(ACTION_META);
      let selectedType = existingAction ? existingAction.type : types[0];
      let paramValues = existingAction ? { ...existingAction.params } : {};

      actionEditPanel = document.createElement('div');
      actionEditPanel.className = 'wpa-panel wpa-edit-panel';

      const buildParamHtml = () => {
        const meta = ACTION_META[selectedType];
        if (!meta) return '';
        const lines = [];
        if (meta.warning) lines.push(`<div class="wpa-warning">⚠ ${meta.warning}</div>`);
        meta.params.forEach(p => {
          const val = paramValues[p.key] !== undefined ? paramValues[p.key] : p.default;
          if (p.type === 'number') {
            lines.push(`<div class="wpa-param-row">
              <span class="wpa-param-label">${p.label}</span>
              <input class="wpa-param-input ap-field" type="number" data-key="${p.key}" min="${p.min}" max="${p.max}" value="${val}">
              <span class="wpa-param-unit">${p.unit || ''}</span>
            </div>`);
          } else if (p.type === 'text') {
            lines.push(`<div class="wpa-param-row">
              <span class="wpa-param-label">${p.label}</span>
              <input class="wpa-param-input ap-field" type="text" data-key="${p.key}" value="${this._escapeHtml(String(val))}">
            </div>`);
          } else if (p.type === 'select') {
            const opts = p.options.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`).join('');
            lines.push(`<div class="wpa-param-row">
              <span class="wpa-param-label">${p.label}</span>
              <select class="wpa-param-select ap-field" data-key="${p.key}">${opts}</select>
            </div>`);
          } else if (p.type === 'checkbox') {
            lines.push(`<div class="wpa-param-row">
              <span class="wpa-param-label">${p.label}</span>
              <input class="ap-field" type="checkbox" data-key="${p.key}" ${val ? 'checked' : ''}>
            </div>`);
          }
        });
        return lines.join('');
      };

      const readParams = () => {
        const result = {};
        actionEditPanel.querySelectorAll('.ap-field').forEach(f => {
          const key = f.dataset.key;
          if (f.type === 'checkbox') result[key] = f.checked;
          else if (f.type === 'number') result[key] = parseFloat(f.value);
          else result[key] = f.value;
        });
        return result;
      };

      const typeGrid = isNew ? types.map(t => {
        const m = ACTION_META[t];
        return `<button class="wpa-type-btn js-wpa-type ${t === selectedType ? 'active' : ''}" data-type="${t}">
          <span>${m.icon}</span><span class="wpa-type-label">${m.label}</span>
        </button>`;
      }).join('') : '';

      actionEditPanel.innerHTML = `
        <div class="wpa-panel-header">
          <span class="wpa-panel-title">${isNew ? 'Add Action' : 'Edit Action'}</span>
          <button class="wpa-close-btn" title="Close">✕</button>
        </div>
        ${isNew ? `<div class="wpa-type-grid">${typeGrid}</div>` : ''}
        <div class="wpa-params" id="wpaEditParams">${buildParamHtml()}</div>
        <div class="wpa-edit-footer">
          ${!isNew ? '<button class="wpa-del-btn">Delete</button>' : ''}
          <button class="wpa-confirm-btn">${isNew ? 'Add' : 'Done'}</button>
        </div>`;

      actionEditPanel.querySelector('.wpa-close-btn').addEventListener('click', closeActionEditPanel);

      if (isNew) {
        actionEditPanel.querySelectorAll('.js-wpa-type').forEach(btn => {
          btn.addEventListener('click', () => {
            paramValues = readParams();
            selectedType = btn.dataset.type;
            actionEditPanel.querySelectorAll('.js-wpa-type').forEach(b =>
              b.classList.toggle('active', b.dataset.type === selectedType));
            const p = actionEditPanel.querySelector('#wpaEditParams');
            if (p) p.innerHTML = buildParamHtml();
          });
        });
      } else {
        actionEditPanel.querySelector('.wpa-del-btn').addEventListener('click', () => {
          closeActionEditPanel();
          onDeleteAction && onDeleteAction(existingAction.id);
        });
      }

      actionEditPanel.querySelector('.wpa-confirm-btn').addEventListener('click', () => {
        const params = readParams();
        closeActionEditPanel();
        if (isNew) {
          onAddAction && onAddAction(selectedType, params);
        }
      });

      positionPanel(actionEditPanel, actionListPanel);
      overlay.appendChild(actionEditPanel);
    };

    const openActionListPanel = () => {
      if (actionListPanel) { closeActionListPanel(); return; }
      actionsButton.classList.add('active');
      actionListPanel = document.createElement('div');
      actionListPanel.className = 'wpa-panel wpa-list-panel';
      actionListPanel.innerHTML = `
        <div class="wpa-panel-header">
          <span class="wpa-panel-title">Actions</span>
          <button class="wpa-close-btn" title="Close">✕</button>
        </div>
        <div class="wpa-list"></div>
        <button class="wpa-add-btn">＋ Add Action</button>`;
      actionListPanel.querySelector('.wpa-close-btn').addEventListener('click', closeActionListPanel);
      actionListPanel.querySelector('.wpa-add-btn').addEventListener('click', () => {
        closeActionEditPanel();
        openActionEditPanel(null);
      });
      positionPanel(actionListPanel, modal);
      overlay.appendChild(actionListPanel);
      refreshActionListPanel();
    };

    actionsButton.addEventListener('click', openActionListPanel);

    // Expose refresh hook so App can push updated actions without reopening
    overlay._refreshActions = (updatedActions) => {
      currentActions = Array.isArray(updatedActions) ? [...updatedActions] : [];
      refreshActionListPanel();
    };

    document.body.appendChild(overlay);

    const dragPadding = 10;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const positionModalWithinViewport = (desiredLeft, desiredTop) => {
      const rect = modal.getBoundingClientRect();
      const maxLeft = Math.max(dragPadding, window.innerWidth - rect.width - dragPadding);
      const maxTop = Math.max(dragPadding, window.innerHeight - rect.height - dragPadding);
      modal.style.left = `${clamp(desiredLeft, dragPadding, maxLeft)}px`;
      modal.style.top = `${clamp(desiredTop, dragPadding, maxTop)}px`;
    };

    // Convert the centered flex modal into a movable fixed-position dialog.
    const initialRect = modal.getBoundingClientRect();
    const desiredInitialLeft = initialPosition && Number.isFinite(initialPosition.left)
      ? initialPosition.left
      : initialRect.left;
    const desiredInitialTop = initialPosition && Number.isFinite(initialPosition.top)
      ? initialPosition.top
      : initialRect.top;
    modal.style.position = 'fixed';
    modal.style.margin = '0';
    modal.style.left = `${desiredInitialLeft}px`;
    modal.style.top = `${desiredInitialTop}px`;
    positionModalWithinViewport(desiredInitialLeft, desiredInitialTop);

    let dragState = null;

    const stopDragging = event => {
      if (!dragState) {
        return;
      }
      if (event && typeof dragState.pointerId === 'number' && header.hasPointerCapture(dragState.pointerId)) {
        header.releasePointerCapture(dragState.pointerId);
      }
      dragState = null;
      header.classList.remove('is-dragging');
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', stopDragging, true);
      document.removeEventListener('pointercancel', stopDragging, true);
    };

    const onPointerMove = event => {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }
      const nextLeft = event.clientX - dragState.offsetX;
      const nextTop = event.clientY - dragState.offsetY;
      positionModalWithinViewport(nextLeft, nextTop);
    };

    header.addEventListener('pointerdown', event => {
      if (event.button !== 0) {
        return;
      }
      if (event.target.closest('button, input, select, textarea, a, label')) {
        return;
      }

      const rect = modal.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };

      header.classList.add('is-dragging');
      header.setPointerCapture(event.pointerId);
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', stopDragging, true);
      document.addEventListener('pointercancel', stopDragging, true);
      event.preventDefault();
    });

    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        stopDragging();
        onClose();
      }
    });
  }

  showMissionLoadDialog({ rootLabel, nodes, initialExpandedPath, onCancel, onSelectFile, onDeleteFile, onRefresh, onChooseFolder, onOpenFromFiles }) {
    this.closeMissionLoadDialog();
    const expandedSegments = typeof initialExpandedPath === 'string' && initialExpandedPath.trim()
      ? initialExpandedPath.split('/').filter(Boolean)
      : [];
    const expandedFolderKeys = new Set();
    const normalizedRootLabel = String(rootLabel || '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
    if (expandedSegments.length) {
      let folderPath = '';
      expandedSegments.forEach(segment => {
        folderPath = folderPath ? `${folderPath}/${segment}` : segment;
        expandedFolderKeys.add(folderPath);
        if (normalizedRootLabel) {
          expandedFolderKeys.add(`${normalizedRootLabel}/${folderPath}`);
        }
      });
    }

    let searchTerm = '';

    const countFiles = list => list.reduce((total, node) => {
      if (node.type === 'file') {
        return total + 1;
      }
      const children = Array.isArray(node.children) ? node.children : [];
      return total + countFiles(children);
    }, 0);

    const totalMissionCount = countFiles(nodes);

    const filterNodes = (list, term) => {
      const normalizedTerm = term.trim().toLowerCase();
      if (!normalizedTerm) {
        return list;
      }

      const filtered = [];
      list.forEach(node => {
        if (node.type === 'file') {
          if (node.name.toLowerCase().includes(normalizedTerm)) {
            filtered.push(node);
          }
          return;
        }

        const children = Array.isArray(node.children) ? node.children : [];
        const filteredChildren = filterNodes(children, normalizedTerm);
        const folderMatches = node.name.toLowerCase().includes(normalizedTerm);
        if (folderMatches || filteredChildren.length) {
          filtered.push({
            ...node,
            children: filteredChildren
          });
        }
      });
      return filtered;
    };

    const overlay = document.createElement('div');
    overlay.id = 'missionLoadModal';
    overlay.className = 'mission-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'mission-modal';

    const header = document.createElement('div');
    header.className = 'mission-modal-header';
    header.innerHTML = `<div class="mission-modal-title">Load Mission</div><div class="mission-modal-subtitle">${rootLabel}</div>`;

    const toolbar = document.createElement('div');
    toolbar.className = 'mission-modal-toolbar';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'mission-tree-search';
    searchInput.placeholder = 'Search missions or folders...';
    searchInput.setAttribute('aria-label', 'Search mission files and folders');

    const stats = document.createElement('div');
    stats.className = 'mission-tree-stats';

    const expandAllButton = document.createElement('button');
    expandAllButton.type = 'button';
    expandAllButton.className = 'ghost mission-tree-toolbar-btn';
    expandAllButton.textContent = 'Expand All';

    const collapseAllButton = document.createElement('button');
    collapseAllButton.type = 'button';
    collapseAllButton.className = 'ghost mission-tree-toolbar-btn';
    collapseAllButton.textContent = 'Collapse';

    toolbar.appendChild(searchInput);
    toolbar.appendChild(stats);
    toolbar.appendChild(expandAllButton);
    toolbar.appendChild(collapseAllButton);

    const treeWrap = document.createElement('div');
    treeWrap.className = 'mission-tree-wrap';

    const collectDirectoryKeys = (list, keys = []) => {
      list.forEach(node => {
        if (node.type !== 'directory') {
          return;
        }
        keys.push(node.path);
        if (Array.isArray(node.children) && node.children.length) {
          collectDirectoryKeys(node.children, keys);
        }
      });
      return keys;
    };

    const renderTree = () => {
      treeWrap.innerHTML = '';
      const filteredNodes = filterNodes(nodes, searchTerm);
      const visibleMissionCount = countFiles(filteredNodes);
      const isSearching = searchTerm.trim().length > 0;
      stats.textContent = isSearching
        ? `${visibleMissionCount} of ${totalMissionCount} missions`
        : `${totalMissionCount} missions`;

      if (!totalMissionCount) {
        const empty = document.createElement('div');
        empty.className = 'mission-tree-empty';
        empty.textContent = 'No mission JSON files found in this folder.';
        treeWrap.appendChild(empty);
        return;
      }

      if (!filteredNodes.length) {
        const empty = document.createElement('div');
        empty.className = 'mission-tree-empty';
        empty.textContent = 'No missions match your search.';
        treeWrap.appendChild(empty);
        return;
      }

      const rootList = document.createElement('ul');
      rootList.className = 'mission-tree';
      filteredNodes.forEach(node => rootList.appendChild(this.createMissionTreeNode(
        node,
        onSelectFile,
        onDeleteFile,
        expandedFolderKeys,
        searchTerm.trim().length > 0
      )));
      treeWrap.appendChild(rootList);
    };

    searchInput.addEventListener('input', () => {
      searchTerm = searchInput.value || '';
      renderTree();
    });

    expandAllButton.addEventListener('click', () => {
      collectDirectoryKeys(nodes).forEach(key => expandedFolderKeys.add(key));
      renderTree();
    });

    collapseAllButton.addEventListener('click', () => {
      expandedFolderKeys.clear();
      renderTree();
    });

    renderTree();

    const footer = document.createElement('div');
    footer.className = 'mission-modal-footer';

    const refreshButton = document.createElement('button');
    refreshButton.className = 'ghost';
    refreshButton.textContent = 'Refresh';
    refreshButton.addEventListener('click', () => onRefresh());

    const closeButton = document.createElement('button');
    closeButton.className = 'accent2';
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', () => onCancel());

    if (typeof onChooseFolder === 'function') {
      const changeFolderButton = document.createElement('button');
      changeFolderButton.className = 'ghost';
      changeFolderButton.textContent = 'Change Folder';
      changeFolderButton.addEventListener('click', () => onChooseFolder());
      footer.appendChild(changeFolderButton);
    }

    if (typeof onOpenFromFiles === 'function') {
      const fileInputBtn = document.createElement('button');
      fileInputBtn.className = 'ghost';
      fileInputBtn.textContent = 'Open from Files...';
      fileInputBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.style.display = 'none';
        input.addEventListener('change', () => {
          const file = input.files && input.files[0];
          if (file) {
            onOpenFromFiles(file);
          }
          input.remove();
        }, { once: true });
        document.body.appendChild(input);
        input.click();
      });
      footer.appendChild(fileInputBtn);
    }

    footer.appendChild(refreshButton);
    footer.appendChild(closeButton);

    modal.appendChild(header);
    modal.appendChild(toolbar);
    modal.appendChild(treeWrap);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        onCancel();
      }
    });
  }

  createMissionTreeNode(node, onSelectFile, onDeleteFile, expandedFolderKeys = new Set(), forceExpand = false) {
    const li = document.createElement('li');
    li.className = 'mission-tree-node';

    if (node.type === 'directory') {
      const directoryPath = node.path || node.name;
      const isExpanded = forceExpand || expandedFolderKeys.has(directoryPath);

      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'mission-tree-row mission-tree-folder';
      row.textContent = `${isExpanded ? '▾' : '▸'} ${node.name}`;

      const childList = document.createElement('ul');
      childList.className = 'mission-tree mission-tree-children';
      childList.style.display = isExpanded ? 'block' : 'none';
      node.children.forEach(child => childList.appendChild(this.createMissionTreeNode(
        child,
        onSelectFile,
        onDeleteFile,
        expandedFolderKeys,
        forceExpand
      )));

      row.addEventListener('click', () => {
        const expanded = childList.style.display !== 'none';
        childList.style.display = expanded ? 'none' : 'block';
        if (expanded) {
          expandedFolderKeys.delete(directoryPath);
        } else {
          expandedFolderKeys.add(directoryPath);
        }
        row.textContent = `${expanded ? '▸' : '▾'} ${node.name}`;
      });

      li.appendChild(row);
      li.appendChild(childList);
      return li;
    }

    const row = document.createElement('div');
    row.className = 'mission-tree-file-row';

    const fileButton = document.createElement('button');
    fileButton.type = 'button';
    fileButton.className = 'mission-tree-row mission-tree-file';
    fileButton.textContent = node.name;
    fileButton.title = node.path;
    fileButton.addEventListener('click', () => onSelectFile(node));
    row.appendChild(fileButton);

    if (typeof onDeleteFile === 'function') {
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'danger mission-tree-delete';
      deleteButton.textContent = 'Delete';
      deleteButton.title = `Delete ${node.path}`;
      deleteButton.addEventListener('click', event => {
        event.stopPropagation();
        onDeleteFile(node);
      });
      row.appendChild(deleteButton);
    }

    li.appendChild(row);
    return li;
  }

  setStatus(message) {
    this.sbStatus.textContent = message;
  }

  ensureToastContainer() {
    let container = document.getElementById('appToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'appToastContainer';
      container.className = 'app-toast-container';
      document.body.appendChild(container);
    }

    return container;
  }

  hideToast(toastOrId) {
    const toast = typeof toastOrId === 'string'
      ? document.getElementById(toastOrId)
      : toastOrId;
    if (!toast) {
      return;
    }

    toast.classList.remove('visible');
    window.setTimeout(() => {
      toast.remove();
    }, 180);
  }

  showToast(message, tone = 'success', options = {}) {
    const {
      duration = 2200,
      id = null,
      persistent = false,
      position = 'center'
    } = options;
    const container = this.ensureToastContainer();

    if (id) {
      const existing = document.getElementById(id);
      if (existing) {
        existing.remove();
      }
    }

    if (position === 'top') {
      container.classList.add('position-top');
      this._topToastCount = (this._topToastCount || 0) + 1;
    }

    const toast = document.createElement('div');
    toast.className = `app-toast ${tone}`;
    toast.textContent = message;
    if (id) {
      toast.id = id;
    }
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    const cleanup = () => {
      this.hideToast(toast);
      if (position === 'top') {
        this._topToastCount = Math.max(0, (this._topToastCount || 1) - 1);
        if (this._topToastCount === 0) {
          container.classList.remove('position-top');
        }
      }
    };

    if (!persistent && duration > 0) {
      window.setTimeout(cleanup, duration);
    }

    return toast;
  }

  setCursor(lat, lng) {
    this.sbCursor.textContent = `Lat: ${lat.toFixed(6)}  Lon: ${lng.toFixed(6)}`;
  }

  formatFlythroughTime(totalSeconds) {
    const safeTotal = Number.isFinite(totalSeconds) && totalSeconds > 0
      ? totalSeconds
      : 0;
    const minutes = Math.floor(safeTotal / 60);
    const seconds = Math.floor(safeTotal % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

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
  }

  setFlythroughStopped() {
    this.updateFlythroughProgress(0, 0, 0);
  }

  updateStats({ waypointCount, poiCount, distanceMeters }) {
    this.statWP.textContent = waypointCount;
    this.statPOI.textContent = poiCount;
    this.statDist.textContent = distanceMeters >= 1000
      ? (distanceMeters / 1000).toFixed(2) + ' km'
      : Math.round(distanceMeters) + ' m';
  }

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
  }

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
  }

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
  }

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
  }

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

  showMobileWaypointSheet({ wp, waypointIndex, pois, onAltChange, onSpeedChange, onPoiChange, onDelete }) {
    const body = this.mobileSheetBody;
    if (!body) {
      return;
    }

    body.innerHTML = '';
    body.appendChild(this._mbsHeader(`Waypoint ${waypointIndex}`, onDelete));

    body.appendChild(this._mbsNumberRow('Alt', wp.alt, 'm', 1, 500, value => {
      if (onAltChange) {
        onAltChange(value);
      }
    }));

    const speedKmh = Math.round((wp.speed || 0) * 3.6);
    body.appendChild(this._mbsNumberRow('Speed', speedKmh, 'km/h', 0, 54, value => {
      if (onSpeedChange) {
        onSpeedChange(value);
      }
    }));

    const poiRow = document.createElement('div');
    poiRow.className = 'mbs-row';
    const poiLabel = document.createElement('span');
    poiLabel.className = 'mbs-label';
    poiLabel.textContent = 'POI';
    const poiSelect = document.createElement('select');
    poiSelect.className = 'mbs-select';
    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = '— None —';
    poiSelect.appendChild(noneOption);
    pois.forEach(poi => {
      const option = document.createElement('option');
      option.value = poi.id;
      option.textContent = Mission.formatPoiDisplayName(poi.name);
      poiSelect.appendChild(option);
    });
    poiSelect.value = wp.poiId || '';
    poiSelect.addEventListener('change', () => {
      if (onPoiChange) {
        onPoiChange(poiSelect.value || null);
      }
    });

    poiRow.appendChild(poiLabel);
    poiRow.appendChild(poiSelect);
    body.appendChild(poiRow);

    this._openMobileSheet();
  }

  showMobilePOISheet({ poi, onNameChange, onAltChange, onDelete }) {
    const body = this.mobileSheetBody;
    if (!body) {
      return;
    }

    body.innerHTML = '';
    body.appendChild(this._mbsHeader(`POI ${Mission.formatPoiDisplayName(poi.name)}`, onDelete));

    const nameRow = document.createElement('div');
    nameRow.className = 'mbs-row';
    const nameLabel = document.createElement('span');
    nameLabel.className = 'mbs-label';
    nameLabel.textContent = 'Name';
    const nameInput = document.createElement('input');
    nameInput.className = 'mbs-input';
    nameInput.style.textAlign = 'left';
    nameInput.type = 'text';
    nameInput.value = poi.name;
    nameInput.addEventListener('blur', () => {
      if (onNameChange) {
        onNameChange(nameInput.value);
      }
    });
    nameRow.appendChild(nameLabel);
    nameRow.appendChild(nameInput);
    body.appendChild(nameRow);

    body.appendChild(this._mbsNumberRow('Alt', poi.alt, 'm', 0, 500, value => {
      if (onAltChange) {
        onAltChange(value);
      }
    }));

    this._openMobileSheet();
  }

  hideMobileSheet() {
    if (this.mobileSheet) {
      this.mobileSheet.classList.remove('open');
    }
    if (this.mobileSheetOvl) {
      this.mobileSheetOvl.classList.remove('open');
    }
  }

  toggleMobileMissionSettings() {
    document.body.classList.toggle('mobile-mission-open');
  }

  closeMobileMissionSettings() {
    document.body.classList.remove('mobile-mission-open');
  }

  // Compatibility wrappers for earlier mobile draft usage.
  showMobileDetailSheet() {
    this._openMobileSheet();
  }

  hideMobileDetailSheet() {
    this.hideMobileSheet();
  }

  _openMobileSheet() {
    if (this.mobileSheet) {
      this.mobileSheet.classList.add('open');
    }
    if (this.mobileSheetOvl) {
      this.mobileSheetOvl.classList.add('open');
    }
  }

  _mbsHeader(title, onDelete) {
    const header = document.createElement('div');
    header.className = 'mbs-hdr';

    const titleElement = document.createElement('span');
    titleElement.className = 'mbs-hdr-title';
    titleElement.textContent = title;

    const deleteButton = document.createElement('button');
    deleteButton.className = 'mbs-hdr-del';
    deleteButton.textContent = '🗑';
    deleteButton.addEventListener('click', () => {
      this.hideMobileSheet();
      if (onDelete) {
        onDelete();
      }
    });

    header.appendChild(titleElement);
    header.appendChild(deleteButton);
    return header;
  }

  _mbsNumberRow(label, value, unit, min, max, onChange) {
    const row = document.createElement('div');
    row.className = 'mbs-row';

    const labelElement = document.createElement('span');
    labelElement.className = 'mbs-label';
    labelElement.textContent = label;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'mbs-input';
    input.value = value;
    input.min = min;
    input.max = max;
    input.addEventListener('blur', () => {
      const parsed = parseFloat(input.value);
      if (Number.isFinite(parsed)) {
        onChange(parsed);
      }
    });

    const unitElement = document.createElement('span');
    unitElement.className = 'mbs-unit';
    unitElement.textContent = unit;

    row.appendChild(labelElement);
    row.appendChild(input);
    row.appendChild(unitElement);
    return row;
  }

  resolveDetailContainer(targetElement) {
    return targetElement || this.detailContent;
  }

  setEmptyStateVisible(visible) {
    this.emptyState.style.display = visible ? 'block' : 'none';
  }

  showNothingSelected(targetElement = null) {
    const detailTarget = this.resolveDetailContainer(targetElement);
    detailTarget.innerHTML = '<div id="detail-placeholder">Nothing selected</div>';
  }

  highlightSelectedItem(selectedId, selectedWaypointIds = new Set(), scrollTargetId = undefined) {
    document.querySelectorAll('.tree-wp-hdr').forEach(el => {
      const isMultiSelected = selectedWaypointIds.has(el.dataset.wpId);
      el.classList.toggle('selected', el.dataset.wpId === selectedId);
      el.classList.toggle('multi-selected', isMultiSelected);
    });

    const resolvedScrollTarget = scrollTargetId !== undefined
      ? scrollTargetId
      : (selectedId || [...selectedWaypointIds].at(-1) || null);
    if (this.selectedItemScrollFrame) {
      window.cancelAnimationFrame(this.selectedItemScrollFrame);
    }
    this.selectedItemScrollFrame = window.requestAnimationFrame(() => {
      this.selectedItemScrollFrame = null;
      this.scrollListItemIntoView(resolvedScrollTarget);
    });
  }

  scrollListItemIntoView(itemId) {
    if (!itemId || !this.wpList) {
      return;
    }

    const row = this.wpList.querySelector(`.tree-wp[data-wp-id="${itemId}"]`);
    if (!row) {
      return;
    }

    // Avoid scrollIntoView() — on iOS Safari it can scroll the layout viewport
    // even when the element is inside an overflow:auto container. Manually
    // scroll only within the waypoint list wrapper.
    const container = this.wpList.closest('#wp-list-wrap') || this.wpList.parentElement;
    if (!container) {
      return;
    }

    const rowRect = row.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const rowTop = rowRect.top - containerRect.top + container.scrollTop;
    const rowBottom = rowTop + rowRect.height;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;

    if (rowTop < containerTop) {
      container.scrollTop = rowTop;
    } else if (rowBottom > containerBottom) {
      container.scrollTop = rowBottom - container.clientHeight;
    }
  }

  renderList({
    waypoints = [],
    pois = [],
    selectedId = null,
    selectedType = null,
    selectedWaypointIds = new Set(),
    heightAboveGroundByWaypointId = null,
    heightAboveGroundByPoiId = null,
    onSelect,
    onDelete,
    onToggleWaypointMultiSelect,
    onAddAction,
    onDeleteAction,
    onMoveActionUp,
    onMoveActionDown,
  } = {}) {
    const list = document.getElementById('wp-list');
    const empty = document.getElementById('emptyState');
    if (!list) return;

    const hasItems = waypoints.length > 0 || pois.length > 0;
    if (empty) empty.style.display = hasItems ? 'none' : '';
    if (!hasItems) { list.innerHTML = ''; return; }

    const html = [];

    // ── Waypoints section ──────────────────────────────────────────
    html.push(`<div class="tree-section-hdr js-tree-sect" data-sect="wp">
      <span class="tree-arrow ${this._wpSectionOpen ? 'expanded' : ''}">▶</span>
      <span>Waypoints (${waypoints.length})</span>
    </div>`);

    html.push(`<div class="tree-section-body ${this._wpSectionOpen ? '' : 'collapsed'}" id="treeSectWp">`);

    waypoints.forEach((wp, idx) => {
      const wpIdx      = idx + 1;
      const isSelected = selectedId === wp.id && selectedType === 'wp';
      const isExpanded = this._expandedWpIds.has(wp.id);
      const hasActions = Array.isArray(wp.actions) && wp.actions.length > 0;
      const speedKmh   = Math.round((wp.speed || 0) * 3.6);
      const hag = heightAboveGroundByWaypointId instanceof Map
        ? heightAboveGroundByWaypointId.get(wp.id)
        : null;
      const assignedPoi = wp.poiId ? pois.find(p => p.id === wp.poiId) : null;
      const poiSuffix = assignedPoi
        ? ` · 🎯 ${this._escapeHtml(Mission.formatPoiDisplayName(assignedPoi.name, '?'))}`
        : '';
      const meta = hag != null
        ? `${wp.alt}m · HAG ${Math.round(hag)}m · ${speedKmh}km/h${poiSuffix}`
        : `${wp.alt}m · ${speedKmh}km/h${poiSuffix}`;

      html.push(`<div class="tree-wp" data-wp-id="${wp.id}">
        <div class="tree-wp-hdr ${isSelected ? 'selected' : ''}" data-wp-id="${wp.id}">
          <button class="tree-wp-expand js-wp-expand" data-wp-id="${wp.id}" title="${isExpanded ? 'Collapse' : 'Expand'}">
            ${hasActions || isExpanded ? (isExpanded ? '▼' : '▶') : '◦'}
          </button>
          <span class="tree-wp-label">WP ${wpIdx}</span>
          <span class="tree-wp-meta">${meta}</span>
          <button class="tree-wp-del js-wp-del" data-wp-id="${wp.id}" title="Delete waypoint">✕</button>
        </div>
        <div class="tree-actions ${isExpanded ? 'open' : ''}" id="wpActions_${wp.id}">`);

      if (isExpanded) {
        const actions = Array.isArray(wp.actions) ? wp.actions : [];
        actions.forEach(action => {
          const m    = ACTION_META[action.type];
          const icon = m ? m.icon  : '?';
          const lbl  = m ? m.label : action.type;
          const summ = _actionSummary(action);
          html.push(`<div class="tree-action-row" data-action-id="${action.id}" data-wp-id="${wp.id}">
            <span class="tree-action-icon">${icon}</span>
            <span class="tree-action-label">${lbl}${summ ? ' · ' + summ : ''}</span>
            <button class="tree-action-up js-act-up" data-wp-id="${wp.id}" data-action-id="${action.id}" title="Move up">↑</button>
            <button class="tree-action-dn js-act-dn" data-wp-id="${wp.id}" data-action-id="${action.id}" title="Move down">↓</button>
            <button class="tree-action-del js-act-del" data-wp-id="${wp.id}" data-action-id="${action.id}" title="Delete action">✕</button>
          </div>`);
        });
        html.push(`<button class="tree-add-action js-add-action" data-wp-id="${wp.id}">＋ Add Action</button>`);
      }

      html.push(`</div></div>`); // close tree-actions + tree-wp
    });

    html.push(`</div>`); // close treeSectWp

    // ── POIs section ───────────────────────────────────────────────
    if (pois.length > 0) {
      html.push(`<div class="tree-section-hdr js-tree-sect" data-sect="poi">
        <span class="tree-arrow ${this._poiSectionOpen ? 'expanded' : ''}">▶</span>
        <span>POIs (${pois.length})</span>
      </div>`);
      html.push(`<div class="tree-section-body ${this._poiSectionOpen ? '' : 'collapsed'}" id="treeSectPoi">`);

      pois.forEach(poi => {
        const isSelected = selectedId === poi.id && selectedType === 'poi';
        const hag = heightAboveGroundByPoiId instanceof Map
          ? heightAboveGroundByPoiId.get(poi.id)
          : null;
        const meta = hag != null ? `HAG ${Math.round(hag)}m` : `${poi.alt}m`;
        html.push(`<div class="tree-poi ${isSelected ? 'selected' : ''}" data-poi-id="${poi.id}">
          <span class="tree-poi-dot">🎯</span>
          <span class="tree-poi-label">${this._escapeHtml(Mission.formatPoiDisplayName(poi.name))}</span>
          <span class="tree-poi-meta">${meta}</span>
          <button class="tree-poi-del js-poi-del" data-poi-id="${poi.id}" title="Delete POI">✕</button>
        </div>`);
      });

      html.push(`</div>`); // close treeSectPoi
    }

    list.innerHTML = html.join('');

    // ── Wire events ────────────────────────────────────────────────
    list.querySelectorAll('.js-tree-sect').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const sect = hdr.dataset.sect;
        if (sect === 'wp') {
          this._wpSectionOpen = !this._wpSectionOpen;
          hdr.querySelector('.tree-arrow').classList.toggle('expanded', this._wpSectionOpen);
          const body = document.getElementById('treeSectWp');
          if (body) body.classList.toggle('collapsed', !this._wpSectionOpen);
        } else {
          this._poiSectionOpen = !this._poiSectionOpen;
          hdr.querySelector('.tree-arrow').classList.toggle('expanded', this._poiSectionOpen);
          const body = document.getElementById('treeSectPoi');
          if (body) body.classList.toggle('collapsed', !this._poiSectionOpen);
        }
      });
    });

    list.querySelectorAll('.js-wp-expand').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const wpId = btn.dataset.wpId;
        if (this._expandedWpIds.has(wpId)) this._expandedWpIds.delete(wpId);
        else this._expandedWpIds.add(wpId);
        btn.dispatchEvent(new CustomEvent('tree-expand', { bubbles: true, detail: { wpId } }));
      });
    });

    list.querySelectorAll('.tree-wp-hdr').forEach(hdr => {
      hdr.addEventListener('click', e => {
        if (e.target.closest('.tree-wp-expand, .tree-wp-del')) return;
        const wpId = hdr.dataset.wpId;
        const isCtrlCmd = e.ctrlKey || e.metaKey;
        if (isCtrlCmd && onToggleWaypointMultiSelect) {
          const isAlreadySelected = hdr.classList.contains('multi-selected') || hdr.classList.contains('selected');
          onToggleWaypointMultiSelect(wpId, !isAlreadySelected, {});
        } else if (e.shiftKey) {
          onSelect && onSelect(wpId, 'wp', { shiftKey: true });
        } else {
          onSelect && onSelect(wpId, 'wp');
        }
      });
    });

    list.querySelectorAll('.js-wp-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        onDelete && onDelete(btn.dataset.wpId, 'wp');
      });
    });

    list.querySelectorAll('.tree-poi').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.tree-poi-del')) return;
        onSelect && onSelect(row.dataset.poiId, 'poi');
      });
    });

    list.querySelectorAll('.js-poi-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        onDelete && onDelete(btn.dataset.poiId, 'poi');
      });
    });

    list.querySelectorAll('.js-act-up').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        onMoveActionUp && onMoveActionUp(btn.dataset.wpId, btn.dataset.actionId);
      });
    });

    list.querySelectorAll('.js-act-dn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        onMoveActionDown && onMoveActionDown(btn.dataset.wpId, btn.dataset.actionId);
      });
    });

    list.querySelectorAll('.js-act-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        onDeleteAction && onDeleteAction(btn.dataset.wpId, btn.dataset.actionId);
      });
    });

    list.querySelectorAll('.js-add-action').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const wpId = btn.dataset.wpId;
        this.showActionPickerDialog((type, params) => {
          onAddAction && onAddAction(wpId, type, params);
        });
      });
    });
  }

  showActionPickerDialog(onConfirm) {
    const types = Object.keys(ACTION_META);
    let selectedType = types[0];
    let paramValues = {};

    const buildParamSection = () => {
      const meta = ACTION_META[selectedType];
      if (!meta) return '';
      const lines = [];
      if (meta.warning) {
        lines.push(`<div class="action-warning">⚠ ${meta.warning}</div>`);
      }
      meta.params.forEach(p => {
        const val = paramValues[p.key] !== undefined ? paramValues[p.key] : p.default;
        if (p.type === 'number') {
          lines.push(`<div class="action-param-row">
            <span class="action-param-label">${p.label}</span>
            <input class="action-param-input ap-field" type="number"
              data-key="${p.key}" min="${p.min}" max="${p.max}" value="${val}">
            <span class="action-param-unit">${p.unit || ''}</span>
          </div>`);
        } else if (p.type === 'text') {
          lines.push(`<div class="action-param-row">
            <span class="action-param-label">${p.label}</span>
            <input class="action-param-input ap-field" type="text"
              data-key="${p.key}" value="${this._escapeHtml(String(val))}">
          </div>`);
        } else if (p.type === 'select') {
          const opts = p.options.map(([v, l]) =>
            `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`
          ).join('');
          lines.push(`<div class="action-param-row">
            <span class="action-param-label">${p.label}</span>
            <select class="action-param-select ap-field" data-key="${p.key}">${opts}</select>
          </div>`);
        } else if (p.type === 'checkbox') {
          lines.push(`<div class="action-param-row">
            <span class="action-param-label">${p.label}</span>
            <input class="ap-field" type="checkbox" data-key="${p.key}" ${val ? 'checked' : ''}>
          </div>`);
        }
      });
      return lines.join('');
    };

    const typeGrid = types.map(t => {
      const m = ACTION_META[t];
      return `<button class="action-type-btn js-atype ${t === selectedType ? 'active' : ''}"
        data-type="${t}">
        <span class="action-type-icon">${m.icon}</span>
        <span class="action-type-label">${m.label}</span>
      </button>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.className = 'action-picker-overlay';
    overlay.innerHTML = `
      <div class="action-picker">
        <div class="action-picker-title">Add Action</div>
        <div class="action-type-grid">${typeGrid}</div>
        <div class="action-params" id="apParams">${buildParamSection()}</div>
        <div class="action-picker-footer">
          <button class="ghost" id="apCancel">Cancel</button>
          <button class="primary" id="apConfirm">Add</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const readParams = () => {
      const result = {};
      overlay.querySelectorAll('.ap-field').forEach(f => {
        const key = f.dataset.key;
        if (f.type === 'checkbox') result[key] = f.checked;
        else if (f.type === 'number') result[key] = parseFloat(f.value);
        else result[key] = f.value;
      });
      return result;
    };

    overlay.addEventListener('click', e => {
      const btn = e.target.closest('.js-atype');
      if (btn) {
        paramValues = readParams();
        selectedType = btn.dataset.type;
        overlay.querySelectorAll('.js-atype').forEach(b =>
          b.classList.toggle('active', b.dataset.type === selectedType));
        const p = document.getElementById('apParams');
        if (p) p.innerHTML = buildParamSection();
        return;
      }
      if (e.target.id === 'apCancel' || e.target === overlay) {
        overlay.remove();
        return;
      }
      if (e.target.id === 'apConfirm') {
        const params = readParams();
        overlay.remove();
        onConfirm(selectedType, params);
      }
    });
  }

  _escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  showWaypointDetail({ wp, waypointIndex, pois, distanceText, onAltitudeChange, onSpeedChange, onPoiChange, targetElement = null }) {
    const detailTarget = this.resolveDetailContainer(targetElement);
    const poiOptions = pois.map((poi, index) => {
      const displayName = Mission.formatPoiDisplayName(poi.name, index + 1);
      return `<option value="${poi.id}" ${wp.poiId === poi.id ? 'selected' : ''}>${displayName}</option>`;
    }).join('');
    let computed = '';
    if (wp.poiId) {
      computed = `<div class="computed-row">
        <span class="computed-chip">Heading <span>${wp.heading.toFixed(1)}°</span></span>
        <span class="computed-chip">Gimbal <span>${wp.gimbalPitch.toFixed(1)}°</span></span>
        <span class="computed-chip">Dist <span>${distanceText}</span></span>
      </div>`;
    }

    detailTarget.innerHTML = `
      <div class="field-row"><label>WP ${waypointIndex} - Altitude</label>
        <input id="d_alt" type="number" value="${wp.alt}" min="1" max="500" step="1"/><span class="unit">m</span></div>
      <div class="field-row"><label>Speed</label>
        <input id="d_speed" type="number" value="${Math.round(wp.speed * 3.6)}" min="4" max="54" step="1"/><span class="unit">km/h</span></div>
      <div class="poi-assign">
        <div class="field-row" style="margin-bottom:4px"><label>Point of Interest</label>
          <select id="d_poi">
            <option value="">- None -</option>
            ${poiOptions}
          </select>
        </div>
        ${computed}
      </div>
    `;

    detailTarget.querySelector('#d_alt').addEventListener('input', e => {
      onAltitudeChange(e.target.value);
    });
    detailTarget.querySelector('#d_speed').addEventListener('input', e => {
      const speedKmh = parseFloat(e.target.value);
      if (!Number.isFinite(speedKmh)) {
        return;
      }
      onSpeedChange((speedKmh / 3.6).toFixed(2));
    });
    detailTarget.querySelector('#d_speed').addEventListener('blur', e => {
      const speedKmh = parseFloat(e.target.value);
      if (!Number.isFinite(speedKmh)) {
        return;
      }
      const rounded = Math.round(speedKmh);
      const clamped = Math.max(4, Math.min(54, rounded));
      e.target.value = String(clamped);
      onSpeedChange((clamped / 3.6).toFixed(2));
    });
    detailTarget.querySelector('#d_poi').addEventListener('change', e => {
      onPoiChange(e.target.value);
    });
  }

  showPOIDetail({ poi, onNameChange, onAltitudeChange, targetElement = null }) {
    const detailTarget = this.resolveDetailContainer(targetElement);
    const isTakeoffPoi = poi.id === 'poi_1' || Mission.formatPoiDisplayName(poi.name, '') === '1';
    const takeoffNote = isTakeoffPoi
      ? 'This POI is currently used as the takeoff reference for terrain HAG calculations.'
      : 'POI named "1" is used as the takeoff reference for terrain HAG calculations.';

    detailTarget.innerHTML = `
      <div class="field-row"><label>POI Name</label>
        <input id="d_pname" type="text" value="${poi.name}"/></div>
      <div class="field-row"><label>POI Altitude</label>
        <input id="d_palt" type="number" value="${poi.alt}" min="-500" max="500" step="1"/><span class="unit">m</span></div>
      <div style="margin-top:8px;font-size:11px;color:var(--muted)">
        Assign this POI to waypoints to auto-calculate gimbal pitch and drone heading.
      </div>
      <div style="margin-top:6px;font-size:11px;color:var(--muted)">
        ${takeoffNote}
      </div>
    `;

    detailTarget.querySelector('#d_pname').addEventListener('input', e => {
      onNameChange(e.target.value);
    });
    detailTarget.querySelector('#d_palt').addEventListener('input', e => {
      onAltitudeChange(e.target.value);
    });
  }

  showBulkWaypointDetail({ selectedCount, pois, onApply, onApplyAll, onClearSelection, targetElement = null }) {
    const detailTarget = this.resolveDetailContainer(targetElement);
    const poiOptions = pois.map((poi, index) => {
      const displayName = Mission.formatPoiDisplayName(poi.name, index + 1);
      return `<option value="${poi.id}">${displayName}</option>`;
    }).join('');
    detailTarget.innerHTML = `
      <div class="bulk-edit-header">
        <div class="bulk-edit-title">Bulk Waypoint Edit</div>
        <div class="bulk-edit-subtitle">${selectedCount} waypoints selected</div>
      </div>
      <div class="field-row"><label>Altitude</label>
        <input id="bulk_alt" type="number" min="1" max="500" step="1" placeholder="Leave blank to keep"/><span class="unit">m</span></div>
      <div class="field-row"><label>Speed</label>
        <input id="bulk_speed" type="number" min="4" max="54" step="1" placeholder="Leave blank to keep"/><span class="unit">km/h</span></div>
      <div class="field-row" style="margin-bottom:10px"><label>Point of Interest</label>
        <select id="bulk_poi">
          <option value="__KEEP__">Keep current</option>
          <option value="__NONE__">None</option>
          ${poiOptions}
        </select>
      </div>
      <div class="bulk-edit-actions">
        <button id="bulk_apply" class="accent2">Apply to Selected</button>
        <button id="bulk_apply_all" class="ghost">Apply all</button>
        <button id="bulk_clear" class="ghost">Clear Selection</button>
      </div>
    `;

    detailTarget.querySelector('#bulk_apply').addEventListener('click', () => {
      onApply({
        altitudeValue: detailTarget.querySelector('#bulk_alt').value,
        speedValue: detailTarget.querySelector('#bulk_speed').value,
        poiValue: detailTarget.querySelector('#bulk_poi').value
      });
    });

    detailTarget.querySelector('#bulk_apply_all').addEventListener('click', () => {
      onApplyAll({
        altitudeValue: detailTarget.querySelector('#bulk_alt').value,
        speedValue: detailTarget.querySelector('#bulk_speed').value,
        poiValue: detailTarget.querySelector('#bulk_poi').value
      });
    });

    detailTarget.querySelector('#bulk_clear').addEventListener('click', () => {
      onClearSelection();
    });
  }
}
