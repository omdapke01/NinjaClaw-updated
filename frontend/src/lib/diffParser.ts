export type DiffHunk = {
  search: string;
  replace: string;
  raw: string;
};

export type DiffParseResult = {
  hasDiff: boolean;
  originalContent: string;
  proposedContent: string;
  stats: {
    added: number;
    removed: number;
  };
  hunks: DiffHunk[];
  error?: string;
};

function normalizeLineEndings(str = ""): string {
  return str.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function normalizeWhitespace(str = ""): string {
  return str
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

function findFuzzyMatchIndex(originalLines: string[], searchLines: string[]): number {
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

export function extractDiffHunks(text = ""): DiffHunk[] {
  const normalized = normalizeLineEndings(text);
  const hunks: DiffHunk[] = [];

  const regex = /<{7}\s*SEARCH\r?\n([\s\S]*?)\r?\n={7}\r?\n([\s\S]*?)\r?\n>{7}\s*REPLACE/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized)) !== null) {
    hunks.push({
      search: match[1],
      replace: match[2],
      raw: match[0]
    });
  }

  return hunks;
}

export function applyHunksToContent(originalContent = "", hunks: DiffHunk[]): { ok: boolean; content: string; error?: string } {
  let currentContent = normalizeLineEndings(originalContent);

  for (let i = 0; i < hunks.length; i++) {
    const { search, replace } = hunks[i];
    const normSearch = normalizeLineEndings(search);
    const normReplace = normalizeLineEndings(replace);

    const searchLines = normSearch.split("\n");
    const replaceLines = normReplace.split("\n");

    // 1. Exact match
    if (currentContent.includes(normSearch)) {
      currentContent = currentContent.replace(normSearch, normReplace);
      continue;
    }

    // 2. Trailing whitespace-trimmed match
    const normSearchTrimmed = normalizeWhitespace(normSearch);
    const currentTrimmed = normalizeWhitespace(currentContent);

    if (currentTrimmed.includes(normSearchTrimmed)) {
      const origLines = currentContent.split("\n");
      const matchIdx = findFuzzyMatchIndex(origLines, searchLines);

      if (matchIdx !== -1) {
        origLines.splice(matchIdx, searchLines.length, ...replaceLines);
        currentContent = origLines.join("\n");
        continue;
      }
    }

    return {
      ok: false,
      content: originalContent,
      error: `Could not locate SEARCH block #${i + 1} in current file.`
    };
  }

  return { ok: true, content: currentContent };
}

export function computeDiffStats(original = "", modified = ""): { added: number; removed: number } {
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

export function parseAiDiffResponse(originalContent = "", aiReply = ""): DiffParseResult {
  const hunks = extractDiffHunks(aiReply);

  if (hunks.length === 0) {
    return {
      hasDiff: false,
      originalContent,
      proposedContent: originalContent,
      stats: { added: 0, removed: 0 },
      hunks: []
    };
  }

  const result = applyHunksToContent(originalContent, hunks);
  const stats = computeDiffStats(originalContent, result.content);

  return {
    hasDiff: true,
    originalContent,
    proposedContent: result.content,
    stats,
    hunks,
    error: result.error
  };
}
