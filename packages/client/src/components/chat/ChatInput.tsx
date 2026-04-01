// ──────────────────────────────────────────────
// Chat: Input — mode-aware styling
// ──────────────────────────────────────────────
import { useState, useRef, useCallback, useEffect, memo } from "react";
import { Send, Paperclip, StopCircle, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient, useQuery, skipToken, type InfiniteData } from "@tanstack/react-query";
import { useChatStore } from "../../stores/chat.store";
import { useUIStore } from "../../stores/ui.store";
import { useGenerate } from "../../hooks/use-generate";
import { useApplyRegex } from "../../hooks/use-apply-regex";
import { useCreateMessage, chatKeys } from "../../hooks/use-chats";
import type { Message } from "@marinara-engine/shared";
import {
  matchSlashCommand,
  getSlashCompletions,
  type SlashCommand,
  type SlashCommandContext,
} from "../../lib/slash-commands";
import { cn } from "../../lib/utils";
import { QuickConnectionSwitcher } from "./QuickConnectionSwitcher";
import { QuickPersonaSwitcher } from "./QuickPersonaSwitcher";
import { QuickSwitcherMobile } from "./QuickSwitcherMobile";



interface Attachment {
  type: string; // MIME type
  data: string; // base64 data URL
  name: string;
}

