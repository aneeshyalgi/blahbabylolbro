"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PANEL, PythonLine } from "./atoms";
import { AllColumns, ColumnDetail, LookupDetail } from "./column-details";
import { GraphView } from "./graph-view";
import type { Model } from "./model";
import type { Focus, Navigator, Run } from "./types";

const STAGE_COLORS = ["#f5c400", "#38bdf8", "#a78bfa", "#34d399", "#fb7185", "#fbbf24", "#22d3ee", "#f472b6"];

/**
 * The technical lineage of an execution on one screen: how its columns depend on each other (graph), how the selected
 * column is derived (details) and the script itself.
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
    </div>
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
