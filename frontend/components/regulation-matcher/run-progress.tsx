"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PANEL } from "./atoms";
import type { NotePhase, Run } from "./types";

/** Position of each phase in the pipeline; finished notes are past every step. */
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
const STEPS = ["interpret", "retrieve", "adjudicate", "verify", "review"] as const;

/** The run while it works: elapsed time, overall progress and where every release note is in the pipeline. */
export function RunProgress({ run, onCancel, cancelling }: { run: Run; onCancel: () => void; cancelling: boolean }) {
  const t = useTranslations("matcher.progress");
  const tFocus = useTranslations("matcher.focus");
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
  // Each note counts in thirds of a step while it works, so the bar moves before the first note is finished.
  const progress = total ? run.notes.reduce((sum, note) => sum + Math.min(PHASE_ORDER[note.phase], FINISHED), 0) / (total * FINISHED) : 0;
  const percent = Math.round(progress * 100);
  const regulations = run.regulations.map((item) => item.short).join(", ");

  return (
    <section data-tour="matcher-progress" className={cn(PANEL, "relative overflow-hidden")}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,196,0,0.10),transparent_45%)]" />
      <div className="relative flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div className="flex min-w-0 items-center gap-4">
          {live ? (
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#f5c400]/40 bg-[#f5c400]/10">
              <Loader2 className="h-5 w-5 animate-spin text-[#f5c400]" />
            </span>
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10">
              <Check className="h-5 w-5 text-emerald-300" />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[#f2f4f7]">{cancelling ? t("cancelling") : live ? tFocus("progressTitle", { notes: total, regulations }) : t("done")}</h3>
            <p className="mt-0.5 text-xs text-[#8c96a8]">{live ? tFocus("progressHint") : t("notesDone", { done: finished, total })}</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#687386]">{t("elapsed")}</p>
            <p className="font-mono text-sm font-semibold tabular-nums text-[#f2f4f7]">
              {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, "0")}
            </p>
          </div>
          {live && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="flex items-center gap-1.5 rounded-md border border-[#3a4350] px-3 py-1.5 text-xs font-medium text-[#c9d1dd] transition-colors hover:border-rose-400/50 hover:bg-rose-400/10 hover:text-rose-200 disabled:opacity-50"
            >
              <Square className="h-3 w-3 fill-current" />
              {t("cancel")}
            </button>
          )}
        </div>
      </div>
      <div className="relative px-6 pb-4">
        <div className="flex items-center justify-between text-[11px] text-[#8c96a8]">
          <span>{t("notesDone", { done: finished, total })}</span>
          <span className="font-mono tabular-nums text-[#f2f4f7]">{percent}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#1a2028]">
          <div className="h-full rounded-full bg-[linear-gradient(90deg,#f5c400,#ffe066)] transition-all duration-700" style={{ width: `${Math.max(3, percent)}%` }} />
        </div>
      </div>
      <div className="relative border-t border-[#1f252e]">
        <div className="grid grid-cols-[minmax(150px,220px)_minmax(0,1fr)_110px] gap-4 border-b border-[#1a2028] px-6 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">
          <span>{t("notes")}</span>
          <span className="grid grid-cols-5 gap-2">
            {STEPS.map((step) => (
              <span key={step}>{tFocus(`steps.${step}`)}</span>
            ))}
          </span>
          <span className="text-right">{t("links")}</span>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {run.notes.map((note) => {
            const order = PHASE_ORDER[note.phase];
            const working = order > 0 && order < FINISHED;
            return (
              <div key={note.key} className="grid grid-cols-[minmax(150px,220px)_minmax(0,1fr)_110px] items-center gap-4 border-b border-[#151a21] px-6 py-2.5 last:border-0">
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs font-semibold text-[#f2f4f7]">{note.jira_id || `#${note.key.split(":").pop()}`}</span>
                  <span className="block truncate text-[10.5px] text-[#687386]">{note.file}</span>
                </span>
                <span className="grid grid-cols-5 gap-2" aria-label={note.phase}>
                  {STEPS.map((step, index) => {
                    const position = index + 1;
                    const failed = note.phase === "failed" || note.phase === "cancelled";
                    const done = !failed && order > position;
                    const active = !failed && order === position;
                    return (
                      <span
                        key={step}
                        className={cn(
                          "h-1.5 rounded-full transition-colors duration-500",
                          done ? "bg-emerald-400/80" : active ? "animate-pulse bg-[#f5c400]" : failed ? "bg-rose-400/40" : "bg-[#1f2630]",
                        )}
                      />
                    );
                  })}
                </span>
                <span className="flex items-center justify-end gap-1.5 text-right text-xs">
                  {note.phase === "done" ? (
                    <span className={cn("font-mono", note.link_count ? "text-emerald-300" : "text-[#8c96a8]")}>{tFocus("linksFound", { count: note.link_count })}</span>
                  ) : note.phase === "failed" || note.phase === "cancelled" ? (
                    <span className="flex items-center gap-1 text-rose-300">
                      <X className="h-3 w-3" />
                      {tPhase(note.phase)}
                    </span>
                  ) : working ? (
                    <span className="flex items-center gap-1 text-[#f5c400]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {tPhase(note.phase)}
                    </span>
                  ) : (
                    <span className="text-[#687386]">{tPhase("queued")}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
