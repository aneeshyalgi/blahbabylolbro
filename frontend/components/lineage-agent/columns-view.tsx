"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRight, BadgeCheck, Bot, ChevronDown, ChevronRight, Database, GitBranch, History, ListChecks, Search, ShieldCheck, Sparkles, Table2, UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CodeBlock, ColumnChip, EYEBROW, Formula, LineChip, OperationChip, PANEL, ROLE_STYLES, RichText, RoleBadge, SectionTitle, TransformationBadge,
  ValueText, VerificationBadge, plainText,
} from "./atoms";
import { FindingCard } from "./findings";
import type { Model } from "./model";
import type { ColumnDoc, GroundingIssue, LineageColumn, Navigator, Role, Rule } from "./types";

const FILTERS = ["all", "derived", "created", "passthrough"] as const;
type Filter = (typeof FILTERS)[number];

export function ColumnsView({ model, selected, onSelect, nav }: { model: Model; selected: string | null; onSelect: (column: string) => void; nav: Navigator }) {
  const t = useTranslations("lineageAgent.columns");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const columns = useMemo(() => {
    const output = model.analysis.columns.filter((column) => column.in_output);
    const others = model.analysis.columns.filter((column) => !column.in_output);
    return [...output, ...others];
  }, [model]);
  const visible = columns.filter((column) => {
    if (query.trim() && !column.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (filter === "derived") return ["cast", "enriched", "overwritten"].includes(column.role);
    if (filter === "created") return ["created", "renamed"].includes(column.role);
    if (filter === "passthrough") return ["passthrough", "dropped", "intermediate"].includes(column.role);
    return true;
  });
  const current = (selected && model.byName.get(selected)) || columns.find((column) => column.role !== "passthrough") || columns[0];
  const counts: Record<Filter, number> = {
    all: columns.length,
    derived: columns.filter((column) => ["cast", "enriched", "overwritten"].includes(column.role)).length,
    created: columns.filter((column) => ["created", "renamed"].includes(column.role)).length,
    passthrough: columns.filter((column) => ["passthrough", "dropped", "intermediate"].includes(column.role)).length,
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside data-tour="lineage-column-list" className={cn(PANEL, "flex h-fit flex-col xl:sticky xl:top-4 xl:max-h-[calc(100vh-120px)]")}>
        <div className="space-y-2.5 border-b border-[#1f252e] p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5d6878]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search")}
              className="h-8 w-full rounded-md border border-[#252a33] bg-[#0f141b] pl-8 pr-2 text-[12px] text-white outline-none placeholder:text-[#5d6878] focus:border-[#f5c400]/50"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={cn("rounded-full border px-2 py-0.5 text-[11px]", filter === item ? "border-[#f5c400]/40 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#252a33] text-[#8c96a8] hover:text-white")}
              >
                {t(`filter.${item}`)} <span className="tabular-nums opacity-70">{counts[item]}</span>
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {visible.map((column) => {
            const active = current?.name === column.name;
            const doc = model.result.ai.columns[column.name];
            return (
              <li key={column.name}>
                <button
                  type="button"
                  onClick={() => onSelect(column.name)}
                  className={cn("group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors", active ? "bg-[#f5c400]/10" : "hover:bg-[#121821]")}
                >
                  <span className="h-7 w-[3px] shrink-0 rounded-full" style={{ background: ROLE_STYLES[column.role].bar }} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate font-mono text-[12.5px]", active ? "text-[#f5c400]" : "text-[#e5e9f0]")}>{column.name}</span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-[#687386]">
                      {t(`roleShort.${column.role}`)}
                      {column.upstream.length > 0 && ` · ${t("inputsCount", { count: column.upstream.length })}`}
                    </span>
                  </span>
                  {doc?.grounding?.status === "verified" && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" />}
                </button>
              </li>
            );
          })}
          {!visible.length && <li className="px-3 py-6 text-center text-[12px] text-[#687386]">{t("noMatch")}</li>}
        </ul>
      </aside>
      {current && <ColumnDetail key={current.name} model={model} column={current} nav={nav} />}
    </div>
  );
}

function ColumnDetail({ model, column, nav }: { model: Model; column: LineageColumn; nav: Navigator }) {
  const t = useTranslations("lineageAgent.columns");
  const doc = model.result.ai.columns[column.name] as ColumnDoc | undefined;
  const findings = model.result.findings.filter((finding) => finding.columns.includes(column.name));
  const inputProfile = model.result.profiles.input[column.name];
  const outputProfile = model.result.profiles.output[column.name];
  const dependency = model.result.runtime.dependencies[column.name];
  const changed = Object.values(model.result.cells.changes[column.name] ?? {}).length;
  const computed = model.result.cells.computed.filter((key) => key.endsWith(`|${column.name}`)).length;
  const lines = [...new Set(column.chain.map((id) => model.analysis.nodes[id].line).filter((line): line is number => Boolean(line)))].sort((a, b) => a - b);

  return (
    <div className="min-w-0 space-y-4">
      {/* Header */}
      <section data-tour="lineage-column-header" className={cn(PANEL, "relative overflow-hidden px-5 py-4")}>
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: ROLE_STYLES[column.role].bar }} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={EYEBROW}>{t("column")}</p>
            <h2 className="mt-1 break-all font-mono text-[22px] font-semibold text-white">{column.name}</h2>
            {doc?.meaning && <p className="mt-1.5 max-w-3xl text-[13px] italic leading-relaxed text-[#aab3c2]">{plainText(doc.meaning, model.columnNames)}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <RoleBadge role={column.role} />
              <VerificationBadge status={model.verification(column.name)} />
              {column.in_input && column.in_output && <span className="rounded-full border border-[#2c3440] px-2 py-[1px] text-[10.5px] text-[#aab3c2]">{t("inInputAndOutput")}</span>}
              {!column.in_input && column.in_output && <span className="rounded-full border border-violet-400/30 px-2 py-[1px] text-[10.5px] text-violet-300">{t("newColumn")}</span>}
              {column.possible && <span className="rounded-full border border-amber-400/30 px-2 py-[1px] text-[10.5px] text-amber-300">{t("possible")}</span>}
              {column.operations.map((operation) => <OperationChip key={operation} operation={operation} />)}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => nav.openColumn(column.name, "graph")} className="flex items-center gap-1.5 rounded-md border border-[#2c3440] px-2.5 py-1.5 text-[12px] text-[#c2cad5] hover:border-[#f5c400]/50 hover:text-[#f5c400]">
              <GitBranch className="h-3.5 w-3.5" /> {t("showInGraph")}
            </button>
            {lines[0] && (
              <button type="button" onClick={() => nav.openLine(lines[0])} className="flex items-center gap-1.5 rounded-md border border-[#2c3440] px-2.5 py-1.5 text-[12px] text-[#c2cad5] hover:border-[#f5c400]/50 hover:text-[#f5c400]">
                <ListChecks className="h-3.5 w-3.5" /> {t("showInCode")}
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Fact label={t("facts.directInputs")} value={column.upstream.length} />
          <Fact label={t("facts.sources")} value={column.sources.filter((source) => source.column !== column.name).length} />
          <Fact label={t("facts.writes")} value={column.chain.length} />
          <Fact label={t("facts.usedBy")} value={column.downstream.length} />
          <Fact label={t("facts.cellsChanged")} value={changed} detail={computed ? t("facts.computed", { count: computed }) : undefined} />
        </div>
      </section>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <AiExplanation model={model} column={column} doc={doc} nav={nav} />
          <Derivation model={model} column={column} nav={nav} />
        </div>
        <div className="min-w-0 space-y-4">
          <LineagePanel model={model} column={column} nav={nav} />
          {column.lookups_all.length > 0 && <LookupPanel model={model} column={column} nav={nav} />}
          <section className={cn(PANEL, "space-y-3 p-4")}>
            <SectionTitle icon={<Database className="h-4 w-4 text-[#f5c400]" />} title={t("profile.title")} hint={t("profile.hint")} />
            <div className="grid grid-cols-2 gap-3">
              <ProfileCard label={t("profile.input")} profile={column.in_input ? inputProfile : undefined} empty={t("profile.notInInput")} />
              <ProfileCard label={t("profile.output")} profile={column.in_output ? outputProfile : undefined} empty={t("profile.notInOutput")} />
            </div>
          </section>
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
            <p className="text-[12.5px] leading-relaxed text-[#dbe2ec]"><RichText text={rule.text} columns={model.columnNames} onColumn={(name) => nav.openColumn(name)} /></p>
            {(rule.lines.length > 0 || rule.inputs.length > 0) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {rule.lines.map((line) => <LineChip key={line} line={line} onClick={nav.openLine} />)}
                {rule.inputs.map((input) => <ColumnChip key={input} name={input} muted onClick={(name) => nav.openColumn(name)} />)}
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
      <section className={cn(PANEL, "p-4")}>
        <SectionTitle icon={<Sparkles className="h-4 w-4 text-[#f5c400]" />} title={t("title")} />
        <p className="mt-2 text-[12.5px] leading-relaxed text-[#8c96a8]">{column.role === "passthrough" ? t("passthrough") : t("notDocumented")}</p>
      </section>
    );
  }
  if (doc.status === "failed") {
    return (
      <section className={cn(PANEL, "p-4")}>
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
      {shown.summary && <p className="text-[13.5px] leading-relaxed text-[#e5e9f0]"><RichText text={shown.summary} columns={model.columnNames} onColumn={(name) => nav.openColumn(name)} /></p>}
      {shown.formula && (
        <div className="rounded-md border border-[#f5c400]/20 bg-[linear-gradient(120deg,rgba(245,196,0,0.06),transparent_70%)] px-3.5 py-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a8862a]">{t("formula")}</p>
          <Formula text={shown.formula} columns={model.columnNames} onColumn={(name) => nav.openColumn(name)} />
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
              <span className="min-w-0 flex-1"><RichText text={note.text} columns={model.columnNames} onColumn={(name) => nav.openColumn(name)} /></span>
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
                      <Formula text={node.pretty} columns={model.columnNames} onColumn={(name) => nav.openColumn(name)} />
                    </div>
                  )}
                  {node.renamed_from && <p className="text-[12px] text-[#aab3c2]">{t("renamedFrom", { column: node.renamed_from })}</p>}
                  {(node.conditions ?? []).map((condition, index) => (
                    <div key={index} className="rounded border border-dashed border-amber-400/30 bg-amber-400/[0.04] px-2.5 py-1.5 text-[12px]">
                      <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-amber-300">{t(`condition.${condition.kind}`)}</span>
                      {condition.pretty ? <Formula text={condition.pretty} columns={model.columnNames} onColumn={(name) => nav.openColumn(name)} className="text-[11.5px]" /> : <span className="font-mono text-[11.5px] text-[#dbe2ec]">{condition.code}</span>}
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

function LineagePanel({ model, column, nav }: { model: Model; column: LineageColumn; nav: Navigator }) {
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
              <ColumnChip name={entry.column} onClick={(name) => nav.openColumn(name)} />
              <div className="mt-1 flex flex-wrap gap-1">{entry.transformations.map((item) => <TransformationBadge key={`${item.type}${item.subtype}`} transformation={item} compact />)}</div>
              {entry.historical && <p className="mt-1 text-[10px] text-amber-300">{t("historical")}</p>}
            </div>
          ))}
          {column.lookups.map((name) => (
            <div key={name} className="flex items-center gap-1.5 rounded-md border border-dashed border-violet-400/30 bg-violet-400/[0.04] p-1.5 font-mono text-[11px] text-violet-200">
              <Table2 className="h-3 w-3" /> {name}
            </div>
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
          {column.downstream.map((name) => <div key={name}><ColumnChip name={name} onClick={(target) => nav.openColumn(target)} /></div>)}
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
            {open === name && lookup.kind === "mapping" && (
              <table className="w-full text-[11.5px]">
                <tbody>
                  {lookup.entries.map(([key, value], index) => (
                    <tr key={index} className="border-t border-[#1a2029]">
                      <td className="w-1/2 px-3 py-1 font-mono"><ValueText value={key} /></td>
                      <td className="px-3 py-1 font-mono"><ArrowRight className="mr-2 inline h-3 w-3 text-[#5d6878]" /><ValueText value={value} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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

function ProfileCard({ label, profile, empty }: { label: string; profile?: { non_null: number; total: number; samples: unknown[] }; empty: string }) {
  const t = useTranslations("lineageAgent.columns.profile");
  if (!profile) {
    return (
      <div className="rounded-md border border-dashed border-[#252a33] p-3">
        <p className="text-[10px] uppercase tracking-wide text-[#687386]">{label}</p>
        <p className="mt-2 text-[11.5px] text-[#5d6878]">{empty}</p>
      </div>
    );
  }
  const filled = profile.total ? profile.non_null / profile.total : 0;
  return (
    <div className="rounded-md border border-[#1f252e] bg-[#0d1218] p-3">
      <p className="text-[10px] uppercase tracking-wide text-[#687386]">{label}</p>
      <p className="mt-1 text-[13px] font-semibold tabular-nums text-white">{t("filled", { filled: profile.non_null, total: profile.total })}</p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#1a212c]">
        <div className="h-full rounded-full bg-[#f5c400]/70" style={{ width: `${Math.round(filled * 100)}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {profile.samples.map((sample, index) => (
          <span key={index} className="rounded bg-[#121821] px-1.5 py-[1px] font-mono text-[10.5px]"><ValueText value={sample} /></span>
        ))}
      </div>
    </div>
  );
}

function DependencyRow({ label, tone, items, nav, hint }: { label: string; tone: "good" | "warn" | "bad"; items: string[]; nav: Navigator; hint?: string }) {
  if (!items.length) return null;
  const tones = { good: "text-emerald-300", warn: "text-amber-300", bad: "text-rose-300" };
  return (
    <div>
      <p className={cn("text-[11.5px] font-semibold", tones[tone])}>{label} <span className="tabular-nums opacity-70">({items.length})</span></p>
      {hint && <p className="text-[11px] text-[#687386]">{hint}</p>}
      <div className="mt-1.5 flex flex-wrap gap-1">{items.map((name) => <ColumnChip key={name} name={name} onClick={(target) => nav.openColumn(target)} />)}</div>
    </div>
  );
}

export function roleOrder(role: Role): number {
  return ["created", "renamed", "overwritten", "enriched", "cast", "passthrough", "dropped", "intermediate"].indexOf(role);
}
