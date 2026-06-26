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

  // ── Mission defaults ───────────────────────────────────────────────────
  static SPEED_DEFAULT_KMH          = 44;
  static SPEED_MIN_KMH              = 4;
  static SPEED_MAX_KMH              = 54;
  static ALT_DEFAULT_M              = 80;
  static ALT_MIN_M                  = 1;
  static ALT_MAX_M                  = 500;
  static CONST_HAG_DEFAULT_M        = 80;
  static CONST_HAG_MIN_M            = 1;
  static CONST_HAG_MAX_M            = 500;
  static TAKEOFF_ELEVATION_DEFAULT_M = 0;
  static TAKEOFF_ELEVATION_MIN_M    = 0;
  static TAKEOFF_ELEVATION_MAX_M    = 500;
  static HFOV_DEFAULT_DEG           = 82;
  static HFOV_MIN_DEG               = 30;
  static HFOV_MAX_DEG               = 140;
  static DRONE_PROFILE_DEFAULT      = 'air3s';
  static FINISH_ACTION_DEFAULT      = 'noAction';
  static RC_LOST_ACTION_DEFAULT     = 'goContinue';
  static HEADING_MODE_DEFAULT       = 'followWayline';
  static MISSION_NAME_DEFAULT       = 'MyMission';

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
    this.missionNameInput.value = PlannerUI.MISSION_NAME_DEFAULT;
    this.defaultAltitudeInput = document.getElementById('defAlt');
    this.defaultAltitudeInput.min   = PlannerUI.ALT_MIN_M;
    this.defaultAltitudeInput.max   = PlannerUI.ALT_MAX_M;
    this.defaultAltitudeInput.value = PlannerUI.ALT_DEFAULT_M;
    this.btnApplyDefaultAlt = document.getElementById('btnApplyDefaultAlt');
    this.defaultSpeedInput = document.getElementById('defSpeed');
    this.defaultSpeedInput.min   = PlannerUI.SPEED_MIN_KMH;
    this.defaultSpeedInput.max   = PlannerUI.SPEED_MAX_KMH;
    this.defaultSpeedInput.value = PlannerUI.SPEED_DEFAULT_KMH;
    this.btnApplyDefaultSpeed = document.getElementById('btnApplyDefaultSpeed');
    this.droneProfileSelect = document.getElementById('defDrone');
    this.cameraHfovInput = document.getElementById('defHfov');
    this.cameraHfovInput.min = PlannerUI.HFOV_MIN_DEG;
    this.cameraHfovInput.max = PlannerUI.HFOV_MAX_DEG;
    this.takeoffElevationInput = document.getElementById('defTakeoffElevation');
    this.takeoffElevationInput.min   = PlannerUI.TAKEOFF_ELEVATION_MIN_M;
    this.takeoffElevationInput.max   = PlannerUI.TAKEOFF_ELEVATION_MAX_M;
    this.takeoffElevationInput.value = PlannerUI.TAKEOFF_ELEVATION_DEFAULT_M;
    this.defaultConstHagInput = document.getElementById('defConstHag');
    this.defaultConstHagInput.min   = PlannerUI.CONST_HAG_MIN_M;
    this.defaultConstHagInput.max   = PlannerUI.CONST_HAG_MAX_M;
    this.defaultConstHagInput.value = PlannerUI.CONST_HAG_DEFAULT_M;
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

  /**
   * Get mission name.
   *
   * @returns {*}
   */
  getMissionName() {
    return this.missionNameInput.value || PlannerUI.MISSION_NAME_DEFAULT;
  }

  /**
   * Get default altitude.
   *
   * @returns {number}
   */
  getDefaultAltitude() {
    return parseFloat(this.defaultAltitudeInput.value) || PlannerUI.ALT_DEFAULT_M;
  }

  /**
   * Get default speed.
   *
   * @returns {*}
   */
  getDefaultSpeed() {
    const speedKmh = parseFloat(this.defaultSpeedInput.value);
    return Number.isFinite(speedKmh) ? Number((speedKmh / 3.6).toFixed(2)) : Number((PlannerUI.SPEED_DEFAULT_KMH / 3.6).toFixed(2));
  }

  /**
   * Get takeoff elevation.
   *
   * @returns {*}
   */
  getTakeoffElevation() {
    const v = parseFloat(this.takeoffElevationInput?.value);
    return Number.isFinite(v) && v >= 0 ? v : PlannerUI.TAKEOFF_ELEVATION_DEFAULT_M;
  }

  /**
   * Get constant height above ground.
   *
   * @returns {number}
   */
  getConstantHeightAboveGround() {
    return parseFloat(this.defaultConstHagInput?.value) || PlannerUI.CONST_HAG_DEFAULT_M;
  }

  /**
   * Get drone profile id.
   *
   * @returns {*}
   */
  getDroneProfileId() {
    return this.droneProfileSelect ? this.droneProfileSelect.value : PlannerUI.DRONE_PROFILE_DEFAULT;
  }

  /**
   * Get camera hfov.
   *
   * @returns {*}
   */
  getCameraHfov() {
    const value = parseFloat(this.cameraHfovInput?.value);
    return Number.isFinite(value) ? value : PlannerUI.HFOV_DEFAULT_DEG;
  }

  /**
   * Update drone inputs state.
   *
   * @returns {*}
   */
  updateDroneInputsState() {
    if (!this.cameraHfovInput) {
      return;
    }
    const isCustom = this.getDroneProfileId() === 'custom';
    this.cameraHfovInput.disabled = !isCustom;
    if (!isCustom) {
      this.cameraHfovInput.value = PlannerUI.HFOV_DEFAULT_DEG;
    }
  }

  /**
   * Get finish action.
   *
   * @returns {*}
   */
  getFinishAction() {
    return this.finishActionSelect.value;
  }

  /**
   * Get heading mode.
   *
   * @returns {*}
   */
  getHeadingMode() {
    return this.headingModeSelect.value;
  }

  /**
   * Get rc lost action.
   *
   * @returns {*}
   */
  getRcLostAction() {
    return this.rcLostActionSelect.value;
  }

  /**
   * Get mission settings.
   *
   * @returns {Object}
   */
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

  /**
   * Resets all mission settings fields to their default values.
   * Called by clearAll so a fresh mission cannot accidentally overwrite the previous one.
   */
  resetMissionSettings() {
    const D = PlannerUI;
    this.missionNameInput.value           = D.MISSION_NAME_DEFAULT;
    this.defaultAltitudeInput.value       = D.ALT_DEFAULT_M;
    this.defaultSpeedInput.value          = D.SPEED_DEFAULT_KMH;
    if (this.droneProfileSelect)          this.droneProfileSelect.value    = D.DRONE_PROFILE_DEFAULT;
    if (this.cameraHfovInput)             this.cameraHfovInput.value       = D.HFOV_DEFAULT_DEG;
    if (this.takeoffElevationInput)       this.takeoffElevationInput.value = D.TAKEOFF_ELEVATION_DEFAULT_M;
    if (this.defaultConstHagInput)        this.defaultConstHagInput.value  = D.CONST_HAG_DEFAULT_M;
    if (this.finishActionSelect)          this.finishActionSelect.value    = D.FINISH_ACTION_DEFAULT;
    if (this.rcLostActionSelect)          this.rcLostActionSelect.value    = D.RC_LOST_ACTION_DEFAULT;
    if (this.headingModeSelect)           this.headingModeSelect.value     = D.HEADING_MODE_DEFAULT;
    this.updateDroneInputsState();
  }

  /**
   * Apply mission settings.
   *
   * @param {Object} settings [default: {}]
   */
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

  /**
   * Bind toolbar events.
   *
   * @param {*} handlers
   */
  bindToolbarEvents(handlers) {
    this.btnAddWP.addEventListener('click', handlers.onAddWaypoint);
    this.btnAddPOI.addEventListener('click', handlers.onAddPOI);
    this.btnSelect.addEventListener('click', handlers.onSelectMode);
    this.btnUnselectAll.addEventListener('click', handlers.onUnselectAll);
    this.btnLocate.addEventListener('click', handlers.onLocate);
    this.btnClear.addEventListener('click', handlers.onClearAll);

    // Debounced click handlers for Save and Export so that a double-click
    // cancels the pending single-click before any dblclick handler fires.
    let saveMissionClickTimer = null;
    this.btnSaveMission.addEventListener('click', () => {
      clearTimeout(saveMissionClickTimer);
      saveMissionClickTimer = setTimeout(() => handlers.onSaveMission(), 250);
    });

    // Load Mission uses a plain click — re-entry is guarded in doLoadMission()
    // via the _loadMissionInProgress flag, which is zero-delay unlike a debounce.
    this.btnLoadMission.addEventListener('click', handlers.onLoadMission);

    let exportClickTimer = null;
    this.btnExport.addEventListener('click', () => {
      clearTimeout(exportClickTimer);
      exportClickTimer = setTimeout(() => handlers.onExport(), 250);
    });

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
        clearTimeout(saveMissionClickTimer);
        handlers.onSaveMissionAs();
      });
      this.btnSaveMission.addEventListener('dblclick', event => {
        event.preventDefault();
        clearTimeout(saveMissionClickTimer);
        handlers.onSaveMissionAs();
      });
    }

    // Right-click or double-click on Export = Export As (pick a new location)
    if (typeof handlers.onExportAs === 'function') {
      this.btnExport.addEventListener('contextmenu', e => {
        e.preventDefault();
        clearTimeout(exportClickTimer);
        handlers.onExportAs();
      });
      this.btnExport.addEventListener('dblclick', e => {
        e.preventDefault();
        clearTimeout(exportClickTimer);
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
