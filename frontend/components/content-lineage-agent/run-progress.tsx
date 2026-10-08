"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Ban, BookOpenCheck, CheckCircle2, Clock, Languages, Loader2, Microscope, Route, Scale, ScanSearch, Square, UserCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EYEBROW, PANEL, formatDuration } from "./atoms";
import { AgentConsole } from "./log";
import type { Run, Stage } from "./types";

const STAGES = [
  { id: "trace", icon: Microscope },
  { id: "compose", icon: Route },
  { id: "describe", icon: BookOpenCheck },
  { id: "regulate", icon: Scale },
  { id: "review", icon: UserCheck },
  { id: "translate", icon: Languages },
] as const;

const POSITION: Record<Stage, number> = {
  queued: 0, load: 0, trace: 0, compose: 1, describe: 2, regulate: 3, review: 4, translate: 5, assemble: 6, finished: 6,
};

export function RunProgress({ run, cancelling, onCancel, onNew }: { run: Run; cancelling: boolean; onCancel: () => void; onNew: () => void }) {
  const t = useTranslations("contentLineageAgent.progress");
  const locale = useLocale();
  const running = run.status === "running";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running]);
  const elapsed = running ? now - new Date(run.created_at).getTime() : run.duration_ms ?? 0;
  const position = run.status === "completed" ? 6 : POSITION[run.stage] ?? 0;
  const params = (code: string) => [...run.log].reverse().find((entry) => entry.code === code)?.params ?? null;
  const regulationSkipped = Boolean(params("regulation_skipped")) || (run.settings.regulation_ids.length === 0);
  const detail = (id: (typeof STAGES)[number]["id"]): string | null => {
    if (id === "trace") {
      const p = params("replay_done");
      if (p) return t("detail.trace", { cells: Number(p.cells), changes: Number(p.changes) });
      return params("replay_mismatch") || params("replay_columns") ? t("detail.traceMismatch") : null;
    }
    if (id === "compose") {
      const p = params("scope");
      const c = params("composed");
      if (!p) return null;
      return t("detail.compose", { terms: Number(p.terms), rules: Number(p.rules), cases: Number(p.cases) }) + (c ? ` · ${t("detail.paths", { count: Number(c.paths) })}` : "");
    }
    if (id === "describe") {
      if (!run.progress.rules_total) return null;
      return t("detail.describe", { done: run.progress.rules_described, total: run.progress.rules_total });
    }
    if (id === "regulate") {
      if (regulationSkipped) return t("detail.skipped");
      if (position < 3) return null;
      return t("detail.regulate", { done: run.progress.rules_regulated, total: run.progress.rules_total, provisions: run.progress.provisions_linked });
    }
    if (id === "review") {
      if (regulationSkipped) return t("detail.skipped");
      if (position < 4 || !run.progress.rules_to_review) return null;
      return t("detail.review", { done: run.progress.rules_reviewed, total: run.progress.rules_to_review });
    }
    if (id === "translate") {
      const p = params("translated");
      return p ? t("detail.translate", { count: Number(p.count) }) : null;
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <section data-tour="content-progress" className={cn(PANEL, "relative overflow-hidden p-5")}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(245,196,0,0.07),transparent_55%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={EYEBROW}>{running ? t("running") : run.status === "failed" ? t("failed") : run.status === "cancelled" ? t("cancelled") : run.status === "interrupted" ? t("interrupted") : t("done")}</p>
            <h2 className="mt-1 flex items-center gap-2.5 text-[20px] font-semibold text-white">
              {running ? <Loader2 className="h-5 w-5 animate-spin text-[#f5c400]" /> : run.status === "completed" ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : run.status === "cancelled" ? <Ban className="h-5 w-5 text-amber-400" /> : <XCircle className="h-5 w-5 text-rose-400" />}
              {t("title", { cluster: run.source.cluster_name ?? "–" })}
            </h2>
            <p className="mt-1 text-[12.5px] text-[#8c96a8]">
              <span className="font-mono text-[#c2cad5]">{run.source.code_filename}</span> · {run.source.dataset_name ?? "–"}
              {(run.settings.figures_traced.length || run.settings.figures.length) > 0 && <> · {t("figures", { figures: (run.settings.figures_traced.length ? run.settings.figures_traced : run.settings.figures).join(", ") })}</>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-md border border-[#252a33] bg-[#0f141b] px-2.5 py-1.5 font-mono text-[12px] tabular-nums text-[#c2cad5]">
              <Clock className="h-3.5 w-3.5 text-[#687386]" />
              {formatDuration(elapsed, locale)}
            </span>
            {running ? (
              <button type="button" onClick={onCancel} disabled={cancelling} className="flex items-center gap-1.5 rounded-md border border-rose-400/40 px-3 py-1.5 text-[12.5px] text-rose-200 transition-colors hover:bg-rose-400/10 disabled:opacity-50">
                {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                {t("cancel")}
              </button>
            ) : (
              <button type="button" onClick={onNew} className="flex items-center gap-1.5 rounded-md bg-[#f5c400] px-3 py-1.5 text-[12.5px] font-semibold text-[#0b0f15] hover:bg-[#ffd633]">
                <ScanSearch className="h-3.5 w-3.5" /> {t("new")}
              </button>
            )}
          </div>
        </div>

        <ol data-tour="content-stages" className="relative mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((stage, index) => {
            const skipped = (stage.id === "regulate" || stage.id === "review") && regulationSkipped && index < position;
            const state = run.status !== "running" && run.status !== "completed" && index === position ? "failed" : index < position ? (skipped ? "skipped" : "done") : index === position && running ? "active" : "pending";
            const Icon = stage.icon;
            const text = detail(stage.id);
            return (
              <li key={stage.id} className={cn(
                "relative rounded-lg border px-3.5 py-3 transition-colors",
                state === "done" && "border-emerald-400/25 bg-emerald-400/[0.04]",
                state === "skipped" && "border-[#1f252e] bg-[#0d1218] opacity-70",
                state === "active" && "border-[#f5c400]/45 bg-[#f5c400]/[0.06] shadow-[0_0_24px_rgba(245,196,0,0.10)]",
                state === "pending" && "border-[#1f252e] bg-[#0d1218]",
                state === "failed" && "border-rose-400/35 bg-rose-400/[0.05]",
              )}>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border",
                    state === "done" ? "border-emerald-400/50 text-emerald-300" : state === "active" ? "border-[#f5c400]/60 text-[#f5c400]" : state === "failed" ? "border-rose-400/50 text-rose-300" : "border-[#2c3440] text-[#5d6878]",
                  )}>
                    {state === "done" ? <CheckCircle2 className="h-4 w-4" /> : state === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#687386]">{t("step", { index: index + 1 })}</span>
                </div>
                <p className={cn("mt-2 text-[13px] font-semibold", state === "pending" || state === "skipped" ? "text-[#8c96a8]" : "text-white")}>{t(`stages.${stage.id}.title`)}</p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-[#8c96a8]">{t(`stages.${stage.id}.body`)}</p>
                {text && <p className={cn("mt-2 font-mono text-[11px]", state === "active" ? "text-[#f5c400]" : "text-[#aab3c2]")}>{text}</p>}
                {(stage.id === "describe" || stage.id === "regulate" || stage.id === "review") && state === "active" && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#1a212c]">
                    <div
                      className="h-full rounded-full bg-[#f5c400] transition-[width] duration-300"
                      style={{
                        width: `${
                          stage.id === "describe"
                            ? (100 * run.progress.rules_described) / Math.max(1, run.progress.rules_total)
                            : stage.id === "regulate"
                              ? (100 * run.progress.rules_regulated) / Math.max(1, run.progress.rules_total)
                              : (100 * run.progress.rules_reviewed) / Math.max(1, run.progress.rules_to_review)
                        }%`,
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {run.error && (
          <div className="relative mt-4 rounded-md border border-rose-400/35 bg-rose-400/[0.07] px-4 py-3 text-[12.5px] text-rose-100">
            <p className="font-semibold">{t("errorTitle")}</p>
            <p className="mt-0.5">{run.error}</p>
          </div>
        )}
        {run.status === "interrupted" && <p className="relative mt-4 text-[12.5px] text-amber-200">{t("interruptedBody")}</p>}
      </section>

      <section className={cn(PANEL, "p-4")}>
        <div className="mb-2.5 flex items-center justify-between">
          <p className={EYEBROW}>{t("console")}</p>
          <span className="text-[11px] text-[#5d6878]">{t("consoleHint")}</span>
        </div>
        <AgentConsole log={run.log} live={running} className="h-[360px]" tourId="content-console" />
      </section>
    </div>
  );
}
