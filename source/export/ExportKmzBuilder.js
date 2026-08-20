/**
 * ExportKmzBuilder.js  —  ExportKmz mixin: KMZ/WPML XML construction
 * Mixed into ExportKmz.prototype via ExportKmz.js.
 *
 * Responsibilities:
 *  - _buildKmzZip: constructs the full DJI WPML KMZ zip archive including
 *    wpmz/template.kml and wpmz/waylines.wpml from a waypoint array.
 *    Handles heading modes, gimbal pitch, speed, finish/RC-lost actions,
 *    gimbalEvenlyRotate segments, user waypoint actions, and POI headings.
 *  Calls this._esc() and this._buildUserActionXml() from ExportKmzShare.
 */
// ExportKmzBuilder.js
// Mixed into ExportKmz.prototype

const ExportKmzBuilder = {

/**
 * Constructs the full WPML KMZ zip archive from a waypoint array.
 *
 * @param {Object} options - Named options object.
 *
 * @returns {number}
 */
_buildKmzZip({ waypoints, missionName, finishAction, rcLostAction, headingMode, defaultSpeed, droneConfig = null }) {
  if (waypoints.length < 1) {
    this.onError('Add at least one waypoint before exporting.');
    return null;
  }

  const name      = missionName;
  const finish    = finishAction;
  const rcLost    = rcLostAction || 'goContinue';
  const hdgMode   = headingMode;
  const now       = Date.now();
  const lastIndex = waypoints.length - 1;
  const droneEnumValue = Number.isInteger(droneConfig && droneConfig.droneEnumValue)
    ? droneConfig.droneEnumValue
    : 68;
  const droneSubEnumValue = Number.isInteger(droneConfig && droneConfig.droneSubEnumValue)
    ? droneConfig.droneSubEnumValue
    : 0;

  // FIX 3: globalTransitionalSpeed must be >= every waypointSpeed.
  // Also guard against invalid values so NaN is never emitted into KMZ.
  const parsedDefaultSpeed = Number(defaultSpeed);
  const safeDefaultSpeed = Number.isFinite(parsedDefaultSpeed) && parsedDefaultSpeed > 0
    ? parsedDefaultSpeed
    : 8;
  const maxWpSpeed = waypoints.reduce((m, wp) => {
    const speed = Number(wp.speed);
    return Number.isFinite(speed) && speed > 0 ? Math.max(m, speed) : m;
  }, 0);
  const globalSpeed = Math.max(safeDefaultSpeed, maxWpSpeed);
  const normalizeAngle = deg => {
    const n = ((deg % 360) + 360) % 360;
    return n > 180 ? n - 360 : n;
  };

  const NS = 'http://www.dji.com/wpmz/1.0.6';

  const missionConfig = `
  <wpml:missionConfig>
    <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
    <wpml:finishAction>${finish}</wpml:finishAction>
    <wpml:exitOnRCLost>goContinue</wpml:exitOnRCLost>
    <wpml:executeRCLostAction>${rcLost}</wpml:executeRCLostAction>
    <wpml:globalTransitionalSpeed>${globalSpeed}</wpml:globalTransitionalSpeed>
    <wpml:globalGimbalPitchMode>usePointSetting</wpml:globalGimbalPitchMode>
    <wpml:droneInfo>
      <wpml:droneEnumValue>${droneEnumValue}</wpml:droneEnumValue>
      <wpml:droneSubEnumValue>${droneSubEnumValue}</wpml:droneSubEnumValue>
    </wpml:droneInfo>
  </wpml:missionConfig>`;

  const templateKml =
`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="${NS}">
<Document>
  <wpml:author>DJI Planner Web</wpml:author>
  <wpml:createTime>${now}</wpml:createTime>
  <wpml:updateTime>${now}</wpml:updateTime>
  ${missionConfig}
</Document>
</kml>`;

  // ── Wayline action groups — 0-based running counter ─────────────────────
  let grpId = 0;   // actionGroupId — unique across the whole wayline

  const wpmlPlacemarks = waypoints.map((wp, i) => {
    const isFirst = i === 0;
    const isLast  = i === lastIndex;
    const usePOI  = !!wp.poiId;

    // ── Heading ─────────────────────────────────────────────────────────
    const hdgAngle  = normalizeAngle(usePOI ? wp.heading : 0).toFixed(6);
    const hdgModeWP = usePOI ? 'smoothTransition' : hdgMode;
    const hdgEnable = (isFirst || isLast) ? '1' : '0';

    // ── Turn mode ────────────────────────────────────────────────────────
    const turnMode = (isFirst || isLast)
      ? 'toPointAndStopWithContinuityCurvature'
      : 'toPointAndPassWithContinuityCurvature';

    // ── Gimbal pitches ───────────────────────────────────────────────────
    const gimbalPitch = (usePOI && wp.gimbalPitch != null)
      ? Number(wp.gimbalPitch).toFixed(2) : '0';
    const nextWp = !isLast ? waypoints[i + 1] : null;
    const nextUsePOI = !!(nextWp && nextWp.poiId);
    const nextGimbalPitch = (nextUsePOI && nextWp.gimbalPitch != null)
      ? Number(nextWp.gimbalPitch).toFixed(2) : '0';

    // ── Group A: gimbalRotate snap — WP0 only ────────────────────────────
    let snapGroup = '';
    if (isFirst) {
      const gid = grpId++;
      snapGroup = `
      <wpml:actionGroup>
        <wpml:actionGroupId>${gid}</wpml:actionGroupId>
        <wpml:actionGroupStartIndex>0</wpml:actionGroupStartIndex>
        <wpml:actionGroupEndIndex>0</wpml:actionGroupEndIndex>
        <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
        <wpml:actionTrigger>
          <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
        </wpml:actionTrigger>
        <wpml:action>
          <wpml:actionId>0</wpml:actionId>
          <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam>
            <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            <wpml:gimbalHeadingYawBase>north</wpml:gimbalHeadingYawBase>
            <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
            <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
            <wpml:gimbalPitchRotateAngle>${gimbalPitch}</wpml:gimbalPitchRotateAngle>
            <wpml:gimbalRollRotateEnable>1</wpml:gimbalRollRotateEnable>
            <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
            <wpml:gimbalYawRotateEnable>1</wpml:gimbalYawRotateEnable>
            <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
            <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
            <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
          </wpml:actionActuatorFuncParam>
        </wpml:action>
      </wpml:actionGroup>`;
    }

    // ── Group B: gimbalEvenlyRotate — all waypoints except last ──────────
    // Trigger: betweenAdjacentPoints, explicit span [i, i+1].
    // Segment i -> i+1 should end at waypoint(i+1) pitch.
    let evenGroup = '';
    if (!isLast) {
      const gid = grpId++;
      evenGroup = `
      <wpml:actionGroup>
        <wpml:actionGroupId>${gid}</wpml:actionGroupId>
        <wpml:actionGroupStartIndex>${i}</wpml:actionGroupStartIndex>
        <wpml:actionGroupEndIndex>${i + 1}</wpml:actionGroupEndIndex>
        <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
        <wpml:actionTrigger>
          <wpml:actionTriggerType>betweenAdjacentPoints</wpml:actionTriggerType>
        </wpml:actionTrigger>
        <wpml:action>
          <wpml:actionId>0</wpml:actionId>
          <wpml:actionActuatorFunc>gimbalEvenlyRotate</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam>
            <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            <wpml:gimbalPitchRotateAngle>${nextGimbalPitch}</wpml:gimbalPitchRotateAngle>
          </wpml:actionActuatorFuncParam>
        </wpml:action>
      </wpml:actionGroup>`;
    }

    // ── Group C: user-defined actions — sequence on arrival ───────────────
    let userGroup = '';
    const userActions = Array.isArray(wp.actions)
      ? wp.actions.filter(a => a && a.type)
      : [];
    if (userActions.length > 0) {
      const gid = grpId++;
      const actionXml = userActions.map((a, j) =>
        this._buildUserActionXml(a, j)
      ).filter(Boolean).join('');
      if (actionXml) {
        userGroup = `
      <wpml:actionGroup>
        <wpml:actionGroupId>${gid}</wpml:actionGroupId>
        <wpml:actionGroupStartIndex>${i}</wpml:actionGroupStartIndex>
        <wpml:actionGroupEndIndex>${i}</wpml:actionGroupEndIndex>
        <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
        <wpml:actionTrigger>
          <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
        </wpml:actionTrigger>
        ${actionXml}
      </wpml:actionGroup>`;
      }
    }

    return `
    <Placemark>
      <Point>
        <coordinates>
          ${wp.lng},${wp.lat}
        </coordinates>
      </Point>
      <wpml:index>${i}</wpml:index>
      <wpml:executeHeight>${wp.alt}</wpml:executeHeight>
      <wpml:waypointSpeed>${wp.speed}</wpml:waypointSpeed>
      <wpml:waypointHeadingParam>
        <wpml:waypointHeadingMode>${hdgModeWP}</wpml:waypointHeadingMode>
        <wpml:waypointHeadingAngle>${hdgAngle}</wpml:waypointHeadingAngle>
        <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
        <wpml:waypointHeadingAngleEnable>${hdgEnable}</wpml:waypointHeadingAngleEnable>
        <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
        <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
      </wpml:waypointHeadingParam>
      <wpml:waypointTurnParam>
        <wpml:waypointTurnMode>${turnMode}</wpml:waypointTurnMode>
        <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
      </wpml:waypointTurnParam>
      <wpml:useStraightLine>0</wpml:useStraightLine>
      ${snapGroup}
      ${evenGroup}
      ${userGroup}
      <wpml:waypointGimbalHeadingParam>
        <wpml:waypointGimbalPitchAngle>0</wpml:waypointGimbalPitchAngle>
        <wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle>
      </wpml:waypointGimbalHeadingParam>
    </Placemark>`;
  }).join('');

  const wpml =
`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="${NS}">
<Document>
  ${missionConfig}
  <Folder>
    <wpml:templateId>0</wpml:templateId>
    <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
    <wpml:waylineId>0</wpml:waylineId>
    <wpml:distance>0</wpml:distance>
    <wpml:duration>0</wpml:duration>
    <wpml:autoFlightSpeed>${safeDefaultSpeed}</wpml:autoFlightSpeed>
    ${wpmlPlacemarks}
  </Folder>
</Document>
</kml>`;

  const zip = new JSZip();
  const wpmz = zip.folder('wpmz');
  wpmz.file('template.kml', templateKml);
  wpmz.file('waylines.wpml', wpml);
  const filename = name.replace(/\s+/g, '_') + '.kmz';
  return { zip, filename };

}
};
