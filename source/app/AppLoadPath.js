/**
 * AppLoadPath.js  —  App mixin: mission folder path display helpers
 * Mixed into App.prototype via App.js.
 *
 * Responsibilities:
 *  - getMissionFolderPath / normalizeCloudDisplayPath
 *  - getLoadedMissionDisplayPath: builds a human-readable path string
 *    shown in the load dialog header
 *  - getLoadedMissionDisplayPathForPicker: path text for the file picker context
 *  - getLoadPickerContextText / getLoadPickerContextSuffix
 *  All methods are pure display-string formatters with no side effects.
 */
// AppLoadPath.js
// Mixed into App.prototype in App.js

const AppLoadPath = {
getMissionFolderPath(path, rootLabel) {
  const normalizedPath = String(path || '').replace(/\\/g, '/');
  const normalizedRoot = String(rootLabel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const prefix = normalizedRoot ? `${normalizedRoot}/` : '';
  const relative = prefix && normalizedPath.startsWith(prefix)
    ? normalizedPath.slice(prefix.length)
    : normalizedPath;
  const parts = relative.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
},

normalizeCloudDisplayPath(pathValue) {
  const normalized = String(pathValue || '').replace(/\\/g, '/').trim();
  if (!normalized) {
    return '';
  }

  const iCloudPatterns = [
    /^\/Users\/[^/]+\/Library\/Mobile Documents\/com~apple~CloudDocs\/?(.*)$/i,
    /^\/Users\/[^/]+\/Library\/Mobile Documents\/comappleCloudDocs\/?(.*)$/i,
    /^\/Users\/[^/]+\/Library\/Mobile Documents\/com\.apple\.CloudDocs\/?(.*)$/i
  ];

  for (const pattern of iCloudPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const suffix = String(match[1] || '').replace(/^\/+|\/+$/g, '');
      return suffix ? `iCloud/${suffix}` : 'iCloud';
    }
  }

  const cloudStorageMatch = normalized.match(/^\/Users\/[^/]+\/Library\/CloudStorage\/([^/]+)\/?(.*)$/i);
  if (cloudStorageMatch) {
    const volumeName = String(cloudStorageMatch[1] || '');
    const suffix = String(cloudStorageMatch[2] || '').replace(/^\/+|\/+$/g, '');
    const lowerVolume = volumeName.toLowerCase();

    let providerLabel = volumeName;
    if (lowerVolume.startsWith('googledrive')) {
      providerLabel = 'Google Drive';
    } else if (lowerVolume.startsWith('onedrive')) {
      providerLabel = 'OneDrive';
    }

    return suffix ? `${providerLabel}/${suffix}` : providerLabel;
  }

  return normalized;
},

getLoadedMissionDisplayPath(path, rootLabel) {
  const normalizedPath = this.normalizeCloudDisplayPath(path).replace(/^\/+/, '');
  const normalizedRoot = this.normalizeCloudDisplayPath(rootLabel).replace(/^\/+|\/+$/g, '');
  if (!normalizedRoot) {
    return normalizedPath || 'mission.json';
  }

  if (!normalizedPath) {
    return normalizedRoot;
  }

  if (normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath;
  }

  return `${normalizedRoot}/${normalizedPath}`;
},

getLoadedMissionDisplayPathForPicker(selected, fallbackPath, debugContext = null) {
  const loadedPath = String(fallbackPath || selected?.path || selected?.name || 'mission.json');
  const rootLabel = this.normalizeCloudDisplayPath(selected?.rootLabel || selected?.startRootLabel || '');
  const directoryPath = String(selected?.directoryPath || selected?.startDirectoryPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  const fileName = String(selected?.name || loadedPath.split('/').pop() || 'mission.json');

  if (rootLabel && directoryPath) {
    return `${rootLabel}/${directoryPath}/${fileName}`;
  }

  if (rootLabel) {
    return this.getLoadedMissionDisplayPath(loadedPath, rootLabel);
  }

  const savedLocation = debugContext && debugContext.savedLocation && typeof debugContext.savedLocation === 'object'
    ? debugContext.savedLocation
    : null;
  const savedRoot = savedLocation && savedLocation.rootLabel
    ? this.normalizeCloudDisplayPath(savedLocation.rootLabel)
    : '';
  const savedFolder = savedLocation && savedLocation.folderPath
    ? String(savedLocation.folderPath).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    : '';

  if (savedRoot && savedFolder) {
    return `${savedRoot}/${savedFolder}/${fileName}`;
  }

  if (savedRoot) {
    return this.getLoadedMissionDisplayPath(loadedPath, savedRoot);
  }

  return loadedPath;
},

getLoadPickerContextText(debugContext) {
  if (!debugContext || typeof debugContext !== 'object') {
    return '';
  }

  const handles = debugContext.handles && typeof debugContext.handles === 'object'
    ? debugContext.handles
    : {};
  const savedLocation = debugContext.savedLocation && typeof debugContext.savedLocation === 'object'
    ? debugContext.savedLocation
    : {};

  const rootLabelRaw = handles.lastLoadedRootHandleName
    || handles.preferredRootHandleName
    || savedLocation.rootLabel
    || handles.currentRootHandleName
    || 'unknown root';
  const rootLabel = this.normalizeCloudDisplayPath(rootLabelRaw);
  const folderPath = savedLocation.folderPath || '/';
  const lastFileName = handles.lastLoadedFileHandleName || 'none';

  return `${rootLabel} | ${folderPath} | last file: ${lastFileName}`;
},

getLoadPickerContextSuffix(selected, debugContext = null) {
  const source = selected && selected.startInSource ? String(selected.startInSource) : 'unknown';
  const selectedRoot = this.normalizeCloudDisplayPath(selected?.rootLabel || selected?.startRootLabel || '');
  const selectedFolder = String(selected?.directoryPath || selected?.startDirectoryPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  const relativePath = String(selected?.path || selected?.name || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');

  const savedLocation = debugContext && debugContext.savedLocation && typeof debugContext.savedLocation === 'object'
    ? debugContext.savedLocation
    : null;
  const handles = debugContext && debugContext.handles && typeof debugContext.handles === 'object'
    ? debugContext.handles
    : {};

  const savedRoot = savedLocation && savedLocation.rootLabel
    ? this.normalizeCloudDisplayPath(savedLocation.rootLabel)
    : '';
  const savedFolder = savedLocation && savedLocation.folderPath
    ? String(savedLocation.folderPath).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    : '';
  const handleRoot = this.normalizeCloudDisplayPath(
    handles.lastLoadedRootHandleName || handles.preferredRootHandleName || handles.currentRootHandleName || ''
  );
  const lastFileName = String(handles.lastLoadedFileHandleName || selected?.name || '').trim();

  const root = selectedRoot || savedRoot || handleRoot;
  const folder = selectedFolder || savedFolder;

  const parts = [`picker=${source}`];
  if (root) {
    parts.push(`root=${root}`);
  }
  if (folder) {
    parts.push(`folder=${folder}`);
  }
  if (relativePath) {
    parts.push(`relative=${relativePath}`);
  }
  if (lastFileName) {
    parts.push(`file=${lastFileName}`);
  }

  return ` [${parts.join(' | ')}]`;
}

};
