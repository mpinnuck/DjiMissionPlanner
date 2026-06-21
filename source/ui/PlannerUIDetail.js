/**
 * PlannerUIDetail.js  —  PlannerUI mixin: desktop detail panel
 * Mixed into PlannerUI.prototype via PlannerUI.js.
 *
 * Responsibilities:
 *  - showWaypointDetail: renders the full waypoint detail form in the
 *    desktop sidebar detail panel (altitude, speed, POI, heading, actions)
 *  - showPOIDetail: renders the POI detail form (name, altitude, HAG)
 *  - showBulkWaypointDetail: renders the bulk-edit summary panel when
 *    multiple waypoints are selected
 *  - showNothingSelected: resets the detail panel to the placeholder state
 */
// PlannerUIDetail.js
// Mixed into PlannerUI.prototype in PlannerUI.js

const PlannerUIDetail = {
/**
 * Show waypoint detail.
 *
 * @param {Object} options - Named options object.
 *
 * @returns {string}
 */
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
},

/**
 * Show p o i detail.
 *
 * @param {Object} options - Named options object.
 */
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
},

/**
 * Show bulk waypoint detail.
 *
 * @param {Object} options - Named options object.
 *
 * @returns {string}
 */
showBulkWaypointDetail({ selectedCount, pois, onApply, onApplyAll, onClearSelection, targetElement = null }) {
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
      <button id="bulk_apply_all" class="ghost">Apply all</button>
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

  detailTarget.querySelector('#bulk_apply_all').addEventListener('click', () => {
    onApplyAll({
      altitudeValue: detailTarget.querySelector('#bulk_alt').value,
      speedValue: detailTarget.querySelector('#bulk_speed').value,
      poiValue: detailTarget.querySelector('#bulk_poi').value
    });
  });

  detailTarget.querySelector('#bulk_clear').addEventListener('click', () => {
    onClearSelection();
  });
}

};
