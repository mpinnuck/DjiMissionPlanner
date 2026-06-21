/**
 * PlannerUIMobile.js  —  PlannerUI mixin: mobile layout and bottom sheet
 * Mixed into PlannerUI.prototype via PlannerUI.js.
 *
 * Responsibilities:
 *  - toggleMobileMissionSettings / closeMobileMissionSettings
 *  - showMobileSheet / hideMobileSheet: shows/hides the bottom sheet panel
 *    with keyboard-avoidance via visualViewport resize events
 *  - setMobileModeActive: highlights the active mode button in the action bar
 *  - setMode: updates the mode indicator in the status bar
 *  - scrollListItemIntoView: scrolls the waypoint list to keep selected
 *    items visible on small screens
 */
// PlannerUIMobile.js
// Mixed into PlannerUI.prototype in PlannerUI.js

const PlannerUIMobile = {
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
},

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
},

hideMobileSheet() {
  if (this.mobileSheet) {
    this.mobileSheet.classList.remove('open');
  }
  if (this.mobileSheetOvl) {
    this.mobileSheetOvl.classList.remove('open');
  }
},

toggleMobileMissionSettings() {
  document.body.classList.toggle('mobile-mission-open');
},

closeMobileMissionSettings() {
  document.body.classList.remove('mobile-mission-open');
},

// Compatibility wrappers for earlier mobile draft usage.
showMobileDetailSheet() {
  this._openMobileSheet();
},

hideMobileDetailSheet() {
  this.hideMobileSheet();
},

_openMobileSheet() {
  if (this.mobileSheet) {
    this.mobileSheet.classList.add('open');
  }
  if (this.mobileSheetOvl) {
    this.mobileSheetOvl.classList.add('open');
  }
},

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
},

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
},

resolveDetailContainer(targetElement) {
  return targetElement || this.detailContent;
},

setEmptyStateVisible(visible) {
  this.emptyState.style.display = visible ? 'block' : 'none';
},

showNothingSelected(targetElement = null) {
  const detailTarget = this.resolveDetailContainer(targetElement);
  detailTarget.innerHTML = '<div id="detail-placeholder">Nothing selected</div>';
},

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
},

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
};
