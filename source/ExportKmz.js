class ExportKmz {
  constructor(options) {
    this.onStatus = options.onStatus || null;
    this.onError = options.onError || (message => alert(message));
  }

  export({ waypoints, missionName, finishAction, rcLostAction, headingMode, defaultSpeed }) {
    if (waypoints.length < 1) {
      this.onError('Add at least one waypoint before exporting.');
      return;
    }

    const name = missionName;
    const finish = finishAction;
    const rcLost = rcLostAction || 'goContinue';
    const hdgMode = headingMode;
    const now = Date.now();
    const spd = defaultSpeed;
    const lastIndex = waypoints.length - 1;

    const NS = 'http://www.uav.com/wpmz/1.0.2';

    const missionConfig = `
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>${finish}</wpml:finishAction>
      <wpml:exitOnRCLost>goContinue</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>${rcLost}</wpml:executeRCLostAction>
      <wpml:globalTransitionalSpeed>${spd}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>68</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
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

    // Action group IDs must be globally unique across all waypoints.
    // Dronelink uses two action groups per waypoint:
    //   Group A (snapId)  — gimbalRotate:      snaps gimbal to THIS waypoint's pitch on arrival
    //   Group B (evenId)  — gimbalEvenlyRotate: smoothly transitions gimbal pitch from THIS
    //                        waypoint TO the next one during transit. Spans [i, i+1].
    //                        Omitted on the last waypoint (no next segment to traverse).
    let nextActionGroupId = 1;

    const wpmlPlacemarks = waypoints.map((wp, i) => {
      const isFirst = i === 0;
      const isLast  = i === lastIndex;
      const usePOI  = !!wp.poiId;

      // ── Heading ──────────────────────────────────────────────────────────
      // headingAngleEnable=1 only at waypoints with an explicit heading (POI,
      // first WP, last WP). Transit waypoints let the drone interpolate freely.
      const hdgAngle  = usePOI ? wp.heading.toFixed(6) : '0';
      const hdgModeWP = usePOI ? 'smoothTransition' : hdgMode;
      const hdgEnable = (usePOI || isFirst || isLast) ? '1' : '0';

      // ── Turn mode ────────────────────────────────────────────────────────
      // Stop at first and last waypoint; fly-through (pass) all others.
      const turnMode = (isFirst || isLast)
        ? 'toPointAndStopWithContinuityCurvature'
        : 'toPointAndPassWithContinuityCurvature';

      // ── Gimbal pitch ─────────────────────────────────────────────────────
      const gimbalPitch     = usePOI ? wp.gimbalPitch.toFixed(2) : '0';
      const snapGimbalPitch = isFirst ? '0' : gimbalPitch;
      const nextWp          = !isLast ? waypoints[i + 1] : null;
      const nextGimbalPitch = nextWp
        ? (nextWp.poiId ? nextWp.gimbalPitch.toFixed(2) : '0')
        : gimbalPitch;

      // ── Action group A: gimbalRotate — only on the first waypoint ──────
      let snapAction = '';
      if (isFirst) {
        const snapId = nextActionGroupId++;
        snapAction = `
        <wpml:actionGroup>
          <wpml:actionGroupId>${snapId}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${i}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${i}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>${snapId}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>${snapGimbalPitch}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>`;
      }

      // ── Action group B: gimbalEvenlyRotate — smooth transit to next WP ───
      // Spans from this waypoint index to the next. Omitted on last waypoint.
      let evenAction = '';
      if (!isLast) {
        const evenId = nextActionGroupId++;
        evenAction = `
        <wpml:actionGroup>
          <wpml:actionGroupId>${evenId}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${i}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${i + 1}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>${evenId}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalEvenlyRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalPitchRotateAngle>${nextGimbalPitch}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>`;
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
        ${snapAction}
        ${evenAction}
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
      <wpml:autoFlightSpeed>${spd}</wpml:autoFlightSpeed>
      ${wpmlPlacemarks}
    </Folder>
  </Document>
</kml>`;

    const zip = new JSZip();
    const wpmz = zip.folder('wpmz');
    wpmz.file('template.kml', templateKml);
    wpmz.file('waylines.wpml', wpml);

    zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name.replace(/\s+/g, '_') + '.kmz';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (this.onStatus) {
        this.onStatus(`Exported: ${name}.kmz  (${waypoints.length} WPs)`);
      }
    });
  }
}
