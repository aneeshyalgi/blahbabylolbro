"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Scissors, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useStudioText } from "./i18n";
import type { ToolInfo } from "./types";

// A step starts with "1." or "1)" followed by whitespace (so "1.5%" is not a step).
const STEP_LINE = /^\s*\d+[.)](?:\s+(.*))?$/;

/** Older drafts stored a list as its text form, e.g. ["1. …", "2. …"]; turn that back into lines. */
function repairListText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return text;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed.join("\n");
  } catch {
    // Not JSON; fall through to a quote-aware split.
  }
  const inner = trimmed.slice(1, -1).trim();
  if (!/^["']/.test(inner)) return text;
  return inner
    .split(/["']\s*,\s*["']/)
    .map((part) => part.replace(/^["']|["']$/g, "").trim())
    .join("\n");
}

export function parseProcedure(text: string): { intro: string; steps: string[] } {
  const intro: string[] = [];
  const steps: string[] = [];
  for (const line of repairListText(text).split(/\r?\n/)) {
    const match = line.match(STEP_LINE);
    if (match) steps.push(match[1] ?? "");
    else if (steps.length) steps[steps.length - 1] += `\n${line}`;
    else intro.push(line);
  }
  return { intro: intro.join("\n").trim(), steps: steps.map((step) => step.trimEnd()) };
}

export function serializeProcedure(intro: string, steps: string[]): string {
  return [intro.trim(), ...steps.map((step, index) => `${index + 1}. ${step}`.trimEnd())].filter(Boolean).join("\n");
}

function splitIntoSteps(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const source = lines.length > 1 ? lines : text.replace(/([.!?])\s+(?=[A-Z0-9])/g, "$1\n").split("\n");
  return source.map((line) => line.trim()).filter(Boolean);
}

type Cursor = { index: number; start: number; end: number };

export function ProcedureEditor({
  value,
  onChange,
  tools,
  accent,
}: {
  value: string;
  onChange: (value: string) => void;
  tools: ToolInfo[];
  accent: string;
}) {
  const { t, toolDescription } = useStudioText();
  const [mode, setMode] = useState<"steps" | "text">("steps");
  const { intro, steps } = parseProcedure(value);
  const stepRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const lastCursor = useRef<Cursor | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ index: number; caret?: number } | null>(null);

  useEffect(() => {
    if (!focusRequest) return;
    const element = stepRefs.current[focusRequest.index];
    if (element) {
      element.focus();
      const caret = focusRequest.caret ?? element.value.length;
      element.setSelectionRange(caret, caret);
    }
    setFocusRequest(null);
  }, [focusRequest]);

  const commit = (nextIntro: string, nextSteps: string[]) => onChange(serializeProcedure(nextIntro, nextSteps));

  const insertStep = (at: number) => {
    const next = [...steps];
    next.splice(at, 0, "");
    commit(intro, next);
    setFocusRequest({ index: at });
  };

  const removeStep = (index: number) => {
    commit(intro, steps.filter((_step, stepIndex) => stepIndex !== index));
    if (steps.length > 1) setFocusRequest({ index: Math.max(0, index - 1) });
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    commit(intro, next);
    setFocusRequest({ index: target });
  };

  const onStepKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const caret = event.currentTarget.selectionStart;
      const text = steps[index];
      const next = [...steps];
      next.splice(index, 1, text.slice(0, caret).trimEnd(), text.slice(caret).trimStart());
      commit(intro, next);
      setFocusRequest({ index: index + 1, caret: 0 });
    } else if (event.key === "Backspace" && !steps[index] && steps.length > 1) {
      event.preventDefault();
      removeStep(index);
    }
  };

  const insertTool = (name: string) => {
    if (!steps.length) {
      commit(intro, [t("procedure.toolStepPrefix", { tool: name })]);
      setFocusRequest({ index: 0 });
      return;
    }
    const cursor = lastCursor.current && lastCursor.current.index < steps.length
      ? lastCursor.current
      : { index: steps.length - 1, start: steps[steps.length - 1].length, end: steps[steps.length - 1].length };
    const text = steps[cursor.index];
    const before = text.slice(0, cursor.start);
    const insertion = `${before && !/\s$/.test(before) ? " " : ""}${name} `;
    const next = steps.map((step, index) => (index === cursor.index ? `${before}${insertion}${text.slice(cursor.end)}` : step));
    commit(intro, next);
    const caret = before.length + insertion.length;
    lastCursor.current = { index: cursor.index, start: caret, end: caret };
    setFocusRequest({ index: cursor.index, caret });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-[#e5e9ef]">{t("procedure.title")}</span>
        <div className="flex rounded-md border border-[#252a33] bg-[#0b1017] p-0.5 text-[11px]">
          {(["steps", "text"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={cn("rounded px-2.5 py-1 font-medium transition-colors", mode === option ? "bg-[#1a222d] text-white" : "text-[#8c96a8] hover:text-white")}
              aria-pressed={mode === option}
            >
              {option === "steps" ? t("procedure.steps") : t("procedure.text")}
            </button>
          ))}
        </div>
      </div>

      {mode === "text" ? (
        <>
          <Textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={t("procedure.textPlaceholder")}
            maxLength={12000}
            spellCheck={false}
            className="min-h-52 resize-y border-[#252a33] bg-[#0b1017] text-sm leading-6"
          />
          <p className="text-[10.5px] text-[#687386]">{t("procedure.textHint")}</p>
        </>
      ) : (
        <div className="space-y-2">
          {intro ? (
            <div className="rounded-lg border border-dashed border-[#303845] p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#687386]">{t("procedure.context")}</span>
                <button
                  type="button"
                  onClick={() => {
                    const pieces = splitIntoSteps(intro);
                    commit("", [...pieces, ...steps]);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-[#8c96a8] hover:text-white"
                  title={t("procedure.splitTitle")}
                >
                  <Scissors className="h-3 w-3" /> {t("procedure.split")}
                </button>
              </div>
              <Textarea
                value={intro}
                onChange={(event) => commit(event.target.value, steps)}
                spellCheck={false}
                className="min-h-12 resize-none border-0 bg-transparent p-0 text-sm leading-6 shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
            </div>
          ) : null}

          <ol className="space-y-1.5">
            {steps.map((step, index) => (
              <li key={index} className="group relative flex items-start gap-2.5 rounded-lg border border-[#252a33] bg-[#0b1017] p-2 transition-colors focus-within:border-[#f5c400]/40">
                <span
                  className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums"
                  style={{ backgroundColor: `${accent}1f`, color: accent, boxShadow: `inset 0 0 0 1px ${accent}55` }}
                >
                  {index + 1}
                </span>
                <Textarea
                  ref={(element) => {
                    stepRefs.current[index] = element;
                  }}
                  value={step}
                  onChange={(event) => commit(intro, steps.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
                  onKeyDown={(event) => onStepKeyDown(event, index)}
                  onSelect={(event) => {
                    lastCursor.current = { index, start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
                  }}
                  placeholder={index === 0 ? t("procedure.firstPlaceholder") : t("procedure.nextPlaceholder")}
                  spellCheck={false}
                  rows={1}
                  className="min-h-8 flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-6 shadow-none focus-visible:ring-0 dark:bg-transparent"
                />
                <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} className="rounded p-1 text-[#687386] hover:text-white disabled:opacity-30" aria-label={t("procedure.moveUp", { n: index + 1 })}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} className="rounded p-1 text-[#687386] hover:text-white disabled:opacity-30" aria-label={t("procedure.moveDown", { n: index + 1 })}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => removeStep(index)} className="rounded p-1 text-[#687386] hover:text-red-400" aria-label={t("procedure.delete", { n: index + 1 })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={() => insertStep(steps.length)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#303845] py-2 text-xs text-[#8c96a8] transition-colors hover:border-[#f5c400]/50 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" /> {steps.length ? t("procedure.add") : t("procedure.addFirst")}
          </button>
          <p className="text-[10.5px] text-[#687386]">{t("procedure.keys")}</p>
        </div>
      )}

      {tools.length ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10.5px] text-[#687386]">{t("procedure.insertTool")}</span>
          {tools.map((tool) => (
            <button
              key={tool.name}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => (mode === "steps" ? insertTool(tool.name) : onChange(`${value}${value && !/\s$/.test(value) ? " " : ""}${tool.name} `))}
              className="rounded border border-[#303845] bg-[#0b1017] px-1.5 py-0.5 font-mono text-[10.5px] text-[#aeb8c7] transition-colors hover:border-[#f5c400]/50 hover:text-white"
              title={toolDescription(tool)}
            >
              {tool.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
