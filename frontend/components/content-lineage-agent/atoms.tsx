"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, CircleDashed, CircleHelp, Database, FileText, GitCommitHorizontal, Scale, Sigma, Target, TriangleAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Model } from "./model";
import type { TermKind, Verdict } from "./types";

export { PANEL, SUBTLE, EYEBROW, CodeBlock, Formula, LineChip, ValueText, CheckIcon, SeverityIcon, SEVERITY_STYLES, SectionTitle, formatDateTime, formatDuration } from "@/components/lineage-agent/atoms";

export const KIND_COLORS: Record<TermKind | "rule" | "provision", string> = {
  figure: "#f5c400",
  concept: "#34d399",
  source: "#38bdf8",
  rule: "#a78bfa",
  provision: "#fb923c",
};

export const KIND_CHIPS: Record<TermKind, string> = {
  figure: "border-[#f5c400]/40 bg-[#f5c400]/10 text-[#f5c400]",
  concept: "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300",
  source: "border-sky-400/30 bg-sky-400/[0.08] text-sky-300",
};

export const VERDICT_COLORS: Record<Verdict, string> = {
  consistent: "#34d399",
  simplified: "#fbbf24",
  deviation: "#fb7185",
  not_covered: "#64748b",
  unverified: "#94a3b8",
};

const VERDICT_CHIPS: Record<Verdict, string> = {
  consistent: "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300",
  simplified: "border-amber-400/35 bg-amber-400/[0.08] text-amber-300",
  deviation: "border-rose-400/35 bg-rose-400/[0.09] text-rose-300",
  not_covered: "border-slate-400/25 bg-slate-400/[0.06] text-slate-300",
  unverified: "border-slate-400/25 bg-slate-400/[0.06] text-slate-300",
};

/** Origin colours: delivered by the source system, derived by a case (shades), missing. */
export const ORIGIN_COLORS = {
  delivered: "#38bdf8",
  derived: ["#34d399", "#a78bfa", "#f472b6", "#fbbf24", "#22d3ee", "#fb923c", "#a3e635", "#e879f9"],
  missing: "#fb7185",
};

export function KindIcon({ kind, className, style }: { kind: TermKind | "rule" | "provision"; className?: string; style?: React.CSSProperties }) {
  const Icon = kind === "figure" ? Target : kind === "concept" ? Sigma : kind === "source" ? Database : kind === "rule" ? GitCommitHorizontal : Scale;
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} style={style ?? { color: KIND_COLORS[kind] }} />;
}

export function KindBadge({ kind, classifier, className }: { kind: TermKind; classifier?: boolean; className?: string }) {
  const t = useTranslations("contentLineageAgent.kinds");
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[1px] text-[10.5px] font-semibold uppercase tracking-wide", KIND_CHIPS[kind], className)}>
      <KindIcon kind={kind} className="h-3 w-3" style={{ color: "currentColor" }} />
      {t(classifier && kind === "source" ? "classification" : kind)}
    </span>
  );
}

export function VerdictBadge({ verdict, className, compact = false }: { verdict: Verdict; className?: string; compact?: boolean }) {
  const t = useTranslations("contentLineageAgent.verdicts");
  const Icon = verdict === "consistent" ? CheckCircle2 : verdict === "deviation" ? XCircle : verdict === "simplified" ? TriangleAlert : verdict === "unverified" ? CircleHelp : CircleDashed;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[1px] text-[10.5px] font-semibold", VERDICT_CHIPS[verdict], className)} title={t(`${verdict}Hint`)}>
      <Icon className="h-3 w-3" />
      {compact ? t(`${verdict}Short`) : t(verdict)}
    </span>
  );
}

/** A business term: its business name, the technical column on hover (or below). */
export function TermChip({ model, column, onClick, active, showColumn = false, className }: {
  model: Model;
  column: string;
  onClick?: (column: string) => void;
  active?: boolean;
  showColumn?: boolean;
  className?: string;
}) {
  const term = model.termBy.get(column);
  const kind = term?.kind ?? "source";
  const classes = cn(
    "inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-[1px] text-[11.5px]",
    active ? "border-[#f5c400]/50 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#2c3440] bg-[#141a23] text-[#e5e9f0]",
    onClick && "transition-colors hover:border-[#f5c400]/50 hover:text-[#f5c400]",
    className,
  );
  const body = (
    <>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND_COLORS[kind] }} />
      <span className="truncate">{model.termName(column)}</span>
      {showColumn && <span className="truncate font-mono text-[10px] text-[#687386]">{column}</span>}
    </>
  );
  if (!onClick) return <span className={classes} title={column}>{body}</span>;
  return (
    <button type="button" className={classes} title={column} onClick={() => onClick(column)}>
      {body}
    </button>
  );
}