// Normalize curly/smart quotes to straight quotes (hoisted to avoid recreation)
const normalizeQuotes = (s: string) => s.replace(/["\u201C\u201D\u201E\u201F]/g, '"').replace(/[\u2018\u2019]/g, "'");

interface ChatInputProps {
  mode?: "conversation" | "roleplay";
  characterNames?: string[];
}

export const ChatInput = memo(function ChatInput({ mode = "conversation", characterNames = [] }: ChatInputProps) {
  const [hasInput, setHasInput] = useState(false);
  const [completions, setCompletions] = useState<SlashCommand[]>([]);
  const [selectedCompletion, setSelectedCompletion] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const streamingChatId = useChatStore((s) => s.streamingChatId);
  const isStreamingGlobal = useChatStore((s) => s.isStreaming);
  const isStreaming = isStreamingGlobal && streamingChatId === activeChatId;
  const setInputDraft = useChatStore((s) => s.setInputDraft);
  const clearInputDraft = useChatStore((s) => s.clearInputDraft);
  const { generate } = useGenerate();
  const { applyToUserInput } = useApplyRegex();
  const enterToSend = useUIStore((s) => s.enterToSendRP);
  const createMessage = useCreateMessage(activeChatId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resizeRafRef = useRef<number>(0);
  const qc = useQueryClient();

  // Restore draft when mounting or switching chats
  const prevChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevChatIdRef.current !== activeChatId) {
      // Save draft from the previous chat before switching
      if (prevChatIdRef.current && textareaRef.current) {
        const prevText = textareaRef.current.value;
        if (prevText.trim()) {
          setInputDraft(prevChatIdRef.current, prevText);
        } else {
          clearInputDraft(prevChatIdRef.current);
        }
      }
      prevChatIdRef.current = activeChatId;
    }
    // Restore draft for the new active chat
    if (activeChatId && textareaRef.current) {
      const draft = useChatStore.getState().inputDrafts.get(activeChatId) ?? "";
      textareaRef.current.value = draft;
      setHasInput(draft.trim().length > 0);
      // Resize textarea to fit content
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [activeChatId, setInputDraft, clearInputDraft]);

  // Save draft when component unmounts (e.g. navigating to editor)
  useEffect(() => {
    const textarea = textareaRef.current;
    return () => {
      // Cancel pending debounce timers
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      // Cancel pending resize rAF
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
      // Flush draft synchronously
      const chatId = useChatStore.getState().activeChatId;
      if (chatId && textarea) {
        const text = textarea.value;
        if (text.trim()) {
          useChatStore.getState().setInputDraft(chatId, text);
        } else {
          useChatStore.getState().clearInputDraft(chatId);
        }
      }
    };
  }, []);

  // Reactively derive the last message's role from the query cache.
  // pages[0] is the newest page; its last element is the most recent message.
  const lastMessageRole =
    useQuery({
      queryKey: chatKeys.messages(activeChatId ?? ""),
      queryFn: skipToken,
      select: (data: InfiniteData<Message[]>) => {
        const firstPage = data?.pages?.[0];
        return firstPage?.[firstPage.length - 1]?.role ?? null;
      },
    }).data ?? null;

  const canRetry = !isStreaming && lastMessageRole === "user";
  const canContinue = !isStreaming && mode === "roleplay" && lastMessageRole === "assistant";

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !activeChatId) return;

    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 20 MB)`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setAttachments((prev) => [...prev, { type: file.type, data: dataUrl, name: file.name }]);
      };
      reader.onerror = () => toast.error(`Failed to read ${file.name}`);
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // Get the current textarea value (always from the DOM directly)
  const getValue = () => textareaRef.current?.value ?? "";

  const buildContext = useCallback((): SlashCommandContext | null => {
    if (!activeChatId) return null;
    return {
      chatId: activeChatId,
      generate,
      createMessage: (data) => createMessage.mutate(data),
      invalidate: () => qc.invalidateQueries({ queryKey: chatKeys.all }),
      characterNames,
    };
  }, [activeChatId, generate, createMessage, characterNames, qc]);

  const handleSend = useCallback(async () => {
    const raw = getValue();
    if (!activeChatId || isStreaming) return;
    // Cancel pending draft debounce so clearInputDraft isn't overwritten
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);

    const hasText = raw.trim().length > 0;
    const hasFiles = attachments.length > 0;

    // If input is empty, check if we should retry or continue
    if (!hasText && !hasFiles) {
      const cached = qc.getQueryData<InfiniteData<Message[]>>(chatKeys.messages(activeChatId));
      const firstPage = cached?.pages?.[0];
      const lastMsg = firstPage?.[firstPage.length - 1];
      if (lastMsg && (lastMsg.role === "user" || (lastMsg.role === "assistant" && mode === "roleplay"))) {
        // Retry (last msg is user) or Continue (last msg is assistant, roleplay mode)
        try {
          await generate({ chatId: activeChatId, connectionId: null });
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Generation failed";
          toast.error(msg);
        }
      }
      return;
    }

    const normalized = normalizeQuotes(raw.trim());

    // Check for slash command
    const match = matchSlashCommand(normalized);
    if (match) {
      const ctx = buildContext();
      if (!ctx) return;

      if (textareaRef.current) {
        textareaRef.current.value = "";
        textareaRef.current.style.height = "auto";
      }
      setHasInput(false);
      setCompletions([]);
      setAttachments([]);
      clearInputDraft(activeChatId);

      const result = await match.command.execute(match.args, ctx);
      if (result.feedback) {
        setFeedback(result.feedback);
      }
      return;
    }

    // Check if the chat has a connection configured
    const chat = useChatStore.getState().activeChat;
    if (chat && !chat.connectionId) {
      toast.error(
        "It looks like you haven't connected any model yet. Please head to Chat Settings in the top right corner to do that first!",
      );
      return;
    }

    const message = applyToUserInput(normalized);

    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }
    setHasInput(false);
    setCompletions([]);
    const pendingAttachments = attachments.map((a) => ({ type: a.type, data: a.data }));
    setAttachments([]);
    clearInputDraft(activeChatId);

    try {
      await generate({
        chatId: activeChatId,
        connectionId: null,
        userMessage: message,
        ...(pendingAttachments.length ? { attachments: pendingAttachments } : {}),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Generation failed";
      toast.error(msg);
      console.error("Send failed:", error);
    }
  }, [activeChatId, isStreaming, generate, applyToUserInput, buildContext, qc, clearInputDraft, attachments, mode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Autocomplete navigation
    if (completions.length > 0) {
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const cmd = completions[selectedCompletion];
        if (cmd && textareaRef.current) {
          textareaRef.current.value = `/${cmd.name} `;
          handleInput();
        }
        setCompletions([]);
        setSelectedCompletion(0);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCompletion((prev) => (prev > 0 ? prev - 1 : completions.length - 1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCompletion((prev) => (prev < completions.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === "Escape") {
        setCompletions([]);
        setSelectedCompletion(0);
        return;
      }
    }

    if (enterToSend && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    // Normalize smart quotes directly in the DOM
    const raw = el.value;
    const fixed = normalizeQuotes(raw);
    if (raw !== fixed) {
      const pos = el.selectionStart;
      el.value = fixed;
      el.setSelectionRange(pos, pos);
    }
    const nowHasInput = fixed.trim().length > 0;
    setHasInput((prev) => (prev === nowHasInput ? prev : nowHasInput));

    // Keep draft in sync so it survives remounts (debounced to avoid store churn)
    if (activeChatId) {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      const chatId = activeChatId;
      const text = fixed;
      draftTimerRef.current = setTimeout(() => {
        if (text.trim()) {
          setInputDraft(chatId, text);
        } else {
          clearInputDraft(chatId);
        }
      }, 300);
    }

    // Auto-resize textarea — batched via rAF to avoid layout thrashing on
    // every keystroke while still responding within the same visual frame.
    if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
    resizeRafRef.current = requestAnimationFrame(() => {
      if (!el) return;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    });

    // Slash command autocomplete
    const trimmed = fixed.trim();
    if (trimmed.startsWith("/") && !trimmed.includes(" ")) {
      const matches = getSlashCompletions(trimmed);
      setCompletions(matches);
      setSelectedCompletion(0);
    } else {
      setCompletions((prev) => (prev.length === 0 ? prev : []));
    }
  };

  // Dismiss feedback on new input
  useEffect(() => {
    if (hasInput && feedback) setFeedback(null);
  }, [hasInput, feedback]);

  const _isRP = mode === "roleplay";

  return (
    <div className="mari-chat-input chat-input-container px-3 pb-3">
      {/* Slash command autocomplete popup */}
      {completions.length > 0 && (
        <div className="mb-2 overflow-hidden rounded-xl border border-white/10 bg-black/80 shadow-xl backdrop-blur-xl">
          {completions.map((cmd, i) => (
            <button
              key={cmd.name}
              onMouseDown={(e) => {
                e.preventDefault();
                if (textareaRef.current) {
                  textareaRef.current.value = `/${cmd.name} `;
                  handleInput();
                  textareaRef.current.focus();
                }
                setCompletions([]);
              }}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                i === selectedCompletion
                  ? "bg-foreground/10 text-foreground"
                  : "text-foreground/70 hover:bg-foreground/5",
              )}
            >
              <span className="font-mono font-semibold text-blue-400">/{cmd.name}</span>
              <span className="text-xs opacity-60">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Feedback toast */}
      {feedback && (
        <div className={cn("mb-2 flex items-start gap-2 rounded-lg px-3 py-2 text-xs bg-amber-500/15 text-amber-300")}>
          <span className="flex-1 whitespace-pre-wrap">{feedback}</span>
          <button
            onClick={() => setFeedback(null)}
            className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
          >
            <X size="0.75rem" />
          </button>
        </div>
      )}

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="group relative flex items-center gap-1.5 rounded-lg bg-foreground/10 px-2 py-1 text-xs text-foreground/70"
            >
              {att.type.startsWith("image/") ? (
                <img src={att.data} alt={att.name} className="h-8 w-8 rounded object-cover" />
              ) : null}
              <span className="max-w-[7.5rem] truncate">{att.name}</span>
              <button
                onClick={() => removeAttachment(i)}
                className="ml-0.5 rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
              >
                <X size="0.75rem" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main input container */}
      <div
        className={cn(
          "mari-chat-input-box relative flex items-center gap-1.5 rounded-2xl border-2 px-2.5 py-2.5 transition-all duration-200 sm:gap-2 sm:px-4",
          "bg-black/40",
          hasInput || attachments.length ? "border-blue-400/30 shadow-md shadow-blue-500/5" : "border-foreground/25",
        )}
      >
        {/* Attachment button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*,.pdf,.txt,.md,.json,.csv"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!activeChatId}
          className={cn(
            "rounded-lg p-1.5 transition-all active:scale-90",
            attachments.length
              ? "text-blue-400 hover:bg-foreground/10"
              : "text-foreground/40 hover:bg-foreground/10 hover:text-foreground/70",
          )}
          title="Attach files"
        >
          <Paperclip size="1rem" />
        </button>

        {/* Quick Switchers — desktop: inline, mobile: chevron */}
        <QuickConnectionSwitcher className="hidden sm:flex" />
        <QuickPersonaSwitcher className="hidden sm:flex" />
        <div className="sm:hidden">
          <QuickSwitcherMobile />
        </div>

        {/* Text input */}
        <textarea
          ref={textareaRef}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={activeChatId ? "Type here, / for commands." : "Select a chat first"}
          disabled={!activeChatId}
          rows={1}
          spellCheck
          autoCorrect="on"
          className="mari-chat-input-textarea max-h-[12.5rem] min-w-0 flex-1 resize-none bg-transparent py-0 text-sm leading-normal text-[#c3c2c2] placeholder:text-foreground/30 outline-none disabled:cursor-not-allowed disabled:opacity-40"
        />

        {/* Send / Stop button */}

        <button
          onClick={isStreaming ? () => useChatStore.getState().stopGeneration() : handleSend}
          disabled={(!hasInput && !attachments.length && !isStreaming && !canRetry && !canContinue) || !activeChatId}
          className={cn(
            "mari-chat-send-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
            isStreaming
              ? "text-foreground hover:opacity-80"
              : (hasInput || attachments.length || canRetry || canContinue) && activeChatId
                ? "text-foreground hover:text-foreground/80 active:scale-90"
                : "text-foreground/20",
          )}
        >
          {isStreaming ? (
            <StopCircle size="1rem" />
          ) : (
            <Send size="0.9375rem" className={cn(hasInput && "translate-x-[1px]")} />
          )}
        </button>
      </div>
    </div>
  );
});
