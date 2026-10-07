"use client";

import { Fragment, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, CircleDashed, Info, MinusCircle, OctagonAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CheckStatus, Operation, Role, Severity, Transformation } from "./types";

export const PANEL = "rounded-lg border border-[#252a33] bg-[#0b0f15]";
export const SUBTLE = "rounded-md border border-[#1f252e] bg-[#0f141b]";
export const EYEBROW = "text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#687386]";

export const ROLE_STYLES: Record<Role, { chip: string; bar: string; dot: string }> = {
  passthrough: { chip: "border-slate-400/25 bg-slate-400/[0.07] text-slate-300", bar: "#64748b", dot: "bg-slate-400" },
  cast: { chip: "border-cyan-400/30 bg-cyan-400/[0.08] text-cyan-300", bar: "#22d3ee", dot: "bg-cyan-400" },
  enriched: { chip: "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300", bar: "#34d399", dot: "bg-emerald-400" },
  overwritten: { chip: "border-amber-400/30 bg-amber-400/[0.08] text-amber-300", bar: "#fbbf24", dot: "bg-amber-400" },
  created: { chip: "border-violet-400/30 bg-violet-400/[0.09] text-violet-300", bar: "#a78bfa", dot: "bg-violet-400" },
  renamed: { chip: "border-sky-400/30 bg-sky-400/[0.08] text-sky-300", bar: "#38bdf8", dot: "bg-sky-400" },
  dropped: { chip: "border-rose-400/30 bg-rose-400/[0.08] text-rose-300", bar: "#fb7185", dot: "bg-rose-400" },
  intermediate: { chip: "border-zinc-400/25 bg-zinc-400/[0.07] text-zinc-300", bar: "#a1a1aa", dot: "bg-zinc-400" },
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const t = useTranslations("lineageAgent.roles");
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-[1px] text-[10.5px] font-semibold uppercase tracking-wide", ROLE_STYLES[role].chip, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", ROLE_STYLES[role].dot)} />
      {t(role)}
    </span>
  );
}

export function OperationChip({ operation, className }: { operation: Operation | string; className?: string }) {
  const t = useTranslations("lineageAgent.operations");
  const label = t.has(operation) ? t(operation) : operation;
  return <span className={cn("inline-flex whitespace-nowrap rounded border border-[#2a313c] bg-[#121821] px-1.5 py-[1px] text-[10.5px] text-[#c2cad5]", className)}>{label}</span>;
}

export function TransformationBadge({ transformation, compact = false }: { transformation: Transformation; compact?: boolean }) {
  const t = useTranslations("lineageAgent.subtypes");
  const direct = transformation.type === "DIRECT";
  const label = t.has(transformation.subtype) ? t(transformation.subtype) : transformation.subtype;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide",
        direct ? "border-sky-400/30 bg-sky-400/[0.08] text-sky-300" : "border-dashed border-amber-400/40 bg-amber-400/[0.06] text-amber-300",
      )}
      title={`${transformation.type} / ${transformation.subtype}`}
    >
      {!compact && <span className="opacity-70">{direct ? "D" : "I"}</span>}
      {label}
    </span>
  );
}

export function LineChip({ line, end, onClick, className }: { line: number; end?: number | null; onClick?: (line: number) => void; className?: string }) {
  const label = end && end !== line ? `L${line}–${end}` : `L${line}`;
  const classes = cn(
    "inline-flex items-center rounded border border-[#f5c400]/25 bg-[#f5c400]/[0.06] px-1.5 py-[1px] font-mono text-[10.5px] text-[#f5c400]",
    onClick && "transition-colors hover:border-[#f5c400]/60 hover:bg-[#f5c400]/15",
    className,
  );
  if (!onClick) return <span className={classes}>{label}</span>;
  return (
    <button type="button" className={classes} onClick={() => onClick(line)}>
      {label}
    </button>
  );
}

export function ColumnChip({ name, onClick, active, muted, className }: { name: string; onClick?: (name: string) => void; active?: boolean; muted?: boolean; className?: string }) {
  const classes = cn(
    "inline-flex max-w-full items-center truncate rounded-md border px-1.5 py-[1px] font-mono text-[11px]",
    active ? "border-[#f5c400]/50 bg-[#f5c400]/10 text-[#f5c400]" : muted ? "border-[#252a33] bg-transparent text-[#8c96a8]" : "border-[#2c3440] bg-[#141a23] text-[#dbe2ec]",
    onClick && "transition-colors hover:border-[#f5c400]/50 hover:text-[#f5c400]",
    className,
  );
  if (!onClick) return <span className={classes} title={name}>{name}</span>;
  return (
    <button type="button" className={classes} title={name} onClick={() => onClick(name)}>
      {name}
    </button>
  );
}