export function ProvisionChip({ reference, regulation, onClick, className }: { reference: string; regulation?: string; onClick?: () => void; className?: string }) {
  const classes = cn(
    "inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-orange-400/30 bg-orange-400/[0.07] px-1.5 py-[1px] font-mono text-[10.5px] text-orange-200",
    onClick && "transition-colors hover:border-orange-300/70 hover:bg-orange-400/15",
    className,
  );
  const body = (
    <>
      <FileText className="h-3 w-3" />
      {regulation ? `${regulation} ` : ""}
      {reference}
    </>
  );
  if (!onClick) return <span className={classes}>{body}</span>;
  return (
    <button type="button" className={classes} onClick={onClick}>
      {body}
    </button>
  );
}

/** Amounts and shares in the tab's locale. */
export function useNumbers() {
  const locale = useLocale();
  const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return {
    amount: (value: number | null | undefined) => (value === null || value === undefined ? "–" : amount.format(value)),
    compact: (value: number | null | undefined) => (value === null || value === undefined ? "–" : Math.abs(value) >= 10000 ? compact.format(value) : amount.format(value)),
    share: (part: number, total: number) => (total ? `${percent.format((100 * part) / total)} %` : "–"),
    /** A parameter of a table; factors (tables whose values all lie between 0 and 12.5) read as percentages. */
    parameter: (value: unknown, asPercent = false) => {
      if (typeof value === "number") return asPercent ? `${percent.format(value * 100)} %` : amount.format(value);
      if (value === null || value === undefined) return "∅";
      return String(value);
    },
  };
}

/** A horizontal bar of shares (each part with its own colour). */
export function ShareBar({ parts, className, height = 6 }: { parts: { value: number; color: string; label?: string }[]; className?: string; height?: number }) {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  return (
    <div className={cn("flex w-full overflow-hidden rounded-full bg-[#1a212c]", className)} style={{ height }}>
      {total > 0 && parts.map((part, index) => (
        part.value > 0 ? <span key={index} title={part.label} style={{ width: `${(100 * part.value) / total}%`, background: part.color }} className="h-full" /> : null
      ))}
    </div>
  );
}

export function Stat({ label, value, detail, tone = "default", icon }: { label: string; value: ReactNode; detail?: ReactNode; tone?: "default" | "good" | "warn" | "bad" | "gold"; icon?: ReactNode }) {
  const tones = { default: "text-white", good: "text-emerald-300", warn: "text-amber-300", bad: "text-rose-300", gold: "text-[#f5c400]" };
  return (
    <div className="rounded-lg border border-[#252a33] bg-[#0b0f15] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#687386]">{label}</p>
        {icon}
      </div>
      <p className={cn("mt-1.5 text-[22px] font-semibold leading-none tabular-nums tracking-tight", tones[tone])}>{value}</p>
      {detail && <p className="mt-1.5 text-[11.5px] leading-snug text-[#8c96a8]">{detail}</p>}
    </div>
  );
}

/** A case of a rule: its business label, the parameter of a lookup key. */
export function CaseText({ model, caseId, keyValue, className }: { model: Model; caseId: string; keyValue?: string | null; className?: string }) {
  const numbers = useNumbers();
  const parameter = model.parameter(caseId, keyValue ?? null);
  return (
    <span className={cn("text-[#dbe2ec]", className)}>
      {model.caseLabel(caseId)}
      {keyValue && (
        <span className="ml-1 rounded bg-[#1a212c] px-1 font-mono text-[10.5px] text-[#c9d1dd]">
          {keyValue}
          {parameter !== undefined && <span className="text-[#f5c400]"> → {numbers.parameter(parameter, model.percentTable(caseId))}</span>}
        </span>
      )}
    </span>
  );
}
