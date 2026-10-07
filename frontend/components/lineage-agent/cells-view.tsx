"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, Database, MousePointerClick, Rows3, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ColumnChip, EYEBROW, Formula, LineChip, OperationChip, PANEL, ValueText, useValueFormatter } from "./atoms";
import type { Model } from "./model";
import type { Navigator } from "./types";

type CellKind = "filled" | "changed" | "emptied" | "unchanged";

const CELL_STYLES: Record<CellKind, string> = {
  filled: "bg-emerald-400/[0.10] text-emerald-100",
  changed: "bg-amber-400/[0.10] text-amber-100",
  emptied: "bg-rose-400/[0.10] text-rose-200",
  unchanged: "text-[#aab3c2]",
};

export function CellsView({ model, selected, onSelect, nav }: {
  model: Model;
  selected: { row: string; column: string } | null;
  onSelect: (cell: { row: string; column: string } | null) => void;
  nav: Navigator;
}) {
  const t = useTranslations("lineageAgent.cells");
  const cells = model.result.cells;
  const format = useValueFormatter();
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [compare, setCompare] = useState(false);
  const computed = useMemo(() => new Set(cells.computed), [cells.computed]);
  const changedColumns = useMemo(() => new Set(Object.keys(cells.changes)), [cells.changes]);
  // A readable row key: the first pass-through text column with unique values (e.g. a position id).
  const keyColumn = useMemo(() => {
    for (const column of model.analysis.columns) {
      if (column.role !== "passthrough") continue;
      const values = cells.rows.map((row) => row.values[column.name]);
      if (values.every((value) => typeof value === "string") && new Set(values).size === values.length) return column.name;
    }
    return null;
  }, [model, cells.rows]);
  const columns = cells.columns.filter((column) => !onlyChanged || changedColumns.has(column) || column === keyColumn);

  const kindOf = (row: string, column: string, value: unknown): CellKind => {
    const history = cells.changes[column]?.[row];
    if (!history?.length) return "unchanged";
    if (computed.has(`${row}|${column}`)) return "filled";
    if (value === null || value === undefined) return "emptied";
    const before = history[0].before;
    if (before === null || before === undefined) return "filled";
    return "changed";
  };
  const counts = useMemo(() => {
    const result: Record<CellKind, number> = { filled: 0, changed: 0, emptied: 0, unchanged: 0 };
    for (const row of cells.rows) for (const column of cells.columns) result[kindOf(row.label, column, row.values[column])] += 1;
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <section data-tour="lineage-cells" className={cn(PANEL, "min-w-0 overflow-hidden")}>
        <div className="flex flex-wrap items-center gap-3 border-b border-[#1f252e] px-4 py-2.5">
          <Rows3 className="h-4 w-4 text-[#f5c400]" />
          <span className="text-[12.5px] font-semibold text-white">{t("title")}</span>
          <span className="text-[11px] text-[#687386]">
            {cells.total_rows > cells.rows.length ? t("rowsLimited", { shown: cells.rows.length, total: cells.total_rows }) : t("rows", { count: cells.rows.length })}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-[#9aa4b4]">
            {(["filled", "changed", "emptied"] as const).map((kind) => (
              <span key={kind} className="flex items-center gap-1.5">
                <span className={cn("h-3 w-3 rounded-sm border border-white/10", CELL_STYLES[kind])} />
                {t(`legend.${kind}`)} <span className="tabular-nums text-[#687386]">{counts[kind]}</span>
              </span>
            ))}
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={onlyChanged} onChange={(event) => setOnlyChanged(event.target.checked)} className="accent-[#f5c400]" />
              {t("onlyChanged")}
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} className="accent-[#f5c400]" />
              {t("compare")}
            </label>
          </div>
        </div>
        <div className="max-h-[calc(100vh-240px)] min-h-[420px] overflow-auto">
          <table className="border-separate border-spacing-0 text-[12px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 border-b border-r border-[#1f252e] bg-[#0f141b] px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[#687386]">#</th>
                {columns.map((column) => {
                  const item = model.byName.get(column);
                  return (
                    <th key={column} className="border-b border-[#1f252e] bg-[#0f141b] px-3 py-2 text-left">
                      <button type="button" onClick={() => nav.openColumn(column)} className="group flex flex-col items-start">
                        <span className={cn("whitespace-nowrap font-mono text-[11.5px] font-semibold", changedColumns.has(column) ? "text-[#f5c400]" : "text-[#c2cad5]")}>{column}</span>
                        {item && <span className="text-[9.5px] font-normal uppercase tracking-wide text-[#5d6878] group-hover:text-[#8c96a8]">{item.role}</span>}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {cells.rows.map((row) => (
                <tr key={row.label}>
                  <td className="sticky left-0 z-[5] whitespace-nowrap border-b border-r border-[#151b23] bg-[#0b0f15] px-3 py-1.5 font-mono text-[11px] text-[#687386]">
                    {row.label}
                    {keyColumn && <span className="ml-2 text-[#aab3c2]">{format(row.values[keyColumn])}</span>}
                  </td>
                  {columns.map((column) => {
                    const value = row.values[column];
                    const kind = kindOf(row.label, column, value);
                    const active = selected?.row === row.label && selected.column === column;
                    const input = cells.input[row.label]?.[column];
                    return (
                      <td
                        key={column}
                        onClick={() => onSelect(active ? null : { row: row.label, column })}
                        className={cn(
                          "cursor-pointer whitespace-nowrap border-b border-[#151b23] px-3 py-1.5 font-mono transition-colors",
                          CELL_STYLES[kind],
                          typeof value === "number" && "text-right",
                          active ? "outline outline-2 -outline-offset-2 outline-[#f5c400]" : "hover:bg-white/[0.04]",
                        )}
                      >
                        <ValueText value={value} className={kind === "unchanged" ? "text-[#aab3c2]" : undefined} />
                        {compare && kind !== "unchanged" && cells.input_columns.includes(column) && (
                          <span className="block text-[10px] text-[#687386] line-through decoration-[#687386]/60"><ValueText value={input} className="text-[#687386]" /></span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <aside className={cn(PANEL, "h-fit xl:sticky xl:top-4")}>
        {selected ? (
          <Provenance model={model} row={selected.row} column={selected.column} keyColumn={keyColumn} nav={nav} onClose={() => onSelect(null)} />
        ) : (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <MousePointerClick className="h-8 w-8 text-[#f5c400]/70" />
            <p className="mt-3 text-[13px] font-semibold text-white">{t("pickTitle")}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#8c96a8]">{t("pickBody")}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function Provenance({ model, row, column, keyColumn, nav, onClose }: { model: Model; row: string; column: string; keyColumn: string | null; nav: Navigator; onClose: () => void }) {
  const t = useTranslations("lineageAgent.cells.provenance");
  const tOps = useTranslations("lineageAgent.operations");
  const cells = model.result.cells;
  const history = cells.changes[column]?.[row] ?? [];
  const value = cells.rows.find((item) => item.label === row)?.values[column];
  const inInput = cells.input_columns.includes(column);
  const input = cells.input[row]?.[column];
  const keyValue = keyColumn ? cells.rows.find((item) => item.label === row)?.values[keyColumn] : undefined;
  return (
    <div data-tour="lineage-provenance" className="max-h-[calc(100vh-150px)] space-y-4 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={EYEBROW}>{t("title")}</p>
          <p className="mt-1 break-all font-mono text-[14px] font-semibold text-white">{column}</p>
          <p className="mt-0.5 text-[11.5px] text-[#8c96a8]">{t("row", { row })}{keyValue !== undefined && ` · ${String(keyValue)}`}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#687386] hover:text-white" aria-label={t("close")}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="rounded-lg border border-[#f5c400]/25 bg-[linear-gradient(120deg,rgba(245,196,0,0.08),transparent_70%)] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a8862a]">{t("finalValue")}</p>
        <p className="mt-1 font-mono text-[20px] font-semibold text-white"><ValueText value={value} /></p>
      </div>
      <ol className="space-y-2">
        <li className="flex items-start gap-2.5 rounded-md border border-[#1f252e] bg-[#0d1218] px-3 py-2.5">
          <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
          <div className="min-w-0 text-[12px]">
            <p className="font-semibold text-white">{inInput ? t("inputValue") : t("notInInput")}</p>
            {inInput && <p className="mt-0.5 font-mono"><ValueText value={input} /></p>}
          </div>
        </li>
        {history.map((change, index) => {
          const node = model.writeAt(column, change.line);
          const operation = node?.operation;
          return (
            <li key={index} className="space-y-0">
              <div className="flex justify-center py-0.5"><ArrowDown className="h-3.5 w-3.5 text-[#3f4957]" /></div>
              <div className="rounded-md border border-[#f5c400]/20 bg-[#0d1218] px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <LineChip line={change.line} onClick={nav.openLine} />
                  {operation && <OperationChip operation={tOps.has(operation) ? operation : operation} />}
                  {node?.bindings && Object.entries(node.bindings).map(([name, bound]) => <span key={name} className="font-mono text-[10.5px] text-[#8c96a8]">{name} = {String(bound)}</span>)}
                </div>
                <div className="mt-2 flex items-center gap-2 font-mono text-[12.5px]">
                  <ValueText value={change.before} />
                  <span className="text-[#5d6878]">→</span>
                  <ValueText value={change.after} className="font-semibold" />
                </div>
                {node?.pretty && (
                  <div className="mt-2 rounded border border-[#1a2029] bg-[#080b10] px-2.5 py-2">
                    <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{t("formula")}</p>
                    <Formula text={node.pretty} columns={model.columnNames} values={change.inputs} onColumn={(name) => nav.openColumn(name)} />
                  </div>
                )}
                {(node?.conditions ?? []).length > 0 && (
                  <p className="mt-2 text-[11px] text-amber-200/90">
                    {t("conditionTrue")} <span className="font-mono">{node!.conditions!.map((condition) => condition.expanded ?? condition.code).join(" · ")}</span>
                  </p>
                )}
                {Object.keys(change.inputs).length > 0 && (
                  <div className="mt-2">
                    <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{t("inputs")}</p>
                    <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                      {Object.entries(change.inputs).map(([name, item]) => (
                        <div key={name} className="contents">
                          <ColumnChip name={name} muted onClick={(target) => nav.openColumn(target)} />
                          <span className="font-mono text-[11.5px]"><ValueText value={item} /></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {!history.length && <p className="text-[12px] leading-relaxed text-[#8c96a8]">{inInput ? t("unchanged") : t("neverWritten")}</p>}
    </div>
  );
}
