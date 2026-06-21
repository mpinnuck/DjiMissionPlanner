/**
 * ExportKmzShare.js  —  ExportKmz mixin: share, download, and export API
 * Mixed into ExportKmz.prototype via ExportKmz.js.
 *
 * Responsibilities:
 *  - _shareOrDownloadBlob: delivers the KMZ blob via Share Sheet (iOS/mobile)
 *    or filesystem write (desktop with folder handle) or browser download
 *  - export(params): builds KMZ and shares/downloads to the saved folder
 *  - exportAs(params): shows showSaveFilePicker then writes the KMZ file
 *  - _buildUserActionXml: generates WPML action XML for a single waypoint action
 *  - _esc: XML-escapes a string value
 */
// ExportKmzShare.js
// Mixed into ExportKmz.prototype

const ExportKmzShare = {
/**
 * Delivers a KMZ blob via Share Sheet, filesystem write, or browser download.
 *
 * @param {*} blob
 * @param {string} filename
 * @param {number} waypointCount
 *
 * @returns {Promise<void>}
 */
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
        files: [kmzFile]
      });
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
},

/**
 * Builds and delivers a KMZ file to the saved export folder or Share Sheet.
 *
 * @param {Object} params
 */
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
},

/**
 * Shows a save file picker then writes the KMZ to the chosen location.
 *
 * @param {Object} params
 */
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
},

/**
 * Generates the WPML XML block for a single waypoint action.
 *
 * @param {*} action
 * @param {string} actionId
 */
_buildUserActionXml(action, actionId) {
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
},

/**
 * XML-escapes a string value for safe embedding in WPML XML attributes.
 *
 * @param {string} s
 *
 * @returns {string}
 */
_esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

};
