// PlannerUILoadTree.js
// Mixed into PlannerUI.prototype in PlannerUI.js

const PlannerUILoadTree = {
showMissionLoadDialog({ rootLabel, nodes, initialExpandedPath, onCancel, onSelectFile, onDeleteFile, onRefresh, onChooseFolder, onOpenFromFiles }) {
  this.closeMissionLoadDialog();
  const expandedSegments = typeof initialExpandedPath === 'string' && initialExpandedPath.trim()
    ? initialExpandedPath.split('/').filter(Boolean)
    : [];
  const expandedFolderKeys = new Set();
  const normalizedRootLabel = String(rootLabel || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  if (expandedSegments.length) {
    let folderPath = '';
    expandedSegments.forEach(segment => {
      folderPath = folderPath ? `${folderPath}/${segment}` : segment;
      expandedFolderKeys.add(folderPath);
      if (normalizedRootLabel) {
        expandedFolderKeys.add(`${normalizedRootLabel}/${folderPath}`);
      }
    });
  }

  let searchTerm = '';

  const countFiles = list => list.reduce((total, node) => {
    if (node.type === 'file') {
      return total + 1;
    }
    const children = Array.isArray(node.children) ? node.children : [];
    return total + countFiles(children);
  }, 0);

  const totalMissionCount = countFiles(nodes);

  const filterNodes = (list, term) => {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) {
      return list;
    }

    const filtered = [];
    list.forEach(node => {
      if (node.type === 'file') {
        if (node.name.toLowerCase().includes(normalizedTerm)) {
          filtered.push(node);
        }
        return;
      }

      const children = Array.isArray(node.children) ? node.children : [];
      const filteredChildren = filterNodes(children, normalizedTerm);
      const folderMatches = node.name.toLowerCase().includes(normalizedTerm);
      if (folderMatches || filteredChildren.length) {
        filtered.push({
          ...node,
          children: filteredChildren
        });
      }
    });
    return filtered;
  };

  const overlay = document.createElement('div');
  overlay.id = 'missionLoadModal';
  overlay.className = 'mission-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'mission-modal';

  const header = document.createElement('div');
  header.className = 'mission-modal-header';
  header.innerHTML = `<div class="mission-modal-title">Load Mission</div><div class="mission-modal-subtitle">${rootLabel}</div>`;

  const toolbar = document.createElement('div');
  toolbar.className = 'mission-modal-toolbar';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'mission-tree-search';
  searchInput.placeholder = 'Search missions or folders...';
  searchInput.setAttribute('aria-label', 'Search mission files and folders');

  const stats = document.createElement('div');
  stats.className = 'mission-tree-stats';

  const expandAllButton = document.createElement('button');
  expandAllButton.type = 'button';
  expandAllButton.className = 'ghost mission-tree-toolbar-btn';
  expandAllButton.textContent = 'Expand All';

  const collapseAllButton = document.createElement('button');
  collapseAllButton.type = 'button';
  collapseAllButton.className = 'ghost mission-tree-toolbar-btn';
  collapseAllButton.textContent = 'Collapse';

  toolbar.appendChild(searchInput);
  toolbar.appendChild(stats);
  toolbar.appendChild(expandAllButton);
  toolbar.appendChild(collapseAllButton);

  const treeWrap = document.createElement('div');
  treeWrap.className = 'mission-tree-wrap';

  const collectDirectoryKeys = (list, keys = []) => {
    list.forEach(node => {
      if (node.type !== 'directory') {
        return;
      }
      keys.push(node.path);
      if (Array.isArray(node.children) && node.children.length) {
        collectDirectoryKeys(node.children, keys);
      }
    });
    return keys;
  };

  const renderTree = () => {
    treeWrap.innerHTML = '';
    const filteredNodes = filterNodes(nodes, searchTerm);
    const visibleMissionCount = countFiles(filteredNodes);
    const isSearching = searchTerm.trim().length > 0;
    stats.textContent = isSearching
      ? `${visibleMissionCount} of ${totalMissionCount} missions`
      : `${totalMissionCount} missions`;

    if (!totalMissionCount) {
      const empty = document.createElement('div');
      empty.className = 'mission-tree-empty';
      empty.textContent = 'No mission JSON files found in this folder.';
      treeWrap.appendChild(empty);
      return;
    }

    if (!filteredNodes.length) {
      const empty = document.createElement('div');
      empty.className = 'mission-tree-empty';
      empty.textContent = 'No missions match your search.';
      treeWrap.appendChild(empty);
      return;
    }

    const rootList = document.createElement('ul');
    rootList.className = 'mission-tree';
    filteredNodes.forEach(node => rootList.appendChild(this.createMissionTreeNode(
      node,
      onSelectFile,
      onDeleteFile,
      expandedFolderKeys,
      searchTerm.trim().length > 0
    )));
    treeWrap.appendChild(rootList);
  };

  searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value || '';
    renderTree();
  });

  expandAllButton.addEventListener('click', () => {
    collectDirectoryKeys(nodes).forEach(key => expandedFolderKeys.add(key));
    renderTree();
  });

  collapseAllButton.addEventListener('click', () => {
    expandedFolderKeys.clear();
    renderTree();
  });

  renderTree();

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

  if (typeof onOpenFromFiles === 'function') {
    const fileInputBtn = document.createElement('button');
    fileInputBtn.className = 'ghost';
    fileInputBtn.textContent = 'Open from Files...';
    fileInputBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (file) {
          onOpenFromFiles(file);
        }
        input.remove();
      }, { once: true });
      document.body.appendChild(input);
      input.click();
    });
    footer.appendChild(fileInputBtn);
  }

  footer.appendChild(refreshButton);
  footer.appendChild(closeButton);

  modal.appendChild(header);
  modal.appendChild(toolbar);
  modal.appendChild(treeWrap);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      onCancel();
    }
  });
},

