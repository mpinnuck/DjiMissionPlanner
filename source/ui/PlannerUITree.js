// PlannerUITree.js
// Mixed into PlannerUI.prototype in PlannerUI.js

const PlannerUITree = {
renderList({
  waypoints = [],
  pois = [],
  selectedId = null,
  selectedType = null,
  selectedWaypointIds = new Set(),
  heightAboveGroundByWaypointId = null,
  heightAboveGroundByPoiId = null,
  onSelect,
  onDelete,
  onToggleWaypointMultiSelect,
  onAddAction,
  onDeleteAction,
  onMoveActionUp,
  onMoveActionDown,
} = {}) {
  const list = document.getElementById('wp-list');
  const empty = document.getElementById('emptyState');
  if (!list) return;

  const hasItems = waypoints.length > 0 || pois.length > 0;
  if (empty) empty.style.display = hasItems ? 'none' : '';
  if (!hasItems) { list.innerHTML = ''; return; }

  const html = [];

  // ── Waypoints section ──────────────────────────────────────────
  html.push(`<div class="tree-section-hdr js-tree-sect" data-sect="wp">
    <span class="tree-arrow ${this._wpSectionOpen ? 'expanded' : ''}">▶</span>
    <span>Waypoints (${waypoints.length})</span>
  </div>`);

  html.push(`<div class="tree-section-body ${this._wpSectionOpen ? '' : 'collapsed'}" id="treeSectWp">`);

  waypoints.forEach((wp, idx) => {
    const wpIdx      = idx + 1;
    const isSelected = selectedId === wp.id && selectedType === 'wp';
    const isExpanded = this._expandedWpIds.has(wp.id);
    const hasActions = Array.isArray(wp.actions) && wp.actions.length > 0;
    const speedKmh   = Math.round((wp.speed || 0) * 3.6);
    const hag = heightAboveGroundByWaypointId instanceof Map
      ? heightAboveGroundByWaypointId.get(wp.id)
      : null;
    const assignedPoi = wp.poiId ? pois.find(p => p.id === wp.poiId) : null;
    const poiSuffix = assignedPoi
      ? ` · 🎯 ${this._escapeHtml(Mission.formatPoiDisplayName(assignedPoi.name, '?'))}`
      : '';
    const meta = hag != null
      ? `${wp.alt}m · HAG ${Math.round(hag)}m · ${speedKmh}km/h${poiSuffix}`
      : `${wp.alt}m · ${speedKmh}km/h${poiSuffix}`;

    html.push(`<div class="tree-wp" data-wp-id="${wp.id}">
      <div class="tree-wp-hdr ${isSelected ? 'selected' : ''}" data-wp-id="${wp.id}">
        <button class="tree-wp-expand js-wp-expand" data-wp-id="${wp.id}" title="${isExpanded ? 'Collapse' : 'Expand'}">
          ${hasActions || isExpanded ? (isExpanded ? '▼' : '▶') : '◦'}
        </button>
        <span class="tree-wp-label">WP ${wpIdx}</span>
        <span class="tree-wp-meta">${meta}</span>
        <button class="tree-wp-del js-wp-del" data-wp-id="${wp.id}" title="Delete waypoint">✕</button>
      </div>
      <div class="tree-actions ${isExpanded ? 'open' : ''}" id="wpActions_${wp.id}">`);

    if (isExpanded) {
      const actions = Array.isArray(wp.actions) ? wp.actions : [];
      actions.forEach(action => {
        const m    = ACTION_META[action.type];
        const icon = m ? m.icon  : '?';
        const lbl  = m ? m.label : action.type;
        const summ = _actionSummary(action);
        html.push(`<div class="tree-action-row" data-action-id="${action.id}" data-wp-id="${wp.id}">
          <span class="tree-action-icon">${icon}</span>
          <span class="tree-action-label">${lbl}${summ ? ' · ' + summ : ''}</span>
          <button class="tree-action-up js-act-up" data-wp-id="${wp.id}" data-action-id="${action.id}" title="Move up">↑</button>
          <button class="tree-action-dn js-act-dn" data-wp-id="${wp.id}" data-action-id="${action.id}" title="Move down">↓</button>
          <button class="tree-action-del js-act-del" data-wp-id="${wp.id}" data-action-id="${action.id}" title="Delete action">✕</button>
        </div>`);
      });
      html.push(`<button class="tree-add-action js-add-action" data-wp-id="${wp.id}">＋ Add Action</button>`);
    }

    html.push(`</div></div>`); // close tree-actions + tree-wp
  });

  html.push(`</div>`); // close treeSectWp

  // ── POIs section ───────────────────────────────────────────────
  if (pois.length > 0) {
    html.push(`<div class="tree-section-hdr js-tree-sect" data-sect="poi">
      <span class="tree-arrow ${this._poiSectionOpen ? 'expanded' : ''}">▶</span>
      <span>POIs (${pois.length})</span>
    </div>`);
    html.push(`<div class="tree-section-body ${this._poiSectionOpen ? '' : 'collapsed'}" id="treeSectPoi">`);

    pois.forEach(poi => {
      const isSelected = selectedId === poi.id && selectedType === 'poi';
      const hag = heightAboveGroundByPoiId instanceof Map
        ? heightAboveGroundByPoiId.get(poi.id)
        : null;
      const meta = hag != null ? `HAG ${Math.round(hag)}m` : `${poi.alt}m`;
      html.push(`<div class="tree-poi ${isSelected ? 'selected' : ''}" data-poi-id="${poi.id}">
        <span class="tree-poi-dot">🎯</span>
        <span class="tree-poi-label">${this._escapeHtml(Mission.formatPoiDisplayName(poi.name))}</span>
        <span class="tree-poi-meta">${meta}</span>
        <button class="tree-poi-del js-poi-del" data-poi-id="${poi.id}" title="Delete POI">✕</button>
      </div>`);
    });

    html.push(`</div>`); // close treeSectPoi
  }

  list.innerHTML = html.join('');

  // ── Wire events ────────────────────────────────────────────────
  list.querySelectorAll('.js-tree-sect').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const sect = hdr.dataset.sect;
      if (sect === 'wp') {
        this._wpSectionOpen = !this._wpSectionOpen;
        hdr.querySelector('.tree-arrow').classList.toggle('expanded', this._wpSectionOpen);
        const body = document.getElementById('treeSectWp');
        if (body) body.classList.toggle('collapsed', !this._wpSectionOpen);
      } else {
        this._poiSectionOpen = !this._poiSectionOpen;
        hdr.querySelector('.tree-arrow').classList.toggle('expanded', this._poiSectionOpen);
        const body = document.getElementById('treeSectPoi');
        if (body) body.classList.toggle('collapsed', !this._poiSectionOpen);
      }
    });
  });

  list.querySelectorAll('.js-wp-expand').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const wpId = btn.dataset.wpId;
      if (this._expandedWpIds.has(wpId)) this._expandedWpIds.delete(wpId);
      else this._expandedWpIds.add(wpId);
      btn.dispatchEvent(new CustomEvent('tree-expand', { bubbles: true, detail: { wpId } }));
    });
  });

  list.querySelectorAll('.tree-wp-hdr').forEach(hdr => {
    hdr.addEventListener('click', e => {
      if (e.target.closest('.tree-wp-expand, .tree-wp-del')) return;
      const wpId = hdr.dataset.wpId;
      const isCtrlCmd = e.ctrlKey || e.metaKey;
      if (isCtrlCmd && onToggleWaypointMultiSelect) {
        const isAlreadySelected = hdr.classList.contains('multi-selected') || hdr.classList.contains('selected');
        onToggleWaypointMultiSelect(wpId, !isAlreadySelected, {});
      } else if (e.shiftKey) {
        onSelect && onSelect(wpId, 'wp', { shiftKey: true });
      } else {
        onSelect && onSelect(wpId, 'wp');
      }
    });
  });

  list.querySelectorAll('.js-wp-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      onDelete && onDelete(btn.dataset.wpId, 'wp');
    });
  });

  list.querySelectorAll('.tree-poi').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.tree-poi-del')) return;
      onSelect && onSelect(row.dataset.poiId, 'poi');
    });
  });

  list.querySelectorAll('.js-poi-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      onDelete && onDelete(btn.dataset.poiId, 'poi');
    });
  });

  list.querySelectorAll('.js-act-up').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      onMoveActionUp && onMoveActionUp(btn.dataset.wpId, btn.dataset.actionId);
    });
  });

  list.querySelectorAll('.js-act-dn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      onMoveActionDown && onMoveActionDown(btn.dataset.wpId, btn.dataset.actionId);
    });
  });

  list.querySelectorAll('.js-act-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      onDeleteAction && onDeleteAction(btn.dataset.wpId, btn.dataset.actionId);
    });
  });

  list.querySelectorAll('.js-add-action').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const wpId = btn.dataset.wpId;
      this.showActionPickerDialog((type, params) => {
        onAddAction && onAddAction(wpId, type, params);
      });
    });
  });
},

