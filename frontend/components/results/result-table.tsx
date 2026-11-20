"use client";

import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The result of a run as the Results and Clusters tabs (and the Code tab's test run) show it: the table after the code
 * ran, with the cells the code filled highlighted, plus the figures above it.
 */

export type ResultRow = Record<string, unknown>;
export type ComputedCell = { row: number; column: string; value?: unknown };

export function computedKey(row: number, column: string): string {
  return `${row}\u0000${column}`;
}

export function computedSet(cells: ComputedCell[] | [number, string][] | undefined | null): Set<string> {
  const keys = new Set<string>();
  for (const cell of cells ?? []) {
    if (Array.isArray(cell)) keys.add(computedKey(cell[0], cell[1]));
    else keys.add(computedKey(cell.row, cell.column));
  }
  return keys;
}

const MIDNIGHT = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.0+)?$/;

/** A cell as text: numbers in the page's language, dates without a midnight time, empty as null. */
export function formatResultValue(value: unknown, locale: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString(locale, { maximumFractionDigits: 6 }) : null;
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = String(value);
  if (!text.trim()) return null;
  const date = MIDNIGHT.exec(text);
  return date ? date[1] : text;
}

export function ResultTable({
  columns,
  rows,
  computed,
  locale,
  maxHeight = "60vh",
  className,
  footer,
}: {
  columns: string[];
  rows: ResultRow[];
  computed: Set<string>;
  locale: string;
  maxHeight?: string;
  className?: string;
  footer?: ReactNode;
}) {
  const filledByColumn = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const key of computed) {
      const column = key.slice(key.indexOf("\u0000") + 1);
      counts[column] = (counts[column] ?? 0) + 1;
    }
    return counts;
  }, [computed]);

  return (
    <div className={cn("overflow-auto rounded-lg border border-[#1f252e] bg-[#0b0f15]", className)} style={{ maxHeight }}>
      <table className="w-max min-w-full border-separate border-spacing-0 text-[12.5px]">
        <thead className="sticky top-0 z-10">
          <tr>
            <th scope="col" className="sticky left-0 z-20 w-10 border-b border-r border-[#1f252e] bg-[#0f141b] px-2.5 py-2 text-right font-mono text-[10.5px] font-medium text-[#5d6878]">
              #
            </th>
            {columns.map((column) => (
              <th key={column} scope="col" className="whitespace-nowrap border-b border-[#1f252e] bg-[#0f141b] px-3 py-2 text-left text-[11.5px] font-semibold text-[#c9d1dc]">
                <span className="inline-flex items-center gap-1.5">
                  {column}
                  {filledByColumn[column] ? (
                    <span className="rounded border border-emerald-400/25 bg-emerald-400/[0.08] px-1 font-mono text-[10px] font-medium leading-4 text-emerald-300">
                      +{filledByColumn[column]}
                    </span>
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="group">
              <td className="sticky left-0 z-[1] border-b border-r border-[#161b22] bg-[#0b0f15] px-2.5 py-1.5 text-right font-mono text-[11px] text-[#5d6878] transition-colors group-hover:bg-[#10151c]">
                {rowIndex + 1}
              </td>
              {columns.map((column) => {
                const value = row[column];
                const text = formatResultValue(value, locale);
                const filled = computed.has(computedKey(rowIndex, column));
                return (
                  <td
                    key={column}
                    data-computed={filled ? "true" : undefined}
                    className={cn(
                      "whitespace-nowrap border-b border-[#161b22] px-3 py-1.5 transition-colors",
                      typeof value === "number" && "text-right font-mono tabular-nums",
                      filled ? "bg-emerald-400/[0.09] font-medium text-emerald-200 group-hover:bg-emerald-400/[0.13]" : "text-[#dbe2ec] group-hover:bg-white/[0.025]",
                    )}
                  >
                    {text === null ? <span className="text-[#3d4655]">–</span> : text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {footer}
    </div>
  );
}

/** "Computed values" and "empty cell", under a result table. */
export function ResultLegend({ computedLabel, emptyLabel, children }: { computedLabel: string; emptyLabel: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-[#8c96a8]">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[3px] border border-emerald-400/40 bg-emerald-400/[0.15]" />
        {computedLabel}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-3 text-center text-[#3d4655]">–</span>
        {emptyLabel}
      </span>
      {children}
    </div>
  );
}

export function StatTile({ label, value, tone = "default", hint }: { label: string; value: ReactNode; tone?: "default" | "green"; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#1f252e] bg-[#0f141b] px-3.5 py-2.5" title={hint}>
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{label}</p>
      <p className={cn("mt-0.5 font-mono text-[18px] font-semibold tabular-nums", tone === "green" ? "text-emerald-300" : "text-white")}>{value}</p>
    </div>
  );
}
