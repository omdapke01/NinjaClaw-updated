import { Bot, Check, ChevronDown, ChevronRight, Copy, Dna, FilePlus2, GitCompare, RefreshCw, SendHorizonal, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import type { AiAction, ChatMessage, CodeApplyAction, StyleProfile } from "../types";
import { extractDiffHunks } from "../lib/diffParser";

type ChatPanelProps = {
  messages: ChatMessage[];
  onSend: (content: string) => Promise<void> | void;
  onAction: (action: AiAction) => Promise<void> | void;
  onApplyCode: (action: CodeApplyAction, payload: { language: string; code: string }) => Promise<void> | void;
  onPreviewDiff?: (aiReply: string) => void;
  isGenerating: boolean;
  activeLanguageLabel: string;
  activeFile: string | null;
  styleProfile?: StyleProfile | null;
  onReindexStyle?: () => void;
  isIndexingStyle?: boolean;
};

const suggestedPrompts = ["Build a counter app", "Build a todo app"];
const quickActions: { id: AiAction; label: string }[] = [
  { id: "explain", label: "Explain this code" },
  { id: "fix", label: "Fix this code" },
  { id: "continue", label: "Continue in current language" },
  { id: "generate", label: "Generate full solution" }
];

export function ChatPanel({
  messages,
  onSend,
  onAction,
  onApplyCode,
  onPreviewDiff,
  isGenerating,
  activeLanguageLabel,
  activeFile,
  styleProfile,
  onReindexStyle,
  isIndexingStyle
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [showStyleDetails, setShowStyleDetails] = useState(false);

  async function submit(content: string) {
    if (!content.trim()) return;
    setDraft("");
    await onSend(content);
  }

  const conventions = styleProfile?.effectiveConventions || styleProfile?.conventions || {};
  const isReady = styleProfile?.status === "ready";
  const isIndexing = isIndexingStyle || styleProfile?.status === "indexing";
  const exemplarCount = styleProfile?.exemplars?.length || 0;

  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-l border-ide-border bg-ide-sidebar">
      <div className="flex items-center justify-between border-b border-ide-border px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          AI Assistant
        </div>
        <button
          onClick={() => setShowStyleDetails((prev) => !prev)}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
            isReady
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
              : isIndexing
              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              : "bg-secondary text-muted-foreground border border-ide-border hover:bg-secondary/80"
          }`}
          title="Codebase Style DNA Profile"
        >
          <Dna className={`h-3 w-3 ${isIndexing ? "animate-spin" : ""}`} />
          <span>{isIndexing ? "Learning Style..." : isReady ? "Style DNA Active" : "Style DNA Idle"}</span>
          {showStyleDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </div>

      {showStyleDetails ? (
        <div className="border-b border-ide-border bg-zinc-950/70 p-3 text-xs animate-slide-down">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-foreground">Codebase Style Profile</span>
            {onReindexStyle ? (
              <button
                onClick={onReindexStyle}
                disabled={isIndexing}
                className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground hover:bg-secondary/80 disabled:opacity-40"
              >
                <RefreshCw className={`h-2.5 w-2.5 ${isIndexing ? "animate-spin" : ""}`} />
                Re-learn
              </button>
            ) : null}
          </div>

          <div className="space-y-1.5 text-muted-foreground">
            <div>
              <span className="text-zinc-400">OOP Paradigm: </span>
              <span className="text-zinc-200">
                {conventions.oopAndPatterns?.primaryParadigm || "Standard"}
                {conventions.oopAndPatterns?.dependencyInjection ? ` (${conventions.oopAndPatterns.dependencyInjection})` : ""}
              </span>
            </div>
            <div>
              <span className="text-zinc-400">Error Handling: </span>
              <span className="text-zinc-200">
                {conventions.errorHandling?.strategy || "Standard"}
                {conventions.errorHandling?.customErrorClasses?.length ? ` [${conventions.errorHandling.customErrorClasses.join(", ")}]` : ""}
              </span>
            </div>
            <div>
              <span className="text-zinc-400">Edge-case Guards: </span>
              <span className="text-zinc-200">
                {conventions.edgeCasesAndGuards?.guardClauseStyle || "Early return"}
                {conventions.edgeCasesAndGuards?.validationApproach ? ` (${conventions.edgeCasesAndGuards.validationApproach})` : ""}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 text-[11px]">
              <span className="text-emerald-400">
                ✓ {exemplarCount} Golden Exemplar{exemplarCount === 1 ? "" : "s"} Anchored
              </span>
              <span className="text-zinc-500 text-[10px]">Saved in .ninjaclaw/</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="border-b border-ide-border px-4 py-2 text-xs text-muted-foreground">
        AI is tuned for {activeLanguageLabel}. {activeFile ? `Working against ${activeFile}.` : "Open a file for file-aware help."}
      </div>

      <div className="flex-1 space-y-4 overflow-auto px-4 py-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex animate-slide-up gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            {message.role === "assistant" ? (
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/20">
                <Bot size={14} className="text-accent" />
              </div>
            ) : null}
          <div
            className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 ${
              message.role === "user"
                ? "bg-ide-chat-user text-foreground"
                : "bg-ide-chat-ai text-secondary-foreground"
            }`}
          >
              <MessageContent
                content={message.content}
                canApply={message.role === "assistant"}
                onApplyCode={onApplyCode}
                onPreviewDiff={onPreviewDiff}
              />
            </div>
            {message.role === "user" ? (
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/20">
                <SendHorizonal size={14} className="text-primary" />
              </div>
            ) : null}
          </div>
        ))}

        {isGenerating ? (
          <div className="flex gap-2 items-start">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/20">
              <Bot size={14} className="text-accent" />
            </div>
            <div className="flex gap-1 rounded-lg bg-ide-chat-ai px-3 py-2.5">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-muted-foreground" />
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-muted-foreground" style={{ animationDelay: "0.2s" }} />
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-muted-foreground" style={{ animationDelay: "0.4s" }} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="px-3 pb-2">
        <div className="mb-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-zinc-500">
            <Sparkles size={12} />
            Current File
          </div>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <button
                key={action.id}
                className="rounded-md border border-ide-border bg-secondary px-2.5 py-1.5 text-xs text-secondary-foreground transition hover:bg-secondary/80"
                onClick={() => void onAction(action.id)}
                disabled={isGenerating}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-2">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-zinc-500">
            <Sparkles size={12} />
            Suggestions
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestedPrompts.map((prompt) => (
              <button
                key={prompt}
                className="rounded-md border border-ide-border bg-secondary px-2.5 py-1.5 text-xs text-secondary-foreground transition hover:bg-secondary/80"
                onClick={() => submit(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-ide-border p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-zinc-950 p-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask anything..."
            rows={3}
            className="min-h-[72px] flex-1 resize-none bg-transparent px-2 py-1 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            className="rounded-md bg-primary p-3 text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
            onClick={() => submit(draft)}
            disabled={!draft.trim() || isGenerating}
          >
            <SendHorizonal size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function MessageContent({
  content,
  canApply,
  onApplyCode,
  onPreviewDiff
}: {
  content: string;
  canApply: boolean;
  onApplyCode: (action: CodeApplyAction, payload: { language: string; code: string }) => Promise<void> | void;
  onPreviewDiff?: (aiReply: string) => void;
}) {
  const diffHunks = canApply ? extractDiffHunks(content) : [];
  const blocks = content.split(/```/);

  return (
    <div className="space-y-3">
      {diffHunks.length > 0 && onPreviewDiff ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
              <GitCompare className="h-3.5 w-3.5" />
              <span>AI Diff Suggested ({diffHunks.length} hunk{diffHunks.length === 1 ? "" : "s"})</span>
            </div>
            <button
              onClick={() => onPreviewDiff(content)}
              className="flex items-center gap-1 rounded bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-500/30 border border-amber-500/30 shadow-sm"
            >
              <GitCompare className="h-3 w-3" />
              Review Diff
            </button>
          </div>
          <p className="text-[11px] text-zinc-400">
            Contains structured Search/Replace changes. Click 'Review Diff' to preview and accept/reject in the Monaco editor.
          </p>
        </div>
      ) : null}

      {blocks.map((block, index) => {
        if (index % 2 === 0) {
          const trimmed = block.trim();
          if (!trimmed) return null;

          return (
            <div key={`text-${index}`} className="whitespace-pre-wrap">
              {trimmed}
            </div>
          );
        }

        const lines = block.split(/\r?\n/);
        const language = (lines[0] || "code").trim() || "code";
        const code = lines.slice(1).join("\n").trimEnd();

        return <CodeBlock key={`code-${index}`} language={language} code={code} canApply={canApply} onApplyCode={onApplyCode} />;
      })}
    </div>
  );
}

function CodeBlock({
  language,
  code,
  canApply,
  onApplyCode
}: {
  language: string;
  code: string;
  canApply: boolean;
  onApplyCode: (action: CodeApplyAction, payload: { language: string; code: string }) => Promise<void> | void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-ide-border bg-[#171717]">
      <div className="flex items-center justify-between border-b border-ide-border px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">{language}</div>
        <div className="flex items-center gap-1">
          {canApply ? (
            <>
              <button
                onClick={() => void onApplyCode("replace", { language, code })}
                className="rounded-md px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                title="Replace current file"
              >
                <Wand2 size={12} className="inline-block" /> Replace
              </button>
              <button
                onClick={() => void onApplyCode("append", { language, code })}
                className="rounded-md px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                title="Append to current file"
              >
                <Wand2 size={12} className="inline-block" /> Append
              </button>
              <button
                onClick={() => void onApplyCode("new-file", { language, code })}
                className="rounded-md px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                title="Create new file from snippet"
              >
                <FilePlus2 size={12} className="inline-block" /> New File
              </button>
            </>
          ) : null}
          <button
            onClick={handleCopy}
            className="rounded-md p-1.5 text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
            title="Copy code"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-sm leading-7 text-zinc-100">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
