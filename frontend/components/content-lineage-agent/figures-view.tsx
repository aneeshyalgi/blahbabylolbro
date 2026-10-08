"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Database, ListTree, PieChart, Route, Search, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EYEBROW, KIND_COLORS, KindIcon, ORIGIN_COLORS, PANEL, SectionTitle, ShareBar, Stat, TermChip, ValueText, useNumbers,
} from "./atoms";
import type { Model } from "./model";
import type { Navigator, RecordItem } from "./types";

export function FiguresView({ model, figure, onFigure, record, onRecord, nav }: {
  model: Model;
  figure: string;
  onFigure: (figure: string) => void;
  record: string | null;
  onRecord: (label: string | null) => void;
  nav: Navigator;
}) {
  const t = useTranslations("contentLineageAgent.figures");
  const numbers = useNumbers();
  const data = model.result.figures[figure];
  const rule = model.ruleOfColumn.get(figure);
  const [dimension, setDimension] = useState<string | null>(model.result.scope.dimensions[0] ?? null);
  if (!data) return null;
  const total = data.total ?? 0;
  const share = (amount: number | null, records: number) => (data.numeric && total ? numbers.share(amount ?? 0, total) : numbers.share(records, data.present));
  const delivered = data.origins.find((origin) => origin.origin === "delivered");
  const caseIndex = new Map((rule?.cases ?? []).map((item, index) => [item.id, index]));
  const segments = dimension ? data.segments[dimension] ?? [] : [];
  const maxSegment = Math.max(1, ...segments.map((segment) => Math.abs(data.numeric ? segment.amount ?? 0 : segment.records)));

  return (
    <div className="space-y-4">
      {model.figures.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {model.figures.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onFigure(name)}
              className={cn("flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12.5px] transition-colors", name === figure ? "border-[#f5c400]/50 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#252a33] text-[#aab3c2] hover:text-white")}
            >
              <KindIcon kind="figure" />
              {model.termName(name)}
            </button>
          ))}
        </div>
      )}

      <section data-tour="content-figure-head" className={cn(PANEL, "relative overflow-hidden p-5")}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,196,0,0.08),transparent_55%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <p className={EYEBROW}>{t("eyebrow")}</p>
            <h3 className="mt-1 flex items-center gap-2 text-[19px] font-semibold text-white"><Target className="h-5 w-5 text-[#f5c400]" />{model.termName(figure)}</h3>
            <p className="mt-0.5 font-mono text-[11px] text-[#687386]">{figure}</p>
            {model.definition(figure) && <p className="mt-2 text-[12.5px] leading-relaxed text-[#c9d1dd]">{model.definition(figure)}</p>}
            {rule && <p className="mt-2 text-[12px] leading-relaxed text-[#aab3c2]"><span className="font-semibold text-violet-200">{model.ruleName(rule.id)}:</span> {model.ruleStatement(rule.id)}</p>}
          </div>
          <button type="button" onClick={() => nav.openTerm(figure, "graph")} className="rounded-md border border-[#2c3440] px-3 py-1.5 text-[12px] text-[#c9d1dd] hover:border-[#f5c400]/40 hover:text-[#f5c400]">{t("showInGraph")}</button>
        </div>
        <div className="relative mt-4 grid gap-3 md:grid-cols-4">
          <Stat label={t("total")} value={data.numeric ? numbers.amount(data.total) : data.present} tone="gold" detail={t("totalHint", { records: data.present })} />
          <Stat label={t("records")} value={`${data.present} / ${data.records}`} detail={data.missing ? t("missingHint", { count: data.missing }) : t("completeHint")} tone={data.missing ? "bad" : "default"} />
          <Stat label={t("derivedShare")} value={numbers.share(data.present - (delivered?.records ?? 0), data.present)} detail={t("derivedHint", { delivered: delivered?.records ?? 0 })} />
          <Stat label={t("paths")} value={data.paths.length + (data.other_paths?.count ?? 0)} detail={t("pathsHint")} />
        </div>
      </section>

      <section data-tour="content-origins" className={cn(PANEL, "p-5")}>
        <SectionTitle icon={<PieChart className="h-4 w-4 text-[#f5c400]" />} title={t("originsTitle")} hint={t("originsHint")} />
        <ShareBar
          className="mt-4"
          height={12}
          parts={data.origins.map((origin) => ({
            value: data.numeric ? Math.abs(origin.amount ?? 0) || (origin.records && total === 0 ? origin.records : 0) : origin.records,
            color: origin.origin === "delivered" ? ORIGIN_COLORS.delivered : ORIGIN_COLORS.derived[(caseIndex.get(origin.origin) ?? 0) % ORIGIN_COLORS.derived.length],
          }))}
        />
        <table className="mt-4 w-full text-[12.5px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wide text-[#687386]">
            <tr><th className="pb-2 font-semibold">{t("origin")}</th><th className="pb-2 text-right font-semibold">{t("records")}</th>{data.numeric && <th className="pb-2 text-right font-semibold">{t("amount")}</th>}<th className="pb-2 pl-4 text-right font-semibold">{t("share")}</th></tr>
          </thead>
          <tbody>
            {data.origins.map((origin) => {
              const color = origin.origin === "delivered" ? ORIGIN_COLORS.delivered : ORIGIN_COLORS.derived[(caseIndex.get(origin.origin) ?? 0) % ORIGIN_COLORS.derived.length];
              return (
                <tr key={origin.origin} className="border-t border-[#1a2029]">
                  <td className="py-2 pr-3">
                    <span className="flex items-start gap-2">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                      <span>
                        <span className="block font-medium text-white">{origin.origin === "delivered" ? t("deliveredBySource") : model.caseLabel(origin.origin)}</span>
                        <span className="block text-[11.5px] text-[#8c96a8]">{origin.origin === "delivered" ? t("deliveredHint") : model.caseDescription(origin.origin)}</span>
                      </span>
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-[#c9d1dd]">{origin.records}</td>
                  {data.numeric && <td className="py-2 text-right font-mono tabular-nums text-[#dbe2ec]">{numbers.amount(origin.amount)}</td>}
                  <td className="py-2 pl-4 text-right tabular-nums text-[#aab3c2]">{share(origin.amount, origin.records)}</td>
                </tr>
              );
            })}
            {data.missing > 0 && (
              <tr className="border-t border-[#1a2029]">
                <td className="py-2 pr-3"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: ORIGIN_COLORS.missing }} /><span className="font-medium text-rose-200">{t("missing")}</span></span></td>
                <td className="py-2 text-right tabular-nums text-rose-300">{data.missing}</td>
                {data.numeric && <td className="py-2 text-right text-[#5d6878]">–</td>}
                <td className="py-2 pl-4 text-right text-[#5d6878]">–</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section data-tour="content-paths" className={cn(PANEL, "p-5")}>
        <SectionTitle icon={<Route className="h-4 w-4 text-[#f5c400]" />} title={t("pathsTitle")} hint={t("pathsDescription")} />
        <div className="mt-4 space-y-2">
          {data.paths.map((path, index) => (
            <div key={index} className="rounded-md border border-[#1f252e] bg-[#0d1218] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f5c400]/12 font-mono text-[10.5px] font-semibold text-[#f5c400]">{index + 1}</span>
                  <span className="text-[12px] text-[#aab3c2]">{t("pathRecords", { count: path.records })}</span>
                  {data.numeric && <span className="font-mono text-[12.5px] tabular-nums text-white">{numbers.amount(path.amount)}</span>}
                  <span className="text-[11.5px] tabular-nums text-[#8c96a8]">{share(path.amount, path.records)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {path.examples.map((label) => {
                    const item = model.result.records.items.find((entry) => entry.label === label);
                    return (
                      <button key={label} type="button" onClick={() => onRecord(label)} className="rounded border border-[#2c3440] px-1.5 py-[1px] font-mono text-[10.5px] text-[#c9d1dd] hover:border-[#f5c400]/50 hover:text-[#f5c400]">
                        {item?.id ?? `#${Number(label) + 1}`}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#1a212c]">
                <div className="h-full rounded-full bg-[#f5c400]/70" style={{ width: `${Math.min(100, (100 * (data.numeric && total ? Math.abs(path.amount ?? 0) / Math.abs(total) : path.records / Math.max(1, data.present))))}%` }} />
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {path.tokens.map((token, at) => (
                  <Fragment key={token}>
                    {at > 0 && <span className="text-[11px] text-[#3f4957]">‹</span>}
                    <PathStep model={model} token={token} />
                  </Fragment>
                ))}
              </div>
            </div>
          ))}
          {data.other_paths && <p className="text-[12px] text-[#8c96a8]">{t("otherPaths", { count: data.other_paths.count, records: data.other_paths.records })}</p>}
        </div>
      </section>

      {model.result.scope.dimensions.length > 0 && (
        <section data-tour="content-segments" className={cn(PANEL, "p-5")}>
          <SectionTitle icon={<ListTree className="h-4 w-4 text-[#f5c400]" />} title={t("segmentsTitle")} hint={t("segmentsHint")} />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {model.result.scope.dimensions.map((name) => (
              <button key={name} type="button" onClick={() => setDimension(name)} className={cn("rounded-md border px-2.5 py-1 text-[12px]", dimension === name ? "border-[#f5c400]/50 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#252a33] text-[#aab3c2] hover:text-white")}>
                {model.termBy.has(name) ? model.termName(name) : name}
              </button>
            ))}
          </div>
          <table className="mt-4 w-full text-[12.5px]">
            <thead className="text-left text-[10.5px] uppercase tracking-wide text-[#687386]">
              <tr><th className="pb-2 font-semibold">{t("segment")}</th><th className="pb-2 text-right font-semibold">{t("records")}</th>{data.numeric && <th className="pb-2 text-right font-semibold">{t("amount")}</th>}<th className="w-[34%] pb-2 pl-6 font-semibold">{t("share")}</th></tr>
            </thead>
            <tbody>
              {segments.map((segment) => (
                <tr key={segment.value} className="border-t border-[#1a2029]">
                  <td className="py-2 pr-3 font-mono text-[12px] text-white">{segment.value}{segment.missing > 0 && <span className="ml-2 font-sans text-[11px] text-rose-300">{t("segmentMissing", { count: segment.missing })}</span>}</td>
                  <td className="py-2 text-right tabular-nums text-[#c9d1dd]">{segment.records}</td>
                  {data.numeric && <td className="py-2 text-right font-mono tabular-nums text-[#dbe2ec]">{numbers.amount(segment.amount)}</td>}
                  <td className="py-2 pl-6">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#1a212c]"><div className="h-full rounded-full bg-[#f5c400]/75" style={{ width: `${(100 * Math.abs(data.numeric ? segment.amount ?? 0 : segment.records)) / maxSegment}%` }} /></div>
                      <span className="w-14 text-right text-[11.5px] tabular-nums text-[#aab3c2]">{share(segment.amount, segment.records)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <RecordTrace model={model} figure={figure} record={record} onRecord={onRecord} />
    </div>
  );
}

/** One step of a content path: the business term and the case that produced its value. */
export function PathStep({ model, token }: { model: Model; token: string }) {
  const t = useTranslations("contentLineageAgent.figures");
  const numbers = useNumbers();
  const info = model.token(token);
  const kind = model.termBy.get(info.column)?.kind ?? "concept";
  const parameter = info.case ? model.parameter(info.case, info.key) : undefined;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[#252a33] bg-[#121821] px-2 py-1 text-[11.5px]" title={info.case ? model.caseDescription(info.case) : t("deliveredHint")}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND_COLORS[kind] }} />
      <span className="font-medium text-white">{model.termName(info.column)}</span>
      <span className="text-[#5d6878]">·</span>
      {info.delivered ? (
        <span className="text-sky-300">{t("delivered")}</span>
      ) : (
        <span className="text-[#c9d1dd]">
          {model.caseLabel(info.case!)}
          {info.key && (
            <span className="ml-1 rounded bg-[#1a212c] px-1 font-mono text-[10.5px]">
              {info.key}
              {parameter !== undefined && <span className="text-[#f5c400]"> → {numbers.parameter(parameter, model.percentTable(info.case!))}</span>}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function RecordTrace({ model, figure, record, onRecord }: { model: Model; figure: string; record: string | null; onRecord: (label: string | null) => void }) {
  const t = useTranslations("contentLineageAgent.figures");
  const [query, setQuery] = useState("");
  const records = model.result.records;
  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.items.filter((item) => !needle || (item.id ?? "").toLowerCase().includes(needle) || item.label.includes(needle));
  }, [records.items, query]);
  const current = records.items.find((item) => item.label === record) ?? null;
  useEffect(() => {
    if (record) document.getElementById("content-record-trace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [record]);
  return (
    <section id="content-record-trace" data-tour="content-records" className={cn(PANEL, "p-5")}>
      <SectionTitle
        icon={<Database className="h-4 w-4 text-[#f5c400]" />}
        title={t("recordsTitle")}
        hint={records.total > records.items.length ? t("recordsHintLimited", { shown: records.items.length, total: records.total }) : t("recordsHint")}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5d6878]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("recordSearch", { identifier: records.identifier ?? t("record") })} className="h-8 w-full rounded-md border border-[#252a33] bg-[#0f141b] pl-8 pr-2 text-[12px] text-white outline-none placeholder:text-[#5d6878] focus:border-[#f5c400]/50" />
          </div>
          <div className="mt-2 max-h-[420px] space-y-1 overflow-y-auto pr-1">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onRecord(item.label === record ? null : item.label)}
                className={cn("flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-[12px]", item.label === record ? "border-[#f5c400]/50 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#1f252e] text-[#dbe2ec] hover:border-[#2c3440]")}
              >
                <span className="truncate font-mono">{item.id ?? `#${Number(item.label) + 1}`}</span>
                <span className="shrink-0 font-mono text-[11px] text-[#8c96a8]"><ValueText value={item.values[figure]} /></span>
              </button>
            ))}
          </div>
        </div>
        <div data-tour="content-derivation" className="min-w-0 rounded-md border border-[#1f252e] bg-[#0b0f15] p-4">
          {current ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-white">{t("recordTitle", { record: current.id ?? `#${Number(current.label) + 1}` })}</p>
                <button type="button" onClick={() => onRecord(null)} className="flex items-center gap-1 text-[11.5px] text-[#8c96a8] hover:text-white"><ArrowLeft className="h-3.5 w-3.5" />{t("close")}</button>
              </div>
              <Derivation model={model} record={current} column={figure} before={null} depth={0} />
            </>
          ) : (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
              <Route className="h-8 w-8 text-[#3f4957]" />
              <p className="mt-3 max-w-sm text-[12.5px] text-[#8c96a8]">{t("recordEmpty")}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** How one value of a record came about: the case that produced it, then the values it used, recursively. */
function Derivation({ model, record, column, before, depth, value }: { model: Model; record: RecordItem; column: string; before: number | null; depth: number; value?: unknown }) {
  const t = useTranslations("contentLineageAgent.figures");
  const numbers = useNumbers();
  const steps = (record.steps[column] ?? []).filter((step) => before === null || step.line < before);
  const step = steps[steps.length - 1];
  const shown = step ? step.after : value !== undefined ? value : record.values[column];
  const rule = model.ruleOfColumn.get(column);
  const item = step ? model.caseBy.get(step.case) : undefined;
  const children = item ? [...item.inputs, ...item.selectors].filter((name) => model.termBy.has(name)) : [];
  const parameter = step && item ? model.parameter(item.id, step.key) : undefined;
  return (
    <div className={cn(depth > 0 && "ml-3 border-l border-[#252a33] pl-3")}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1">
        <TermChip model={model} column={column} className="border-transparent bg-transparent px-0 text-[12.5px] font-medium" />
        <span className="font-mono text-[12.5px] text-[#f5c400]">= <ValueText value={shown} /></span>
        {step && item ? (
          <span className="text-[11.5px] text-[#aab3c2]">
            {t("byCase", { case: model.caseLabel(item.id) })}
            {step.key && <span className="ml-1 rounded bg-[#1a212c] px-1 font-mono text-[10.5px] text-[#c9d1dd]">{step.key}{parameter !== undefined && <span className="text-[#f5c400]"> → {numbers.parameter(parameter, model.percentTable(item.id))}</span>}</span>}
          </span>
        ) : rule ? (
          <span className="text-[11.5px] text-sky-300">{t("deliveredKept")}</span>
        ) : (
          <span className="text-[11.5px] text-sky-300/80">{t("sourceValue")}</span>
        )}
      </div>
      {step && item && model.caseDescription(item.id) && <p className="ml-3.5 pb-1 text-[11px] leading-relaxed text-[#687386]">{model.caseDescription(item.id)}</p>}
      {step && children.map((name) => (
        <Derivation key={name} model={model} record={record} column={name} before={step.line} depth={depth + 1} value={step.inputs[name]} />
      ))}
    </div>
  );
}
