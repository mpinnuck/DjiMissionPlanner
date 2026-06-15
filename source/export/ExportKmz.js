class ExportKmz {
  constructor(options) {
    this.onStatus = options.onStatus || null;
    this.onExported = options.onExported || null;
    this.onError = options.onError || (message => alert(message));
    this.folderHandleKey = 'djiMissionPlanner:exportFolderHandle';
    this.folderHandleStoreName = 'djiMissionPlannerFsHandles';
    this.folderHandleStore = 'handles';
    this.folderHandleDbKey = 'exportFolderHandle';
    this.folderHandle = null;
    this.folderHandleRestorePromise = this.loadFolderHandle();
  }

  // Public methods

  async openHandleDatabase() {
    if (typeof indexedDB === 'undefined') {
      return null;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.folderHandleStoreName, 1);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.folderHandleStore)) {
          db.createObjectStore(this.folderHandleStore);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to open export handle database.'));
    });
  }

  async persistFolderHandle(handle) {
    if (!handle) {
      return;
    }

    const db = await this.openHandleDatabase();
    if (!db) {
      return;
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction(this.folderHandleStore, 'readwrite');
      tx.objectStore(this.folderHandleStore).put(handle, this.folderHandleDbKey);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Failed to persist export folder.'));
    });
    db.close();
  }

  async restoreFolderHandle() {
    const db = await this.openHandleDatabase();
    if (!db) {
      return null;
    }

    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(this.folderHandleStore, 'readonly');
      const request = tx.objectStore(this.folderHandleStore).get(this.folderHandleDbKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Failed to read saved export folder.'));
    });
    db.close();
    return handle;
  }

  async clearPersistedFolderHandle() {
    const db = await this.openHandleDatabase();
    if (!db) {
      return;
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction(this.folderHandleStore, 'readwrite');
      tx.objectStore(this.folderHandleStore).delete(this.folderHandleDbKey);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Failed to clear saved export folder.'));
    });
    db.close();
  }

  async loadFolderHandle() {
    try {
      this.folderHandle = await this.restoreFolderHandle();
    } catch (error) {
      this.folderHandle = null;
    }

    return this.folderHandle;
  }

  async ensurePermission(handle) {
    const options = { mode: 'readwrite' };
    if (typeof handle?.queryPermission === 'function') {
      const queried = await handle.queryPermission(options);
      if (queried === 'granted') {
        return true;
      }
    }
    if (typeof handle?.requestPermission === 'function') {
      const requested = await handle.requestPermission(options);
      return requested === 'granted';
    }
    return !!handle;
  }

  hasSavedFolder() {
    return !!this.folderHandle || localStorage.getItem(this.folderHandleKey) !== null;
  }

  canChooseFolder() {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
  }

  async promptForFolder() {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const permissionGranted = await this.ensurePermission(dirHandle);
      if (!permissionGranted) {
        return null;
      }

      await this.persistFolderHandle(dirHandle);
      localStorage.setItem(this.folderHandleKey, 'true');
      this.folderHandle = dirHandle;
      return dirHandle;
    } catch (err) {
      if (err.name !== 'AbortError') {
        this.onError(`Failed to access folder: ${err.message}`);
      }
      return null;
    }
  }

  async clearSavedFolder() {
    localStorage.removeItem(this.folderHandleKey);
    this.folderHandle = null;
    try {
      await this.clearPersistedFolderHandle();
    } catch (error) {
      // Ignore IndexedDB cleanup failures and continue.
    }
  }

  async getExportFolder() {
    if (this.folderHandleRestorePromise) {
      await this.folderHandleRestorePromise;
      this.folderHandleRestorePromise = null;
    }

    if (this.folderHandle) {
      try {
        const granted = await this.ensurePermission(this.folderHandle);
        if (granted) {
          return this.folderHandle;
        }
      } catch (err) {
        this.folderHandle = null;
      }
    }

    if (!this.hasSavedFolder()) {
      return await this.promptForFolder();
    }

    await this.clearSavedFolder();
    return await this.promptForFolder();
  }

  async getSavedExportFolder() {
    if (this.folderHandleRestorePromise) {
      await this.folderHandleRestorePromise;
      this.folderHandleRestorePromise = null;
    }

    const hadSavedMarker = localStorage.getItem(this.folderHandleKey) !== null;
    if (!this.folderHandle && !hadSavedMarker) {
      return null;
    }

    if (!this.folderHandle && hadSavedMarker) {
      await this.clearSavedFolder();
      return null;
    }

    try {
      const granted = await this.ensurePermission(this.folderHandle);
      if (granted) {
        return this.folderHandle;
      }
    } catch (err) {
      // Ignore and clear stale handles below.
    }

    await this.clearSavedFolder();
    return null;
  }

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
      const nextWp          = !isLast ? waypoints[i + 1] : null;
      const nextGimbalPitch = nextWp
        ? (nextWp.poiId && nextWp.gimbalPitch != null
            ? Number(nextWp.gimbalPitch).toFixed(2) : '0')
        : gimbalPitch;

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
      // Trigger: betweenAdjacentPoints, span [i, i] (Dronelink pattern)
      let evenGroup = '';
      if (!isLast) {
        const gid = grpId++;
        evenGroup = `
        <wpml:actionGroup>
          <wpml:actionGroupId>${gid}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${i}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${i}</wpml:actionGroupEndIndex>
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
          ExportKmz._buildUserActionXml(a, j)
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

  async _shareOrDownloadBlob(blob, filename, waypointCount) {
    const kmzFile = new File([blob], filename, { type: 'application/vnd.google-earth.kmz' });
    let canShareFile = false;
    try {
      canShareFile = typeof navigator !== 'undefined'
        && typeof navigator.share === 'function'
        && typeof navigator.canShare === 'function'
        && navigator.canShare({ files: [kmzFile] });
    } catch (shareCheckError) {
      console.warn('navigator.canShare check failed, falling back to download flow:', shareCheckError);
    }

    if (canShareFile) {
      try {
        await navigator.share({
          files: [kmzFile],
          title: filename,
          text: 'KMZ generated locally on this device.'
        });
        if (this.onExported) {
          this.onExported(`${filename} exported via Share Sheet`);
        }
        if (this.onStatus) {
          this.onStatus(`KMZ ready on this device via Share Sheet: ${filename} (${waypointCount} WPs)`);
        }
        return;
      } catch (shareErr) {
        if (shareErr && shareErr.name === 'AbortError') {
          return;
        }
        console.warn('Share failed, falling back to browser download:', shareErr);
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (this.onExported) {
      this.onExported(`${filename} exported via browser download`);
    }
    if (this.onStatus) {
      this.onStatus(`Browser download started (generated locally on this device): ${filename} (${waypointCount} WPs)`);
    }
  }

  export(params) {
    const built = this._buildKmzZip(params);
    if (!built) return;
    const { zip, filename } = built;
    const { waypoints } = params;

    zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(async blob => {
      try {
        const dirHandle = await this.getSavedExportFolder();
        if (dirHandle) {
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();

          const folderName = dirHandle.name || 'selected folder';
          const successMessage = `${filename} exported to folder ${folderName}`;
          if (this.onExported) {
            this.onExported(successMessage);
          }
          if (this.onStatus) {
            this.onStatus(successMessage);
          }
          return;
        }
      } catch (err) {
        console.warn('Folder save failed, falling back to download:', err);
      }

      await this._shareOrDownloadBlob(blob, filename, waypoints.length);
    });
  }

  exportAs(params) {
    const built = this._buildKmzZip(params);
    if (!built) return;
    const { zip, filename } = built;
    const { waypoints } = params;

    zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(async blob => {
      if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
        try {
          const fileHandle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'KMZ Mission File', accept: { 'application/vnd.google-earth.kmz': ['.kmz'] } }]
          });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          const successMessage = `${filename} saved`;
          if (this.onExported) {
            this.onExported(successMessage);
          }
          if (this.onStatus) {
            this.onStatus(`${successMessage} (${waypoints.length} WPs)`);
          }
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.warn('showSaveFilePicker failed, falling back:', err);
        }
      }

      await this._shareOrDownloadBlob(blob, filename, waypoints.length);
    });
  }

  static _buildUserActionXml(action, actionId) {
    const p = action.params || {};
    let param = '';

    switch (action.type) {
      case 'takePhoto':
        param = `
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
              <wpml:fileSuffix>${ExportKmz._esc(p.fileSuffix || '')}</wpml:fileSuffix>
              <wpml:useGlobalPayloadLensIndex>0</wpml:useGlobalPayloadLensIndex>`;
        break;

      case 'startRecord':
        param = `
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
              <wpml:fileSuffix/>
              <wpml:useGlobalPayloadLensIndex>0</wpml:useGlobalPayloadLensIndex>`;
        break;

      case 'stopRecord':
        param = `
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>`;
        break;

      case 'hover':
        param = `
              <wpml:hoverTime>${Math.max(1, Math.round(Number(p.hoverTime) || 1))}</wpml:hoverTime>`;
        break;

      case 'gimbalRotate':
        param = `
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
              <wpml:gimbalHeadingYawBase>north</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>${p.rotateMode || 'absoluteAngle'}</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>${Number(p.pitch || 0).toFixed(1)}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>1</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>1</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>`;
        break;

      case 'rotateYaw': {
        const hdg = Number(p.heading || 0);
        const norm = ((hdg % 360) + 360) % 360;
        const clamped = norm > 180 ? norm - 360 : norm;
        param = `
              <wpml:aircraftHeading>${clamped.toFixed(1)}</wpml:aircraftHeading>
              <wpml:aircraftPathMode>${p.turnDir || 'clockwise'}</wpml:aircraftPathMode>`;
        break;
      }

      case 'zoom':
        param = `
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
              <wpml:focalLength>${Math.max(1, Math.round(Number(p.focalLength) || 24))}</wpml:focalLength>`;
        break;

      case 'focus':
        param = `
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
              <wpml:isPointFocus>0</wpml:isPointFocus>
              <wpml:focusX>0.5</wpml:focusX>
              <wpml:focusY>0.5</wpml:focusY>
              <wpml:focusRegionWidth>1</wpml:focusRegionWidth>
              <wpml:focusRegionHeight>1</wpml:focusRegionHeight>
              <wpml:isInfiniteFocus>${p.isInfiniteFocus ? 1 : 0}</wpml:isInfiniteFocus>`;
        break;

      case 'panoShot':
        param = `
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
              <wpml:useGlobalPayloadLensIndex>0</wpml:useGlobalPayloadLensIndex>
              <wpml:panoShotSubMode>${p.panoShotSubMode || 'panoShot_360'}</wpml:panoShotSubMode>`;
        break;

      default:
        return '';
    }

    return `
          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>${action.type}</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>${param}
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
  }

  static _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
