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
    this.btnLocate = document.getElementById('btnLocate');
    this.btnClear = document.getElementById('btnClear');
    this.btnExport = document.getElementById('btnExport');
  }

  bindToolbarEvents(handlers) {
    this.btnAddWP.addEventListener('click', handlers.onAddWaypoint);
    this.btnAddPOI.addEventListener('click', handlers.onAddPOI);
    this.btnSelect.addEventListener('click', handlers.onSelectMode);
    this.btnLocate.addEventListener('click', handlers.onLocate);
    this.btnClear.addEventListener('click', handlers.onClearAll);
    this.btnExport.addEventListener('click', handlers.onExport);
  }

  setStatus(message) {
    this.sbStatus.textContent = message;
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

  highlightSelectedItem(selectedId) {
    document.querySelectorAll('.wp-item').forEach(el => {
      el.classList.toggle('selected', el.dataset.id === selectedId);
    });
  }

  renderList({ waypoints, pois, selectedId, resolvePoiName, onSelect, onDelete }) {
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
      if (item.id === selectedId) {
        div.classList.add('selected');
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
      div.addEventListener('click', () => onSelect(item.id, item._type));
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
}
