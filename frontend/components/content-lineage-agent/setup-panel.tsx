"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle, BookOpenCheck, Boxes, Code2, Database, Languages, Layers, Loader2, Microscope, Rocket, Route, Scale, Search, Sparkles, Star, Target, UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EYEBROW, PANEL, formatDateTime } from "./atoms";
import type { Preview, Sources } from "./types";

const METHOD = [
  { id: "trace", icon: Microscope },
  { id: "compose", icon: Route },
  { id: "describe", icon: BookOpenCheck },
  { id: "regulate", icon: Scale },
  { id: "review", icon: UserCheck },
  { id: "translate", icon: Languages },
] as const;

export function SetupPanel({
  sources, loading, selected, onSelect, preview, previewLoading, figures, onFigures, regulations, onRegulations, starting, onStart,
}: {
  sources: Sources | null;
  loading: boolean;
  selected: string | null;
  onSelect: (executionId: string) => void;
  preview: Preview | null;
  previewLoading: boolean;
  figures: string[];
  onFigures: (figures: string[]) => void;
  regulations: string[];
  onRegulations: (ids: string[]) => void;
  starting: boolean;
  onStart: () => void;
}) {
  const t = useTranslations("contentLineageAgent.setup");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const clusters = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = sources?.clusters ?? [];
    if (!needle) return list;
    return list.filter((cluster) => `${cluster.name} ${cluster.dataset_name ?? ""} ${cluster.code_filename ?? ""}`.toLowerCase().includes(needle));
  }, [sources, query]);
  const selectedCluster = sources?.clusters.find((cluster) => cluster.executions.some((execution) => execution.execution_id === selected));
  const selectedExecution = selectedCluster?.executions.find((execution) => execution.execution_id === selected);
  const executions = (sources?.clusters ?? []).reduce((sum, cluster) => sum + cluster.executions.length, 0);
  const ready = (sources?.regulations ?? []).filter((item) => item.ready);
  const toggleFigure = (column: string) => onFigures(figures.includes(column) ? figures.filter((item) => item !== column) : [...figures, column].slice(0, 6));
  const toggleRegulation = (id: string) => onRegulations(regulations.includes(id) ? regulations.filter((item) => item !== id) : [...regulations, id]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section data-tour="content-executions" className={cn(PANEL, "flex flex-col")}>
          <div className="flex flex-wrap items-center gap-3 border-b border-[#1f252e] px-4 py-3">
            <StepNumber value={1} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-white">{t("executionsTitle")}</p>
              <p className="text-[11.5px] text-[#8c96a8]">{t("executionsHint")}</p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5d6878]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} className="h-8 w-52 rounded-md border border-[#252a33] bg-[#0f141b] pl-8 pr-2 text-[12px] text-white outline-none placeholder:text-[#5d6878] focus:border-[#f5c400]/50" />
            </div>
          </div>
          <div className="max-h-[520px] min-h-[260px] flex-1 overflow-y-auto p-2">
            {loading && (
              <div className="flex items-center gap-2 px-3 py-6 text-[12.5px] text-[#8c96a8]"><Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}</div>
            )}
            {!loading && executions === 0 && (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <Boxes className="h-9 w-9 text-[#3f4957]" />
                <p className="mt-3 text-[13px] font-semibold text-white">{t("emptyTitle")}</p>
                <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-[#8c96a8]">{t("emptyBody")}</p>
              </div>
            )}
            {!loading && clusters.map((cluster) => (
              <div key={cluster.id} className="mb-2 overflow-hidden rounded-md border border-[#1f252e]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#0f141b] px-3 py-2">
                  <span className="text-[13px] font-semibold text-white">{cluster.name}</span>
                  {cluster.is_reference && <span className="inline-flex items-center gap-1 rounded-full border border-[#f5c400]/30 px-1.5 text-[10px] text-[#f5c400]"><Star className="h-2.5 w-2.5" />{t("reference")}</span>}
                  {cluster.reporting_date && <span className="text-[11px] text-[#687386]">{t("reportingDate", { date: cluster.reporting_date })}</span>}
                  <span className="ml-auto flex items-center gap-3 text-[11px] text-[#8c96a8]">
                    <span className="flex items-center gap-1"><Database className="h-3 w-3" />{cluster.dataset_name ?? "–"}</span>
                    <span className="flex items-center gap-1 font-mono"><Code2 className="h-3 w-3" />{cluster.code_filename ?? "–"}</span>
                  </span>
                </div>
                {cluster.executions.length === 0 && <p className="px-3 py-2.5 text-[11.5px] text-[#5d6878]">{t("noExecutions")}</p>}
                {cluster.executions.map((execution) => {
                  const active = execution.execution_id === selected;
                  return (
                    <button
                      key={execution.execution_id}
                      type="button"
                      onClick={() => onSelect(execution.execution_id)}
                      aria-pressed={active}
                      className={cn("flex w-full items-center gap-3 border-t border-[#1a2029] px-3 py-2.5 text-left transition-colors", active ? "bg-[#f5c400]/[0.08]" : "hover:bg-white/[0.02]")}
                    >
                      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", active ? "border-[#f5c400]" : "border-[#3f4957]")}>
                        {active && <span className="h-2 w-2 rounded-full bg-[#f5c400]" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-[12.5px]", active ? "text-[#f5c400]" : "text-[#e5e9f0]")}>{t("executedAt", { date: formatDateTime(execution.executed_date, locale) })}</span>
                        <span className="mt-0.5 block font-mono text-[10.5px] text-[#5d6878]">{execution.execution_id.slice(0, 8)}</span>
                      </span>
                      <span className="flex shrink-0 gap-2 text-[11px] text-[#8c96a8]">
                        <span className="rounded border border-[#252a33] px-1.5 py-[1px] tabular-nums">{t("records", { count: execution.rows ?? 0 })}</span>
                        <span className="rounded border border-[#252a33] px-1.5 py-[1px] tabular-nums">{t("columns", { count: execution.columns })}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section data-tour="content-figures" className={cn(PANEL, "flex flex-col")}>
            <div className="flex items-center gap-3 border-b border-[#1f252e] px-4 py-3">
              <StepNumber value={2} />
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-white">{t("figuresTitle")}</p>
                <p className="text-[11.5px] text-[#8c96a8]">{t("figuresHint")}</p>
              </div>
            </div>
            {!selected && (
              <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
                <Target className="h-8 w-8 text-[#3f4957]" />
                <p className="mt-3 text-[12.5px] text-[#8c96a8]">{t("figuresEmpty")}</p>
              </div>
            )}
            {selected && previewLoading && !preview && (
              <div className="flex items-center gap-2 px-4 py-6 text-[12.5px] text-[#8c96a8]"><Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}</div>
            )}
            {selected && preview && (
              <div className="space-y-3 p-4">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[#8c96a8]">
                  <span className="font-mono text-[#c2cad5]">{preview.code.filename}</span>
                  <span>{t("lines", { count: preview.code.line_count })}</span>
                  <span>{t("records", { count: preview.rows })}</span>
                  <span>{t("derivedCount", { count: preview.derived.length })}</span>
                </p>
                {preview.derived.length === 0 ? (
                  <p className="flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-[12px] text-amber-200"><AlertTriangle className="h-4 w-4" />{t("noDerived")}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {preview.derived.map((item) => {
                      const active = figures.includes(item.column);
                      return (
                        <button
                          key={item.column}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleFigure(item.column)}
                          className={cn(
                            "group inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] transition-colors",
                            active ? "border-[#f5c400]/60 bg-[#f5c400]/12 text-[#f5c400]" : "border-[#2c3440] bg-[#121821] text-[#dbe2ec] hover:border-[#f5c400]/40",
                          )}
                          title={item.used_by.length ? t("usedBy", { columns: item.used_by.join(", ") }) : t("endOfChain")}
                        >
                          <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded-sm border", active ? "border-[#f5c400] bg-[#f5c400]" : "border-[#4a5464]")}>
                            {active && <span className="h-1.5 w-1.5 rounded-[1px] bg-[#0b0f15]" />}
                          </span>
                          <span className="font-mono">{item.column}</span>
                          {item.default && <span className="rounded bg-[#f5c400]/15 px-1 text-[9.5px] font-semibold uppercase tracking-wide text-[#f5c400]">{t("suggested")}</span>}
                          {!item.numeric && <span className="text-[10px] text-[#687386]">{t("text")}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] leading-relaxed text-[#687386]">{t("figuresNote")}</p>
              </div>
            )}
          </section>

          <section data-tour="content-regulations" className={cn(PANEL, "flex flex-col")}>
            <div className="flex items-center gap-3 border-b border-[#1f252e] px-4 py-3">
              <StepNumber value={3} />
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-white">{t("regulationsTitle")}</p>
                <p className="text-[11.5px] text-[#8c96a8]">{t("regulationsHint")}</p>
              </div>
            </div>
            <div className="space-y-1.5 p-3">
              {(sources?.regulations ?? []).length === 0 && <p className="px-1 py-2 text-[12px] text-[#8c96a8]">{t("regulationsEmpty")}</p>}
              {(sources?.regulations ?? []).map((document) => {
                const active = regulations.includes(document.id);
                return (
                  <button
                    key={document.id}
                    type="button"
                    disabled={!document.ready}
                    aria-pressed={active}
                    onClick={() => toggleRegulation(document.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      active ? "border-orange-400/40 bg-orange-400/[0.07]" : "border-[#1f252e] bg-[#0d1218] hover:border-[#2c3440]",
                    )}
                  >
                    <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border", active ? "border-orange-300 bg-orange-300" : "border-[#4a5464]")}>
                      {active && <span className="h-1.5 w-1.5 rounded-[1px] bg-[#0b0f15]" />}
                    </span>
                    <Scale className="h-4 w-4 shrink-0 text-orange-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-white">{document.short} · <span className="font-normal text-[#aab3c2]">{document.title ?? document.filename}</span></span>
                      <span className="block text-[11px] text-[#687386]">
                        {document.ready ? t("regulationMeta", { articles: document.articles ?? 0, pages: document.pages ?? 0 }) : t("regulationNotReady")}
                      </span>
                    </span>
                  </button>
                );
              })}
              {sources && ready.length > 0 && regulations.length === 0 && <p className="px-1 pt-1 text-[11px] text-amber-200/80">{t("regulationsNone")}</p>}
            </div>
          </section>
        </div>
      </div>

      <section data-tour="content-method" className={cn(PANEL, "p-4")}>
        <div className="flex flex-wrap items-center gap-3">
          <Layers className="h-5 w-5 text-[#f5c400]" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-white">{t("methodTitle")}</p>
            <p className="text-[11.5px] text-[#8c96a8]">{t("methodHint")}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          {METHOD.map((step, index) => {
            const Icon = step.icon;
            const off = (step.id === "regulate" || step.id === "review") && regulations.length === 0;
            return (
              <div key={step.id} className={cn("relative rounded-md border border-[#1f252e] bg-[#0d1218] p-3", off && "opacity-50")}>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#f5c400]/30 bg-[#f5c400]/10"><Icon className="h-3.5 w-3.5 text-[#f5c400]" /></span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#687386]">{index + 1}</span>
                </div>
                <p className="mt-2 text-[12.5px] font-semibold text-white">{t(`method.${step.id}.title`)}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-[#8c96a8]">{t(`method.${step.id}.body`)}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid gap-2 rounded-md border border-[#1f252e] bg-[#0d1218] p-3 text-[12px] leading-relaxed text-[#aab3c2] md:grid-cols-2">
          <p><span className={cn(EYEBROW, "mr-2 text-sky-300")}>{t("versusTechnicalLabel")}</span>{t("versusTechnical")}</p>
          <p><span className={cn(EYEBROW, "mr-2 text-[#f5c400]")}>{t("versusContentLabel")}</span>{t("versusContent")}</p>
        </div>
      </section>

      <section data-tour="content-run-bar" className="flex flex-wrap items-center gap-4 rounded-lg border border-[#f5c400]/25 bg-[linear-gradient(110deg,rgba(245,196,0,0.08),rgba(11,15,21,1)_45%)] px-5 py-4">
        <Sparkles className="h-5 w-5 shrink-0 text-[#f5c400]" />
        <div className="min-w-0 flex-1">
          {selectedExecution && selectedCluster ? (
            <>
              <p className="text-[13.5px] font-semibold text-white">{t("readyTitle", { cluster: selectedCluster.name })}</p>
              <p className="mt-0.5 text-[12px] text-[#aab3c2]">
                {figures.length ? t("readyFigures", { figures: figures.join(", ") }) : t("readyNoFigures")} · {regulations.length ? t("readyRegulations", { count: regulations.length }) : t("readyNoRegulations")}
              </p>
            </>
          ) : (
            <>
              <p className="text-[13.5px] font-semibold text-white">{t("notReadyTitle")}</p>
              <p className="mt-0.5 text-[12px] text-[#8c96a8]">{t("notReadyBody")}</p>
            </>
          )}
          {sources && !sources.llm_configured && <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /> {t("noLlm")}</p>}
        </div>
        {sources?.model && <span className="rounded-full border border-[#2c3440] px-2.5 py-1 font-mono text-[11px] text-[#aab3c2]">{sources.model}</span>}
        <button
          type="button"
          onClick={onStart}
          disabled={!selected || !preview || preview.derived.length === 0 || figures.length === 0 || starting || (sources ? !sources.llm_configured : true)}
          className="flex items-center gap-2 rounded-md bg-[#f5c400] px-5 py-2.5 text-[13px] font-semibold text-[#0b0f15] shadow-[0_0_24px_rgba(245,196,0,0.25)] transition-colors hover:bg-[#ffd633] disabled:cursor-not-allowed disabled:bg-[#3a3a2a] disabled:text-[#8c8a70] disabled:shadow-none"
        >
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          {t("start")}
        </button>
      </section>
    </div>
  );
}

function StepNumber({ value }: { value: number }) {
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#f5c400]/40 bg-[#f5c400]/10 text-[12px] font-bold text-[#f5c400]">{value}</span>;
}
