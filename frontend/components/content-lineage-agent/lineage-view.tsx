"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ClipboardCheck, Crosshair, Flag, FlaskConical, MousePointerClick, ScrollText, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CASE_COLORS, CheckIcon, EYEBROW, ImpactBadge, PANEL, REACH_COLORS, ReachBar, SEVERITY_STYLES, SeverityIcon, Stat, TermChip, UseChip, useNumbers,
} from "./atoms";
import { AgentConsole } from "./log";
import type { LinkKind, Model } from "./model";
import type { Check, Finding, Run } from "./types";
import { WhatIfLine } from "./what-if";

const LINK_COLORS: Record<LinkKind, string> = { value: "#34d399", decides: "#fbbf24", impact: "#f472b6" };
const LINK_DASH: Record<LinkKind, string | undefined> = { value: undefined, decides: "7 5", impact: "2 5" };

/**
 * The content lineage of the selected field on one screen: where its content goes (summary), the fields it flows
 * into step by step (diagram), how it reaches the field the user clicks (details), and the checks behind the result.
 */
export function LineageView({ model, run, selected, onSelect }: { model: Model; run: Run; selected: string; onSelect: (column: string) => void }) {
  const details = useRef<HTMLElement | null>(null);
  // The details sit under the lineage: a click brings them into view when they are below the screen.
  const select = useCallback((column: string) => {
    onSelect(column);
    window.requestAnimationFrame(() => details.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }, [onSelect]);
  return (
    <div className="space-y-4">
      <Summary model={model} />
      <Diagram model={model} selected={selected} onSelect={select} />
      <Details ref={details} model={model} column={selected} onSelect={select} />
      <Quality model={model} run={run} onSelect={select} />
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Summary                                                                                                          */
/* ---------------------------------------------------------------------------------------------------------------- */

function Summary({ model }: { model: Model }) {
  const t = useTranslations("contentLineageAgent.lineage");
  const scope = model.result.scope;
  const impact = model.result.impact;
  const ends = scope.ends.map((column) => model.flowBy.get(column)).filter((flow) => flow !== undefined);
  const reachedAtEnd = Math.max(0, ...ends.map((flow) => flow.records.reached));
  const steps = Math.max(1, ...model.downstream.map((column) => model.level(column)));
  return (
    <section data-tour="content-summary" className={cn(PANEL, "relative overflow-hidden p-5")}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(245,196,0,0.08),transparent_55%)]" />
      <div className="relative">
        <p className={EYEBROW}>{t("eyebrow")}</p>
        <h3 className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[19px] font-semibold text-white">
          <Crosshair className="h-5 w-5 self-center text-[#f5c400]" />
          {model.termName(model.field)}
          <span className="font-mono text-[11.5px] font-normal text-[#687386]">{model.field}</span>
        </h3>
        {model.texts.summary && <p className="mt-2 max-w-4xl text-[13px] leading-relaxed text-[#e5e9f0]">{model.texts.summary}</p>}
      </div>
      <div className="relative mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("stats.next")} value={scope.next.length} tone="gold" detail={scope.next.map((column) => model.termName(column)).join(", ") || "–"} />
        <Stat label={t("stats.downstream")} value={model.downstream.length} detail={t("stats.downstreamHint", { steps })} />
        <Stat label={t("stats.ends")} value={scope.ends.length} detail={scope.ends.map((column) => model.termName(column)).join(", ") || "–"} />
        <Stat label={t("stats.reached")} value={`${reachedAtEnd} / ${scope.records}`} tone={reachedAtEnd ? "good" : "default"} detail={t("stats.reachedHint", { field: model.termName(model.field) })} />
      </div>
      <p className="relative mt-3 flex flex-wrap items-start gap-2 text-[12px] leading-relaxed text-[#aab3c2]">
        <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-300" />
        <span>
          {impact.enabled
            ? t("confirmed", { runs: impact.tested, field: model.termName(model.field), confirmed: impact.confirmed, fields: model.downstream.length })
            : t("confirmedOff")}
          {impact.unexpected.length > 0 && <span className="ml-1 text-pink-200">{t("foundByRerun", { fields: impact.unexpected.map((column) => model.termName(column)).join(", ") })}</span>}
        </span>
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Diagram: the selected field on the left, every step of the calculation to the right                             */
/* ---------------------------------------------------------------------------------------------------------------- */

type Path = { from: string; to: string; kind: LinkKind; d: string };

function Diagram({ model, selected, onSelect }: { model: Model; selected: string; onSelect: (column: string) => void }) {
  const t = useTranslations("contentLineageAgent.lineage");
  const canvas = useRef<HTMLDivElement | null>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<Path[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const steps = useMemo(() => model.steps(), [model]);
  const ancestors = useMemo(() => model.ancestors(selected), [model, selected]);
  const descendants = useMemo(() => model.descendants(selected), [model, selected]);
  const isStart = selected === model.field;

  // The links are drawn between the cards as laid out by the browser, and redrawn whenever the layout changes.
  const measure = useCallback(() => {
    const root = canvas.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const box = (column: string) => {
      const rect = cards.current.get(column)?.getBoundingClientRect();
      return rect ? { left: rect.left - origin.left, right: rect.right - origin.left, top: rect.top - origin.top, bottom: rect.bottom - origin.top } : null;
    };
    // Every step's column: where it lies and its cards, which a link that skips the step must not pass behind.
    const columns = new Map<number, { left: number; right: number; boxes: { top: number; bottom: number }[] }>();
    let natural = 0;
    for (const column of cards.current.keys()) {
      const rect = box(column);
      if (!rect) continue;
      const level = model.level(column);
      const entry = columns.get(level) ?? { left: rect.left, right: rect.right, boxes: [] };
      entry.left = Math.min(entry.left, rect.left);
      entry.right = Math.max(entry.right, rect.right);
      entry.boxes.push(rect);
      columns.set(level, entry);
      natural = Math.max(natural, rect.bottom + 6);
    }
    const free = (y: number, levels: number[]) => levels.every((level) => columns.get(level)!.boxes.every((rect) => y < rect.top - 10 || y > rect.bottom + 10));
    let height = natural;
    let lanes = 0;
    const next: Path[] = [];
    for (const link of model.links) {
      const from = box(link.from);
      const to = box(link.to);
      if (!from || !to) continue;
      const sx = from.right;
      const sy = (from.top + from.bottom) / 2;
      const tx = to.left;
      const ty = (to.top + to.bottom) / 2;
      const skipped: number[] = [];
      for (let level = model.level(link.from) + 1; level < model.level(link.to); level += 1) if (columns.has(level)) skipped.push(level);
      if (!skipped.length) {
        const bend = Math.max(24, (tx - sx) / 2);
        next.push({ ...link, d: `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx - 3} ${ty}` });
        continue;
      }
      // A link that skips a step runs through the free space of the steps in between: at the height of its source or
      // its target where no card is in the way, otherwise below every card of those steps.
      const lane = free(sy, skipped) ? sy : free(ty, skipped) ? ty : Math.max(...skipped.flatMap((level) => columns.get(level)!.boxes.map((rect) => rect.bottom))) + 18 + 10 * lanes++;
      height = Math.max(height, lane + 12);
      const enter = columns.get(skipped[0])!.left;
      const leave = columns.get(skipped[skipped.length - 1])!.right;
      const into = (sx + enter) / 2;
      const out = (leave + tx) / 2;
      next.push({ ...link, d: `M ${sx} ${sy} C ${into} ${sy}, ${into} ${lane}, ${enter} ${lane} L ${leave} ${lane} C ${out} ${lane}, ${out} ${ty}, ${tx - 3} ${ty}` });
    }
    setPaths(next);
    setSize((current) => (current.w === root.scrollWidth && current.h === height ? current : { w: root.scrollWidth, h: height }));
  }, [model]);

  useLayoutEffect(() => {
    measure();
    const root = canvas.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    for (const element of cards.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  const state = (column: string): "self" | "path" | "onward" | "dim" => {
    if (column === selected) return "self";
    if (isStart) return "onward";
    if (ancestors.has(column)) return "path";
    if (descendants.has(column)) return "onward";
    return "dim";
  };
  const linkState = (path: Path): "path" | "onward" | "dim" => {
    if (!isStart && ancestors.has(path.from) && (path.to === selected || ancestors.has(path.to))) return "path";
    if ((path.from === selected || descendants.has(path.from)) && descendants.has(path.to)) return "onward";
    return "dim";
  };
  const ordered = [...paths].sort((a, b) => ["dim", "onward", "path"].indexOf(linkState(a)) - ["dim", "onward", "path"].indexOf(linkState(b)));

  return (
    <section data-tour="content-lineage" className={cn(PANEL, "min-w-0 p-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-white">{t("diagramTitle", { field: model.termName(model.field) })}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-[#8c96a8]"><MousePointerClick className="h-3.5 w-3.5 text-[#f5c400]" />{t("diagramHint", { field: model.termName(model.field) })}</p>
        </div>
        <Legend />
      </div>
      <div className="mt-4 overflow-x-auto pb-2">
        <div ref={canvas} className="relative flex w-full items-start gap-10 px-1 py-1" style={{ minHeight: size.h || undefined }}>
          <svg className="pointer-events-none absolute left-0 top-0" width={size.w} height={size.h} aria-hidden="true">
            <defs>
              {(["value", "decides", "impact"] as const).map((kind) => (
                <marker key={kind} id={`content-arrow-${kind}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill={LINK_COLORS[kind]} />
                </marker>
              ))}
            </defs>
            {ordered.map((path) => {
              const shown = linkState(path);
              return (
                <path
                  key={`${path.from}>${path.to}`}
                  data-from={path.from}
                  data-to={path.to}
                  d={path.d}
                  fill="none"
                  stroke={LINK_COLORS[path.kind]}
                  strokeWidth={shown === "path" ? 2.6 : shown === "onward" ? 1.9 : 1.4}
                  strokeOpacity={shown === "dim" ? 0.22 : shown === "onward" && !isStart ? 0.75 : 1}
                  strokeDasharray={LINK_DASH[path.kind]}
                  strokeLinecap="round"
                  markerEnd={`url(#content-arrow-${path.kind})`}
                  className="transition-[stroke-opacity,stroke-width] duration-300"
                />
              );
            })}
          </svg>
          {steps.map(({ level, columns }) => (
            <div key={level} className="relative z-10 flex min-w-[150px] max-w-[230px] flex-1 basis-0 flex-col gap-2.5">
              <p className={cn("px-1 text-[10px] font-semibold uppercase tracking-[0.16em]", level === 0 ? "text-[#f5c400]" : level === 1 ? "text-emerald-300" : "text-sky-300")}>
                {level === 0 ? t("column.start") : level === 1 ? t("column.next") : t("column.step", { level })}
              </p>
              {columns.map((column) => (
                <FieldCard
                  key={column}
                  model={model}
                  column={column}
                  state={state(column)}
                  onClick={() => onSelect(column)}
                  register={(element) => {
                    if (element) cards.current.set(column, element);
                    else cards.current.delete(column);
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Legend() {
  const t = useTranslations("contentLineageAgent.lineage.legend");
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[10.5px] text-[#9aa4b4]">
      {(["value", "decides", "impact"] as const).map((kind) => (
        <span key={kind} className="flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden="true"><line x1="1" y1="3" x2="21" y2="3" stroke={LINK_COLORS[kind]} strokeWidth="2" strokeDasharray={LINK_DASH[kind]} strokeLinecap="round" /></svg>
          {t(kind)}
        </span>
      ))}
      <span className="flex items-center gap-1.5"><Flag className="h-3 w-3 text-[#f5c400]" />{t("end")}</span>
    </div>
  );
}

function FieldCard({ model, column, state, onClick, register }: {
  model: Model;
  column: string;
  state: "self" | "path" | "onward" | "dim";
  onClick: () => void;
  register: (element: HTMLElement | null) => void;
}) {
  const t = useTranslations("contentLineageAgent.lineage");
  const start = column === model.field;
  const flow = model.flowBy.get(column);
  const values = model.result.scope.categorical ? model.result.scope.values.length : 0;
  return (
    <button
      ref={register}
      type="button"
      onClick={onClick}
      aria-pressed={state === "self"}
      data-tour={start ? "content-lineage-start" : flow?.direct ? "content-lineage-next" : undefined}
      data-field={column}
      className={cn(
        "group relative w-full rounded-lg border bg-[#0f141b] px-3 py-2.5 text-left transition-all duration-300",
        state === "self"
          ? "border-[#f5c400] shadow-[0_0_0_1px_rgba(245,196,0,0.35),0_10px_28px_rgba(245,196,0,0.12)]"
          : state === "path"
            ? "border-[#f5c400]/45"
            : start
              ? "border-[#f5c400]/40 hover:border-[#f5c400]/70"
              : "border-[#2a323d] hover:border-[#4a5464]",
        state === "dim" && "opacity-45 hover:opacity-90",
        flow?.evidence === "impact" && state !== "self" && "border-dashed border-pink-400/50",
      )}
    >
      <span className={cn("absolute bottom-2 left-0 top-2 w-[3px] rounded-r", start ? "bg-[#f5c400]" : flow?.direct ? "bg-emerald-400" : "bg-sky-400")} />
      <span className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-white [overflow-wrap:anywhere]">{model.termName(column)}</span>
        {flow?.end && <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f5c400]" />}
        {flow?.evidence === "impact" && <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-300" />}
      </span>
      <span className="mt-0.5 block truncate font-mono text-[10px] text-[#687386]">{column}</span>
      {flow ? (
        <span className="mt-2 flex items-center gap-2">
          <ReachBar records={flow.records} height={4} className="flex-1" />
          <span className="shrink-0 text-[10px] tabular-nums text-[#8c96a8]">{t("card.records", { reached: flow.records.reached, total: flow.records.total })}</span>
        </span>
      ) : values > 0 ? (
        <span className="mt-1.5 block text-[10.5px] text-[#8c96a8]">{t("card.values", { count: values })}</span>
      ) : null}
    </button>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Details of the clicked field                                                                                     */
/* ---------------------------------------------------------------------------------------------------------------- */

function Details({ ref, model, column, onSelect }: { ref: Ref<HTMLElement>; model: Model; column: string; onSelect: (column: string) => void }) {
  return (
    <section ref={ref} data-tour="content-details" className={cn(PANEL, "min-w-0 scroll-mt-4 p-5")}>
      {column === model.field || !model.flowBy.has(column) ? <StartDetails model={model} onSelect={onSelect} /> : <FieldDetails key={column} model={model} column={column} onSelect={onSelect} />}
    </section>
  );
}

function Badge({ tone, children }: { tone: "gold" | "green" | "blue" | "pink"; children: ReactNode }) {
  const tones = {
    gold: "border-[#f5c400]/40 bg-[#f5c400]/10 text-[#f5c400]",
    green: "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300",
    blue: "border-sky-400/30 bg-sky-400/[0.08] text-sky-300",
    pink: "border-pink-400/35 bg-pink-400/[0.07] text-pink-200",
  };
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[1px] text-[10.5px] font-semibold uppercase tracking-wide", tones[tone])}>{children}</span>;
}

function StartDetails({ model, onSelect }: { model: Model; onSelect: (column: string) => void }) {
  const t = useTranslations("contentLineageAgent.lineage.details");
  const numbers = useNumbers();
  const scope = model.result.scope;
  const term = model.termBy.get(model.field);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0">
        <Badge tone="gold"><Crosshair className="h-3 w-3" />{t("start")}</Badge>
        <h3 className="mt-2 text-[16px] font-semibold text-white">{model.termName(model.field)}</h3>
        <p className="font-mono text-[11px] text-[#687386]">{model.field}</p>
        {model.definition(model.field) && <p className="mt-2 text-[12.5px] leading-relaxed text-[#c9d1dd]">{model.definition(model.field)}</p>}
        {scope.categorical && scope.values.length > 0 && (
          <div className="mt-4">
            <p className={EYEBROW}>{t("values")}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {scope.values.slice(0, 30).map((item) => (
                <span key={item.key} className="rounded border border-[#2c3440] bg-[#121821] px-1.5 py-[1px] font-mono text-[10.5px] text-[#dbe2ec]">
                  {numbers.value(item.value, model.isFactor(model.field))} <span className="text-[#687386]">· {item.records}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {term?.nulled && (
          <p className="mt-3 flex items-start gap-2 text-[11.5px] text-amber-200"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("nulled", { count: term.nulled.count, examples: term.nulled.examples.map((value) => `"${String(value).trim()}"`).join(", ") })}</p>
        )}
      </div>
      <div className="min-w-0">
        <p className={EYEBROW}>{t("flowsInto")}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{scope.next.map((column) => <TermChip key={column} model={model} column={column} onClick={onSelect} />)}</div>
        <p className={cn(EYEBROW, "mt-4")}>{t("endsIn")}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{scope.ends.map((column) => <TermChip key={column} model={model} column={column} onClick={onSelect} />)}</div>
        <p className="mt-5 flex items-center gap-1.5 rounded-md border border-[#1f252e] bg-[#0d1218] px-3 py-2 text-[11.5px] text-[#8c96a8]">
          <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-[#f5c400]" />
          {t("hint", { field: model.termName(model.field) })}
        </p>
      </div>
    </div>
  );
}

function FieldDetails({ model, column, onSelect }: { model: Model; column: string; onSelect: (column: string) => void }) {
  const t = useTranslations("contentLineageAgent.lineage.details");
  const tReach = useTranslations("contentLineageAgent.reach");
  const numbers = useNumbers();
  const flow = model.flowBy.get(column)!;
  const rule = model.ruleOfColumn.get(column);
  const records = flow.records;
  const field = model.termName(model.field);
  const via = flow.via.filter((name) => name !== model.field);
  const usage = model.usage(column);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {flow.direct ? <Badge tone="green">{t("next")}</Badge> : <Badge tone="blue">{t("step", { level: flow.level })}</Badge>}
          {flow.end && <Badge tone="gold"><Flag className="h-3 w-3" />{t("end")}</Badge>}
          {flow.evidence === "impact" && <ImpactBadge />}
        </div>
        <h3 className="mt-2 text-[16px] font-semibold text-white">{model.termName(column)}</h3>
        <p className="font-mono text-[11px] text-[#687386]">{column}</p>
        {model.definition(column) && <p className="mt-2 text-[12px] leading-relaxed text-[#aab3c2]">{model.definition(column)}</p>}

        <div className="mt-4 rounded-lg border border-[#f5c400]/25 bg-[#f5c400]/[0.04] p-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#f5c400]">{t("howTitle", { field })}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#aab3c2]">
            {flow.direct ? t("direct", { field }) : <>{t("via")} {via.map((name) => <TermChip key={name} model={model} column={name} onClick={onSelect} />)}</>}
          </p>
          {usage && <p className="mt-2 text-[12.5px] leading-relaxed text-[#e5e9f0]">{usage}</p>}
          {flow.evidence === "impact" && <p className="mt-2 text-[11.5px] leading-relaxed text-pink-200">{t("impactOnly", { field })}</p>}
        </div>

        <div className="mt-4">
          <p className={EYEBROW}>{t("records", { reached: records.reached, total: records.total, field })}</p>
          <ReachBar className="mt-2" records={records} height={7} />
          <ul className="mt-2 space-y-1 text-[11.5px]">
            {(["value", "decides", "tested"] as const).map((kind) => records[kind] > 0 && (
              <li key={kind} className="flex items-center gap-2" title={tReach(`${kind}Hint`)}><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: REACH_COLORS[kind] }} /><span className="flex-1 text-[#c9d1dd]">{tReach(kind)}</span><span className="tabular-nums text-[#8c96a8]">{records[kind]}</span></li>
            ))}
            {records.delivered > 0 && <li className="flex items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: REACH_COLORS.none }} /><span className="flex-1 text-[#8c96a8]">{tReach("delivered")}</span><span className="tabular-nums text-[#8c96a8]">{records.delivered}</span></li>}
            {records.other > 0 && <li className="flex items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: REACH_COLORS.none }} /><span className="flex-1 text-[#8c96a8]">{tReach("other")}</span><span className="tabular-nums text-[#8c96a8]">{records.other}</span></li>}
            {records.missing > 0 && <li className="flex items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: REACH_COLORS.missing }} /><span className="flex-1 text-rose-200">{tReach("missing")}</span><span className="tabular-nums text-rose-300">{records.missing}</span></li>}
          </ul>
          {flow.passing && <p className="mt-2 text-[11.5px] leading-relaxed text-sky-200">{t("passing", { field })}</p>}
          {flow.amount.summable && flow.amount.total !== null && (
            <p className="mt-2 text-[11.5px] text-[#aab3c2]">{t("amount", { reached: numbers.amount(flow.amount.reached), total: numbers.amount(flow.amount.total), share: numbers.share(Math.abs(flow.amount.reached ?? 0), Math.abs(flow.amount.total)) })}</p>
          )}
        </div>
      </div>

      <div className="min-w-0 lg:[&>*:first-child]:mt-0">
        {flow.by_value && flow.by_value.length > 0 && (
          <div className="mt-4">
            <p className={EYEBROW}>{t("byValue")}</p>
            <div className="mt-2 overflow-hidden rounded-md border border-[#1f252e]">
              <table className="w-full text-[11.5px]">
                <thead className="bg-[#0f141b] text-left text-[10px] uppercase tracking-wide text-[#687386]">
                  <tr>
                    <th className="px-2.5 py-1.5 font-semibold">{field}</th>
                    <th className="px-2.5 py-1.5 font-semibold">{flow.amount.summable && !flow.by_value.some((group) => group.outcomes) ? t("amountColumn") : model.termName(column)}</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold">{t("recordsColumn")}</th>
                  </tr>
                </thead>
                <tbody>
                  {flow.by_value.slice(0, 15).map((group) => (
                    <tr key={group.key} className="border-t border-[#1a2029] align-top">
                      <td className="px-2.5 py-1.5 font-mono text-[#dbe2ec]">{numbers.value(group.value, model.isFactor(model.field))}</td>
                      <td className="px-2.5 py-1.5 text-[#c9d1dd]">
                        {group.outcomes
                          ? group.outcomes.map((outcome, at) => <span key={at} className="mr-2 inline-block font-mono">{numbers.value(outcome.value, model.isFactor(column))}{group.outcomes!.length > 1 && <span className="text-[#687386]"> ×{outcome.records}</span>}</span>)
                          : <span className="font-mono tabular-nums">{numbers.amount(group.amount)}</span>}
                        {group.more_outcomes > 0 && <span className="text-[#687386]">{t("moreOutcomes", { count: group.more_outcomes })}</span>}
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-[#8c96a8]">{group.records}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {flow.by_value.length > 15 && <p className="mt-1.5 text-[11px] text-[#687386]">{t("moreValues", { count: flow.by_value.length - 15 })}</p>}
          </div>
        )}

        {flow.example && (
          <div className="mt-4">
            <p className={EYEBROW}>{t("example")}</p>
            <WhatIfLine model={model} column={column} example={flow.example} className="mt-2" />
          </div>
        )}

        {rule && (
          <details className="group mt-4 rounded-md border border-[#1f252e] bg-[#0d1218]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[12px] text-[#c9d1dd] [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-3.5 w-3.5 shrink-0 -rotate-90 text-[#687386] transition-transform group-open:rotate-0" />
              <span className="min-w-0 flex-1 truncate">{t("rule", { name: model.ruleName(rule.id) })}</span>
              <span className="shrink-0 text-[10.5px] text-[#687386]">{t("cases", { count: rule.cases.length })}</span>
            </summary>
            <div className="border-t border-[#1a2029] px-3 py-2.5">
              {model.ruleStatement(rule.id) && <p className="text-[12px] leading-relaxed text-[#c9d1dd]">{model.ruleStatement(rule.id)}</p>}
              <ul className="mt-2 space-y-2">
                {flow.cases.map((item, index) => (
                  <li key={item.id} className="text-[11.5px]">
                    <p className="flex items-start gap-1.5">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: CASE_COLORS[index % CASE_COLORS.length] }} />
                      <span className="min-w-0 flex-1 font-medium text-[#e5e9f0]">{model.caseLabel(item.id)}</span>
                      <span className="shrink-0 tabular-nums text-[#8c96a8]">{t("reachedOfProduced", { reached: item.reached, produced: item.produced })}</span>
                    </p>
                    {model.caseDescription(item.id) && <p className="ml-3.5 mt-0.5 leading-relaxed text-[#8c96a8]">{model.caseDescription(item.id)}</p>}
                    <p className="ml-3.5 mt-1 flex flex-wrap items-center gap-1">
                      {item.reads.length
                        ? item.reads.map((read) => <span key={read.column} className="inline-flex items-center gap-1"><TermChip model={model} column={read.column} />{read.roles.map((use) => <UseChip key={use} use={use} />)}</span>)
                        : <span className="text-[#687386]">{t("readsNothing", { field })}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Checks and notes                                                                                                 */
/* ---------------------------------------------------------------------------------------------------------------- */

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => (typeof item === "object" && item ? Object.values(item).join(" ") : String(item))).join(", ");
  if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${item}`).join(", ");
  return String(value ?? "");
}

function Quality({ model, run, onSelect }: { model: Model; run: Run; onSelect: (column: string) => void }) {
  const t = useTranslations("contentLineageAgent.quality");
  const [open, setOpen] = useState(false);
  const checks = model.result.checks;
  const findings = model.result.findings;
  const relevant = checks.filter((check) => check.status !== "skipped");
  const passed = relevant.filter((check) => check.status === "pass").length;
  const allPassed = passed === relevant.length;
  return (
    <section data-tour="content-quality" className={cn(PANEL, "overflow-hidden")}>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.02]">
        <ClipboardCheck className={cn("h-4 w-4 shrink-0", allPassed ? "text-emerald-300" : "text-amber-300")} />
        <span className="text-[13.5px] font-semibold text-white">{t("title")}</span>
        <span className={cn("text-[12px]", allPassed ? "text-emerald-300" : "text-amber-300")}>{t("summary", { passed, total: relevant.length })}</span>
        <span className="text-[12px] text-[#8c96a8]">· {t("notes", { count: findings.length })}</span>
        <span className="ml-auto flex items-center gap-1 text-[11.5px] text-[#8c96a8]">{open ? t("hide") : t("show")}<ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} /></span>
      </button>
      {open && (
        <div className="grid gap-5 border-t border-[#1f252e] p-5 lg:grid-cols-2">
          <div>
            <p className={EYEBROW}>{t("notesTitle")}</p>
            {findings.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-[#8c96a8]">{t("noNotes")}</p>
            ) : (
              <ul className="mt-2 space-y-2">{findings.map((finding) => <FindingItem key={finding.id} model={model} finding={finding} onSelect={onSelect} />)}</ul>
            )}
            {model.result.ai.grounding.issues.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-400/25 bg-amber-400/[0.05] p-3">
                <p className="text-[12px] font-semibold text-amber-200">{t("groundingTitle")}</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11.5px] text-[#d9cfb5]">
                  {model.result.ai.grounding.issues.map((issue, index) => <li key={index}>{issue.text}</li>)}
                </ul>
              </div>
            )}
          </div>
          <div>
            <p className={EYEBROW}>{t("checksTitle")}</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[#8c96a8]">{t("checksIntro")}</p>
            <ul className="mt-2 divide-y divide-[#1a2029] rounded-md border border-[#1f252e]">
              {checks.map((check) => (
                <li key={check.id} className="flex items-start gap-3 px-3.5 py-2.5">
                  <CheckIcon status={check.status} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-white">{t(`check.${check.id}.title`)}</p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#aab3c2]">{checkDetail(t, check, model)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <details className="group lg:col-span-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] text-[#8c96a8] hover:text-white [&::-webkit-details-marker]:hidden">
              <ScrollText className="h-3.5 w-3.5" />
              {t("logTitle")}
              <ChevronDown className="h-3.5 w-3.5 -rotate-90 transition-transform group-open:rotate-0" />
            </summary>
            <AgentConsole log={run.log} className="mt-3 h-[320px]" />
          </details>
        </div>
      )}
    </section>
  );
}

function checkDetail(t: ReturnType<typeof useTranslations>, check: Check, model: Model): string {
  const p = check.params as Record<string, unknown>;
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(p)) values[name] = typeof value === "number" ? value : text(value);
  const names = (list: unknown) => (Array.isArray(list) ? (list as string[]).map((column) => model.termName(column)).join(", ") : "");
  if (check.id === "complete" && p.missing && typeof p.missing === "object") values.missing = Object.entries(p.missing as Record<string, number>).map(([name, count]) => `${model.termName(name)} (${count})`).join(", ");
  if (check.id === "impact") values.unexpected = names(p.unexpected);
  if (check.id === "observed") values.unobserved = names(p.unobserved);
  if (check.id === "terms" || check.id === "usage") values.missing = names(p.missing);
  // A warning of the re-run check has its own reason: fields only the re-run found, the time budget or failing runs.
  const variant = check.id === "impact" && check.status === "warn"
    ? (Array.isArray(p.unexpected) && p.unexpected.length ? "warnUnexpected" : p.budget_hit ? "warnBudget" : "warnErrors")
    : check.id === "impact" && check.status === "skipped" ? `skipped_${String(p.reason ?? "disabled")}` : check.status;
  const key = `check.${check.id}.${variant}`;
  try {
    return t.has(key) ? t(key, values) : t.has(`check.${check.id}.${check.status}`) ? t(`check.${check.id}.${check.status}`, values) : t(`check.${check.id}.pass`, values);
  } catch {
    return text(p);
  }
}

function FindingItem({ model, finding, onSelect }: { model: Model; finding: Finding; onSelect: (column: string) => void }) {
  const t = useTranslations("contentLineageAgent.quality");
  const p = finding.params as Record<string, unknown>;
  const column = typeof p.column === "string" ? p.column : null;
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(p)) values[name] = typeof value === "number" ? value : text(value);
  if (column) values.term = model.termName(column);
  values.field = model.termName(model.field);
  if (Array.isArray(p.values)) values.values = (p.values as { value: string; rows: number }[]).map((item) => `${item.value} (${item.rows})`).join(", ");
  if (Array.isArray(p.examples)) values.examples = (p.examples as unknown[]).map((item) => `"${String(item).trim()}"`).join(", ");
  if (!t.has(`finding.${finding.code}.title`)) return null;
  const clickable = column && model.carriers.has(column);
  return (
    <li className={cn("rounded-md border p-3", SEVERITY_STYLES[finding.severity])}>
      <div className="flex items-start gap-2.5">
        <SeverityIcon severity={finding.severity} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-white">{t(`finding.${finding.code}.title`, values)}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[#c9d1dd]">{t(`finding.${finding.code}.body`, values)}</p>
          {clickable && (
            <div className="mt-2">
              <TermChip model={model} column={column} onClick={(target) => {
                onSelect(target);
                document.querySelector('[data-tour="content-lineage"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
              }} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

