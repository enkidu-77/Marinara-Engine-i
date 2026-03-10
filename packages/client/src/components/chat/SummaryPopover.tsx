// ──────────────────────────────────────────────
// Summary Popover — View / edit / generate chat summary
// Shown via the scroll icon in the chat header bar.
// ──────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from "react";
import { useGenerateSummary, useUpdateChatMetadata } from "../../hooks/use-chats";
import { ScrollText, Sparkles, X, Save, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

interface SummaryPopoverProps {
  chatId: string;
  summary: string | null;
  onClose: () => void;
}

export function SummaryPopover({ chatId, summary, onClose }: SummaryPopoverProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(summary ?? "");
  const generateSummary = useGenerateSummary();
  const updateMeta = useUpdateChatMetadata();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Sync draft when summary changes (e.g. after generation)
  useEffect(() => {
    setDraft(summary ?? "");
  }, [summary]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (editing) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [editing]);

  const handleGenerate = useCallback(() => {
    generateSummary.mutate(chatId, {
      onSuccess: (data) => {
        setDraft(data.summary);
        setEditing(false);
      },
    });
  }, [chatId, generateSummary]);

  const handleSave = useCallback(() => {
    updateMeta.mutate({ id: chatId, summary: draft || null });
    setEditing(false);
  }, [chatId, draft, updateMeta]);

  const isGenerating = generateSummary.isPending;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full z-[100] mt-1 w-80 max-md:fixed max-md:top-12 max-md:left-1/2 max-md:right-auto max-md:-translate-x-1/2 max-md:translate-y-0 max-md:mt-0 max-md:w-[calc(100vw-2rem)] max-md:max-h-[calc(100vh-4rem)] rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl shadow-black/40"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <ScrollText size={13} className="text-amber-400" />
          Chat Summary
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={cn(
              "flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium transition-all",
              isGenerating
                ? "cursor-wait text-amber-300/60"
                : "text-amber-300 hover:bg-amber-400/15 hover:text-amber-200",
            )}
            title="Generate summary with AI"
          >
            {isGenerating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {isGenerating ? "Generating…" : "Generate"}
          </button>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-h-72 overflow-y-auto p-3">
        {editing ? (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              className="max-h-48 w-full resize-y rounded-lg bg-[var(--secondary)] p-2.5 text-xs ring-1 ring-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="Write or paste a summary of this chat…"
            />
            <div className="flex justify-end gap-1.5">
              <button
                onClick={() => {
                  setDraft(summary ?? "");
                  setEditing(false);
                }}
                className="rounded-lg px-2.5 py-1 text-[10px] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={updateMeta.isPending}
                className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 py-1 text-[10px] font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                <Save size={10} />
                Save
              </button>
            </div>
          </div>
        ) : (
          <div>
            {draft ? (
              <div
                className="cursor-pointer rounded-lg p-2 transition-colors hover:bg-[var(--accent)]"
                onClick={() => setEditing(true)}
                title="Click to edit"
              >
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--foreground)]/80">{draft}</p>
              </div>
            ) : (
              <div
                className="cursor-pointer rounded-lg p-4 transition-colors hover:bg-[var(--accent)]"
                onClick={() => setEditing(true)}
              >
                <p className="text-center text-xs italic text-[var(--muted-foreground)]">
                  No summary yet. Click to write one, or press Generate.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
