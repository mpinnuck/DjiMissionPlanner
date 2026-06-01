class PlannerUI {
  constructor(options = {}) {
    this.mapElement = document.getElementById(options.mapElementId || 'map');
    this.wpList = document.getElementById('wp-list');
    this.emptyState = document.getElementById('emptyState');
    this.detailContent = document.getElementById('detail-content');
    this.statWP = document.getElementById('statWP');
    this.statPOI = document.getElementById('statPOI');
    this.statDist = document.getElementById('statDist');
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
    this.missionNameInput = document.getElementById('missionName');
    this.defaultAltitudeInput = document.getElementById('defAlt');
    this.defaultSpeedInput = document.getElementById('defSpeed');
    this.finishActionSelect = document.getElementById('defFinish');
    this.rcLostActionSelect = document.getElementById('defRCLost');
    this.headingModeSelect = document.getElementById('defHeading');
    this.touchRangeSelection = null;
  }

  getMissionName() {
    return this.missionNameInput.value || 'Mission';
  }

  getDefaultAltitude() {
    return parseFloat(this.defaultAltitudeInput.value) || 50;
  }

  getDefaultSpeed() {
    return parseFloat(this.defaultSpeedInput.value) || 8;
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
      this.defaultSpeedInput.value = settings.defaultSpeed;
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
  }

  closeMissionLoadDialog() {
    const existing = document.getElementById('missionLoadModal');
    if (existing) {
      existing.remove();
    }
  }

  showMissionLoadDialog({ rootLabel, nodes, onCancel, onSelectFile, onRefresh, onChooseFolder }) {
    this.closeMissionLoadDialog();

    const overlay = document.createElement('div');
    overlay.id = 'missionLoadModal';
    overlay.className = 'mission-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'mission-modal';

    const header = document.createElement('div');
    header.className = 'mission-modal-header';
    header.innerHTML = `<div class="mission-modal-title">Load Mission</div><div class="mission-modal-subtitle">${rootLabel}</div>`;

    const treeWrap = document.createElement('div');
    treeWrap.className = 'mission-tree-wrap';

    if (!nodes.length) {
      const empty = document.createElement('div');
      empty.className = 'mission-tree-empty';
      empty.textContent = 'No mission JSON files found in this folder.';
      treeWrap.appendChild(empty);
    } else {
      const rootList = document.createElement('ul');
      rootList.className = 'mission-tree';
      nodes.forEach(node => rootList.appendChild(this.createMissionTreeNode(node, onSelectFile)));
      treeWrap.appendChild(rootList);
    }

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
    footer.appendChild(refreshButton);
    footer.appendChild(closeButton);

    modal.appendChild(header);
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

  createMissionTreeNode(node, onSelectFile) {
    const li = document.createElement('li');
    li.className = 'mission-tree-node';

    if (node.type === 'directory') {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'mission-tree-row mission-tree-folder';
      row.textContent = `▸ ${node.name}`;

      const childList = document.createElement('ul');
      childList.className = 'mission-tree mission-tree-children';
      childList.style.display = 'none';
      node.children.forEach(child => childList.appendChild(this.createMissionTreeNode(child, onSelectFile)));

      row.addEventListener('click', () => {
        const expanded = childList.style.display !== 'none';
        childList.style.display = expanded ? 'none' : 'block';
        row.textContent = `${expanded ? '▸' : '▾'} ${node.name}`;
      });

      li.appendChild(row);
      li.appendChild(childList);
      return li;
    }

    const fileButton = document.createElement('button');
    fileButton.type = 'button';
    fileButton.className = 'mission-tree-row mission-tree-file';
    fileButton.textContent = node.name;
    fileButton.title = node.path;
    fileButton.addEventListener('click', () => onSelectFile(node));
    li.appendChild(fileButton);
    return li;
  }

  setStatus(message) {
    this.sbStatus.textContent = message;
  }

  showToast(message, tone = 'success') {
    let container = document.getElementById('appToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'appToastContainer';
      container.className = 'app-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `app-toast ${tone}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => {
        toast.remove();
      }, 180);
    }, 2200);
  }

  setCursor(lat, lng) {
    this.sbCursor.textContent = `Lat: ${lat.toFixed(6)}  Lon: ${lng.toFixed(6)}`;
  }

  updateStats({ waypointCount, poiCount, distanceMeters }) {
    this.statWP.textContent = waypointCount;
    this.statPOI.textContent = poiCount;
    this.statDist.textContent = distanceMeters >= 1000
      ? (distanceMeters / 1000).toFixed(2) + ' km'
      : Math.round(distanceMeters) + ' m';
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

  setEmptyStateVisible(visible) {
    this.emptyState.style.display = visible ? 'block' : 'none';
  }

  showNothingSelected() {
    this.detailContent.innerHTML = '<div id="detail-placeholder">Nothing selected</div>';
  }

  highlightSelectedItem(selectedId, selectedWaypointIds = new Set()) {
    document.querySelectorAll('.wp-item').forEach(el => {
      const isMultiSelected = selectedWaypointIds.has(el.dataset.id);
      el.classList.toggle('selected', el.dataset.id === selectedId);
      el.classList.toggle('multi-selected', isMultiSelected);
    });
  }

  renderList({
    waypoints,
    pois,
    selectedId,
    selectedWaypointIds = new Set(),
    resolvePoiName,
    onSelect,
    onDelete,
    onToggleWaypointMultiSelect,
    onRangeWaypointMultiSelect,
    onStartWaypointTouchRange,
    onEndWaypointTouchRange
  }) {
    this.wpList.innerHTML = '';
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

      let badge;
      let meta = '';
      if (item._type === 'wp') {
        badge = `<span class="wp-badge wp">WP${item._idx}</span>`;
        const poiName = item.poiId ? resolvePoiName(item.poiId) : '—';
        meta = `
        <div class="wp-meta">
          <span class="wp-meta-tag">Alt <span>${item.alt}m</span></span>
          <span class="wp-meta-tag">Speed <span>${item.speed}m/s</span></span>
          ${item.poiId ? `<span class="wp-meta-tag">POI <span>${poiName}</span></span>` : ''}
          ${item.poiId ? `<span class="wp-meta-tag">Hdg <span>${item.heading.toFixed(1)}°</span></span>` : ''}
          ${item.poiId ? `<span class="wp-meta-tag">Pitch <span>${item.gimbalPitch.toFixed(1)}°</span></span>` : ''}
        </div>`;
      } else {
        badge = '<span class="wp-badge poi">POI</span>';
        meta = `<div class="wp-meta">
        <span class="wp-meta-tag">Alt <span>${item.alt}m</span></span>
        <span class="wp-meta-tag">${item.name}</span>
      </div>`;
      }

      div.innerHTML = `
      <div class="wp-item-header">
        ${badge}
        <span class="wp-name">${item._type === 'poi' ? item.name : ('Waypoint ' + item._idx)}</span>
        <button class="wp-del" data-id="${item.id}" data-type="${item._type}">✕</button>
      </div>
      <div class="wp-coords">${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}</div>
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
  }

  showWaypointDetail({ wp, waypointIndex, pois, distanceText, onAltitudeChange, onSpeedChange, onPoiChange }) {
    const poiOptions = pois.map(poi => `<option value="${poi.id}" ${wp.poiId === poi.id ? 'selected' : ''}>${poi.name}</option>`).join('');
    let computed = '';
    if (wp.poiId) {
      computed = `<div class="computed-row">
        <span class="computed-chip">Heading <span>${wp.heading.toFixed(1)}°</span></span>
        <span class="computed-chip">Gimbal <span>${wp.gimbalPitch.toFixed(1)}°</span></span>
        <span class="computed-chip">Dist <span>${distanceText}</span></span>
      </div>`;
    }

    this.detailContent.innerHTML = `
      <div class="field-row"><label>WP ${waypointIndex} - Altitude</label>
        <input id="d_alt" type="number" value="${wp.alt}" min="1" max="500" step="1"/><span class="unit">m</span></div>
      <div class="field-row"><label>Speed</label>
        <input id="d_speed" type="number" value="${wp.speed}" min="1" max="15" step="0.5"/><span class="unit">m/s</span></div>
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

    this.detailContent.querySelector('#d_alt').addEventListener('input', e => {
      onAltitudeChange(e.target.value);
    });
    this.detailContent.querySelector('#d_speed').addEventListener('input', e => {
      onSpeedChange(e.target.value);
    });
    this.detailContent.querySelector('#d_poi').addEventListener('change', e => {
      onPoiChange(e.target.value);
    });
  }

  showPOIDetail({ poi, onNameChange, onAltitudeChange }) {
    this.detailContent.innerHTML = `
      <div class="field-row"><label>POI Name</label>
        <input id="d_pname" type="text" value="${poi.name}"/></div>
      <div class="field-row"><label>POI Altitude</label>
        <input id="d_palt" type="number" value="${poi.alt}" min="-500" max="500" step="1"/><span class="unit">m</span></div>
      <div style="margin-top:8px;font-size:11px;color:var(--muted)">
        Assign this POI to waypoints to auto-calculate gimbal pitch and drone heading.
      </div>
    `;

    this.detailContent.querySelector('#d_pname').addEventListener('input', e => {
      onNameChange(e.target.value);
    });
    this.detailContent.querySelector('#d_palt').addEventListener('input', e => {
      onAltitudeChange(e.target.value);
    });
  }

  showBulkWaypointDetail({ selectedCount, pois, onApply, onClearSelection }) {
    const poiOptions = pois.map(poi => `<option value="${poi.id}">${poi.name}</option>`).join('');
    this.detailContent.innerHTML = `
      <div class="bulk-edit-header">
        <div class="bulk-edit-title">Bulk Waypoint Edit</div>
        <div class="bulk-edit-subtitle">${selectedCount} waypoints selected</div>
      </div>
      <div class="field-row"><label>Altitude</label>
        <input id="bulk_alt" type="number" min="1" max="500" step="1" placeholder="Leave blank to keep"/><span class="unit">m</span></div>
      <div class="field-row"><label>Speed</label>
        <input id="bulk_speed" type="number" min="1" max="15" step="0.5" placeholder="Leave blank to keep"/><span class="unit">m/s</span></div>
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

    this.detailContent.querySelector('#bulk_apply').addEventListener('click', () => {
      onApply({
        altitudeValue: this.detailContent.querySelector('#bulk_alt').value,
        speedValue: this.detailContent.querySelector('#bulk_speed').value,
        poiValue: this.detailContent.querySelector('#bulk_poi').value
      });
    });

    this.detailContent.querySelector('#bulk_clear').addEventListener('click', () => {
      onClearSelection();
    });
  }
}
