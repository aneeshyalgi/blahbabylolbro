"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Bot, ChevronDown, ChevronRight, Code2, FileCode2, ScrollText, ShieldCheck, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckIcon, ColumnChip, EYEBROW, Kpi, LineChip, PANEL, PythonLine, RichText, SeverityIcon, formatDateTime, formatDuration } from "./atoms";
import { AllColumns, ColumnDetail, LookupDetail } from "./column-details";
import { FindingCard } from "./findings";
import { GraphView } from "./graph-view";
import { AgentConsole } from "./log";
import type { Model } from "./model";
import type { Focus, Navigator, Run } from "./types";

const STAGE_COLORS = ["#f5c400", "#38bdf8", "#a78bfa", "#34d399", "#fb7185", "#fbbf24", "#22d3ee", "#f472b6"];

/**
 * The technical lineage of an execution on one screen: what the script does (overview), how its columns depend on
 * each other (graph), how the selected column is derived (details), the script itself, and the checks behind it all.
 */
export function LineageView({ model, run, focus, onFocus }: { model: Model; run: Run; focus: Focus | null; onFocus: (focus: Focus | null) => void }) {
  const details = useRef<HTMLDivElement | null>(null);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptLine, setScriptLine] = useState<number | null>(null);

  // Opening a column or lookup table from inside the details brings the details' header into view.
  const reveal = useCallback(() => {
    window.requestAnimationFrame(() => {
      const element = details.current;
      if (!element) return;
      const top = element.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.7) element.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const nav: Navigator = useMemo(() => ({
    openColumn: (column) => {
      if (!model.byName.has(column)) return;
      onFocus({ kind: "column", name: column });
      reveal();
    },
    openLookup: (name) => {
      onFocus({ kind: "lookup", name });
      reveal();
    },
    openLine: (line) => {
      setScriptOpen(true);
      setScriptLine(line);
    },
  }), [model, onFocus, reveal]);

  const column = focus?.kind === "column" ? model.byName.get(focus.name) : undefined;
  return (
    <div className="space-y-4">
      <Overview model={model} run={run} nav={nav} />
      <GraphView key={run.id} layoutKey={run.id} model={model} selected={focus} onSelect={onFocus} />
      <div ref={details} data-tour="lineage-details" className="scroll-mt-4">
        {column ? (
          <ColumnDetail key={column.name} model={model} column={column} nav={nav} onBack={() => onFocus(null)} />
        ) : focus?.kind === "lookup" ? (
          <LookupDetail model={model} name={focus.name} nav={nav} onBack={() => onFocus(null)} />
        ) : (
          <AllColumns model={model} nav={nav} />
        )}
      </div>
      <Script model={model} open={scriptOpen} onOpen={setScriptOpen} line={scriptLine} focus={column?.name ?? null} nav={nav} />
      <Checks model={model} run={run} nav={nav} />
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Overview                                                                                                         */
/* ---------------------------------------------------------------------------------------------------------------- */

function Overview({ model, run, nav }: { model: Model; run: Run; nav: Navigator }) {
  const t = useTranslations("lineageAgent.overview");
  const summary = run.summary!;
  const overview = model.result.ai.overview;
  const stages = overview?.stages ?? [];
  const created = (summary.roles.created ?? 0) + (summary.roles.renamed ?? 0);
  const probes = model.result.runtime.probes.enabled;
  return (
    <section data-tour="lineage-overview" className={cn(PANEL, "relative overflow-hidden p-5")}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(245,196,0,0.07),transparent_55%)]" />
      <div className="relative">
        <p className={EYEBROW}>{t("eyebrow")}</p>
        {overview?.purpose ? (
          <p className="mt-1.5 max-w-4xl text-[13.5px] leading-relaxed text-[#e5e9f0]"><RichText text={overview.purpose} columns={model.columnNames} onColumn={nav.openColumn} /></p>
        ) : (
          <p className="mt-1.5 text-[13px] text-[#8c96a8]">{t("noPurpose")}</p>
        )}
      </div>
      <div className="relative mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t("columns")} value={summary.outputs} detail={t("columnsHint", { derived: summary.derived, created })} />
        <Kpi label={t("dependencies")} value={summary.edges} detail={t("dependenciesHint", { direct: summary.direct, indirect: summary.indirect, lookups: summary.lookups })} />
        <Kpi
          label={t("verified")}
          value={probes && summary.verified_pct !== null ? `${summary.verified_pct} %` : "–"}
          tone={!probes || summary.verified_pct === null ? "default" : summary.runtime_only ? "bad" : summary.verified_pct === 100 ? "good" : "warn"}
          detail={probes ? t("verifiedHint", { confirmed: summary.confirmed, total: summary.static_dependencies }) : t("verifiedOff")}
        />
        <Kpi label={t("documented")} value={summary.documented} detail={t("documentedHint", { grounded: summary.grounded, reviewed: summary.reviewed })} />
      </div>
      {stages.length > 0 && (
        <div className="relative mt-4">
          <p className={EYEBROW}>{t("stages", { count: stages.length })}</p>
          <ol className="mt-2 grid gap-1.5 md:grid-cols-2">
            {stages.map((stage, index) => (
              <li key={index}>
                <button type="button" onClick={() => nav.openLine(stage.start_line)} title={stage.description} className="flex w-full items-center gap-2.5 rounded-md border border-[#1f252e] bg-[#0d1218] px-3 py-1.5 text-left transition-colors hover:border-[#2c3440]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[#0b0f15]" style={{ background: STAGE_COLORS[index % STAGE_COLORS.length] }}>{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[#dbe2ec]">{stage.title}</span>
                  <span className="shrink-0 font-mono text-[10.5px] text-[#687386]">{stage.start_line === stage.end_line ? `L${stage.start_line}` : `L${stage.start_line}–${stage.end_line}`}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      {model.analysis.dataset_ops.length > 0 && (
        <div className="relative mt-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2 text-[11.5px] text-amber-100">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
          {t("datasetOps")}
          {model.analysis.dataset_ops.map((op, index) => (
            <span key={index} className="inline-flex items-center gap-1">
              {op.line && <LineChip line={op.line} onClick={nav.openLine} />}
              <span className="font-semibold">{op.kind}</span>
              {op.columns.length > 0 && <span className="font-mono text-[#c2cad5]">{op.columns.join(", ")}</span>}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* The script with the AI's stages                                                                                  */
/* ---------------------------------------------------------------------------------------------------------------- */

function Script({ model, open, onOpen, line, focus, nav }: {
  model: Model;
  open: boolean;
  onOpen: (open: boolean) => void;
  line: number | null;
  focus: string | null;
  nav: Navigator;
}) {
  const t = useTranslations("lineageAgent.script");
  const lines = model.result.code.lines;
  const stages = model.result.ai.overview?.stages ?? [];
  const container = useRef<HTMLDivElement | null>(null);
  const section = useRef<HTMLElement | null>(null);
  const statements = useMemo(() => new Map(model.result.runtime.statements.map((statement) => [statement.line, statement])), [model]);
  const focusLines = focus ? model.linesOf(focus) : null;
  const focusSet = useMemo(() => (focus ? new Set([focus]) : undefined), [focus]);
  const step = line ? model.stepOf(line) : undefined;
  const stageAt = new Map(stages.map((stage, index) => [stage.start_line, { ...stage, index }]));
  const stageOf = (number: number) => stages.findIndex((stage) => stage.start_line <= number && number <= stage.end_line);

  // A line opened from elsewhere is scrolled into the middle of the code.
  useEffect(() => {
    if (!open || !line) return;
    const timer = window.setTimeout(() => {
      section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      const target = container.current?.querySelector(`[data-line="${line}"]`) as HTMLElement | null;
      if (target && container.current) container.current.scrollTo({ top: target.offsetTop - container.current.clientHeight / 2, behavior: "smooth" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [open, line]);

  return (
    <section ref={section} data-tour="lineage-script" className={cn(PANEL, "scroll-mt-4 overflow-hidden")}>
      <button type="button" onClick={() => onOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-2.5 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.02]">
        {open ? <ChevronDown className="h-4 w-4 text-[#687386]" /> : <ChevronRight className="h-4 w-4 text-[#687386]" />}
        <FileCode2 className="h-4 w-4 text-[#f5c400]" />
        <span className="text-[13.5px] font-semibold text-white">{t("title")}</span>
        <span className="font-mono text-[12px] text-[#c2cad5]">{model.result.code.filename}</span>
        <span className="text-[11.5px] text-[#687386]">{t("summary", { lines: lines.length, stages: stages.length })}</span>
        {focus && <span className="ml-auto text-[11.5px] text-sky-300">{t("highlighted", { column: focus })}</span>}
      </button>
      {open && (
        <div ref={container} className="max-h-[560px] overflow-auto border-t border-[#1f252e] bg-[#080b10] py-2 font-mono text-[12.5px] leading-[1.75]">
          {lines.map((code, index) => {
            const number = index + 1;
            const statementStep = model.stepByLine.get(number);
            const inStep = step && step.line <= number && number <= step.end_line;
            const focused = focusLines?.has(number);
            const stage = stageAt.get(number);
            const stageIndex = stageOf(number);
            const writes = statementStep ? [...new Set(statementStep.writes.map((id) => model.analysis.nodes[id].column))] : [];
            const statement = statementStep ? statements.get(statementStep.line) : undefined;
            const changed = statement ? Object.values(statement.changed).reduce((sum, value) => sum + value, 0) : 0;
            return (
              <Fragment key={number}>
                {stage && (
                  <div
                    className="mx-3 mb-1 mt-3 flex max-w-[calc(100%-24px)] items-center gap-2.5 rounded-md border px-3 py-1.5 [font-family:Inter,sans-serif] first:mt-1"
                    style={{ color: STAGE_COLORS[stage.index % STAGE_COLORS.length], borderColor: `${STAGE_COLORS[stage.index % STAGE_COLORS.length]}33`, background: `${STAGE_COLORS[stage.index % STAGE_COLORS.length]}0d` }}
                    title={stage.description}
                  >
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em]">{t("stage", { index: stage.index + 1 })}</span>
                    <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-white">{stage.title}</span>
                    <span className="min-w-0 truncate text-[11.5px] text-[#8c96a8]">{stage.description}</span>
                  </div>
                )}
                <div data-line={number} className={cn("group flex min-w-max pr-4", inStep ? "bg-[#f5c400]/[0.09]" : focused ? "bg-sky-400/[0.07]" : "hover:bg-white/[0.025]")}>
                  <span className="w-1 shrink-0" style={{ background: stageIndex >= 0 ? `${STAGE_COLORS[stageIndex % STAGE_COLORS.length]}55` : "transparent" }} />
                  <span className={cn("w-12 shrink-0 select-none pr-3 text-right", inStep ? "text-[#f5c400]" : focused ? "text-sky-300" : "text-[#3f4957]")}>{number}</span>
                  <span className="whitespace-pre text-[#d6deeb]"><PythonLine code={code} columns={model.columnNames} focus={focusSet} /></span>
                  {statementStep && writes.length > 0 && (
                    <span className="ml-6 flex items-center gap-1 [font-family:Inter,sans-serif] opacity-80 group-hover:opacity-100">
                      {writes.slice(0, 4).map((name) => (
                        <button key={name} type="button" onClick={() => nav.openColumn(name)} className="rounded border border-[#f5c400]/25 bg-[#f5c400]/[0.06] px-1.5 text-[10.5px] text-[#f5c400] hover:bg-[#f5c400]/15">→ {name}</button>
                      ))}
                      {writes.length > 4 && <span className="text-[10.5px] text-[#8c96a8]">+{writes.length - 4}</span>}
                      {statement && (
                        <span className={cn("rounded-full px-1.5 text-[10.5px] tabular-nums", changed ? "bg-emerald-400/10 text-emerald-300" : "bg-[#1a212c] text-[#687386]")}>
                          {changed ? t("cells", { count: changed }) : t("noChange")}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Checks, findings and the run                                                                                     */
/* ---------------------------------------------------------------------------------------------------------------- */

function sanitize(params: Record<string, unknown>): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) result[key] = typeof value === "number" ? value : typeof value === "boolean" ? (value ? "yes" : "no") : String(value ?? "");
  return result;
}

function Checks({ model, run, nav }: { model: Model; run: Run; nav: Navigator }) {
  const t = useTranslations("lineageAgent.verification");
  const [open, setOpen] = useState(false);
  const result = model.result;
  const relevant = result.checks.filter((check) => check.status !== "skipped");
  const passed = relevant.filter((check) => check.status === "pass").length;
  const allPassed = passed === relevant.length;
  return (
    <section data-tour="lineage-checks" className={cn(PANEL, "overflow-hidden")}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-2.5 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.02]">
        {open ? <ChevronDown className="h-4 w-4 text-[#687386]" /> : <ChevronRight className="h-4 w-4 text-[#687386]" />}
        <ShieldCheck className={cn("h-4 w-4", allPassed ? "text-emerald-300" : "text-amber-300")} />
        <span className="text-[13.5px] font-semibold text-white">{t("sectionTitle")}</span>
        <span className={cn("text-[12px]", allPassed ? "text-emerald-300" : "text-amber-300")}>{t("passed", { passed, total: relevant.length })}</span>
        <span className="text-[12px] text-[#8c96a8]">· {t("findingsCount", { count: result.findings.length })}</span>
      </button>
      {open && (
        <div className="space-y-5 border-t border-[#1f252e] p-5">
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {result.checks.map((check) => (
              <div key={check.id} className={cn("rounded-md border px-3.5 py-3", check.status === "pass" ? "border-emerald-400/20 bg-emerald-400/[0.03]" : check.status === "fail" ? "border-rose-400/30 bg-rose-400/[0.05]" : check.status === "warn" ? "border-amber-400/25 bg-amber-400/[0.04]" : "border-[#1f252e] bg-[#0d1218]")}>
                <div className="flex items-start gap-2.5">
                  <CheckIcon status={check.status} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-white">{t(`checks.${check.id}.title`)}</p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#9aa4b4]">{t(`checks.${check.id}.body`)}</p>
                    <p className="mt-1.5 font-mono text-[11px] text-[#c2cad5]">{t(`checks.${check.id}.value`, sanitize(check.params))}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div>
            <p className={EYEBROW}>{t("findingsTitle", { count: result.findings.length })}</p>
            <div className="mt-2 space-y-2">
              {result.findings.map((finding) => <FindingCard key={finding.id} finding={finding} nav={nav} />)}
              {!result.findings.length && <p className="rounded-md border border-emerald-400/20 bg-emerald-400/[0.04] px-3 py-3 text-[12px] text-emerald-200">{t("noFindings")}</p>}
            </div>
          </div>
          {result.ai.investigation && <Investigation model={model} nav={nav} />}
          <RunDetails run={run} />
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] text-[#8c96a8] hover:text-white [&::-webkit-details-marker]:hidden">
              <ScrollText className="h-3.5 w-3.5" />
              {t("logTitle", { count: run.log.length })}
              <ChevronDown className="h-3.5 w-3.5 -rotate-90 transition-transform group-open:rotate-0" />
            </summary>
            <AgentConsole log={run.log} className="mt-3 max-h-[380px]" />
          </details>
        </div>
      )}
    </section>
  );
}

function Investigation({ model, nav }: { model: Model; nav: Navigator }) {
  const t = useTranslations("lineageAgent.verification.investigation");
  const investigation = model.result.ai.investigation!;
  return (
    <div className="space-y-2">
      <p className={cn(EYEBROW, "flex items-center gap-1.5")}><Bot className="h-3.5 w-3.5" />{t("title")}</p>
      <p className="text-[11.5px] text-[#8c96a8]">{t("hint", { issues: investigation.issues.length, steps: investigation.steps.length })}</p>
      {investigation.steps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {investigation.steps.map((step, index) => (
            <span key={index} className="inline-flex items-center gap-1 rounded-md border border-[#2c3440] bg-[#0d1218] px-2 py-[2px] font-mono text-[10.5px] text-[#aab3c2]">
              <Wrench className="h-3 w-3 text-[#f5c400]" /> {step.tool}({Object.values(step.arguments).map(String).join(", ")})
            </span>
          ))}
        </div>
      )}
      {investigation.findings.map((finding, index) => (
        <div key={index} className="rounded-md border border-[#1f252e] bg-[#0d1218] px-3.5 py-3">
          <div className="flex items-start gap-2.5">
            <SeverityIcon severity={finding.severity} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-white">{finding.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#c2cad5]">{finding.detail}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded border border-[#2c3440] px-1.5 text-[10.5px] text-[#9aa4b4]">{t(`resolution.${finding.resolution}`)}</span>
                {finding.lines.map((line) => <LineChip key={line} line={line} onClick={nav.openLine} />)}
                {finding.columns.map((column) => <ColumnChip key={column} name={column} onClick={nav.openColumn} />)}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RunDetails({ run }: { run: Run }) {
  const t = useTranslations("lineageAgent.verification.run");
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  const items: [string, string][] = [
    [t("runId"), run.id],
    [t("execution"), run.source.execution_id],
    [t("cluster"), run.source.cluster_name ?? "–"],
    [t("dataset"), run.source.dataset_name ?? "–"],
    [t("code"), `${run.source.code_filename} (${run.source.code_lines})`],
    [t("started"), formatDateTime(run.created_at, locale)],
    [t("duration"), formatDuration(run.duration_ms, locale)],
    [t("model"), run.model ?? "–"],
    [t("calls"), `${run.usage.llm_calls} · ${t("tools", { count: run.usage.tool_calls })}`],
    [t("tokens"), `${number.format(run.usage.prompt_tokens)} / ${number.format(run.usage.completion_tokens)}`],
    [t("probes"), run.settings.probes ? t("on") : t("off")],
    [t("language"), run.language.toUpperCase()],
  ];
  return (
    <div>
      <p className={cn(EYEBROW, "flex items-center gap-1.5")}><Code2 className="h-3.5 w-3.5" />{t("title")}</p>
      <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10.5px] uppercase tracking-wide text-[#5d6878]">{label}</dt>
            <dd className="truncate font-mono text-[12px] text-[#c2cad5]" title={value}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

