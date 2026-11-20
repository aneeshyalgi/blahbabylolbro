"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, ArrowUp, Loader2, MessageSquareText, RotateCcw, Sparkles, Undo2, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { EYEBROW, PANEL } from "./atoms";
import { viewLabel } from "./review";
import type { ChangeLine, ReviewTurn } from "./types";

const MAX_LINES = 8;

function Avatar({ busy }: { busy?: boolean }) {
  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#f5c400]/35 bg-[#f5c400]/10">
      {busy ? <Loader2 className="h-3 w-3 animate-spin text-[#f5c400]" /> : <Sparkles className="h-3 w-3 text-[#f5c400]" />}
    </span>
  );
}

/** What an answer changed, grouped by position, with Undo for the latest applied answer. */
function ChangesCard({ turn, canUndo, onUndo }: { turn: ReviewTurn; canUndo: boolean; onUndo: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const groups = new Map<string, ChangeLine[]>();
  (turn.lines ?? []).forEach((line) => groups.set(line.position, [...(groups.get(line.position) ?? []), line]));
  const items: { key: string; position?: string; indent?: boolean; text: string }[] = [];
  groups.forEach((lines, position) =>
    lines.forEach((line, index) => items.push({ key: `${position}-${line.field}`, position: index === 0 ? position : undefined, indent: index > 0, text: line.text })),
  );
  if (turn.restoreSummary) items.push({ key: "summary", text: "Summary back to the computed text" });
  else if (turn.summary) items.push({ key: "summary", text: "Summary updated" });
  if (turn.restoreNextChecks) items.push({ key: "checks", text: "Next checks back to the computed ones" });
  else if (turn.nextChecks) items.push({ key: "checks", text: turn.nextChecks.length ? "Next checks updated" : "Next checks removed" });
  if (turn.view) items.push({ key: "view", text: `Table shows ${viewLabel(turn.view)}` });
  const shown = expanded ? items : items.slice(0, MAX_LINES);
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", turn.undone ? "border-[#252a33]" : "border-[#f5c400]/25 bg-[#f5c400]/[0.04]")}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn(EYEBROW, !turn.undone && "text-[#c9a400]")}>{turn.undone ? "Undone" : "Changed in the report"}</span>
        {canUndo ? (
          <button type="button" onClick={onUndo} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] font-medium text-[#aab3c2] transition-colors hover:bg-white/5 hover:text-white">
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
        ) : null}
      </div>
      <ul className={cn("mt-1.5 space-y-1 text-[12px] leading-5", turn.undone ? "text-[#687386] line-through decoration-[#4a5464]" : "text-[#c7cfdb]")}>
        {shown.map((item) => (
          <li key={item.key} className={cn("break-words", item.indent && "pl-3")}>
            {item.position ? <span className={cn("font-semibold", turn.undone ? "text-[#8c96a8]" : "text-white")}>{item.position} · </span> : null}
            {item.text}
          </li>
        ))}
      </ul>
      {items.length > MAX_LINES ? (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 text-[11.5px] text-[#8c96a8] hover:text-white">
          {expanded ? "Show less" : `+ ${items.length - MAX_LINES} more`}
        </button>
      ) : null}
    </div>
  );
}

function AssistantMessage({ turn, canUndo, onUndo, onRetry }: { turn: ReviewTurn; canUndo: boolean; onUndo: () => void; onRetry: () => void }) {
  const effect = Boolean(turn.lines?.length || turn.summary || turn.restoreSummary || turn.nextChecks || turn.restoreNextChecks || turn.view);
  return (
    <div className="flex gap-2.5">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-2">
        <p className={cn("whitespace-pre-line break-words text-[13px] leading-[1.6]", turn.error ? "text-rose-300" : "text-[#dbe2ec]")}>{turn.text}</p>
        {turn.error ? (
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-md border border-[#303845] px-2.5 py-1 text-[12px] text-[#c7cfdb] hover:border-[#f5c400]/40 hover:text-white">
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
        ) : null}
        {effect ? <ChangesCard turn={turn} canUndo={canUndo} onUndo={onUndo} /> : null}
        {turn.rejected?.length ? (
          <div className="flex gap-1.5 text-[11.5px] leading-5 text-amber-300/90">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <span className="font-medium">Not applied: </span>
              {turn.rejected.join(" ")}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ReviewChatProps = {
  turns: ReviewTurn[];
  sending: boolean;
  undoableId: string | null;
  suggestions: string[];
  editCount: number;
  onSend: (text: string) => void;
  onRetry: (turnId: string) => void;
  onUndo: (turnId: string) => void;
  onReset: () => void;
  onClose: () => void;
  className?: string;
};

/** The post-run human review as a chat: questions are answered, instructions change the report beside it. */
export function ReviewChat({ turns, sending, undoableId, suggestions, editCount, onSend, onRetry, onUndo, onReset, onClose, className }: ReviewChatProps) {
  const [input, setInput] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [turns.length, sending]);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    onSend(message);
    setInput("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(input);
    }
  };

  return (
    <section className={cn(PANEL, "flex min-h-0 flex-col overflow-hidden", className)} aria-label="Post-run human review">
      {/* One assistant at a time: the app's floating data assistant would sit on this chat's send button. */}
      <style>{"[data-floating-assistant]{display:none}"}</style>
      <header className="flex items-center gap-3 border-b border-[#1f252e] bg-[linear-gradient(110deg,rgba(245,196,0,0.07),rgba(11,15,21,0)_55%)] px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#f5c400]/30 bg-[#f5c400]/10">
          <MessageSquareText className="h-4 w-4 text-[#f5c400]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-white">Post-run human review</p>
          <p className="mt-0.5 truncate text-[11.5px] text-[#8c96a8]">
            {editCount ? `${editCount} ${editCount === 1 ? "change" : "changes"} in the report · marked in the table` : "Ask about the result or say what to change"}
          </p>
        </div>
        {turns.length && !confirmReset ? (
          <button type="button" onClick={() => setConfirmReset(true)} disabled={sending} className="rounded-md p-1.5 text-[#8c96a8] transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40" title="Start over" aria-label="Start over">
            <RotateCcw className="h-4 w-4" />
          </button>
        ) : null}
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-[#8c96a8] transition-colors hover:bg-white/5 hover:text-white" title="Close" aria-label="Close the review">
          <X className="h-4 w-4" />
        </button>
      </header>

      {confirmReset ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f252e] bg-amber-400/[0.06] px-4 py-2.5 text-[12px] text-amber-100">
          <span>Clear the conversation and undo every change?</span>
          <span className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                setConfirmReset(false);
                onReset();
              }}
              className="rounded-md bg-amber-400/90 px-2.5 py-1 font-semibold text-[#0b0f15] hover:bg-amber-300"
            >
              Start over
            </button>
            <button type="button" onClick={() => setConfirmReset(false)} className="rounded-md border border-[#303845] px-2.5 py-1 text-[#c7cfdb] hover:text-white">
              Keep
            </button>
          </span>
        </div>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {turns.length === 0 && !sending ? (
          <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center gap-4">
            <div>
              <p className="text-[13.5px] font-semibold text-white">Review the result in a conversation</p>
              <p className="mt-1.5 text-[12.5px] leading-5 text-[#8c96a8]">
                Ask why a position is or is not explained, or say what to change: Explanation Status, score, input, release note, the explanations, a reviewer note, or which positions the table shows. Every change is marked in the table and can be undone.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className={EYEBROW}>Try</p>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="w-full rounded-lg border border-[#252a33] bg-[#0d131b] px-3 py-2 text-left text-[12.5px] leading-5 text-[#c2cad5] transition-colors hover:border-[#f5c400]/40 hover:bg-[#111820] hover:text-white"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {turns.map((turn) =>
              turn.role === "user" ? (
                <div key={turn.id} className="flex justify-end">
                  <p className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-[#f5c400]/20 bg-[#f5c400]/[0.09] px-3.5 py-2 text-[13px] leading-5 text-[#f2f4f7]">{turn.text}</p>
                </div>
              ) : (
                <AssistantMessage key={turn.id} turn={turn} canUndo={turn.id === undoableId && !sending} onUndo={() => onUndo(turn.id)} onRetry={() => onRetry(turn.id)} />
              ),
            )}
            {sending ? (
              <div className="flex items-center gap-2.5">
                <Avatar busy />
                <p className="text-[12.5px] text-[#8c96a8]">Reviewing the report…</p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="border-t border-[#1f252e] bg-[#080c12]/60 p-3">
        <div className="mx-auto max-w-3xl rounded-xl border border-[#303845] bg-[#0d131b] p-2 transition-colors focus-within:border-[#f5c400]/50">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a question or say what to change…"
            className="max-h-32 min-h-10 resize-none border-0 bg-transparent px-2 py-1.5 text-[13px] shadow-none focus-visible:ring-0 dark:bg-transparent"
            maxLength={4000}
            rows={2}
            aria-label="Message to the review assistant"
          />
          <div className="mt-1 flex items-center justify-between gap-2 px-1">
            <span className="text-[10.5px] text-[#687386]">Enter to send · Shift+Enter for a new line</span>
            <button
              type="button"
              onClick={() => send(input)}
              disabled={!input.trim() || sending}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-[#f5c400] text-[#0b0f15] shadow-[0_0_14px_rgba(245,196,0,0.25)] transition-colors hover:bg-[#ffd633] disabled:bg-[#3a3a2a] disabled:text-[#8c8a70] disabled:shadow-none"
              aria-label="Send"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
