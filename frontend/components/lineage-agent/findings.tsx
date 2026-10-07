"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ColumnChip, LineChip, SEVERITY_STYLES, SeverityIcon, useValueFormatter } from "./atoms";
import type { Finding, Navigator } from "./types";

function listOf(value: unknown, format: (value: unknown) => string): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object" && "value" in (item as Record<string, unknown>)) {
          const entry = item as { value: unknown; rows?: number };
          return entry.rows ? `“${format(entry.value)}” (${entry.rows}×)` : `“${format(entry.value)}”`;
        }
        return typeof item === "string" ? `“${item}”` : format(item);
      })
      .join(", ");
  }
  return format(value);
}

/** Localised title and body of a deterministic finding. */
export function useFindingText() {
  const t = useTranslations("lineageAgent.findings");
  const tReasons = useTranslations("lineageAgent.reasons");
  const format = useValueFormatter();
  return (finding: Finding) => {
    const params: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(finding.params ?? {})) {
      params[key] = typeof value === "number" ? value : Array.isArray(value) ? listOf(value, format) : String(value ?? "");
    }
    if (typeof params.reason === "string" && tReasons.has(params.reason)) params.reason = tReasons(params.reason);
    const title = t.has(`${finding.code}.title`) ? t(`${finding.code}.title`) : finding.code;
    const body = t.has(`${finding.code}.body`) ? t(`${finding.code}.body`, params) : JSON.stringify(finding.params);
    return { title, body };
  };
}

export function FindingCard({ finding, nav, compact = false }: { finding: Finding; nav: Navigator; compact?: boolean }) {
  const text = useFindingText()(finding);
  return (
    <div className={cn("rounded-md border px-3.5 py-3", SEVERITY_STYLES[finding.severity])}>
      <div className="flex items-start gap-2.5">
        <SeverityIcon severity={finding.severity} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10.5px] text-[#687386]">{finding.id}</span>
            <p className="text-[12.5px] font-semibold text-white">{text.title}</p>
          </div>
          <p className={cn("mt-1 text-[12px] leading-relaxed text-[#c2cad5]", compact && "line-clamp-2")}>{text.body}</p>
          {(finding.columns.length > 0 || finding.lines.length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {finding.lines.map((line) => <LineChip key={line} line={line} onClick={nav.openLine} />)}
              {finding.columns.slice(0, 8).map((column) => <ColumnChip key={column} name={column} onClick={(name) => nav.openColumn(name)} />)}
              {finding.columns.length > 8 && <span className="text-[11px] text-[#687386]">+{finding.columns.length - 8}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
