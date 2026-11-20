"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Search, Upload, X, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The look shared by the Data, Code, Clusters and Results tabs: the same panels, labels and gold accent as the
 * RootCause and AI-agent tabs, plus the small pieces they need (header, search, tags, empty states, file drop, dates).
 */

export const PANEL = "rounded-xl border border-[#252a33] bg-[#0b0f15]";
export const EYEBROW = "text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#687386]";
export const PRIMARY_BUTTON =
  "inline-flex h-9 items-center gap-2 rounded-md bg-[#f5c400] px-4 text-[13px] font-semibold text-[#0b0f15] shadow-[0_0_24px_rgba(245,196,0,0.2)] transition-colors hover:bg-[#ffd633] disabled:cursor-not-allowed disabled:bg-[#3a3a2a] disabled:text-[#8c8a70] disabled:shadow-none";
export const SECONDARY_BUTTON =
  "inline-flex h-9 items-center gap-2 rounded-md border border-[#2a313c] bg-[#0f141b] px-3.5 text-[13px] font-medium text-[#dbe2ec] transition-colors hover:border-[#f5c400]/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50";
export const INPUT =
  "h-9 w-full rounded-md border border-[#252a33] bg-[#0f141b] px-3 text-[13px] text-white outline-none transition-colors placeholder:text-[#5d6878] focus:border-[#f5c400]/50 disabled:opacity-60";

export function PageHeader({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#f5c400]/30 bg-[#f5c400]/10">
          <Icon className="h-5 w-5 text-[#f5c400]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[18px] font-semibold tracking-tight text-white">{title}</h2>
          <p className="mt-0.5 max-w-4xl text-[13px] leading-relaxed text-[#8c96a8]">{description}</p>
        </div>
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

/** An icon button with a tooltip (the label is also its accessible name). */
export function IconAction({ label, onClick, disabled, tone = "default", className, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          disabled={disabled}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-[#8c96a8] transition-colors disabled:pointer-events-none disabled:opacity-35",
            tone === "danger" ? "hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-300" : "hover:border-[#2a313c] hover:bg-white/[0.04] hover:text-white",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}

export function SearchField({ value, onChange, placeholder, clearLabel, className }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  clearLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5d6878]" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-full rounded-md border border-[#252a33] bg-[#0f141b] pl-8 pr-7 text-[12.5px] text-white outline-none transition-colors placeholder:text-[#5d6878] focus:border-[#f5c400]/50 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button type="button" aria-label={clearLabel} onClick={() => onChange("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#687386] hover:text-white">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

const TAG_TONES = {
  neutral: "border-[#2a313c] bg-[#121821] text-[#aab3c2]",
  gold: "border-[#f5c400]/30 bg-[#f5c400]/[0.07] text-[#f5c400]",
  green: "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300",
  amber: "border-amber-400/25 bg-amber-400/[0.07] text-amber-300",
  rose: "border-rose-400/25 bg-rose-400/[0.07] text-rose-300",
  sky: "border-sky-400/25 bg-sky-400/[0.07] text-sky-300",
} as const;

export function Tag({ children, tone = "neutral", mono, title, className }: {
  children: ReactNode;
  tone?: keyof typeof TAG_TONES;
  mono?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <span title={title} className={cn("inline-flex h-[21px] max-w-full items-center gap-1 whitespace-nowrap rounded border px-1.5 text-[11px] font-medium", mono && "font-mono", TAG_TONES[tone], className)}>
      {children}
    </span>
  );
}

/** A labelled value in a small tile (dataset, code file, reporting date of a cluster). */
export function FactTile({ icon: Icon, label, value, mono, warning }: { icon: LucideIcon; label: string; value: string; mono?: boolean; warning?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#1f252e] bg-[#0f141b] px-3 py-2">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#687386]">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </p>
      <p className={cn("mt-0.5 truncate text-[13px] text-white", mono && "font-mono text-[12.5px]", warning && "text-amber-300")} title={value}>
        {value}
      </p>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, children, className }: { icon: LucideIcon; title: string; hint?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#252a33] bg-[#0f141b]">
        <Icon className="h-5 w-5 text-[#687386]" />
      </span>
      <p className="mt-3.5 text-[14px] font-semibold text-white">{title}</p>
      {hint ? <p className="mt-1 max-w-sm text-[12.5px] leading-5 text-[#8c96a8]">{hint}</p> : null}
      {children ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  );
}

/** Files dropped on an area: `active` while files are dragged over it; other drags (text, links) are ignored. */
export function useFileDrop(onFile: (file: File) => void, enabled = true) {
  const depth = useRef(0);
  const [active, setActive] = useState(false);
  const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
  const handlers = {
    onDragEnter: (event: DragEvent<HTMLElement>) => {
      if (!enabled || !carriesFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setActive(true);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!enabled || !carriesFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!enabled || !carriesFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setActive(false);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!enabled || !carriesFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setActive(false);
      const file = event.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
  };
  return { active, handlers };
}

export function DropOverlay({ active, title, hint }: { active: boolean; title: string; hint: string }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-[#f5c400]/60 bg-[#0b0f15]/90 backdrop-blur-[2px]">
      <div className="text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-[#f5c400]/40 bg-[#f5c400]/10">
          <Upload className="h-5 w-5 text-[#f5c400]" />
        </span>
        <p className="mt-3 text-[14px] font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-[12px] text-[#8c96a8]">{hint}</p>
      </div>
    </div>
  );
}

/** A thin indeterminate progress bar (the server reports no progress while it processes an upload). */
export function WorkingBar() {
  return (
    <div className="relative h-1 overflow-hidden rounded-full bg-[#1c232d]">
      <div className="absolute inset-y-0 w-1/3 animate-[workspace-progress_1.2s_ease-in-out_infinite] rounded-full bg-[#f5c400]" />
      <style>{"@keyframes workspace-progress{0%{left:-35%}100%{left:100%}}"}</style>
    </div>
  );
}

export function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

/** "2 hours ago", "yesterday", "in 3 days", in the tab's language. */
export function relativeTime(value: string | null | undefined, locale: string): string {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = (date.getTime() - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, "minute");
}

export function formatBytes(size: number, locale: string): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString(locale, { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`;
}

/** Moves the selection in a list with the arrow keys (Home/End go to the ends); returns whether it handled the key. */
export function moveInList<T>(key: string, items: T[], current: T | undefined, select: (item: T) => void): boolean {
  if (!items.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) return false;
  const index = current === undefined ? -1 : items.indexOf(current);
  const next = key === "Home" ? 0 : key === "End" ? items.length - 1 : key === "ArrowDown" ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
  select(items[next]);
  return true;
}