showActionPickerDialog(onConfirm) {
  const types = Object.keys(ACTION_META);
  let selectedType = types[0];
  let paramValues = {};

  const buildParamSection = () => {
    const meta = ACTION_META[selectedType];
    if (!meta) return '';
    const lines = [];
    if (meta.warning) {
      lines.push(`<div class="action-warning">⚠ ${meta.warning}</div>`);
    }
    meta.params.forEach(p => {
      const val = paramValues[p.key] !== undefined ? paramValues[p.key] : p.default;
      if (p.type === 'number') {
        lines.push(`<div class="action-param-row">
          <span class="action-param-label">${p.label}</span>
          <input class="action-param-input ap-field" type="number"
            data-key="${p.key}" min="${p.min}" max="${p.max}" value="${val}">
          <span class="action-param-unit">${p.unit || ''}</span>
        </div>`);
      } else if (p.type === 'text') {
        lines.push(`<div class="action-param-row">
          <span class="action-param-label">${p.label}</span>
          <input class="action-param-input ap-field" type="text"
            data-key="${p.key}" value="${this._escapeHtml(String(val))}">
        </div>`);
      } else if (p.type === 'select') {
        const opts = p.options.map(([v, l]) =>
          `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`
        ).join('');
        lines.push(`<div class="action-param-row">
          <span class="action-param-label">${p.label}</span>
          <select class="action-param-select ap-field" data-key="${p.key}">${opts}</select>
        </div>`);
      } else if (p.type === 'checkbox') {
        lines.push(`<div class="action-param-row">
          <span class="action-param-label">${p.label}</span>
          <input class="ap-field" type="checkbox" data-key="${p.key}" ${val ? 'checked' : ''}>
        </div>`);
      }
    });
    return lines.join('');
  };

  const typeGrid = types.map(t => {
    const m = ACTION_META[t];
    return `<button class="action-type-btn js-atype ${t === selectedType ? 'active' : ''}"
      data-type="${t}">
      <span class="action-type-icon">${m.icon}</span>
      <span class="action-type-label">${m.label}</span>
    </button>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'action-picker-overlay';
  overlay.innerHTML = `
    <div class="action-picker">
      <div class="action-picker-title">Add Action</div>
      <div class="action-type-grid">${typeGrid}</div>
      <div class="action-params" id="apParams">${buildParamSection()}</div>
      <div class="action-picker-footer">
        <button class="ghost" id="apCancel">Cancel</button>
        <button class="primary" id="apConfirm">Add</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const readParams = () => {
    const result = {};
    overlay.querySelectorAll('.ap-field').forEach(f => {
      const key = f.dataset.key;
      if (f.type === 'checkbox') result[key] = f.checked;
      else if (f.type === 'number') result[key] = parseFloat(f.value);
      else result[key] = f.value;
    });
    return result;
  };

  overlay.addEventListener('click', e => {
    const btn = e.target.closest('.js-atype');
    if (btn) {
      paramValues = readParams();
      selectedType = btn.dataset.type;
      overlay.querySelectorAll('.js-atype').forEach(b =>
        b.classList.toggle('active', b.dataset.type === selectedType));
      const p = document.getElementById('apParams');
      if (p) p.innerHTML = buildParamSection();
      return;
    }
    if (e.target.id === 'apCancel' || e.target === overlay) {
      overlay.remove();
      return;
    }
    if (e.target.id === 'apConfirm') {
      const params = readParams();
      overlay.remove();
      onConfirm(selectedType, params);
    }
  });
},

_escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

}
};