/** A formula or expression: ⟦column⟧ (from the static analysis) and [column] (from the AI) become column chips. */
export function Formula({ text, columns, onColumn, values, className }: {
  text: string;
  columns?: Set<string>;
  onColumn?: (column: string) => void;
  values?: Record<string, unknown>;
  className?: string;
}) {
  const parts: ReactNode[] = [];
  const pattern = /⟦([^⟧]+)⟧|\[([^[\]]+)\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    const name = match[1] ?? match[2];
    const fromAnalysis = match[1] !== undefined;
    if (!fromAnalysis && columns && !columns.has(name)) continue;
    if (match.index > cursor) parts.push(<Fragment key={`t${index}`}>{text.slice(cursor, match.index)}</Fragment>);
    const value = values && name in values ? values[name] : undefined;
    parts.push(
      <span key={`c${index}`} className="mx-[1px] inline-flex flex-col items-center align-middle leading-none">
        <ColumnChip name={name} onClick={onColumn} className="text-[11px]" />
        {values && (
          <span className="mt-0.5 font-mono text-[10px] text-[#f5c400]">
            <ValueText value={value} />
          </span>
        )}
      </span>,
    );
    cursor = match.index + match[0].length;
    index += 1;
  }
  if (cursor < text.length) parts.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);
  return <span className={cn("font-mono text-[12px] leading-[1.9] text-[#dbe2ec]", className)}>{parts}</span>;
}

/** AI prose: column names written as [Name] become inline chips (other brackets stay as they are). */
export function RichText({ text, columns, onColumn }: { text: string; columns: Set<string>; onColumn?: (column: string) => void }) {
  const parts: ReactNode[] = [];
  const pattern = /\[([^[\]]+)\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    const name = match[1].trim();
    if (!columns.has(name)) continue;
    if (match.index > cursor) parts.push(<Fragment key={`t${index}`}>{text.slice(cursor, match.index)}</Fragment>);
    parts.push(<ColumnChip key={`c${index}`} name={name} onClick={onColumn} className="mx-[1px] align-baseline text-[0.92em]" />);
    cursor = match.index + match[0].length;
    index += 1;
  }
  if (cursor < text.length) parts.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);
  return <>{parts}</>;
}

/** AI prose for plain contexts: [Name] brackets around known column names are dropped. */
export function plainText(text: string, columns: Set<string>): string {
  return text.replace(/\[([^[\]]+)\]/g, (whole, name: string) => (columns.has(name.trim()) ? name.trim() : whole));
}

export function useValueFormatter() {
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
  return (value: unknown): string => {
    if (value === null || value === undefined) return "∅";
    if (typeof value === "number") return number.format(value);
    if (typeof value === "boolean") return value ? "True" : "False";
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  };
}

export function ValueText({ value, className }: { value: unknown; className?: string }) {
  const format = useValueFormatter();
  if (value === null || value === undefined) return <span className={cn("italic text-[#5d6878]", className)}>∅</span>;
  if (typeof value === "string") return <span className={cn("text-[#e6d3a3]", className)}>“{value}”</span>;
  return <span className={cn("tabular-nums", className)}>{format(value)}</span>;
}

export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  if (severity === "critical") return <OctagonAlert className={cn("h-4 w-4 text-rose-400", className)} />;
  if (severity === "warning") return <AlertTriangle className={cn("h-4 w-4 text-amber-400", className)} />;
  return <Info className={cn("h-4 w-4 text-sky-400", className)} />;
}

export const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "border-rose-400/30 bg-rose-400/[0.06]",
  warning: "border-amber-400/25 bg-amber-400/[0.05]",
  info: "border-sky-400/20 bg-sky-400/[0.04]",
};

export function CheckIcon({ status, className }: { status: CheckStatus; className?: string }) {
  if (status === "pass") return <CheckCircle2 className={cn("h-4 w-4 text-emerald-400", className)} />;
  if (status === "warn") return <AlertTriangle className={cn("h-4 w-4 text-amber-400", className)} />;
  if (status === "fail") return <XCircle className={cn("h-4 w-4 text-rose-400", className)} />;
  return <MinusCircle className={cn("h-4 w-4 text-[#5d6878]", className)} />;
}

export type Verification = "verified" | "partial" | "discrepancy" | "unprobed" | "passthrough";

