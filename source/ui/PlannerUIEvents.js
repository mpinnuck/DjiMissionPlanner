/**
 * PlannerUIEvents.js  —  PlannerUI mixin: flythrough and mobile event binding
 * Mixed into PlannerUI.prototype via PlannerUI.js.
 *
 * Responsibilities:
 *  - bindFlythroughEvents: wires play/stop/seek/speed controls and
 *    FOV toggle to the flythrough controller callbacks
 *  - bindMobileEvents: wires mobile toolbar buttons, action bar,
 *    bottom sheet overlay, and long-press save/export tap handlers
 *  - closeExportOptionsDialog / closeSaveOptionsDialog
 */
// PlannerUIEvents.js
// Mixed into PlannerUI.prototype in PlannerUI.js

const PlannerUIEvents = {
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
},

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
},

closeMissionLoadDialog() {
  const existing = document.getElementById('missionLoadModal');
  if (existing) {
    existing.remove();
  }
},

closeExportOptionsDialog() {
  const existing = document.getElementById('exportOptionsModal');
  if (existing) {
    existing.remove();
  }

}
};