createMissionTreeNode(node, onSelectFile, onDeleteFile, expandedFolderKeys = new Set(), forceExpand = false) {
  const li = document.createElement('li');
  li.className = 'mission-tree-node';

  if (node.type === 'directory') {
    const directoryPath = node.path || node.name;
    const isExpanded = forceExpand || expandedFolderKeys.has(directoryPath);

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'mission-tree-row mission-tree-folder';
    row.textContent = `${isExpanded ? '▾' : '▸'} ${node.name}`;

    const childList = document.createElement('ul');
    childList.className = 'mission-tree mission-tree-children';
    childList.style.display = isExpanded ? 'block' : 'none';
    node.children.forEach(child => childList.appendChild(this.createMissionTreeNode(
      child,
      onSelectFile,
      onDeleteFile,
      expandedFolderKeys,
      forceExpand
    )));

    row.addEventListener('click', () => {
      const expanded = childList.style.display !== 'none';
      childList.style.display = expanded ? 'none' : 'block';
      if (expanded) {
        expandedFolderKeys.delete(directoryPath);
      } else {
        expandedFolderKeys.add(directoryPath);
      }
      row.textContent = `${expanded ? '▸' : '▾'} ${node.name}`;
    });

    li.appendChild(row);
    li.appendChild(childList);
    return li;
  }

  const row = document.createElement('div');
  row.className = 'mission-tree-file-row';

  const fileButton = document.createElement('button');
  fileButton.type = 'button';
  fileButton.className = 'mission-tree-row mission-tree-file';
  fileButton.textContent = node.name;
  fileButton.title = node.path;
  fileButton.addEventListener('click', () => onSelectFile(node));
  row.appendChild(fileButton);

  if (typeof onDeleteFile === 'function') {
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'danger mission-tree-delete';
    deleteButton.textContent = 'Delete';
    deleteButton.title = `Delete ${node.path}`;
    deleteButton.addEventListener('click', event => {
      event.stopPropagation();
      onDeleteFile(node);
    });
    row.appendChild(deleteButton);
  }

  li.appendChild(row);
  return li;
},

setStatus(message) {
  this.sbStatus.textContent = message;
},

ensureToastContainer() {
  let container = document.getElementById('appToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'appToastContainer';
    container.className = 'app-toast-container';
    document.body.appendChild(container);
  }

  return container;
},

hideToast(toastOrId) {
  const toast = typeof toastOrId === 'string'
    ? document.getElementById(toastOrId)
    : toastOrId;
  if (!toast) {
    return;
  }

  toast.classList.remove('visible');
  window.setTimeout(() => {
    toast.remove();
  }, 180);
},

showToast(message, tone = 'success', options = {}) {
  const {
    duration = 2200,
    id = null,
    persistent = false,
    position = 'center'
  } = options;
  const container = this.ensureToastContainer();

  if (id) {
    const existing = document.getElementById(id);
    if (existing) {
      existing.remove();
    }
  }

  if (position === 'top') {
    container.classList.add('position-top');
    this._topToastCount = (this._topToastCount || 0) + 1;
  }

  const toast = document.createElement('div');
  toast.className = `app-toast ${tone}`;
  toast.textContent = message;
  if (id) {
    toast.id = id;
  }
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  const cleanup = () => {
    this.hideToast(toast);
    if (position === 'top') {
      this._topToastCount = Math.max(0, (this._topToastCount || 1) - 1);
      if (this._topToastCount === 0) {
        container.classList.remove('position-top');
      }
    }
  };

  if (!persistent && duration > 0) {
    window.setTimeout(cleanup, duration);
  }

  return toast;
},

setCursor(lat, lng) {
  this.sbCursor.textContent = `Lat: ${lat.toFixed(6)}  Lon: ${lng.toFixed(6)}`;
},

formatFlythroughTime(totalSeconds) {
  const safeTotal = Number.isFinite(totalSeconds) && totalSeconds > 0
    ? totalSeconds
    : 0;
  const minutes = Math.floor(safeTotal / 60);
  const seconds = Math.floor(safeTotal % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

}
};
