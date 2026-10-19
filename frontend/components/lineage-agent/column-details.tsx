"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Bot, ChevronDown, ChevronRight, Code2, Database, GitBranch, History, Layers, Rows3, ShieldCheck, Sparkles, Table2, UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CodeBlock, ColumnChip, EYEBROW, Formula, LineChip, OperationChip, PANEL, ROLE_STYLES, RichText, RoleBadge, SectionTitle, TransformationBadge,
  ValueText, VerificationBadge, plainText,
} from "./atoms";
import { FindingCard } from "./findings";
import type { Model } from "./model";
import type { ColumnDoc, GroundingIssue, LineageColumn, Navigator, Rule } from "./types";

/** The columns in the order of the result: output columns first, then helper columns the script drops. */
function orderedColumns(model: Model): LineageColumn[] {
  return [...model.analysis.columns.filter((column) => column.in_output), ...model.analysis.columns.filter((column) => !column.in_output)];
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Every column at a glance (nothing selected)                                                                      */
/* ---------------------------------------------------------------------------------------------------------------- */

export function AllColumns({ model, nav }: { model: Model; nav: Navigator }) {
  const t = useTranslations("lineageAgent.columns");
  const columns = orderedColumns(model);
  return (
    <section data-tour="lineage-columns" className={cn(PANEL, "overflow-hidden")}>
      <div className="px-5 pb-3 pt-4">
        <SectionTitle icon={<Layers className="h-4 w-4 text-[#f5c400]" />} title={t("all.title", { count: columns.length })} hint={t("all.hint")} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="border-y border-[#1f252e] bg-[#0f141b] text-left text-[10px] uppercase tracking-wide text-[#687386]">
            <tr>
              <th className="px-5 py-2 font-semibold">{t("all.column")}</th>
              <th className="px-3 py-2 font-semibold">{t("all.meaning")}</th>
              <th className="px-3 py-2 font-semibold">{t("all.from")}</th>
              <th className="px-3 py-2 font-semibold">{t("all.operations")}</th>
              <th className="px-5 py-2 font-semibold">{t("all.runtime")}</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => {
              const doc = model.result.ai.columns[column.name];
              const text = doc?.meaning || doc?.summary || "";
              const muted = column.role === "passthrough" || !column.in_output;
              return (
                <tr key={column.name} data-column={column.name} onClick={() => nav.openColumn(column.name)} className="cursor-pointer border-b border-[#151b23] align-top transition-colors last:border-b-0 hover:bg-white/[0.025]">
                  <td className="px-5 py-2.5">
                    <span className="flex items-start gap-2.5">
                      <span className="mt-0.5 h-8 w-[3px] shrink-0 rounded-full" style={{ background: ROLE_STYLES[column.role].bar }} />
                      <span className="min-w-0">
                        <span className={cn("block font-mono text-[12.5px] font-medium", muted ? "text-[#aab3c2]" : "text-white")}>{column.name}</span>
                        <RoleBadge role={column.role} className="mt-1" />
                      </span>
                    </span>
                  </td>
                  <td className="max-w-[420px] px-3 py-2.5">
                    <span className="line-clamp-2 leading-relaxed text-[#c2cad5]">{text ? plainText(text, model.columnNames) : column.role === "passthrough" ? t("passthroughText") : "—"}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex max-w-[300px] flex-wrap gap-1">
                      {column.upstream.map((entry) => <ColumnChip key={entry.column} name={entry.column} muted />)}
                      {column.lookups.map((name) => <span key={name} className="inline-flex items-center gap-1 rounded-md border border-dashed border-violet-400/30 px-1.5 py-[1px] font-mono text-[10.5px] text-violet-200"><Table2 className="h-3 w-3" />{name}</span>)}
                      {!column.upstream.length && !column.lookups.length && <span className="text-[11.5px] text-[#5d6878]">{column.in_input ? t("all.inputItself") : "—"}</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex max-w-[220px] flex-wrap gap-1">{column.operations.map((operation) => <OperationChip key={operation} operation={operation} />)}</span>
                  </td>
                  <td className="px-5 py-2.5"><VerificationBadge status={model.verification(column.name)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* One column                                                                                                       */
/* ---------------------------------------------------------------------------------------------------------------- */

export function ColumnDetail({ model, column, nav, onBack }: { model: Model; column: LineageColumn; nav: Navigator; onBack: () => void }) {
  const t = useTranslations("lineageAgent.columns");
  const doc = model.result.ai.columns[column.name] as ColumnDoc | undefined;
  const findings = model.result.findings.filter((finding) => finding.columns.includes(column.name));
  const dependency = model.result.runtime.dependencies[column.name];
  const changed = Object.values(model.result.cells.changes[column.name] ?? {}).length;
  const computed = model.result.cells.computed.filter((key) => key.endsWith(`|${column.name}`)).length;
  const lines = [...new Set(column.chain.map((id) => model.analysis.nodes[id].line).filter((line): line is number => Boolean(line)))].sort((a, b) => a - b);
  const columns = orderedColumns(model);

  return (
    <div className="min-w-0 space-y-4">
      <section data-tour="lineage-column-header" className={cn(PANEL, "relative overflow-hidden px-5 py-4")}>
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: ROLE_STYLES[column.role].bar }} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={onBack} className="flex items-center gap-1.5 rounded-md border border-[#2c3440] px-2.5 py-1 text-[11.5px] text-[#c2cad5] hover:border-[#f5c400]/50 hover:text-[#f5c400]">
            <ArrowLeft className="h-3.5 w-3.5" /> {t("back")}
          </button>
          <div className="flex items-center gap-2">
            {lines[0] && (
              <button type="button" onClick={() => nav.openLine(lines[0])} className="flex items-center gap-1.5 rounded-md border border-[#2c3440] px-2.5 py-1 text-[11.5px] text-[#c2cad5] hover:border-[#f5c400]/50 hover:text-[#f5c400]">
                <Code2 className="h-3.5 w-3.5" /> {t("showInCode")}
              </button>
            )}
            <label className="flex items-center gap-1.5 text-[11.5px] text-[#8c96a8]">
              {t("switch")}
              <select
                value={column.name}
                onChange={(event) => nav.openColumn(event.target.value)}
                className="h-7 max-w-[220px] rounded-md border border-[#252a33] bg-[#0f141b] px-2 font-mono text-[11.5px] text-white outline-none focus:border-[#f5c400]/50"
              >
                {columns.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <h2 className="mt-3 break-all font-mono text-[22px] font-semibold text-white">{column.name}</h2>
        {doc?.meaning && <p className="mt-1 max-w-3xl text-[13px] italic leading-relaxed text-[#aab3c2]">{plainText(doc.meaning, model.columnNames)}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <RoleBadge role={column.role} />
          <VerificationBadge status={model.verification(column.name)} />
          {column.in_input && column.in_output && <span className="rounded-full border border-[#2c3440] px-2 py-[1px] text-[10.5px] text-[#aab3c2]">{t("inInputAndOutput")}</span>}
          {!column.in_input && column.in_output && <span className="rounded-full border border-violet-400/30 px-2 py-[1px] text-[10.5px] text-violet-300">{t("newColumn")}</span>}
          {column.possible && <span className="rounded-full border border-amber-400/30 px-2 py-[1px] text-[10.5px] text-amber-300">{t("possible")}</span>}
          {column.operations.map((operation) => <OperationChip key={operation} operation={operation} />)}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Fact label={t("facts.directInputs")} value={column.upstream.length} />
          <Fact label={t("facts.sources")} value={column.sources.filter((source) => source.column !== column.name).length} />
          <Fact label={t("facts.writes")} value={column.chain.length} />
          <Fact label={t("facts.usedBy")} value={column.downstream.length} />
          <Fact label={t("facts.cellsChanged")} value={changed} detail={computed ? t("facts.computed", { count: computed }) : undefined} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <AiExplanation model={model} column={column} doc={doc} nav={nav} />
          <Derivation model={model} column={column} nav={nav} />
        </div>
        <div className="min-w-0 space-y-4">
          <LineagePanel column={column} nav={nav} />
          {column.lookups_all.length > 0 && <LookupPanel model={model} column={column} nav={nav} />}
          <ValuesPanel model={model} column={column} nav={nav} />
          {column.role !== "passthrough" && dependency && (
            <section className={cn(PANEL, "space-y-3 p-4")}>
              <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-[#f5c400]" />} title={t("runtime.title")} hint={t("runtime.hint")} />
              <DependencyRow label={t("runtime.confirmed")} tone="good" items={dependency.confirmed} nav={nav} />
              <DependencyRow label={t("runtime.staticOnly")} tone="warn" items={dependency.static_only.filter((name) => name !== column.name)} nav={nav} hint={t("runtime.staticOnlyHint")} />
              <DependencyRow label={t("runtime.runtimeOnly")} tone="bad" items={dependency.runtime_only} nav={nav} hint={t("runtime.runtimeOnlyHint")} />
            </section>
          )}
          {findings.length > 0 && (
            <section className={cn(PANEL, "space-y-2.5 p-4")}>
              <SectionTitle title={t("findings", { count: findings.length })} />
              {findings.map((finding) => <FindingCard key={finding.id} finding={finding} nav={nav} />)}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="rounded-md border border-[#1f252e] bg-[#0f141b] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[#687386]">{label}</p>
      <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-white">{value}</p>
      {detail && <p className="text-[10.5px] text-[#8c96a8]">{detail}</p>}
    </div>
  );
}

function RuleList({ rules, model, nav }: { rules: Rule[]; model: Model; nav: Navigator }) {
  return (
    <ol className="space-y-2">
      {rules.map((rule, index) => (
        <li key={index} className="flex gap-3 rounded-md border border-[#1a2029] bg-[#0d1218] px-3 py-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f5c400]/15 text-[10.5px] font-bold text-[#f5c400]">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] leading-relaxed text-[#dbe2ec]"><RichText text={rule.text} columns={model.columnNames} onColumn={nav.openColumn} /></p>
            {(rule.lines.length > 0 || rule.inputs.length > 0) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {rule.lines.map((line) => <LineChip key={line} line={line} onClick={nav.openLine} />)}
                {rule.inputs.map((input) => <ColumnChip key={input} name={input} muted onClick={nav.openColumn} />)}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function AiExplanation({ model, column, doc, nav }: { model: Model; column: LineageColumn; doc?: ColumnDoc; nav: Navigator }) {
  const t = useTranslations("lineageAgent.columns.ai");
  const tLanguages = useTranslations("lineageAgent.languageNames");
  const [showOriginal, setShowOriginal] = useState(false);
  if (column.role === "passthrough" || !doc || doc.status === "passthrough") {
    return (
      <section data-tour="lineage-ai-explanation" className={cn(PANEL, "p-4")}>
        <SectionTitle icon={<Sparkles className="h-4 w-4 text-[#f5c400]" />} title={t("title")} />
        <p className="mt-2 text-[12.5px] leading-relaxed text-[#8c96a8]">{column.role === "passthrough" ? t("passthrough") : t("notDocumented")}</p>
      </section>
    );
  }
  if (doc.status === "failed") {
    return (
      <section data-tour="lineage-ai-explanation" className={cn(PANEL, "p-4")}>
        <SectionTitle icon={<Sparkles className="h-4 w-4 text-[#f5c400]" />} title={t("title")} />
        <p className="mt-2 text-[12.5px] text-rose-300">{t("failed")}</p>
      </section>
    );
  }
  const review = doc.review;
  const shown = showOriginal && review?.original ? { ...doc, ...review.original } : doc;
  return (
    <section data-tour="lineage-ai-explanation" className={cn(PANEL, "space-y-4 p-4")}>
      <SectionTitle
        icon={<Sparkles className="h-4 w-4 text-[#f5c400]" />}
        title={t("title")}
        hint={t("hint")}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[10.5px] font-semibold", doc.grounding?.status === "verified" ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300" : "border-amber-400/30 bg-amber-400/[0.07] text-amber-300")}>
              <BadgeCheck className="h-3 w-3" /> {doc.grounding?.status === "verified" ? t("grounded") : t("partiallyGrounded")}
            </span>
            {review && review.verdict !== "unavailable" && (
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[10.5px] font-semibold", review.verdict === "confirmed" ? "border-sky-400/30 bg-sky-400/[0.08] text-sky-300" : "border-violet-400/30 bg-violet-400/[0.08] text-violet-300")}>
                <UserCheck className="h-3 w-3" /> {review.verdict === "confirmed" ? t("reviewConfirmed") : t("reviewCorrected")}
              </span>
            )}
          </div>
        }
      />
      {shown.summary && <p className="text-[13.5px] leading-relaxed text-[#e5e9f0]"><RichText text={shown.summary} columns={model.columnNames} onColumn={nav.openColumn} /></p>}
      {shown.formula && (
        <div className="rounded-md border border-[#f5c400]/20 bg-[linear-gradient(120deg,rgba(245,196,0,0.06),transparent_70%)] px-3.5 py-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a8862a]">{t("formula")}</p>
          <Formula text={shown.formula} columns={model.columnNames} onColumn={nav.openColumn} />
        </div>
      )}
      {shown.rules && shown.rules.length > 0 && (
        <div>
          <p className={cn(EYEBROW, "mb-2")}>{t("rules")}</p>
          <RuleList rules={shown.rules} model={model} nav={nav} />
        </div>
      )}
      {doc.notes && doc.notes.length > 0 && (
        <div className="space-y-1.5">
          <p className={EYEBROW}>{t("notes")}</p>
          {doc.notes.map((note, index) => (
            <div key={index} className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-[12px] leading-relaxed", note.severity === "warning" ? "border-amber-400/25 bg-amber-400/[0.05] text-amber-100" : "border-[#1f252e] bg-[#0d1218] text-[#c2cad5]")}>
              <span className="min-w-0 flex-1"><RichText text={note.text} columns={model.columnNames} onColumn={nav.openColumn} /></span>
              {note.lines.map((line) => <LineChip key={line} line={line} onClick={nav.openLine} />)}
            </div>
          ))}
        </div>
      )}
      {review && review.verdict === "corrected" && (
        <div className="rounded-md border border-violet-400/25 bg-violet-400/[0.05] px-3 py-2.5 text-[12px] text-violet-100">
          <p className="flex items-center gap-1.5 font-semibold"><UserCheck className="h-3.5 w-3.5" /> {review.applied ? t("correctionApplied") : t("correctionRejected")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11.5px] text-violet-100/90">{review.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
          {review.applied && review.original && (
            <button type="button" onClick={() => setShowOriginal((value) => !value)} className="mt-2 text-[11.5px] font-semibold text-violet-200 underline-offset-2 hover:underline">
              {showOriginal ? t("showCorrected") : t("showOriginal")}
            </button>
          )}
        </div>
      )}
      {doc.grounding && doc.grounding.issues.length > 0 && (
        <div className="rounded-md border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2.5 text-[11.5px] text-amber-100">
          <p className="font-semibold">{t("groundingIssues")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{doc.grounding.issues.map((issue, index) => <li key={index}><IssueText issue={issue} /></li>)}</ul>
        </div>
      )}
      {review?.rejected_because && review.rejected_because.length > 0 && !review.applied && (
        <div className="rounded-md border border-[#2c3440] bg-[#0d1218] px-3 py-2.5 text-[11.5px] text-[#aab3c2]">
          <p className="font-semibold">{t("rejectedBecause")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{review.rejected_because.map((issue, index) => <li key={index}><IssueText issue={issue} /></li>)}</ul>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-[#5d6878]">
        <Bot className="h-3 w-3" /> {t("footer")}
        {model.translatedFrom && <span className="ml-1 rounded border border-[#2c3440] px-1.5 text-[10px] text-[#8c96a8]">{t("translated", { language: tLanguages.has(model.translatedFrom.toUpperCase()) ? tLanguages(model.translatedFrom.toUpperCase()) : model.translatedFrom })}</span>}
      </p>
    </section>
  );
}

function IssueText({ issue }: { issue: GroundingIssue | string }) {
  const t = useTranslations("lineageAgent.columns.ai.issues");
  if (typeof issue === "string") return <>{issue}</>;
  if (!t.has(issue.code)) return <>{issue.text}</>;
  return <>{t(issue.code, issue.params as Record<string, string | number>)}</>;
}

function Derivation({ model, column, nav }: { model: Model; column: LineageColumn; nav: Navigator }) {
  const t = useTranslations("lineageAgent.columns.derivation");
  const tOps = useTranslations("lineageAgent.operations");
  const [open, setOpen] = useState<Set<number>>(() => new Set(column.chain.slice(-1)));
  const focus = useMemo(() => new Set([column.name]), [column.name]);
  const statements = useMemo(() => new Map(model.result.runtime.statements.map((statement) => [statement.line, statement])), [model]);
  const inputProfile = model.result.profiles.input[column.name];
  return (
    <section data-tour="lineage-derivation" className={cn(PANEL, "p-4")}>
      <SectionTitle icon={<History className="h-4 w-4 text-[#f5c400]" />} title={t("title")} hint={t("hint")} />
      <ol className="relative mt-4 space-y-3 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-[#252a33]">
        {column.in_input && (column.input_used || column.role === "passthrough") && (
          <li className="relative flex gap-3">
            <span className="z-[1] mt-0.5 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border border-slate-400/40 bg-[#0b0f15]">
              <Database className="h-3 w-3 text-slate-300" />
            </span>
            <div className="min-w-0 flex-1 rounded-md border border-[#1f252e] bg-[#0d1218] px-3 py-2.5">
              <p className="text-[12.5px] font-semibold text-white">{t("inputValue")}</p>
              <p className="mt-0.5 text-[12px] text-[#8c96a8]">
                {column.role === "passthrough" ? t("passthrough") : t("inputUsed")}
                {inputProfile && ` ${t("inputProfile", { filled: inputProfile.non_null, total: inputProfile.total })}`}
              </p>
            </div>
          </li>
        )}
        {column.chain.map((id) => {
          const node = model.analysis.nodes[id];
          const step = node.line ? model.stepOf(node.line) : undefined;
          const statement = step ? statements.get(step.line) : undefined;
          const cells = statement?.changed?.[column.name] ?? 0;
          const expanded = open.has(id);
          const codeLines = step ? model.result.code.lines.slice((node.line ?? step.line) - 1, node.end_line ?? node.line ?? step.end_line) : [];
          return (
            <li key={id} className="relative flex gap-3">
              <span className="z-[1] mt-0.5 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border border-[#f5c400]/40 bg-[#0b0f15] text-[10px] font-bold text-[#f5c400]">
                {node.version}
              </span>
              <div className="min-w-0 flex-1 rounded-md border border-[#1f252e] bg-[#0d1218]">
                <button type="button" onClick={() => setOpen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left">
                  {expanded ? <ChevronDown className="h-3.5 w-3.5 text-[#687386]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#687386]" />}
                  {node.line && <LineChip line={node.line} end={node.end_line} />}
                  <span className="text-[12.5px] font-semibold text-white">{node.operation ? (tOps.has(node.operation) ? tOps(node.operation) : node.operation) : ""}</span>
                  {node.retained && <span className="rounded border border-emerald-400/25 px-1.5 text-[10px] text-emerald-300">{t("keepsOthers")}</span>}
                  {node.possible && <span className="rounded border border-amber-400/25 px-1.5 text-[10px] text-amber-300">{t("possible")}</span>}
                  {node.bindings && Object.entries(node.bindings).map(([name, value]) => (
                    <span key={name} className="rounded border border-[#2c3440] px-1.5 font-mono text-[10px] text-[#aab3c2]">{name} = {String(value)}</span>
                  ))}
                  <span className={cn("ml-auto rounded-full px-2 py-[1px] text-[10.5px] tabular-nums", cells ? "bg-emerald-400/10 text-emerald-300" : "bg-[#1a212c] text-[#687386]")}>
                    {statement ? (cells ? t("cells", { count: cells }) : t("noChange")) : t("notReplayed")}
                  </span>
                </button>
                <div className="space-y-2 px-3 pb-3">
                  {node.pretty && (
                    <div className="rounded border border-[#1a2029] bg-[#080b10] px-2.5 py-1.5">
                      <Formula text={node.pretty} columns={model.columnNames} onColumn={nav.openColumn} />
                    </div>
                  )}
                  {node.renamed_from && <p className="text-[12px] text-[#aab3c2]">{t("renamedFrom", { column: node.renamed_from })}</p>}
                  {(node.conditions ?? []).map((condition, index) => (
                    <div key={index} className="rounded border border-dashed border-amber-400/30 bg-amber-400/[0.04] px-2.5 py-1.5 text-[12px]">
                      <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-amber-300">{t(`condition.${condition.kind}`)}</span>
                      {condition.pretty ? <Formula text={condition.pretty} columns={model.columnNames} onColumn={nav.openColumn} className="text-[11.5px]" /> : <span className="font-mono text-[11.5px] text-[#dbe2ec]">{condition.code}</span>}
                      {condition.expanded && condition.code !== condition.expanded && <span className="ml-2 font-mono text-[11px] text-[#8c96a8]">({condition.code})</span>}
                    </div>
                  ))}
                  {expanded && codeLines.length > 0 && (
                    <CodeBlock lines={codeLines} start={node.line ?? step!.line} columns={model.columnNames} focus={focus} />
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {column.chain.length === 0 && column.role !== "passthrough" && <li className="pl-9 text-[12px] text-[#687386]">{t("none")}</li>}
      </ol>
    </section>
  );
}

function LineagePanel({ column, nav }: { column: LineageColumn; nav: Navigator }) {
  const t = useTranslations("lineageAgent.columns.lineage");
  const own = column.sources.filter((source) => source.column !== column.name);
  return (
    <section data-tour="lineage-column-lineage" className={cn(PANEL, "space-y-4 p-4")}>
      <SectionTitle icon={<GitBranch className="h-4 w-4 text-[#f5c400]" />} title={t("title")} hint={t("hint")} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-[#687386]">{t("inputs")}</p>
          {column.upstream.length === 0 && column.lookups.length === 0 && <p className="text-[11.5px] text-[#5d6878]">{column.input_used || column.role === "passthrough" ? t("onlyItself") : "—"}</p>}
          {column.upstream.map((entry) => (
            <div key={entry.column} className="rounded-md border border-[#1f252e] bg-[#0d1218] p-1.5">
              <ColumnChip name={entry.column} onClick={nav.openColumn} />
              <div className="mt-1 flex flex-wrap gap-1">{entry.transformations.map((item) => <TransformationBadge key={`${item.type}${item.subtype}`} transformation={item} compact />)}</div>
              {entry.historical && <p className="mt-1 text-[10px] text-amber-300">{t("historical")}</p>}
            </div>
          ))}
          {column.lookups.map((name) => (
            <button key={name} type="button" onClick={() => nav.openLookup(name)} className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-violet-400/30 bg-violet-400/[0.04] p-1.5 font-mono text-[11px] text-violet-200 hover:border-violet-300/60">
              <Table2 className="h-3 w-3" /> {name}
            </button>
          ))}
        </div>
        <div className="flex h-full flex-col items-center justify-center gap-1 px-1 pt-5">
          <ArrowRight className="h-4 w-4 text-[#5d6878]" />
          <span className="rounded-md border border-[#f5c400]/40 bg-[#f5c400]/10 px-2 py-1 font-mono text-[11px] font-semibold text-[#f5c400]">{column.name}</span>
          <ArrowRight className="h-4 w-4 text-[#5d6878]" />
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-[#687386]">{t("usedBy")}</p>
          {column.downstream.length === 0 && <p className="text-[11.5px] text-[#5d6878]">{t("final")}</p>}
          {column.downstream.map((name) => <div key={name}><ColumnChip name={name} onClick={nav.openColumn} /></div>)}
        </div>
      </div>
      {own.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#687386]">{t("sources", { count: own.length })}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {own.map((source) => (
              <span key={source.column} title={t(`mode.${source.mode}`)} className={cn("rounded-md border px-1.5 py-[1px] font-mono text-[11px]", source.mode === "direct" ? "border-[#2c3440] text-[#dbe2ec]" : "border-dashed border-amber-400/40 text-amber-200")}>
                {source.column}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] text-[#5d6878]">{t("sourcesLegend")}</p>
        </div>
      )}
    </section>
  );
}

function LookupPanel({ model, column, nav }: { model: Model; column: LineageColumn; nav: Navigator }) {
  const t = useTranslations("lineageAgent.columns.lookups");
  const [open, setOpen] = useState<string | null>(column.lookups[0] ?? null);
  return (
    <section className={cn(PANEL, "space-y-2 p-4")}>
      <SectionTitle icon={<Table2 className="h-4 w-4 text-violet-300" />} title={t("title")} hint={t("hint")} />
      {column.lookups_all.map((name) => {
        const lookup = model.analysis.lookups.find((item) => item.name === name);
        if (!lookup) return null;
        const direct = column.lookups.includes(name);
        const unmapped = model.result.runtime.unmapped.filter((item) => item.name === name && item.values.length);
        return (
          <div key={name} className="overflow-hidden rounded-md border border-[#1f252e]">
            <div className="flex items-center gap-2 bg-[#0d1218] pr-3">
              <button type="button" onClick={() => setOpen(open === name ? null : name)} aria-expanded={open === name} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left">
                {open === name ? <ChevronDown className="h-3.5 w-3.5 text-[#687386]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#687386]" />}
                <span className="font-mono text-[12px] text-violet-200">{name}</span>
                <span className="text-[10.5px] text-[#687386]">{direct ? t("direct") : t("upstream")}</span>
              </button>
              <LineChip line={lookup.line} end={lookup.end_line} onClick={nav.openLine} />
            </div>
            {open === name && lookup.kind === "mapping" && <LookupEntries entries={lookup.entries} />}
            {open === name && unmapped.map((entry) => (
              <p key={entry.line} className="border-t border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[11.5px] text-amber-100">
                {t("unmapped", { values: entry.values.map((item) => `${item.value} (${item.rows}×)`).join(", ") })}
              </p>
            ))}
          </div>
        );
      })}
    </section>
  );
}

function LookupEntries({ entries }: { entries: [unknown, unknown][] }) {
  return (
    <table className="w-full text-[11.5px]">
      <tbody>
        {entries.map(([key, value], index) => (
          <tr key={index} className="border-t border-[#1a2029]">
            <td className="w-1/2 px-3 py-1 font-mono"><ValueText value={key} /></td>
            <td className="px-3 py-1 font-mono"><ArrowRight className="mr-2 inline h-3 w-3 text-[#5d6878]" /><ValueText value={value} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type CellKind = "filled" | "changed" | "emptied" | "unchanged";

const CELL_STYLES: Record<CellKind, string> = {
  filled: "bg-emerald-400/[0.10] text-emerald-100",
  changed: "bg-amber-400/[0.10] text-amber-100",
  emptied: "bg-rose-400/[0.10] text-rose-200",
  unchanged: "text-[#aab3c2]",
};

const VALUE_ROWS = 8;

/** The column's value in every traced row of the result: the input value, the result and the lines that changed it.
 *  A row opens its paper trail: every change with the formula evaluated on that row's values. */
function ValuesPanel({ model, column, nav }: { model: Model; column: LineageColumn; nav: Navigator }) {
  const t = useTranslations("lineageAgent.columns.values");
  const tOps = useTranslations("lineageAgent.operations");
  const cells = model.result.cells;
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const computed = useMemo(() => new Set(cells.computed), [cells.computed]);
  // A readable row key: the first pass-through text column with unique values (e.g. a position id).
  const keyColumn = useMemo(() => {
    for (const item of model.analysis.columns) {
      if (item.role !== "passthrough" || item.name === column.name) continue;
      const values = cells.rows.map((row) => row.values[item.name]);
      if (values.length && values.every((value) => typeof value === "string") && new Set(values).size === values.length) return item.name;
    }
    return null;
  }, [model, cells.rows, column.name]);
  if (!cells.columns.includes(column.name) && !cells.input_columns.includes(column.name)) return null;
  const inInput = cells.input_columns.includes(column.name);
  const history = cells.changes[column.name] ?? {};
  const kindOf = (row: string, value: unknown): CellKind => {
    const changes = history[row];
    if (!changes?.length) return "unchanged";
    if (computed.has(`${row}|${column.name}`)) return "filled";
    if (value === null || value === undefined) return "emptied";
    const before = changes[0].before;
    return before === null || before === undefined ? "filled" : "changed";
  };
  const rows = all ? cells.rows : cells.rows.slice(0, VALUE_ROWS);
  const filled = cells.rows.filter((row) => row.values[column.name] !== null && row.values[column.name] !== undefined).length;
  const changedRows = cells.rows.filter((row) => history[row.label]?.length).length;
  const grid = inInput ? "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]";
  return (
    <section data-tour="lineage-values" className={cn(PANEL, "overflow-hidden")}>
      <div className="p-4 pb-3">
        <SectionTitle
          icon={<Rows3 className="h-4 w-4 text-[#f5c400]" />}
          title={t("title")}
          hint={t("hint", { filled, rows: cells.rows.length, changed: changedRows })}
        />
      </div>
      <div className={cn("grid border-y border-[#1f252e] bg-[#0f141b] text-[10px] font-semibold uppercase tracking-wide text-[#687386]", grid)}>
        <span className="px-4 py-1.5 pl-[34px]">{t("row")}</span>
        {inInput && <span className="px-2 py-1.5">{t("input")}</span>}
        <span className="px-2 py-1.5">{t("result")}</span>
        <span className="px-4 py-1.5 text-right">{t("changedBy")}</span>
      </div>
      <ul className="text-[11.5px]">
        {rows.map((row) => {
          const value = row.values[column.name];
          const kind = kindOf(row.label, value);
          const changes = history[row.label] ?? [];
          const expanded = open === row.label;
          return (
            <li key={row.label} className="border-b border-[#151b23] last:border-b-0">
              <button type="button" disabled={!changes.length} onClick={() => setOpen(expanded ? null : row.label)} aria-expanded={changes.length ? expanded : undefined} className={cn("grid w-full items-center text-left", grid, changes.length ? "hover:bg-white/[0.025]" : "cursor-default")}>
                <span className="flex min-w-0 items-center gap-1.5 px-4 py-1.5 font-mono text-[11px] text-[#687386]">
                  {changes.length ? (expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />) : <span className="w-3 shrink-0" />}
                  <span className="shrink-0">{row.label}</span>
                  {keyColumn && <span className="truncate text-[#aab3c2]"><ValueText value={row.values[keyColumn]} /></span>}
                </span>
                {inInput && <span className="truncate px-2 py-1.5 font-mono text-[#8c96a8]"><ValueText value={cells.input[row.label]?.[column.name]} /></span>}
                <span className={cn("truncate px-2 py-1.5 font-mono", CELL_STYLES[kind])}><ValueText value={value} /></span>
                <span className="flex justify-end gap-1 px-4 py-1.5">{[...new Set(changes.map((change) => change.line))].map((line) => <LineChip key={line} line={line} />)}</span>
              </button>
              {expanded && (
                <ol className="space-y-1.5 border-t border-[#151b23] bg-[#080b10] px-4 py-2.5">
                  {changes.map((change, index) => {
                    const node = model.writeAt(column.name, change.line);
                    return (
                      <li key={index} className="rounded-md border border-[#1f252e] bg-[#0d1218] px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <LineChip line={change.line} onClick={nav.openLine} />
                          {node?.operation && <span className="text-[11.5px] font-semibold text-white">{tOps.has(node.operation) ? tOps(node.operation) : node.operation}</span>}
                          <span className="ml-auto flex items-center gap-1.5 font-mono text-[11.5px]"><ValueText value={change.before} /><span className="text-[#5d6878]">→</span><ValueText value={change.after} className="font-semibold" /></span>
                        </div>
                        {node?.pretty && <div className="mt-1.5"><Formula text={node.pretty} columns={model.columnNames} values={change.inputs} onColumn={nav.openColumn} className="text-[11.5px]" /></div>}
                        {(node?.conditions ?? []).length > 0 && <p className="mt-1 font-mono text-[11px] text-amber-200/90">{t("when")} {node!.conditions!.map((condition) => condition.expanded ?? condition.code).join(" · ")}</p>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
      {(cells.rows.length > VALUE_ROWS || cells.total_rows > cells.rows.length) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1f252e] px-4 py-2 text-[11px] text-[#687386]">
          {cells.rows.length > VALUE_ROWS ? (
            <button type="button" onClick={() => setAll((value) => !value)} className="font-semibold text-[#c2cad5] hover:text-[#f5c400]">{all ? t("fewer") : t("more", { count: cells.rows.length })}</button>
          ) : <span />}
          {cells.total_rows > cells.rows.length && <span>{t("limited", { shown: cells.rows.length, total: cells.total_rows })}</span>}
        </div>
      )}
    </section>
  );
}

function DependencyRow({ label, tone, items, nav, hint }: { label: string; tone: "good" | "warn" | "bad"; items: string[]; nav: Navigator; hint?: string }) {
  if (!items.length) return null;
  const tones = { good: "text-emerald-300", warn: "text-amber-300", bad: "text-rose-300" };
  return (
    <div>
      <p className={cn("text-[11.5px] font-semibold", tones[tone])}>{label} <span className="tabular-nums opacity-70">({items.length})</span></p>
      {hint && <p className="text-[11px] text-[#687386]">{hint}</p>}
      <div className="mt-1.5 flex flex-wrap gap-1">{items.map((name) => <ColumnChip key={name} name={name} onClick={nav.openColumn} />)}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* One lookup table                                                                                                 */
/* ---------------------------------------------------------------------------------------------------------------- */

export function LookupDetail({ model, name, nav, onBack }: { model: Model; name: string; nav: Navigator; onBack: () => void }) {
  const t = useTranslations("lineageAgent.graph");
  const tColumns = useTranslations("lineageAgent.columns");
  const lookup = model.analysis.lookups.find((item) => item.name === name);
  if (!lookup) return null;
  const unmapped = model.result.runtime.unmapped.filter((item) => item.name === name && item.values.length);
  return (
    <section data-tour="lineage-lookup" className={cn(PANEL, "relative overflow-hidden px-5 py-4")}>
      <span className="absolute inset-y-0 left-0 w-1 bg-violet-400" />
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 rounded-md border border-[#2c3440] px-2.5 py-1 text-[11.5px] text-[#c2cad5] hover:border-[#f5c400]/50 hover:text-[#f5c400]">
        <ArrowLeft className="h-3.5 w-3.5" /> {tColumns("back")}
      </button>
      <p className={cn(EYEBROW, "mt-3")}>{t("lookupTable")}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h2 className="font-mono text-[20px] font-semibold text-violet-200">{lookup.name}</h2>
        <LineChip line={lookup.line} end={lookup.end_line} onClick={nav.openLine} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-md border border-[#1f252e]">
          {lookup.kind === "mapping" ? (
            <>
              <div className="grid grid-cols-2 bg-[#0f141b] text-[10px] uppercase tracking-wide text-[#687386]"><span className="px-3 py-1.5">{t("key")}</span><span className="px-3 py-1.5">{t("value")}</span></div>
              <LookupEntries entries={lookup.entries} />
            </>
          ) : (
            <p className="p-3 text-[12px] text-[#8c96a8]">{t("referenceTable", { columns: lookup.entries.length })}</p>
          )}
        </div>
        <div className="space-y-4">
          {lookup.keys_from.length > 0 && (
            <div>
              <p className={EYEBROW}>{t("keyColumn")}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{lookup.keys_from.map((column) => <ColumnChip key={column} name={column} onClick={nav.openColumn} />)}</div>
            </div>
          )}
          <div>
            <p className={EYEBROW}>{t("usedBy")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{lookup.used_by.map((column) => <ColumnChip key={column} name={column} onClick={nav.openColumn} />)}</div>
          </div>
          {unmapped.map((entry) => (
            <div key={entry.line} className="rounded-md border border-amber-400/30 bg-amber-400/[0.06] p-3 text-[11.5px] text-amber-100">
              {t("unmapped", { column: entry.column, count: entry.values.reduce((sum, item) => sum + item.rows, 0) })}
              <div className="mt-1.5 flex flex-wrap gap-1">{entry.values.map((item) => <span key={item.value} className="rounded bg-amber-400/10 px-1.5 font-mono">{item.value} ×{item.rows}</span>)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
