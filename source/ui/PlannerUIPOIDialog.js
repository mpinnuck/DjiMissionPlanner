/**
 * PlannerUIPOIDialog.js  —  PlannerUI mixin: POI options dialog
 * Mixed into PlannerUI.prototype via PlannerUI.js.
 *
 * Responsibilities:
 *  - showPOIOptionsDialog: floating options panel for a selected POI,
 *    allowing name and altitude editing with live HAG display,
 *    and a delete button with confirmation
 */
// PlannerUIPOIDialog.js
// Mixed into PlannerUI.prototype in PlannerUI.js

const PlannerUIPOIDialog = {
/**
 * Show p o i options dialog.
 *
 * @param {Object} options - Named options object.
 */
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
};