export function VerificationBadge({ status, className }: { status: Verification; className?: string }) {
  const t = useTranslations("lineageAgent.verification");
  const styles: Record<Verification, string> = {
    verified: "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300",
    partial: "border-amber-400/30 bg-amber-400/[0.07] text-amber-300",
    discrepancy: "border-rose-400/30 bg-rose-400/[0.08] text-rose-300",
    unprobed: "border-[#2c3440] bg-[#121821] text-[#8c96a8]",
    passthrough: "border-slate-400/25 bg-slate-400/[0.07] text-slate-300",
  };
  const Icon = status === "verified" ? CheckCircle2 : status === "discrepancy" ? XCircle : status === "partial" ? AlertTriangle : CircleDashed;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[1px] text-[10.5px] font-semibold", styles[status], className)}>
      <Icon className="h-3 w-3" />
      {t(status)}
    </span>
  );
}

// ------------------------------------------------------------------------------------------------
// Python highlighting
// ------------------------------------------------------------------------------------------------

const KEYWORDS = new Set([
  "def", "return", "if", "elif", "else", "for", "while", "in", "not", "and", "or", "is", "None", "True", "False", "import",
  "from", "as", "with", "try", "except", "finally", "lambda", "pass", "break", "continue", "global", "del", "class", "yield",
  "raise", "assert", "nonlocal",
]);
const TOKEN = /(#.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b([A-Za-z_]\w*)\b/g;

/** One line of Python with token colours; string literals that name a known column are marked. */
export function PythonLine({ code, columns, focus }: { code: string; columns?: Set<string>; focus?: Set<string> }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(code))) {
    if (match.index > cursor) parts.push(<Fragment key={`p${index}`}>{code.slice(cursor, match.index)}</Fragment>);
    const [token, comment, string, number, word] = match;
    let className = "";
    if (comment) className = "italic text-[#6b7686]";
    else if (string) {
      const inner = string.slice(1, -1);
      if (columns?.has(inner)) {
        className = focus?.has(inner)
          ? "rounded-[3px] bg-[#f5c400]/20 text-[#ffe27a] ring-1 ring-[#f5c400]/40"
          : "text-[#f0c674] underline decoration-[#f0c674]/30 underline-offset-2";
      } else className = "text-[#b5d58a]";
    } else if (number) className = "text-[#f2a65a]";
    else if (word) {
      if (KEYWORDS.has(word)) className = "text-[#c792ea]";
      else if (word === "df") className = "text-[#7fdbca]";
      else if (word === "pd" || word === "np") className = "text-[#82aaff]";
      else if (code.slice(match.index + word.length).trimStart().startsWith("(")) className = "text-[#82aaff]";
      else className = "text-[#d6deeb]";
    }
    parts.push(
      <span key={`t${index}`} className={className}>
        {token}
      </span>,
    );
    cursor = match.index + token.length;
    index += 1;
  }
  if (cursor < code.length) parts.push(<Fragment key="tail">{code.slice(cursor)}</Fragment>);
  return <>{parts}</>;
}

/** A read-only block of numbered code lines. */
export function CodeBlock({ lines, start, columns, focus, highlight, className }: {
  lines: string[];
  start: number;
  columns?: Set<string>;
  focus?: Set<string>;
  highlight?: Set<number>;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-md border border-[#1f252e] bg-[#080b10] py-1.5 font-mono text-[12px] leading-[1.7]", className)}>
      {lines.map((line, index) => {
        const number = start + index;
        return (
          <div key={number} className={cn("flex min-w-max pr-4", highlight?.has(number) && "bg-[#f5c400]/[0.07] shadow-[inset_2px_0_0_#f5c400]")}>
            <span className="w-11 shrink-0 select-none pr-3 text-right text-[#3f4957]">{number}</span>
            <span className="whitespace-pre text-[#d6deeb]">
              <PythonLine code={line} columns={columns} focus={focus} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Kpi({ label, value, detail, tone = "default", icon }: { label: string; value: ReactNode; detail?: ReactNode; tone?: "default" | "good" | "warn" | "bad"; icon?: ReactNode }) {
  const tones = {
    default: "text-white",
    good: "text-emerald-300",
    warn: "text-amber-300",
    bad: "text-rose-300",
  };
  return (
    <div className="relative overflow-hidden rounded-lg border border-[#252a33] bg-[#0b0f15] px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className={EYEBROW}>{label}</p>
        {icon}
      </div>
      <p className={cn("mt-1.5 text-[26px] font-semibold leading-none tabular-nums tracking-tight", tones[tone])}>{value}</p>
      {detail && <p className="mt-1.5 text-[11.5px] leading-snug text-[#8c96a8]">{detail}</p>}
    </div>
  );
}

export function SectionTitle({ icon, title, hint, actions }: { icon?: ReactNode; title: ReactNode; hint?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-white">
          {icon}
          {title}
        </h3>
        {hint && <p className="mt-0.5 text-[12px] leading-relaxed text-[#8c96a8]">{hint}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function formatDuration(ms: number | null | undefined, locale: string): string {
  if (ms === null || ms === undefined) return "–";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`;
}

export function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return "–";
  try {
    return new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}
