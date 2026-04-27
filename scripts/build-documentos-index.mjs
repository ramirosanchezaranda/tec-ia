import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const documentosRoot = path.resolve(projectRoot, "..", "Documentos");
const outputPath = path.resolve(projectRoot, "src", "data", "documentos-index.json");

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function emptyFolderNode(name, relativePath, depth) {
  return {
    id: slugify(relativePath || name || "documentos"),
    name,
    relativePath,
    depth,
    fileCount: 0,
    folderCount: 0,
    totalBytes: 0,
    sizeLabel: "0 B",
    extensions: [],
    files: [],
    children: [],
  };
}

async function walkDirectory(absoluteDir, relativeDir = "", depth = 0, topLevelName = "Documentos") {
  const dirName = relativeDir ? path.basename(relativeDir) : "Documentos";
  const folderNode = emptyFolderNode(dirName, relativeDir, depth);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });

  const directories = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => collator.compare(a.name, b.name));
  const files = entries
    .filter((entry) => entry.isFile())
    .sort((a, b) => collator.compare(a.name, b.name));

  for (const file of files) {
    const absolutePath = path.join(absoluteDir, file.name);
    const stats = await fs.stat(absolutePath);
    const relativePath = relativeDir ? path.join(relativeDir, file.name) : file.name;
    const ext = path.extname(file.name).slice(1).toLowerCase() || "sin-extension";
    const segments = relativePath.split(path.sep);
    const parentSegments = segments.slice(0, -1);
    const fileEntry = {
      id: slugify(relativePath),
      name: file.name,
      extension: ext,
      relativePath,
      size: stats.size,
      sizeLabel: formatBytes(stats.size),
      topLevel: topLevelName,
      folder: parentSegments.at(-1) || topLevelName,
      subjectPath: parentSegments,
    };

    folderNode.files.push(fileEntry);
    folderNode.fileCount += 1;
    folderNode.totalBytes += stats.size;
    if (!folderNode.extensions.includes(ext)) {
      folderNode.extensions.push(ext);
    }
  }

  for (const directory of directories) {
    const nextRelative = relativeDir ? path.join(relativeDir, directory.name) : directory.name;
    const child = await walkDirectory(
      path.join(absoluteDir, directory.name),
      nextRelative,
      depth + 1,
      depth === 0 ? directory.name : topLevelName,
    );

    folderNode.children.push(child);
    folderNode.fileCount += child.fileCount;
    folderNode.folderCount += child.folderCount + 1;
    folderNode.totalBytes += child.totalBytes;
    for (const extension of child.extensions) {
      if (!folderNode.extensions.includes(extension)) {
        folderNode.extensions.push(extension);
      }
    }
  }

  folderNode.extensions.sort(collator.compare);
  folderNode.sizeLabel = formatBytes(folderNode.totalBytes);
  return folderNode;
}

function flattenFiles(node, target = []) {
  for (const file of node.files) {
    target.push(file);
  }
  for (const child of node.children) {
    flattenFiles(child, target);
  }
  return target;
}

function collectExtensions(files) {
  const map = new Map();
  for (const file of files) {
    map.set(file.extension, (map.get(file.extension) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]))
    .map(([extension, count]) => ({ extension, count }));
}

async function main() {
  const tree = await walkDirectory(documentosRoot);
  const files = flattenFiles(tree);

  const index = {
    generatedAt: new Date().toISOString(),
    root: "Documentos",
    relativeRoot: "Documentos",
    totals: {
      files: tree.fileCount,
      folders: tree.folderCount,
      totalBytes: tree.totalBytes,
      sizeLabel: tree.sizeLabel,
    },
    topLevelFolders: tree.children.map((folder) => ({
      id: folder.id,
      name: folder.name,
      relativePath: folder.relativePath,
      fileCount: folder.fileCount,
      folderCount: folder.folderCount,
      totalBytes: folder.totalBytes,
      sizeLabel: folder.sizeLabel,
      extensions: folder.extensions,
    })),
    extensions: collectExtensions(files),
    tree,
    files,
  };

  await fs.writeFile(outputPath, JSON.stringify(index, null, 2));
  console.log(`Indice generado en ${path.relative(projectRoot, outputPath)} con ${files.length} archivos.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
