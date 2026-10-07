"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle, Binary, Bot, Boxes, CheckCircle2, Code2, Database, FlaskConical, Loader2, PlayCircle, Rocket, Search, Sparkles, Star, UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeBlock, EYEBROW, PANEL, formatDateTime } from "./atoms";
import type { Preview, Sources } from "./types";

const METHOD = [
  { id: "parse", icon: Binary },
  { id: "replay", icon: PlayCircle },
  { id: "probe", icon: FlaskConical },
  { id: "document", icon: Bot },
  { id: "review", icon: UserCheck },
] as const;

export function SetupPanel({ sources, loading, selected, onSelect, preview, previewLoading, probes, onProbes, starting, onStart }: {
  sources: Sources | null;
  loading: boolean;
  selected: string | null;
  onSelect: (executionId: string) => void;
  preview: Preview | null;
  previewLoading: boolean;
  probes: boolean;
  onProbes: (value: boolean) => void;
  starting: boolean;
  onStart: () => void;
  /** Guided tour: Start replays a recorded analysis. */
}) {
  const t = useTranslations("lineageAgent.setup");
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

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section data-tour="lineage-executions" className={cn(PANEL, "flex flex-col")}>
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
                      className={cn(
                        "flex w-full items-center gap-3 border-t border-[#1a2029] px-3 py-2.5 text-left transition-colors",
                        active ? "bg-[#f5c400]/[0.08]" : "hover:bg-white/[0.02]",
                      )}
                    >
                      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", active ? "border-[#f5c400]" : "border-[#3f4957]")}>
                        {active && <span className="h-2 w-2 rounded-full bg-[#f5c400]" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-[12.5px]", active ? "text-[#f5c400]" : "text-[#e5e9f0]")}>{t("executedAt", { date: formatDateTime(execution.executed_date, locale) })}</span>
                        <span className="mt-0.5 block font-mono text-[10.5px] text-[#5d6878]">{execution.execution_id.slice(0, 8)}</span>
                      </span>
                      <span className="flex shrink-0 gap-2 text-[11px] text-[#8c96a8]">
                        <span className="rounded border border-[#252a33] px-1.5 py-[1px] tabular-nums">{t("rows", { count: execution.rows ?? 0 })}</span>
                        <span className="rounded border border-[#252a33] px-1.5 py-[1px] tabular-nums">{t("columns", { count: execution.columns })}</span>
                        <span className="rounded border border-emerald-400/20 px-1.5 py-[1px] tabular-nums text-emerald-300/90">{t("computed", { count: execution.values_computed ?? 0 })}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <section data-tour="lineage-preview" className={cn(PANEL, "flex flex-col")}>
          <div className="flex items-center gap-3 border-b border-[#1f252e] px-4 py-3">
            <StepNumber value={2} />
            <div>
              <p className="text-[13.5px] font-semibold text-white">{t("previewTitle")}</p>
              <p className="text-[11.5px] text-[#8c96a8]">{t("previewHint")}</p>
            </div>
          </div>
          {!selected && (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
              <Code2 className="h-9 w-9 text-[#3f4957]" />
              <p className="mt-3 text-[12.5px] text-[#8c96a8]">{t("previewEmpty")}</p>
            </div>
          )}
          {selected && previewLoading && !preview && (
            <div className="flex items-center gap-2 px-4 py-6 text-[12.5px] text-[#8c96a8]"><Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}</div>
          )}
          {selected && preview && (
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12.5px] text-white">{preview.code.filename}</span>
                <span className="text-[11px] text-[#687386]">{t("lines", { count: preview.code.line_count })}</span>
                {preview.code.syntax_valid ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300"><CheckCircle2 className="h-3 w-3" />{t("syntaxValid")}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-300"><AlertTriangle className="h-3 w-3" />{t("syntaxInvalid")}</span>
                )}
              </div>
              <CodeBlock lines={preview.code.lines.slice(0, 16)} start={1} columns={new Set([...preview.inputs.map((item) => item.name), ...preview.outputs])} className="max-h-[260px]" />
              {preview.code.line_count > 16 && <p className="text-[11px] text-[#5d6878]">{t("moreLines", { count: preview.code.line_count - 16 })}</p>}
              <div>
                <p className={EYEBROW}>{t("inputColumns", { count: preview.inputs.length })}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {preview.inputs.map((column) => (
                    <span key={column.name} className="inline-flex items-center gap-1 rounded-md border border-[#2c3440] bg-[#121821] px-1.5 py-[1px] font-mono text-[11px] text-[#dbe2ec]" title={column.type ?? ""}>
                      {column.name}
                      {column.total ? <span className="text-[9.5px] text-[#5d6878]">{column.total - (column.nulls ?? 0)}/{column.total}</span> : null}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label={t("statRows")} value={preview.rows ?? 0} />
                <MiniStat label={t("statOutputs")} value={preview.outputs.length} />
                <MiniStat label={t("statComputed")} value={preview.values_computed ?? 0} />
              </div>
            </div>
          )}
        </section>
      </div>

      <section data-tour="lineage-method" className={cn(PANEL, "p-4")}>
        <div className="flex flex-wrap items-center gap-3">
          <StepNumber value={3} />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-white">{t("methodTitle")}</p>
            <p className="text-[11.5px] text-[#8c96a8]">{t("methodHint")}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2.5 md:grid-cols-5">
          {METHOD.map((step, index) => {
            const Icon = step.icon;
            const off = step.id === "probe" && !probes;
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
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-[#1f252e] bg-[#0d1218] px-3.5 py-3">
          <button
            type="button"
            role="switch"
            aria-checked={probes}
            onClick={() => onProbes(!probes)}
            className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors", probes ? "bg-[#f5c400]" : "bg-[#2c3440]")}
          >
            <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]", probes ? "left-[18px]" : "left-0.5")} />
          </button>
          <span>
            <span className="block text-[12.5px] font-semibold text-white">{t("probesTitle")}</span>
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[#8c96a8]">{t("probesBody")}</span>
          </span>
        </label>
      </section>

      <section data-tour="lineage-run-bar" className="flex flex-wrap items-center gap-4 rounded-lg border border-[#f5c400]/25 bg-[linear-gradient(110deg,rgba(245,196,0,0.08),rgba(11,15,21,1)_45%)] px-5 py-4">
        <Sparkles className="h-5 w-5 shrink-0 text-[#f5c400]" />
        <div className="min-w-0 flex-1">
          {selectedExecution && selectedCluster ? (
            <>
              <p className="text-[13.5px] font-semibold text-white">{t("readyTitle", { cluster: selectedCluster.name })}</p>
              <p className="mt-0.5 text-[12px] text-[#aab3c2]">
                <span className="font-mono">{selectedCluster.code_filename}</span> · {selectedCluster.dataset_name} · {formatDateTime(selectedExecution.executed_date, locale)}
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
          disabled={!selected || starting || (sources ? !sources.llm_configured : true)}
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[#1f252e] bg-[#0f141b] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[#687386]">{label}</p>
      <p className="mt-0.5 text-[16px] font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
