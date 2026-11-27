import { Check, Columns, GitCompare, Split, X } from "lucide-react";

type DiffReviewBarProps = {
  filePath: string;
  stats: {
    added: number;
    removed: number;
  };
  hunkCount: number;
  sideBySide: boolean;
  onToggleSideBySide: () => void;
  onAccept: () => void;
  onReject: () => void;
};

export function DiffReviewBar({
  filePath,
  stats,
  hunkCount,
  sideBySide,
  onToggleSideBySide,
  onAccept,
  onReject
}: DiffReviewBarProps) {
  return (
    <div className="flex items-center justify-between border-b border-amber-500/30 bg-amber-950/20 px-4 py-2 text-xs">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-medium text-amber-300">
          <GitCompare className="h-4 w-4" />
          <span>AI Proposed Changes</span>
        </div>

        <span className="font-mono text-zinc-300 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800">
          {filePath}
        </span>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-emerald-400 font-semibold">+{stats.added}</span>
          <span className="text-rose-400 font-semibold">-{stats.removed}</span>
          <span className="text-zinc-500">({hunkCount} hunk{hunkCount === 1 ? "" : "s"})</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSideBySide}
          className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-zinc-300 transition hover:bg-zinc-700 text-[11px]"
          title={sideBySide ? "Switch to inline unified diff" : "Switch to side-by-side diff"}
        >
          {sideBySide ? <Split className="h-3.5 w-3.5 text-zinc-400" /> : <Columns className="h-3.5 w-3.5 text-zinc-400" />}
          <span>{sideBySide ? "Side-by-Side" : "Inline"}</span>
        </button>

        <button
          onClick={onReject}
          className="flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-rose-300 transition hover:bg-rose-500/20 text-[11px] font-medium"
        >
          <X className="h-3.5 w-3.5" />
          <span>Reject</span>
        </button>

        <button
          onClick={onAccept}
          className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/20 px-3 py-1 text-emerald-300 transition hover:bg-emerald-500/30 text-[11px] font-medium shadow-sm"
        >
          <Check className="h-3.5 w-3.5" />
          <span>Accept Changes</span>
        </button>
      </div>
    </div>
  );
}
