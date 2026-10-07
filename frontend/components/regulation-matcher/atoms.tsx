"use client";

import { Fragment, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, CircleDashed, Info, PenLine, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CheckStatus, LinkType, NoteStatus } from "./types";

export const PANEL = "rounded-lg border border-[#252a33] bg-[#0b0f15]";
export const SUBTLE_PANEL = "rounded-md border border-[#1f252e] bg-[#0f141b]";

/** Text with exact source passages marked; tolerant of whitespace differences between quote and text. */
export function Highlighted({ text, highlights, className, markClassName }: { text: string; highlights: string[]; className?: string; markClassName?: string }) {
  const ranges: [number, number][] = [];
  for (const raw of highlights) {
    const needle = raw.trim();
    if (needle.length < 4) continue;
    let at = text.indexOf(needle);
    let length = needle.length;
    if (at < 0) {
      const pattern = new RegExp(needle.split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"));
      const match = pattern.exec(text);
      if (match) {
        at = match.index;
        length = match[0].length;
      }
    }
    if (at >= 0) ranges.push([at, at + length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  const parts: ReactNode[] = [];
  let cursor = 0;
  merged.forEach(([start, end], index) => {
    if (start > cursor) parts.push(<Fragment key={`t${index}`}>{text.slice(cursor, start)}</Fragment>);
    parts.push(
      <mark key={`m${index}`} className={cn("rounded-[3px] bg-[#f5c400]/20 px-0.5 text-[#fde68a] ring-1 ring-[#f5c400]/30", markClassName)}>
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);
  return <span className={className}>{parts}</span>;
}

const LINK_STYLES: Record<LinkType, string> = {
  direct: "border-emerald-400/35 bg-emerald-400/10 text-emerald-300",
  indirect: "border-sky-400/35 bg-sky-400/10 text-sky-300",
};

export function LinkTypeBadge({ type, className }: { type: LinkType; className?: string }) {
  const t = useTranslations("matcher.linkType");
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", LINK_STYLES[type], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", type === "direct" ? "bg-emerald-300" : "border border-sky-300")} />
      {t(type)}
    </span>
  );
}

const STATUS_STYLES: Record<NoteStatus, { dot: string; chip: string }> = {
  linked: { dot: "bg-emerald-400", chip: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  review: { dot: "bg-amber-400", chip: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  no_link: { dot: "bg-slate-400", chip: "border-slate-400/30 bg-slate-400/10 text-slate-300" },
  failed: { dot: "bg-rose-400", chip: "border-rose-400/30 bg-rose-400/10 text-rose-300" },
};

export function StatusDot({ status, className }: { status: NoteStatus | null; className?: string }) {
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", status ? STATUS_STYLES[status].dot : "bg-[#3a4350]", className)} />;
}

export function StatusBadge({ status }: { status: NoteStatus | null }) {
  const t = useTranslations("matcher.status");
  if (!status) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", STATUS_STYLES[status].chip)}>
      <StatusDot status={status} />
      {t(status)}
    </span>
  );
}

export function confidenceColor(value: number) {
  if (value >= 80) return "#34d399";
  if (value >= 60) return "#fbbf24";
  return "#fb7185";
}

/** Circular gauge for a 0–100 value. */
export function ConfidenceDial({ value, size = 44, label }: { value: number; size?: number; label?: string }) {
  const stroke = Math.max(3, Math.round(size / 11));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = confidenceColor(value);
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1f2630" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, value)) / 100)}
          style={{ transition: "stroke-dashoffset 700ms ease" }}
        />
      </svg>
      <span className="absolute font-mono text-[11px] font-semibold tabular-nums" style={{ color, fontSize: size < 40 ? 10 : undefined }}>
        {value}
      </span>
    </div>
  );
}

export function CheckIcon({ status, className }: { status: CheckStatus; className?: string }) {
  const base = cn("h-4 w-4 shrink-0", className);
  switch (status) {
    case "pass":
      return <CheckCircle2 className={cn(base, "text-emerald-400")} />;
    case "corrected":
      return <PenLine className={cn(base, "text-amber-300")} />;
    case "fail":
      return <XCircle className={cn(base, "text-rose-400")} />;
    case "warn":
      return <AlertTriangle className={cn(base, "text-amber-400")} />;
    case "info":
      return <Info className={cn(base, "text-sky-400")} />;
    default:
      return <CircleDashed className={cn(base, "text-[#687386]")} />;
  }
}

export function RegulationChip({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded border border-[#f5c400]/30 bg-[#f5c400]/10 px-1.5 py-px font-mono text-[10px] font-semibold uppercase tracking-wider text-[#f5c400]", className)}>
      {name}
    </span>
  );
}

export function SectionLabel({ children, className, icon }: { children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <p className={cn("flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8c96a8]", className)}>
      {icon}
      {children}
    </p>
  );
}

export function formatDuration(ms: number | null | undefined) {
  if (ms == null) return "–";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} s`;
}

export function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) return "–";
  try {
    return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : "en-GB").format(value);
}

/** 'TITLE II — CAPITAL REQUIREMENTS FOR CREDIT RISK' -> 'Title II · Capital requirements for credit risk'. */
export function shortHeading(heading: string) {
  const [head, rest] = heading.split(/\s+[—–-]\s+/, 2);
  const shouting = (text: string) => /[A-Z]/.test(text) && text === text.toUpperCase();
  // 'PART THREE' -> 'Part Three', roman numerals stay upper case ('TITLE II' -> 'Title II').
  const label = (text: string) =>
    shouting(text) ? text.split(/\s+/).map((word) => (/^[IVXLC]+$/.test(word) ? word : word.charAt(0) + word.slice(1).toLowerCase())).join(" ") : text;
  const sentence = (text: string) => (shouting(text) ? text.charAt(0) + text.slice(1).toLowerCase() : text);
  return rest ? `${label(head)} · ${sentence(rest)}` : label(heading);
}
