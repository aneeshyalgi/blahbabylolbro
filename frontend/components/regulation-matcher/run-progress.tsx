"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check, Gavel, Languages, Loader2, ScanSearch, ShieldCheck, Sparkles, Square, Terminal, UserCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PANEL, SectionLabel, StatusDot, formatNumber } from "./atoms";
import type { LogEntry, NotePhase, Run } from "./types";

const PHASE_ORDER: Record<NotePhase, number> = {
  queued: 0,
  interpreting: 1,
  retrieving: 2,
  adjudicating: 3,
  verifying: 4,
  reviewing: 5,
  translating: 6,
  done: 7,
  failed: 7,
  cancelled: 7,
};
const FINISHED = 7;

const STAGES = [
  { key: "interpret", phase: "interpreting", icon: Sparkles },
  { key: "retrieve", phase: "retrieving", icon: ScanSearch },
  { key: "adjudicate", phase: "adjudicating", icon: Gavel },
  { key: "verify", phase: "verifying", icon: ShieldCheck },
  { key: "review", phase: "reviewing", icon: UserCheck },
  { key: "translate", phase: "translating", icon: Languages },
] as const;

export function RunProgress({ run, onCancel, cancelling, locale }: { run: Run; onCancel: () => void; cancelling: boolean; locale: string }) {
  const t = useTranslations("matcher.progress");
  const tPhase = useTranslations("matcher.phase");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  const live = run.status === "running";
  const started = new Date(run.created_at).getTime();
  const elapsed = live ? Math.max(0, (now - started) / 1000) : (run.duration_ms ?? 0) / 1000;
  const total = run.notes.length;
  const finished = run.notes.filter((note) => PHASE_ORDER[note.phase] >= FINISHED).length;
  const percent = total ? Math.round((finished / total) * 100) : 0;
  const linksFound = run.notes.reduce((sum, note) => sum + (note.link_count || 0), 0);

  const stageStats = useMemo(
    () =>
      STAGES.map((stage, index) => {
        const order = index + 1;
        const done = run.notes.filter((note) => PHASE_ORDER[note.phase] > order).length;
        const active = run.notes.filter((note) => PHASE_ORDER[note.phase] === order).length;
        return { ...stage, done, active };
      }),
    [run.notes],
  );

  return (
    <div className="space-y-5">
      <section data-tour="matcher-progress" className={cn(PANEL, "relative overflow-hidden")}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,196,0,0.12),transparent_45%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-4">
            {live ? (
              <span className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[#f5c400]/40 bg-[#f5c400]/10">
                <Loader2 className="h-5 w-5 animate-spin text-[#f5c400]" />
                <span className="absolute inset-0 animate-ping rounded-full border border-[#f5c400]/20" />
              </span>
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10">
                <Check className="h-5 w-5 text-emerald-300" />
              </span>
            )}
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold text-[#f2f4f7]">
                {cancelling ? t("cancelling") : live ? t("title") : t("done")}
              </h3>
              <p className="text-xs text-[#8c96a8]">
                {t("subtitle", { notes: total, regulations: run.regulations.map((item) => item.short).join(", ") })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Metric label={t("elapsed")} value={`${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`} />
            <Metric label={t("llmCalls")} value={formatNumber(run.usage.llm_calls, locale)} />
            <Metric label={t("tokens")} value={formatNumber(run.usage.prompt_tokens + run.usage.completion_tokens, locale)} />
            <Metric label={t("links")} value={String(linksFound)} />
            {live && (
              <Button variant="outline" size="sm" onClick={onCancel} disabled={cancelling} className="gap-1.5 border-[#3a4350] bg-transparent text-[#c9d1dd] hover:border-rose-400/50 hover:bg-rose-400/10 hover:text-rose-200">
                <Square className="h-3 w-3 fill-current" />
                {t("cancel")}
              </Button>
            )}
          </div>
        </div>
        <div className="relative px-6 pb-5">
          <div className="flex items-center justify-between text-[11px] text-[#8c96a8]">
            <span>{t("notesDone", { done: finished, total })}</span>
            <span className="font-mono tabular-nums text-[#f2f4f7]">{percent}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#1a2028]">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,#f5c400,#ffe066)] transition-all duration-700" style={{ width: `${Math.max(3, percent)}%` }} />
          </div>
        </div>
        <div data-tour="matcher-stages" className="relative grid grid-cols-6 gap-px border-t border-[#1f252e] bg-[#1a2028]">
          {stageStats.map(({ key, icon: Icon, done, active }) => {
            const complete = total > 0 && done === total;
            return (
              <div key={key} className="bg-[#0b0f15] px-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-[#f2f4f7]">
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-md border",
                        complete ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : active ? "border-[#f5c400]/50 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#252a33] text-[#687386]",
                      )}
                    >
                      {complete ? <Check className="h-3.5 w-3.5" /> : <Icon className={cn("h-3.5 w-3.5", active && "animate-pulse")} />}
                    </span>
                    {t(`stages.${key}`)}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-[#8c96a8]">
                    {done}/{total}
                  </span>
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#1a2028]">
                  <div className={cn("h-full rounded-full transition-all duration-700", complete ? "bg-emerald-400" : "bg-[#f5c400]")} style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                </div>
                <p className="mt-2 h-4 text-[11px] text-[#687386]">{active > 0 ? t("activeNotes", { count: active }) : complete ? t("stageDone") : ""}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <section className={cn(PANEL, "flex max-h-[460px] flex-col")}>
          <header className="border-b border-[#1f252e] px-5 py-3">
            <SectionLabel>{t("notes")}</SectionLabel>
          </header>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {run.notes.map((note) => {
                  const working = PHASE_ORDER[note.phase] > 0 && PHASE_ORDER[note.phase] < FINISHED;
                  return (
                    <tr key={note.key} className="border-b border-[#151a21] last:border-0">
                      <td className="px-5 py-2.5">
                        <span className="flex items-center gap-2">
                          <StatusDot status={note.status} />
                          <span className="font-mono text-xs font-semibold text-[#f2f4f7]">{note.jira_id || `#${note.key.split(":").pop()}`}</span>
                        </span>
                      </td>
                      <td className="max-w-[180px] truncate px-2 py-2.5 text-xs text-[#687386]">{note.file}</td>
                      <td className="px-2 py-2.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
                            working ? "border-[#f5c400]/30 bg-[#f5c400]/10 text-[#f5c400]" : note.phase === "done" ? "border-emerald-400/25 text-emerald-300" : note.phase === "failed" ? "border-rose-400/30 text-rose-300" : "border-[#252a33] text-[#687386]",
                          )}
                        >
                          {working && <Loader2 className="h-3 w-3 animate-spin" />}
                          {note.phase === "done" && <Check className="h-3 w-3" />}
                          {note.phase === "failed" && <X className="h-3 w-3" />}
                          {tPhase(note.phase)}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs text-[#aab3c2]">{note.phase === "done" ? t("linkCount", { count: note.link_count }) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <LogConsole entries={run.log} live title={t("log")} tourId="matcher-live-log" />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[#687386]">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums text-[#f2f4f7]">{value}</p>
    </div>
  );
}

const LEVEL_STYLES: Record<LogEntry["level"], string> = {
  info: "text-sky-300",
  warn: "text-amber-300",
  error: "text-rose-300",
  success: "text-emerald-300",
};

export function LogConsole({
  entries,
  live = false,
  title,
  className,
  filter,
  tourId,
}: {
  entries: LogEntry[];
  live?: boolean;
  title: string;
  className?: string;
  filter?: ReactNode;
  tourId?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (live && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [entries.length, live]);
  return (
    <section data-tour={tourId} className={cn("flex max-h-[460px] min-h-[240px] flex-col overflow-hidden rounded-lg border border-[#252a33] bg-[#06090d]", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-[#1a2028] bg-[#0b0f15] px-4 py-2.5">
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8c96a8]">
          <Terminal className="h-3.5 w-3.5 text-[#f5c400]" />
          {title}
          {live && <span className="ml-1 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
        </span>
        {filter}
      </header>
      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed">
        {entries.map((entry, index) => (
          <div key={index} className="flex gap-3 py-0.5">
            <span className="w-14 shrink-0 text-right tabular-nums text-[#4b5563]">{entry.t.toFixed(1)}s</span>
            <span className={cn("w-14 shrink-0 uppercase", LEVEL_STYLES[entry.level])}>{entry.level}</span>
            {entry.note ? <span className="w-16 shrink-0 truncate text-[#f5c400]/80">{entry.note}</span> : <span className="w-16 shrink-0 text-[#3a4350]">run</span>}
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[#c9d1dd]">{entry.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
