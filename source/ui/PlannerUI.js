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
    this.btnFPV = document.getElementById('btnFPV');
    this.btnFTPlay = document.getElementById('btnFTPlay');
    this.btnFTPause = document.getElementById('btnFTPause');
    this.btnFTStop = document.getElementById('btnFTStop');
    this.ftSpeedSelect = document.getElementById('ftSpeed');
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
    this.defaultConstHagInput = document.getElementById('defConstHag');
    this.btnApplyConstHag = document.getElementById('btnApplyConstHag');
    this.finishActionSelect = document.getElementById('defFinish');
    this.rcLostActionSelect = document.getElementById('defRCLost');
    this.headingModeSelect = document.getElementById('defHeading');
    this.mobileSheet = document.getElementById('mobileSheet');
    this.mobileSheetBody = document.getElementById('mobileSheetBody');
    this.mobileSheetOvl = document.getElementById('mobileSheetOverlay');
    this.touchRangeSelection = null;

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
      headingMode: this.getHeadingMode()
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

    // Right-click or long-press to change save folder
    if (typeof handlers.onSaveMissionChangeFolder === 'function') {
      this.btnSaveMission.addEventListener('contextmenu', event => {
        event.preventDefault();
        handlers.onSaveMissionChangeFolder();
      });

      let saveTouchStartTime = 0;
      this.btnSaveMission.addEventListener('touchstart', () => {
        saveTouchStartTime = Date.now();
      });
      this.btnSaveMission.addEventListener('touchend', () => {
        if (Date.now() - saveTouchStartTime > 500) {
          handlers.onSaveMissionChangeFolder();
        }
      });
    }
    
    // Right-click or long-press to change export folder
    if (typeof handlers.onExportChangeFolder === 'function') {
      this.btnExport.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        handlers.onExportChangeFolder();
      });
      
      // Long-press support for touch devices
      let touchStartTime = 0;
      this.btnExport.addEventListener('touchstart', () => {
        touchStartTime = Date.now();
      });
      this.btnExport.addEventListener('touchend', (e) => {
        if (Date.now() - touchStartTime > 500) {
          handlers.onExportChangeFolder();
        }
      });
    }
  }

  bindFlythroughEvents(handlers = {}) {
    if (this.btnFTPlay && typeof handlers.onFlythroughPlay === 'function') {
      this.btnFTPlay.addEventListener('click', handlers.onFlythroughPlay);
    }
    if (this.btnFTPause && typeof handlers.onFlythroughPause === 'function') {
      this.btnFTPause.addEventListener('click', handlers.onFlythroughPause);
    }
    if (this.btnFTStop && typeof handlers.onFlythroughStop === 'function') {
      this.btnFTStop.addEventListener('click', handlers.onFlythroughStop);
    }
    if (this.ftSpeedSelect && typeof handlers.onFlythroughSpeedChange === 'function') {
      this.ftSpeedSelect.addEventListener('change', event => {
        handlers.onFlythroughSpeedChange(event.target.value);
      });
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
    wire(this.mbSave, handlers.onMobileSave);
    wire(this.mbExport, handlers.onMobileExport);
    wire(this.mbPlay, handlers.onMobilePlay);
    wire(this.mbAddWp, handlers.onMobileAddWp);
    wire(this.mbAddPoi, handlers.onMobileAddPoi);
    wire(this.mbSelect, handlers.onMobileSelect);
    wire(this.mbClearSel, handlers.onMobileClearSel);

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

      const finish = result => {
        overlay.remove();
        resolve(result);
      };

      cancelButton.addEventListener('click', () => finish(null));
      applyButton.addEventListener('click', () => {
        finish({
          altitudeValue: body.querySelector('#bulkDlgAlt').value,
          speedValue: body.querySelector('#bulkDlgSpeed').value,
          hagValue: body.querySelector('#bulkDlgHag').value,
          poiValue: body.querySelector('#bulkDlgPoi').value
        });
      });

      overlay.addEventListener('click', event => {
        if (event.target === overlay) {
          finish(null);
        }
      });

      footer.appendChild(cancelButton);
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

    const altitudeRow = document.createElement('div');
    altitudeRow.className = 'wp-options-edit-row';
    altitudeRow.innerHTML = `
      <label>Height</label>
      <input type="number" min="-500" max="500" step="1" value="${Math.max(-500, Math.min(500, Math.round(initialAltitude)))}" />
      <span>m</span>
    `;
    const altitudeInput = altitudeRow.querySelector('input');

    const updateAltitude = newValue => {
      const clamped = Math.max(-500, Math.min(500, Math.round(newValue)));
      slider.value = String(clamped);
      if (altitudeInput && document.activeElement !== altitudeInput) {
        altitudeInput.value = String(clamped);
      }
      const valueLabel = valueRow.querySelector('#poiOptionsAltitudeValue');
      if (valueLabel) {
        valueLabel.textContent = formatAltitudeLabel(clamped);
      }
      onAltitudeChange(clamped);
    };

    slider.addEventListener('input', () => updateAltitude(parseFloat(slider.value)));
    minusButton.addEventListener('click', () => updateAltitude(parseFloat(slider.value) - 1));
    plusButton.addEventListener('click', () => updateAltitude(parseFloat(slider.value) + 1));
    altitudeInput.addEventListener('input', () => updateAltitude(parseFloat(altitudeInput.value)));

    controls.appendChild(minusButton);
    controls.appendChild(slider);
    controls.appendChild(plusButton);

    altitudeBlock.appendChild(valueRow);
    altitudeBlock.appendChild(controls);
    body.appendChild(altitudeBlock);
    body.appendChild(altitudeRow);

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
    initialPosition,
    onClose,
    onDelete,
    onPrevious,
    onNext,
    onAltitudeChange,
    onSpeedChange,
    onPoiChange
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

    const altitudeEditRow = document.createElement('div');
    altitudeEditRow.className = 'wp-options-edit-row';
    altitudeEditRow.innerHTML = `
      <label>Altitude</label>
      <input type="number" min="-59" max="499" step="1" value="${Math.max(-59, Math.min(499, Math.round(initialAltitude)))}" />
      <span>m</span>
    `;
    const altitudeInput = altitudeEditRow.querySelector('input');
    body.appendChild(altitudeEditRow);

    const altitudeBlock = document.createElement('div');
    altitudeBlock.className = 'wp-options-altitude-block';

    const valueRow = document.createElement('div');
    valueRow.className = 'wp-options-altitude-values';

    const hasInitialHag = Number.isFinite(initialHeightAboveGround);
    const hagOffset = hasInitialHag
      ? (initialHeightAboveGround - initialAltitude)
      : null;

    const formatAltitudeLabel = altitudeMeters => {
      if (!Number.isFinite(altitudeMeters)) {
        return '0 m';
      }

      if (!Number.isFinite(hagOffset)) {
        return `${Math.round(altitudeMeters)} m`;
      }

      const hagValue = Math.round(altitudeMeters + hagOffset);
      return `${Math.round(altitudeMeters)} m (${hagValue})`;
    };

    valueRow.innerHTML = `
      <span>-59 m</span>
      <strong id="wpOptionsAltitudeValue">${formatAltitudeLabel(initialAltitude)}</strong>
      <span>499 m</span>
    `;

    const controls = document.createElement('div');
    controls.className = 'wp-options-altitude-controls';

    const minusButton = document.createElement('button');
    minusButton.type = 'button';
    minusButton.className = 'wp-options-step';
    minusButton.textContent = '−';

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

    const updateAltitude = newValue => {
      const clamped = Math.max(-59, Math.min(499, Math.round(newValue)));
      slider.value = String(clamped);
      if (altitudeInput && document.activeElement !== altitudeInput) {
        altitudeInput.value = String(clamped);
      }
      const valueLabel = valueRow.querySelector('#wpOptionsAltitudeValue');
      if (valueLabel) {
        valueLabel.textContent = formatAltitudeLabel(clamped);
      }
      onAltitudeChange(clamped);
    };

    slider.addEventListener('input', () => updateAltitude(parseFloat(slider.value)));
    minusButton.addEventListener('click', () => updateAltitude(parseFloat(slider.value) - 1));
    plusButton.addEventListener('click', () => updateAltitude(parseFloat(slider.value) + 1));
    altitudeInput.addEventListener('input', () => {
      const typed = parseFloat(altitudeInput.value);
      if (!Number.isFinite(typed)) {
        return;
      }
      updateAltitude(typed);
    });
    altitudeInput.addEventListener('blur', () => {
      const typed = parseFloat(altitudeInput.value);
      updateAltitude(Number.isFinite(typed) ? typed : parseFloat(slider.value));
      altitudeInput.value = slider.value;
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
      persistent = false
    } = options;
    const container = this.ensureToastContainer();

    if (id) {
      const existing = document.getElementById(id);
      if (existing) {
        existing.remove();
      }
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

    if (!persistent && duration > 0) {
      window.setTimeout(() => {
        this.hideToast(toast);
      }, duration);
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

  highlightSelectedItem(selectedId, selectedWaypointIds = new Set()) {
    document.querySelectorAll('.wp-item').forEach(el => {
      const isMultiSelected = selectedWaypointIds.has(el.dataset.id);
      el.classList.toggle('selected', el.dataset.id === selectedId);
      el.classList.toggle('multi-selected', isMultiSelected);
    });

    const scrollTargetId = selectedId || [...selectedWaypointIds].at(-1) || null;
    if (this.selectedItemScrollFrame) {
      window.cancelAnimationFrame(this.selectedItemScrollFrame);
    }
    this.selectedItemScrollFrame = window.requestAnimationFrame(() => {
      this.selectedItemScrollFrame = null;
      this.scrollListItemIntoView(scrollTargetId);
    });
  }

  scrollListItemIntoView(itemId) {
    if (!itemId || !this.wpList) {
      return;
    }

    const row = this.wpList.querySelector(`.wp-item[data-id="${itemId}"]`);
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
    waypoints,
    pois,
    selectedId,
    selectedWaypointIds = new Set(),
    resolvePoiName,
    resolveWaypointHeightAboveGround,
    resolveWaypointGroundElevation,
    resolveTakeoffGroundElevation,
    resolveWaypointLegDistance,
    onSelect,
    onDelete,
    onToggleWaypointMultiSelect,
    onRangeWaypointMultiSelect,
    onStartWaypointTouchRange,
    onEndWaypointTouchRange
  }) {
    this.wpList.innerHTML = '';
    const poiIndexById = new Map(pois.map((poi, index) => [poi.id, index + 1]));
    const getPoiDisplayName = poi => {
      const index = poiIndexById.get(poi?.id);
      return Mission.formatPoiDisplayName(poi?.name, index);
    };
    const all = [
      ...waypoints.map((waypoint, index) => ({ ...waypoint, _type: 'wp', _idx: index + 1 })),
      ...pois.map(poi => ({ ...poi, _type: 'poi' }))
    ];

    if (all.length === 0) {
      this.setEmptyStateVisible(true);
      return;
    }
    this.setEmptyStateVisible(false);

    all.forEach(item => {
      const div = document.createElement('div');
      div.className = 'wp-item' + (item._type === 'poi' ? ' poi-item' : '');
      div.dataset.id = item.id;
      div.dataset.type = item._type;
      if (item.id === selectedId) {
        div.classList.add('selected');
      }
      if (item._type === 'wp' && selectedWaypointIds.has(item.id)) {
        div.classList.add('multi-selected');
      }
      const poiDisplayName = item._type === 'poi' ? getPoiDisplayName(item) : null;

      let badge;
      let meta = '';
      let coordExtra = '';
      if (item._type === 'wp') {
        badge = `<span class="wp-badge wp">WP${item._idx}</span>`;
        const poiNumber = item.poiId && poiIndexById.has(item.poiId)
          ? String(poiIndexById.get(item.poiId))
          : '—';
        const hagMeters = typeof resolveWaypointHeightAboveGround === 'function'
          ? resolveWaypointHeightAboveGround(item)
          : null;
        const hagLabel = Number.isFinite(hagMeters) ? `${Math.round(hagMeters)}m` : '—';
        const groundAsl = typeof resolveWaypointGroundElevation === 'function'
          ? resolveWaypointGroundElevation(item)
          : null;
        const takeoffAsl = typeof resolveTakeoffGroundElevation === 'function'
          ? resolveTakeoffGroundElevation()
          : null;
        const groundAslLabel = Number.isFinite(groundAsl) ? `${Math.round(groundAsl)}m` : '—';
        const headingLabel = Number.isFinite(item.heading) ? `${item.heading.toFixed(1)}°` : '—';
        const pitchLabel = Number.isFinite(item.gimbalPitch) ? `${item.gimbalPitch.toFixed(1)}°` : '—';
        const legDistanceMeters = typeof resolveWaypointLegDistance === 'function'
          ? resolveWaypointLegDistance(item, item._idx - 1)
          : null;
        const legDistanceText = Number.isFinite(legDistanceMeters)
          ? (legDistanceMeters >= 1000 ? `${(legDistanceMeters / 1000).toFixed(2)} km` : `${Math.round(legDistanceMeters)} m`)
          : '—';
        coordExtra = `<span class="wp-leg-distance">Dist: ${legDistanceText}</span>`;
        meta = `
        <div class="wp-meta">
          <div class="wp-meta-row">
            <span class="wp-meta-tag">Alt <span>${Math.round(item.alt)}m</span></span>
            <span class="wp-meta-tag">HAG <span>${hagLabel}</span></span>
            <span class="wp-meta-tag">Speed <span>${Math.round(item.speed * 3.6)}km/h</span></span>
          </div>
          ${item.poiId ? `
          <div class="wp-meta-row">
            <span class="wp-meta-tag">POI <span>${poiNumber}</span></span>
          </div>
          ` : ''}
          <div class="wp-meta-row wp-meta-row-computed wp-meta-row-computed-headings">
            <span class="wp-meta-tag wp-meta-tag-computed">Gnd ASL</span>
            <span class="wp-meta-tag wp-meta-tag-computed">Hdg</span>
            <span class="wp-meta-tag wp-meta-tag-computed">Pitch</span>
          </div>
          <div class="wp-meta-row wp-meta-row-computed wp-meta-row-computed-values">
            <span class="wp-meta-tag wp-meta-tag-computed"><span>${groundAslLabel}</span></span>
            <span class="wp-meta-tag wp-meta-tag-computed"><span>${headingLabel}</span></span>
            <span class="wp-meta-tag wp-meta-tag-computed"><span>${pitchLabel}</span></span>
          </div>
        </div>`;
      } else {
        badge = '<span class="wp-badge poi">POI</span>';
        const takeoffAsl = typeof resolveTakeoffGroundElevation === 'function'
          ? resolveTakeoffGroundElevation()
          : null;
        const takeoffAslLabel = Number.isFinite(takeoffAsl) ? `${Math.round(takeoffAsl)}m` : '—';
        const takeoffMeta = item.id === 'poi_1'
          ? `<span class="wp-meta-tag wp-meta-tag-computed">Tko ASL <span>${takeoffAslLabel}</span></span>`
          : '';
        meta = `<div class="wp-meta">
        <div class="wp-meta-row">
          <span class="wp-meta-tag">Alt <span>${item.alt}m</span></span>
          <span class="wp-meta-tag">POI <span>${poiDisplayName}</span></span>
          ${takeoffMeta}
        </div>
      </div>`;
      }

      div.innerHTML = `
      <div class="wp-item-header">
        ${badge}
        <span class="wp-name">${item._type === 'poi' ? poiDisplayName : ('Waypoint ' + item._idx)}</span>
        <button class="wp-del" data-id="${item.id}" data-type="${item._type}">✕</button>
      </div>
      <div class="wp-coords"><span>${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}</span>${coordExtra}</div>
      ${meta}
    `;
      if (item._type === 'wp' && typeof onToggleWaypointMultiSelect === 'function') {
        div.addEventListener('click', ev => {
          if (ev.target.closest('.wp-del')) {
            return;
          }
          const shouldSelect = !selectedWaypointIds.has(item.id);
          onToggleWaypointMultiSelect(item.id, shouldSelect, { shiftKey: ev.shiftKey });
        });

        if (typeof onStartWaypointTouchRange === 'function' && typeof onRangeWaypointMultiSelect === 'function') {
          div.addEventListener('touchstart', ev => {
            if (ev.target.closest('.wp-del')) {
              return;
            }
            this.touchRangeSelection = { anchorId: item.id, lastTargetId: item.id };
            onStartWaypointTouchRange(item.id);
          }, { passive: true });

          div.addEventListener('touchmove', ev => {
            if (!this.touchRangeSelection || !ev.touches || ev.touches.length === 0) {
              return;
            }

            const touch = ev.touches[0];
            const element = document.elementFromPoint(touch.clientX, touch.clientY);
            const row = element ? element.closest('.wp-item[data-type="wp"]') : null;
            if (!row || !row.dataset.id) {
              return;
            }

            const targetId = row.dataset.id;
            if (targetId === this.touchRangeSelection.lastTargetId) {
              return;
            }

            this.touchRangeSelection.lastTargetId = targetId;
            onRangeWaypointMultiSelect(this.touchRangeSelection.anchorId, targetId, true);
            ev.preventDefault();
          }, { passive: false });

          const endTouchRange = () => {
            if (!this.touchRangeSelection) {
              return;
            }
            this.touchRangeSelection = null;
            onEndWaypointTouchRange();
          };

          div.addEventListener('touchend', endTouchRange);
          div.addEventListener('touchcancel', endTouchRange);
        }
      } else {
        div.addEventListener('click', ev => onSelect(item.id, item._type, { shiftKey: ev.shiftKey }));
      }
      div.querySelector('.wp-del').addEventListener('click', ev => {
        ev.stopPropagation();
        onDelete(item.id, item._type);
      });
      this.wpList.appendChild(div);
    });

    const scrollTargetId = selectedId || [...selectedWaypointIds].at(-1) || null;
    this.scrollListItemIntoView(scrollTargetId);
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

  showBulkWaypointDetail({ selectedCount, pois, onApply, onClearSelection, targetElement = null }) {
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

    detailTarget.querySelector('#bulk_clear').addEventListener('click', () => {
      onClearSelection();
    });
  }
}
