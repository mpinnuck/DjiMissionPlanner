/**
 * PlannerUIDialogs.js  —  PlannerUI mixin: general-purpose dialogs
 * Mixed into PlannerUI.prototype via PlannerUI.js.
 *
 * Responsibilities:
 *  - showExportOptionsDialog: folder vs share sheet choice for KMZ export
 *  - showSaveOptionsDialog: folder vs save-to-files choice for mission JSON
 *  - showConfirmDialog: reusable async confirm/cancel modal
 *  - showBulkWaypointActionDialog: multi-waypoint altitude/speed/POI edit
 */
// PlannerUIDialogs.js
// Mixed into PlannerUI.prototype in PlannerUI.js

const PlannerUIDialogs = {
/**
 * Show export options dialog.
 *
 * @param {Object} options - Named options object.
 *
 * @returns {Promise<*>}
 */
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
},

/**
 * Close save options dialog.
 *
 * @returns {Promise<*>}
 */
closeSaveOptionsDialog() {
  const existing = document.getElementById('saveOptionsModal');
  if (existing) {
    existing.remove();
  }
},

/**
 * Show save options dialog.
 *
 * @param {Object} options - Named options object.
 *
 * @returns {Promise<*>}
 */
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
},

/**
 * Close waypoint options dialog.
 *
 * @returns {Promise<*>}
 */
closeWaypointOptionsDialog() {
  const existing = document.getElementById('waypointOptionsModal');
  if (existing) {
    existing.remove();
  }
},

/**
 * Close p o i options dialog.
 *
 * @returns {Promise<*>}
 */
closePOIOptionsDialog() {
  const existing = document.getElementById('poiOptionsModal');
  if (existing) {
    existing.remove();
  }
},

/**
 * Close confirm dialog.
 *
 * @returns {Promise<*>}
 */
closeConfirmDialog() {
  const existing = document.getElementById('confirmModal');
  if (existing) {
    existing.remove();
  }
},

/**
 * Show confirm dialog.
 *
 * @param {Object} options - Named options object.
 *
 * @returns {Promise<*>}
 */
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
},

/**
 * Close bulk waypoint action dialog.
 *
 * @returns {Promise<*>}
 */
closeBulkWaypointActionDialog() {
  const existing = document.getElementById('bulkWaypointActionModal');
  if (existing) {
    existing.remove();
  }
},

/**
 * Show bulk waypoint action dialog.
 *
 * @param {Object} options - Named options object.
 *
 * @returns {Promise<*>}
 */
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
};
