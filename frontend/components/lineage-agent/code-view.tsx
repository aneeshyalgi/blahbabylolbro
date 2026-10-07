"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Braces, Code2, Eye, FunctionSquare, Layers, Table2, Variable, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ColumnChip, EYEBROW, Formula, LineChip, OperationChip, PANEL, PythonLine, ValueText, plainText } from "./atoms";
import type { Model } from "./model";
import type { Navigator, Step } from "./types";

const STAGE_COLORS = ["#f5c400", "#38bdf8", "#a78bfa", "#34d399", "#fb7185", "#fbbf24", "#22d3ee", "#f472b6"];

export function CodeView({ model, line, onLine, focusColumn, onFocusColumn, nav }: {
  model: Model;
  line: number | null;
  onLine: (line: number | null) => void;
  focusColumn: string | null;
  onFocusColumn: (column: string | null) => void;
  nav: Navigator;
}) {
  const t = useTranslations("lineageAgent.code");
  const lines = model.result.code.lines;
  const stages = model.result.ai.overview?.stages ?? [];
  const statements = useMemo(() => new Map(model.result.runtime.statements.map((statement) => [statement.line, statement])), [model]);
  const step = line ? model.stepOf(line) : undefined;
  const focusLines = focusColumn ? model.linesOf(focusColumn) : null;
  const focusSet = useMemo(() => (focusColumn ? new Set([focusColumn]) : undefined), [focusColumn]);
  const container = useRef<HTMLDivElement | null>(null);
  const [showStages, setShowStages] = useState(true);

  useEffect(() => {
    if (!line || !container.current) return;
    const target = container.current.querySelector(`[data-line="${line}"]`);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [line]);

  const stageAt = new Map(stages.map((stage, index) => [stage.start_line, { ...stage, index }]));
  const stageOf = (number: number) => stages.findIndex((stage) => stage.start_line <= number && number <= stage.end_line);
  const derived = model.analysis.columns.filter((column) => column.in_output && column.role !== "passthrough");

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section data-tour="lineage-code" className={cn(PANEL, "min-w-0 overflow-hidden")}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1f252e] bg-[#0b0f15] px-4 py-2.5">
          <Code2 className="h-4 w-4 text-[#f5c400]" />
          <span className="font-mono text-[12.5px] text-white">{model.result.code.filename}</span>
          <span className="text-[11px] text-[#687386]">{t("lines", { count: lines.length })}</span>
          <div className="ml-auto flex items-center gap-2">
            {stages.length > 0 && (
              <button type="button" onClick={() => setShowStages((value) => !value)} className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px]", showStages ? "border-[#f5c400]/35 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#252a33] text-[#8c96a8]")}>
                <Layers className="h-3.5 w-3.5" /> {t("stages")}
              </button>
            )}
            <label className="flex items-center gap-1.5 text-[11.5px] text-[#8c96a8]">
              <Eye className="h-3.5 w-3.5" />
              <select
                value={focusColumn ?? ""}
                onChange={(event) => onFocusColumn(event.target.value || null)}
                className="h-7 rounded-md border border-[#252a33] bg-[#0f141b] px-2 font-mono text-[11.5px] text-white outline-none focus:border-[#f5c400]/50"
              >
                <option value="">{t("focusNone")}</option>
                {derived.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div ref={container} className="max-h-[calc(100vh-230px)] min-h-[520px] overflow-auto bg-[#080b10] py-2 font-mono text-[12.5px] leading-[1.75]">
          {lines.map((code, index) => {
            const number = index + 1;
            const statementStep = model.stepByLine.get(number);
            const inStep = step && step.line <= number && number <= step.end_line;
            const focused = focusLines?.has(number);
            const stage = showStages ? stageAt.get(number) : undefined;
            const stageIndex = showStages ? stageOf(number) : -1;
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
                    <span className="min-w-0 truncate text-[11.5px] text-[#8c96a8]">{plainText(stage.description, model.columnNames)}</span>
                  </div>
                )}
                <div
                  data-line={number}
                  onClick={() => onLine(statementStep || model.stepOf(number) ? (model.stepOf(number)?.line ?? number) : null)}
                  className={cn(
                    "group flex min-w-max cursor-pointer pr-4",
                    inStep ? "bg-[#f5c400]/[0.09]" : focused ? "bg-sky-400/[0.07]" : "hover:bg-white/[0.025]",
                  )}
                >
                  <span className="w-1 shrink-0" style={{ background: stageIndex >= 0 ? `${STAGE_COLORS[stageIndex % STAGE_COLORS.length]}55` : "transparent" }} />
                  <span className={cn("w-12 shrink-0 select-none pr-3 text-right", inStep ? "text-[#f5c400]" : focused ? "text-sky-300" : "text-[#3f4957]")}>{number}</span>
                  <span className="w-5 shrink-0 select-none pt-[3px] text-center">{statementStep && <StepIcon step={statementStep} />}</span>
                  <span className="whitespace-pre text-[#d6deeb]"><PythonLine code={code} columns={model.columnNames} focus={focusSet} /></span>
                  {statementStep && (writes.length > 0 || statementStep.frame_ops.length > 0) && (
                    <span className="ml-6 flex items-center gap-1 [font-family:Inter,sans-serif] opacity-80 group-hover:opacity-100">
                      {writes.slice(0, 4).map((column) => (
                        <span key={column} className="rounded border border-[#f5c400]/25 bg-[#f5c400]/[0.06] px-1.5 text-[10.5px] text-[#f5c400]">→ {column}</span>
                      ))}
                      {writes.length > 4 && <span className="text-[10.5px] text-[#8c96a8]">+{writes.length - 4}</span>}
                      {statementStep.frame_ops.map((op, opIndex) => (
                        <span key={opIndex} className="rounded border border-sky-400/25 bg-sky-400/[0.06] px-1.5 text-[10.5px] text-sky-300">{op.kind.toLowerCase()}</span>
                      ))}
                      {statement && writes.length > 0 && (
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
      </section>
      <aside className={cn(PANEL, "h-fit xl:sticky xl:top-4")}>
        {step ? <StatementInspector model={model} step={step} nav={nav} onClose={() => onLine(null)} /> : <CodeLegend model={model} />}
      </aside>
    </div>
  );
}

function StepIcon({ step }: { step: Step }) {
  const className = "inline h-3 w-3";
  if (step.unresolved) return <AlertTriangle className={cn(className, "text-amber-400")} />;
  if (step.kind === "write") return <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#f5c400]" />;
  if (step.kind === "lookup") return <Table2 className={cn(className, "text-violet-300")} />;
  if (step.kind === "function") return <FunctionSquare className={cn(className, "text-sky-300")} />;
  if (step.kind === "variable") return <Variable className={cn(className, "text-[#8c96a8]")} />;
  if (step.kind === "frame") return <Braces className={cn(className, "text-sky-300")} />;
  return null;
}

function CodeLegend({ model }: { model: Model }) {
  const t = useTranslations("lineageAgent.code");
  const kinds = model.analysis.steps.reduce<Record<string, number>>((counts, step) => ({ ...counts, [step.kind]: (counts[step.kind] ?? 0) + 1 }), {});
  return (
    <div className="space-y-4 p-4">
      <div>
        <p className={EYEBROW}>{t("inspector")}</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[#aab3c2]">{t("inspectorHint")}</p>
      </div>
      <ul className="space-y-2 text-[12px] text-[#c2cad5]">
        {(["write", "frame", "lookup", "variable", "function"] as const).map((kind) => (
          <li key={kind} className="flex items-center gap-2.5">
            <span className="flex w-4 justify-center"><StepIcon step={{ kind, unresolved: false } as Step} /></span>
            <span className="flex-1">{t(`kind.${kind}`)}</span>
            <span className="tabular-nums text-[#687386]">{kinds[kind] ?? 0}</span>
          </li>
        ))}
      </ul>
      {model.analysis.unresolved.length > 0 && (
        <div className="rounded-md border border-amber-400/25 bg-amber-400/[0.05] p-3 text-[11.5px] text-amber-100">
          {t("unresolved", { count: model.analysis.unresolved.length })}
        </div>
      )}
    </div>
  );
}

function StatementInspector({ model, step, nav, onClose }: { model: Model; step: Step; nav: Navigator; onClose: () => void }) {
  const t = useTranslations("lineageAgent.code");
  const tReasons = useTranslations("lineageAgent.reasons");
  const statement = model.result.runtime.statements.find((item) => item.line === step.line);
  const writes = step.writes.map((id) => model.analysis.nodes[id]);
  const byColumn = new Map<string, typeof writes>();
  for (const node of writes) (byColumn.get(node.column) ?? byColumn.set(node.column, []).get(node.column)!).push(node);
  const lookups = model.analysis.lookups.filter((lookup) => lookup.line === step.line);
  const dead = new Set(model.analysis.dead_writes.map((item) => item.node));
  const unresolved = model.analysis.unresolved.filter((item) => item.line >= step.line && item.line <= step.end_line);
  return (
    <div className="max-h-[calc(100vh-150px)] space-y-4 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={EYEBROW}>{t("statement")}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <LineChip line={step.line} end={step.end_line} />
            <span className="text-[12.5px] font-semibold text-white">{t(`kind.${step.kind}`)}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#687386] hover:text-white" aria-label={t("close")}>
          <X className="h-4 w-4" />
        </button>
      </div>
      {statement && (
        <div className={cn("rounded-md border px-3 py-2 text-[12px]", statement.error ? "border-rose-400/30 bg-rose-400/[0.06] text-rose-200" : "border-[#1f252e] bg-[#0d1218] text-[#c2cad5]")}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#687386]">{t("runtime")}</p>
          {statement.error ? (
            <p className="mt-1">{statement.error}</p>
          ) : (
            <>
              <p className="mt-1">
                {Object.keys(statement.changed).length
                  ? Object.entries(statement.changed).map(([column, count]) => `${column}: ${count}`).join(" · ")
                  : t("runtimeNoChange")}
              </p>
              <p className="mt-0.5 text-[11px] text-[#687386]">{t("runtimeMs", { ms: statement.ms })}</p>
              {(statement.rows_removed ?? 0) > 0 && <p className="mt-0.5 text-[11px] text-amber-300">{t("rowsRemoved", { count: statement.rows_removed ?? 0 })}</p>}
              {statement.reordered && <p className="mt-0.5 text-[11px] text-sky-300">{t("reordered")}</p>}
            </>
          )}
        </div>
      )}
      {byColumn.size > 0 && (
        <div className="space-y-2.5">
          <p className={EYEBROW}>{t("writes")}</p>
          {[...byColumn.entries()].map(([column, nodes]) => (
            <div key={column} className="rounded-md border border-[#1f252e] bg-[#0d1218] p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <ColumnChip name={column} onClick={(name) => nav.openColumn(name, "columns")} />
                {[...new Set(nodes.map((node) => node.operation).filter(Boolean))].map((operation) => <OperationChip key={operation} operation={operation!} />)}
                {nodes.some((node) => dead.has(node.id)) && <span className="rounded border border-rose-400/30 px-1.5 text-[10px] text-rose-300">{t("dead")}</span>}
              </div>
              {nodes.map((node) => (
                <div key={node.id} className="mt-2 space-y-1">
                  {node.pretty && <Formula text={node.pretty} columns={model.columnNames} onColumn={(name) => nav.openColumn(name)} className="text-[11.5px]" />}
                  {(node.conditions ?? []).map((condition, index) => (
                    <p key={index} className="font-mono text-[11px] text-amber-200/90">
                      {t("when")} {condition.expanded ?? condition.code}
                    </p>
                  ))}
                  {node.bindings && Object.keys(node.bindings).length > 0 && (
                    <p className="font-mono text-[10.5px] text-[#8c96a8]">{Object.entries(node.bindings).map(([name, value]) => `${name} = ${String(value)}`).join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {step.reads.length > 0 && (
        <div>
          <p className={EYEBROW}>{t("reads")}</p>
          <div className="mt-2 flex flex-wrap gap-1">{step.reads.map((column) => <ColumnChip key={column} name={column} muted onClick={(name) => nav.openColumn(name)} />)}</div>
        </div>
      )}
      {step.defines.length > 0 && (
        <div>
          <p className={EYEBROW}>{t("defines")}</p>
          <div className="mt-2 flex flex-wrap gap-1">{step.defines.map((name) => <span key={name} className="rounded-md border border-[#2c3440] px-1.5 py-[1px] font-mono text-[11px] text-[#dbe2ec]">{name}</span>)}</div>
        </div>
      )}
      {lookups.map((lookup) => (
        <div key={lookup.name}>
          <p className={EYEBROW}>{t("lookup", { name: lookup.name })}</p>
          {lookup.kind === "mapping" && (
            <table className="mt-2 w-full overflow-hidden rounded-md border border-[#1f252e] text-[11.5px]">
              <tbody>
                {lookup.entries.map(([key, value], index) => (
                  <tr key={index} className="border-t border-[#1a2029] first:border-t-0">
                    <td className="px-2.5 py-1 font-mono"><ValueText value={key} /></td>
                    <td className="px-2.5 py-1 font-mono"><ValueText value={value} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-1.5 text-[11px] text-[#8c96a8]">{t("usedBy", { columns: lookup.used_by.join(", ") || "—" })}</p>
        </div>
      ))}
      {step.frame_ops.map((op, index) => (
        <div key={index} className="rounded-md border border-sky-400/25 bg-sky-400/[0.05] p-2.5 text-[12px] text-sky-100">
          <p className="font-semibold">{t(`frameOp.${op.kind}`, { count: op.columns.length })}</p>
          {op.columns.length > 0 && <p className="mt-1 font-mono text-[11px] text-sky-200/80">{op.columns.join(", ")}</p>}
        </div>
      ))}
      {unresolved.map((item, index) => (
        <div key={index} className="rounded-md border border-amber-400/30 bg-amber-400/[0.05] p-2.5 text-[11.5px] text-amber-100">
          <p className="font-semibold">{t("unresolvedTitle")}</p>
          <p className="mt-0.5">{tReasons.has(item.reason) ? tReasons(item.reason) : item.reason}: <span className="font-mono">{item.detail}</span></p>
        </div>
      ))}
    </div>
  );
}
