import path from "node:path";

function normalizePath(p = "") {
  return p.replaceAll("\\", "/").replace(/^\/+/, "");
}

function resolveRelativeImport(sourceFilePath, importStatement) {
  // Extract import path from statements like:
  // import { x } from './path'; or require('./path'); or from 'path'
  const match = importStatement.match(/(?:from\s+['"]|require\s*\(\s*['"]|import\s+['"])([^'"]+)['"]/);
  if (!match) return null;
  const rawPath = match[1];

  // Only resolve relative project imports (starting with ./ or ../)
  if (!rawPath.startsWith(".")) return null;

  const sourceDir = path.posix.dirname(normalizePath(sourceFilePath));
  const resolved = path.posix.normalize(path.posix.join(sourceDir, rawPath));
  return resolved;
}

export class DependencyGraph {
  constructor() {
    this.fileMap = new Map(); // normalizedPath -> { filePath, imports: [], nodes: [], rawContent: "" }
  }

  updateProjectFiles(parsedFiles = []) {
    this.fileMap.clear();
    for (const file of parsedFiles) {
      const normalized = normalizePath(file.filePath);
      this.fileMap.set(normalized, {
        filePath: file.filePath,
        language: file.language,
        imports: file.imports || [],
        nodes: file.nodes || [],
        content: file.content || ""
      });
    }
  }

  findMatchingFileKey(resolvedPathWithoutExt) {
    const candidates = [
      resolvedPathWithoutExt,
      `${resolvedPathWithoutExt}.ts`,
      `${resolvedPathWithoutExt}.js`,
      `${resolvedPathWithoutExt}.tsx`,
      `${resolvedPathWithoutExt}.jsx`,
      `${resolvedPathWithoutExt}.py`,
      `${resolvedPathWithoutExt}.java`,
      `${resolvedPathWithoutExt}.cpp`,
      `${resolvedPathWithoutExt}/index.ts`,
      `${resolvedPathWithoutExt}/index.js`
    ];

    for (const cand of candidates) {
      if (this.fileMap.has(cand)) return cand;
    }
    return null;
  }

  getDependencies(targetFilePath, maxHops = 2) {
    const normalizedTarget = normalizePath(targetFilePath);
    const visited = new Set();
    const resultFiles = [];

    const queue = [{ path: normalizedTarget, hop: 0 }];
    visited.add(normalizedTarget);

    while (queue.length > 0) {
      const { path: currentPath, hop } = queue.shift();
      if (hop >= maxHops) continue;

      const fileData = this.fileMap.get(currentPath);
      if (!fileData) continue;

      for (const imp of fileData.imports) {
        const resolvedBase = resolveRelativeImport(currentPath, imp);
        if (!resolvedBase) continue;

        const matchedKey = this.findMatchingFileKey(resolvedBase);
        if (matchedKey && !visited.has(matchedKey)) {
          visited.add(matchedKey);
          const depData = this.fileMap.get(matchedKey);
          if (depData) {
            resultFiles.push({ ...depData, hop: hop + 1 });
            queue.push({ path: matchedKey, hop: hop + 1 });
          }
        }
      }
    }

    return resultFiles;
  }

  // Extract compact symbol signatures from a dependency instead of raw 500-line files
  extractDependencySignatures(targetFilePath, maxHops = 2) {
    const dependencies = this.getDependencies(targetFilePath, maxHops);
    if (dependencies.length === 0) return [];

    const signatureBlocks = [];

    for (const dep of dependencies) {
      const signatures = [];

      for (const node of dep.nodes) {
        if (node.type === "interface") {
          // Keep entire interface definition as it defines contracts
          signatures.push(node.code.trim());
        } else if (node.type === "class") {
          // Extract class header and method signatures
          const lines = node.code.split("\n");
          const classHeader = lines[0].trim();
          const methodLines = lines.filter((l) =>
            /^\s*(?:public|private|protected|async|static|\*|constructor|[a-zA-Z0-9_]+\s*\([^)]*\)\s*[:{])/.test(l) &&
            !l.trim().startsWith("//")
          ).slice(0, 10).map((l) => `  ${l.trim().replace(/\{.*$/, ";")}`);

          signatures.push(`${classHeader} {\n${methodLines.join("\n")}\n  // ...\n}`);
        } else if (node.type === "function" || node.type === "method") {
          // Extract function signature header
          const firstLine = node.code.split("\n")[0].trim().replace(/\{.*$/, ";");
          signatures.push(firstLine);
        } else if (node.type === "error_handler" || node.signatures.errorPattern === "throws_custom_error") {
          const firstLine = node.code.split("\n")[0].trim().replace(/\{.*$/, ";");
          signatures.push(`// Error handling convention: ${node.symbolPath}\n${firstLine}`);
        }
      }

      if (signatures.length > 0) {
        signatureBlocks.push({
          filePath: dep.filePath,
          hop: dep.hop,
          language: dep.language,
          signaturesSummary: signatures.slice(0, 6).join("\n\n")
        });
      }
    }

    return signatureBlocks;
  }
}

export const dependencyGraph = new DependencyGraph();
