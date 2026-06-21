/**
 * PlannerUI.js
 * Root UI class for the DJI Mission Planner.
 * The constructor caches all DOM element references and initialises
 * UI state. All UI methods are mixed in from the PlannerUI* mixin files
 * via Object.assign at the bottom of this file.
 *
 * Also defines module-level helpers:
 *  - ACTION_META: display metadata for each supported waypoint action type
 *  - _actionSummary(action): returns a short human-readable action label
 */
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
  // ── Mixin method groups ─────────────────────────────────────────
  // Load order in HTML:
  //   PlannerUIEvents → PlannerUIDialogs → PlannerUIPOIDialog
  //   → PlannerUIWpDialog → PlannerUILoadTree → PlannerUIFlythrough
  //   → PlannerUIMobile → PlannerUITree → PlannerUIDetail → PlannerUI.js
}

// Mix method groups into PlannerUI.prototype
Object.assign(
  PlannerUI.prototype,
  PlannerUIEvents,
  PlannerUIDialogs,
  PlannerUIPOIDialog,
  PlannerUIWpDialog,
  PlannerUILoadTree,
  PlannerUIFlythrough,
  PlannerUIMobile,
  PlannerUITree,
  PlannerUIDetail
);
