/**
 * PlannerUIWpDialog.js  —  PlannerUI mixin: waypoint options dialog
 * Mixed into PlannerUI.prototype via PlannerUI.js.
 *
 * Responsibilities:
 *  - showWaypointOptionsDialog: floating options panel for a selected waypoint.
 *    Contains altitude (ASL/HAG), speed, POI assignment, and an actions panel.
 *    The actions panel supports add/edit/delete/reorder for all nine supported
 *    DJI waypoint action types via inline edit and list sub-panels.
 */
// PlannerUIWpDialog.js
// Mixed into PlannerUI.prototype in PlannerUI.js

const PlannerUIWpDialog = {
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
};
