// Diff Engine: Search-and-Replace Blocks Parser & Atomic Patcher

const SEARCH_BLOCK_HEADER = "<<<<<<< SEARCH";
const DIVIDER_BLOCK = "=======";
const REPLACE_BLOCK_FOOTER = ">>>>>>> REPLACE";

function normalizeLineEndings(str = "") {
  return str.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

export function extractDiffHunks(text = "") {
  const normalized = normalizeLineEndings(text);
  const hunks = [];

  // Match <<<<<<< SEARCH\n(.*?)\n=======\n(.*?)\n>>>>>>> REPLACE
  const regex = /<{7}\s*SEARCH\r?\n([\s\S]*?)\r?\n={7}\r?\n([\s\S]*?)\r?\n>{7}\s*REPLACE/g;
  let match;

  while ((match = regex.exec(normalized)) !== null) {
    hunks.push({
      search: match[1],
      replace: match[2],
      raw: match[0]
    });
  }

  return {
    hasDiff: hunks.length > 0,
    hunks
  };
}

function normalizeWhitespace(str = "") {
  return str
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

function findFuzzyMatchIndex(originalLines, searchLines) {
  if (searchLines.length === 0 || originalLines.length < searchLines.length) {
    return -1;
  }

  const normalizedSearch = searchLines.map((l) => l.trim());

  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let match = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j].trim() !== normalizedSearch[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }

  return -1;
}

export function applyDiffHunks(originalContent = "", hunks = []) {
  if (!hunks || hunks.length === 0) {
    return { ok: true, patchedContent: originalContent, appliedCount: 0, stats: { added: 0, removed: 0 } };
  }

  let currentContent = normalizeLineEndings(originalContent);
  let totalAdded = 0;
  let totalRemoved = 0;
  let appliedCount = 0;

  for (let i = 0; i < hunks.length; i++) {
    const { search, replace } = hunks[i];
    const normSearch = normalizeLineEndings(search);
    const normReplace = normalizeLineEndings(replace);

    const searchLines = normSearch.split("\n");
    const replaceLines = normReplace.split("\n");

    // 1. Try exact match
    if (currentContent.includes(normSearch)) {
      currentContent = currentContent.replace(normSearch, normReplace);
      totalRemoved += searchLines.length;
      totalAdded += replaceLines.length;
      appliedCount++;
      continue;
    }

    // 2. Try trailing whitespace-trimmed match
    const normSearchTrimmed = normalizeWhitespace(normSearch);
    const currentTrimmed = normalizeWhitespace(currentContent);

    if (currentTrimmed.includes(normSearchTrimmed)) {
      const origLines = currentContent.split("\n");
      const matchIdx = findFuzzyMatchIndex(origLines, searchLines);

      if (matchIdx !== -1) {
        origLines.splice(matchIdx, searchLines.length, ...replaceLines);
        currentContent = origLines.join("\n");
        totalRemoved += searchLines.length;
        totalAdded += replaceLines.length;
        appliedCount++;
        continue;
      }
    }

    // If both failed, report failure for atomic safety
    return {
      ok: false,
      error: `Failed to match SEARCH block #${i + 1} in the target file.`,
      failedHunkIndex: i,
      failedHunk: hunks[i],
      patchedContent: originalContent,
      stats: { added: 0, removed: 0 }
    };
  }

  return {
    ok: true,
    patchedContent: currentContent,
    appliedCount,
    stats: {
      added: totalAdded,
      removed: totalRemoved
    }
  };
}

export function computeDiffStats(original = "", modified = "") {
  const origLines = normalizeLineEndings(original).split("\n");
  const modLines = normalizeLineEndings(modified).split("\n");

  const origSet = new Set(origLines.map((l) => l.trim()));
  const modSet = new Set(modLines.map((l) => l.trim()));

  let added = 0;
  let removed = 0;

  for (const l of modLines) {
    if (!origSet.has(l.trim())) added++;
  }
  for (const l of origLines) {
    if (!modSet.has(l.trim())) removed++;
  }

  return { added, removed };
}
