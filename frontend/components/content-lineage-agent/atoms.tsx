"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Model } from "./model";
import type { Reach, TermRole, Use } from "./types";

export { PANEL, EYEBROW, CheckIcon, SeverityIcon, SEVERITY_STYLES, formatDateTime, formatDuration } from "@/components/lineage-agent/atoms";

/** start: the selected field; next: its rule reads it; downstream: further down; context: another input of a rule. */
export const ROLE_COLORS: Record<TermRole, string> = {
  start: "#f5c400",
  next: "#34d399",
  downstream: "#38bdf8",
  context: "#64748b",
};

/** How a record's value depends on the selected field (and the records it does not reach). */
export const REACH_COLORS: Record<Reach | "none" | "missing", string> = {
  value: "#34d399",
  decides: "#fbbf24",
  tested: "#f472b6",
  none: "#2a3340",
  missing: "#fb7185",
};

/** Case colours: one per case of a rule. */
export const CASE_COLORS = ["#34d399", "#a78bfa", "#f472b6", "#fbbf24", "#22d3ee", "#fb923c", "#a3e635", "#e879f9"];

/** A field only re-running the calculation links to the selected field (the code does not show how). */
export function ImpactBadge({ className }: { className?: string }) {
  const t = useTranslations("contentLineageAgent.roles");
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-pink-400/35 bg-pink-400/[0.07] px-2 py-[1px] text-[10.5px] font-semibold text-pink-200", className)} title={t("impactHint")}>
      <FlaskConical className="h-3 w-3" />
      {t("impact")}
    </span>
  );
}

/** How a case uses a field: value, table key, condition, grouping, join key. */
export function UseChip({ use, className }: { use: Use; className?: string }) {
  const t = useTranslations("contentLineageAgent.uses");
  const tone = use === "value" ? "border-emerald-400/30 text-emerald-200" : use === "key" ? "border-[#f5c400]/35 text-[#f5c400]" : use === "impact" ? "border-pink-400/35 text-pink-200" : "border-amber-400/30 text-amber-200";
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded border px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide", tone, className)} title={t(`${use}Hint`)}>{t(use)}</span>;
}

/** A business term: its business name, the technical column on hover. */
export function TermChip({ model, column, onClick, className }: { model: Model; column: string; onClick?: (column: string) => void; className?: string }) {
  const classes = cn(
    "inline-flex max-w-full items-center gap-1.5 rounded-md border border-[#2c3440] bg-[#141a23] px-1.5 py-[1px] text-[11.5px] text-[#e5e9f0]",
    onClick && "transition-colors hover:border-[#f5c400]/50 hover:text-[#f5c400]",
    className,
  );
  const body = (
    <>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ROLE_COLORS[model.role(column)] }} />
      <span className="truncate">{model.termName(column)}</span>
    </>
  );
  if (!onClick) return <span className={classes} title={column}>{body}</span>;
  return (
    <button type="button" className={classes} title={column} onClick={() => onClick(column)}>
      {body}
    </button>
  );
}

/** Amounts, shares and values in the tab's locale. */
export function useNumbers() {
  const locale = useLocale();
  const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return {
    amount: (value: number | null | undefined) => (value === null || value === undefined ? "–" : amount.format(value)),
    share: (part: number, total: number) => (total ? `${percent.format((100 * part) / total)} %` : "–"),
    /** A value of a field: numbers in the locale (factors in percent), text as it is, a missing value as ∅. */
    value: (value: unknown, asPercent = false) => {
      if (value === null || value === undefined || value === "") return "∅";
      if (typeof value === "number") return asPercent ? `${percent.format(value * 100)} %` : amount.format(value);
      if (typeof value === "boolean") return value ? "true" : "false";
      return String(value);
    },
  };
}

/** A horizontal bar of shares (each part with its own colour). */
function ShareBar({ parts, className, height = 6 }: { parts: { value: number; color: string; label?: string }[]; className?: string; height?: number }) {
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

/** Records reached by the selected field (by value, by deciding the case, shown by re-running) and the rest. */
export function ReachBar({ records, height = 6, className }: { records: { value: number; decides: number; tested: number; total: number; reached: number }; height?: number; className?: string }) {
  const t = useTranslations("contentLineageAgent.reach");
  return (
    <ShareBar
      className={className}
      height={height}
      parts={[
        { value: records.value, color: REACH_COLORS.value, label: t("valueCount", { count: records.value }) },
        { value: records.decides, color: REACH_COLORS.decides, label: t("decidesCount", { count: records.decides }) },
        { value: records.tested, color: REACH_COLORS.tested, label: t("testedCount", { count: records.tested }) },
        { value: records.total - records.reached, color: REACH_COLORS.none, label: t("noneCount", { count: records.total - records.reached }) },
      ]}
    />
  );
}
