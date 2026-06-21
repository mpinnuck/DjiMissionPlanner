/**
 * FileSystemBackendIO.js  —  FileSystemBackend mixin: file I/O and directory tree
 * Mixed into FileSystemBackend.prototype via FileSystemBackend.js.
 *
 * Responsibilities:
 *  - save(name, jsonText): writes mission JSON to the resolved directory path
 *  - load(name): reads and returns mission JSON from the directory
 *  - delete(name): removes a mission file from the directory
 *  - list(): returns a flat array of mission file names in the root directory
 *  - flattenTree / listTree: recursively lists all JSON files in the tree
 *  - joinPath / readDirectoryTree: directory traversal helpers
 */
// FileSystemBackendIO.js
// Mixed into FileSystemBackend.prototype

const FileSystemBackendIO = {

async save(name, jsonText) {
  const normalized = this.normalizePath(name);
  const { directory, fileName } = await this.resolveDirectoryForPath(normalized, true);
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writer = await fileHandle.createWritable();
  await writer.write(jsonText);
  await writer.close();
  return normalized;
},

async load(name) {
  const normalized = this.normalizePath(name);
  const { directory, fileName } = await this.resolveDirectoryForPath(normalized, false);
  const fileHandle = await directory.getFileHandle(fileName, { create: false });
  const file = await fileHandle.getFile();
  if (this.rootDirectoryHandle) {
    this.persistLastLoadedRootDirectoryHandle(this.rootDirectoryHandle).catch(() => {});
  }
  return file.text();
},

async delete(name) {
  const normalized = this.normalizePath(name);
  const { directory, fileName } = await this.resolveDirectoryForPath(normalized, false);
  await directory.removeEntry(fileName);
},

async list() {
  const tree = await this.listTree();
  return this.flattenTree(tree.nodes);
},

flattenTree(nodes) {
  const results = [];
  nodes.forEach(node => {
    if (node.type === 'file') {
      results.push(node.path);
      return;
    }
    results.push(...this.flattenTree(node.children || []));
  });
  return results;
},

async listTree(preferredRootLabel = '') {
  const missionDir = await this.getMissionDirectoryHandle(true, preferredRootLabel);
  const nodes = await this.readDirectoryTree(missionDir, '');
  return {
    rootLabel: this.rootLabel,
    nodes
  };
},

joinPath(parent, child) {
  return parent ? `${parent}/${child}` : child;
},

async readDirectoryTree(directoryHandle, relativePath) {
  const directories = [];
  const files = [];

  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind === 'directory') {
      directories.push({ name, handle });
    } else if (handle.kind === 'file' && name.toLowerCase().endsWith('.json')) {
      files.push({ name, handle });
    }
  }

  directories.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  const directoryNodes = [];
  for (const entry of directories) {
    const path = this.joinPath(relativePath, entry.name);
    directoryNodes.push({
      type: 'directory',
      name: entry.name,
      path,
      children: await this.readDirectoryTree(entry.handle, path)
    });
  }

  const fileNodes = files.map(entry => ({
    type: 'file',
    name: entry.name,
    path: this.joinPath(relativePath, entry.name)
  }));

  return [...directoryNodes, ...fileNodes];
}

};
