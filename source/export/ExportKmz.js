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

    const NS = 'http://www.uav.com/wpmz/1.0.2';

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

    // FIX 1: actionGroupId pattern must match Dronelink exactly:
    //
    //   Group 1  — gimbalRotate on WP0 only (snap to initial pitch)
    //              actionGroupId=1, actionId=1, span [0→0]
    //
    //   Group 2  — gimbalEvenlyRotate on WP0..WP(N-2), actionGroupId=2 CONSTANT
    //              actionId increments from 2 upward (unique per action instance)
    //              span [i→i+1] per waypoint
    //
    //   WP(last) — NO action groups at all
    //
    // Using a unique incrementing actionGroupId for every group (previous approach)
    // causes DJI Fly to reject the mission.
    //
    // FIX 2: lastAction (gimbalRotate on last waypoint) removed entirely.
    // Dronelink's last waypoint has zero action groups.

    let evenlyActionId = 2; // actionId counter for gimbalEvenlyRotate instances

    const wpmlPlacemarks = waypoints.map((wp, i) => {
      const isFirst = i === 0;
      const isLast  = i === lastIndex;
      const usePOI  = !!wp.poiId;

      // ── Heading ──────────────────────────────────────────────────────────
      const hdgAngle  = normalizeAngle(usePOI ? wp.heading : 0).toFixed(6);
      const hdgModeWP = usePOI ? 'smoothTransition' : hdgMode;
      const hdgEnable = (isFirst || isLast) ? '1' : '0';

      // ── Turn mode ─────────────────────────────────────────────────────────
      const turnMode = (isFirst || isLast)
        ? 'toPointAndStopWithContinuityCurvature'
        : 'toPointAndPassWithContinuityCurvature';

      // ── Gimbal pitches ────────────────────────────────────────────────────
      const gimbalPitch = (usePOI && wp.gimbalPitch != null)
        ? Number(wp.gimbalPitch).toFixed(2)
        : '0';

      // FIX 4: gimbalEvenlyRotate targets the NEXT waypoint's pitch, not the
      // current one. It is a transition — the drone interpolates FROM the current
      // pitch TO the next waypoint's pitch during the transit segment.
      const nextWp          = !isLast ? waypoints[i + 1] : null;
      const nextGimbalPitch = nextWp
        ? (nextWp.poiId && nextWp.gimbalPitch != null ? Number(nextWp.gimbalPitch).toFixed(2) : '0')
        : gimbalPitch;

      // ── Action group 1: gimbalRotate snap — WP0 only ──────────────────────
      let snapAction = '';
      if (isFirst) {
        snapAction = `
        <wpml:actionGroup>
          <wpml:actionGroupId>1</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>0</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>0</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>1</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>${gimbalPitch}</wpml:gimbalPitchRotateAngle>
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

      // ── Action group 2: gimbalEvenlyRotate — all waypoints except last ─────
      // actionGroupId is always 2. actionId increments across the mission.
      let evenAction = '';
      if (!isLast) {
        const myActionId = evenlyActionId++;
        evenAction = `
        <wpml:actionGroup>
          <wpml:actionGroupId>2</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${i}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${i + 1}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>${myActionId}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalEvenlyRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalPitchRotateAngle>${nextGimbalPitch}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>`;
      }
      // Last waypoint: no action groups — covered by preceding gimbalEvenlyRotate.

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
}
