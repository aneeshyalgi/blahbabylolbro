import { CheckCircle2, CircleX, Contrast, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "./review";
import type { Status } from "./types";

/** The look of the app's analysis tabs (see components/lineage-agent/atoms.tsx). */
export const PANEL = "rounded-xl border border-[#252a33] bg-[#0b0f15]";
export const EYEBROW = "text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#687386]";

export const STATUS: Record<Status, { label: string; icon: LucideIcon; text: string; chip: string; bar: string }> = {
  explained: { label: STATUS_LABEL.explained, icon: CheckCircle2, text: "text-emerald-400", chip: "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300", bar: "#34d399" },
  partial: { label: STATUS_LABEL.partial, icon: Contrast, text: "text-amber-400", chip: "border-amber-400/30 bg-amber-400/[0.08] text-amber-300", bar: "#fbbf24" },
  unexplained: { label: STATUS_LABEL.unexplained, icon: CircleX, text: "text-rose-400", chip: "border-rose-400/30 bg-rose-400/[0.08] text-rose-300", bar: "#fb7185" },
  unchanged: { label: STATUS_LABEL.unchanged, icon: Minus, text: "text-[#8c96a8]", chip: "border-[#2c3440] bg-[#121821] text-[#8c96a8]", bar: "#3f4957" },
};

export function StatusChip({ status, count }: { status: Status; count?: number }) {
  const meta = STATUS[status];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[11.5px] font-semibold", meta.chip)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {count !== undefined ? `${count} ${meta.label.toLowerCase()}` : meta.label}
    </span>
  );
}

export function NoteChip({ label }: { label: string }) {
  return <span className="inline-flex whitespace-nowrap rounded border border-[#f5c400]/30 bg-[#f5c400]/[0.07] px-1.5 py-[1px] font-mono text-[11.5px] text-[#f5c400]">{label}</span>;
}
