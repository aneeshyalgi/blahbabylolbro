"use client";

import { Fragment, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, CircleDashed, FileSpreadsheet, Search, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ColumnChip, LineChip, OperationChip, PANEL, RoleBadge, TransformationBadge, plainText } from "./atoms";
import { mappingRows, type MappingRow, type Model } from "./model";
import type { Navigator } from "./types";

type TypeFilter = "all" | "DIRECT" | "INDIRECT";

export function MappingView({ model, nav, onExport }: { model: Model; nav: Navigator; onExport: () => void }) {
  const t = useTranslations("lineageAgent.mapping");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [hidePassthrough, setHidePassthrough] = useState(true);
  const rows = useMemo(() => mappingRows(model), [model]);
  const docs = model.result.ai.columns;
  const filtered = rows.filter((row) => {
    const column = model.byName.get(row.output);
    if (hidePassthrough && column?.role === "passthrough") return false;
    if (type !== "all" && !row.transformations.some((item) => item.type === type)) return false;
    const needle = query.trim().toLowerCase();
    if (needle && !`${row.output} ${row.input} ${docs[row.output]?.summary ?? ""}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const groups = new Map<string, MappingRow[]>();
  for (const row of filtered) (groups.get(row.output) ?? groups.set(row.output, []).get(row.output)!).push(row);

  return (
    <section data-tour="lineage-mapping" className={cn(PANEL, "overflow-hidden")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#1f252e] px-4 py-3">
        <Table2 className="h-4 w-4 text-[#f5c400]" />
        <div className="mr-2">
          <p className="text-[13px] font-semibold text-white">{t("title")}</p>
          <p className="text-[11.5px] text-[#8c96a8]">{t("hint")}</p>
        </div>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5d6878]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} className="h-8 w-60 rounded-md border border-[#252a33] bg-[#0f141b] pl-8 pr-2 text-[12px] text-white outline-none placeholder:text-[#5d6878] focus:border-[#f5c400]/50" />
        </div>
        <div className="flex overflow-hidden rounded-md border border-[#252a33]">
          {(["all", "DIRECT", "INDIRECT"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setType(item)} className={cn("px-2.5 py-1.5 text-[11.5px]", type === item ? "bg-[#f5c400]/15 text-[#f5c400]" : "text-[#8c96a8] hover:text-white")}>
              {t(`type.${item}`)}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-[#9aa4b4]">
          <input type="checkbox" checked={hidePassthrough} onChange={(event) => setHidePassthrough(event.target.checked)} className="accent-[#f5c400]" />
          {t("hidePassthrough")}
        </label>
        <button type="button" onClick={onExport} className="flex h-8 items-center gap-1.5 rounded-md border border-[#2c3440] px-2.5 text-[12px] text-[#e5e9f0] hover:border-[#f5c400]/50 hover:text-[#f5c400]">
          <FileSpreadsheet className="h-3.5 w-3.5" /> {t("export")}
        </button>
      </div>
      <div className="max-h-[calc(100vh-230px)] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-[12px]">
          <thead className="sticky top-0 z-10 bg-[#0f141b] text-left text-[10.5px] uppercase tracking-wide text-[#687386]">
            <tr>
              <th className="border-b border-[#1f252e] px-4 py-2 font-semibold">{t("cols.output")}</th>
              <th className="border-b border-[#1f252e] px-3 py-2 font-semibold">{t("cols.input")}</th>
              <th className="border-b border-[#1f252e] px-3 py-2 font-semibold">{t("cols.transformation")}</th>
              <th className="border-b border-[#1f252e] px-3 py-2 font-semibold">{t("cols.function")}</th>
              <th className="border-b border-[#1f252e] px-3 py-2 font-semibold">{t("cols.lines")}</th>
              <th className="border-b border-[#1f252e] px-3 py-2 font-semibold">{t("cols.runtime")}</th>
            </tr>
          </thead>
          <tbody>
            {[...groups.entries()].map(([output, items]) => {
              const column = model.byName.get(output)!;
              const doc = docs[output];
              return (
                <Fragment key={output}>
                  {items.map((row, index) => (
                    <tr key={row.key} className="align-top hover:bg-white/[0.02]">
                      {index === 0 && (
                        <td rowSpan={items.length} className="w-[30%] border-b border-[#1a2029] px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <ColumnChip name={output} onClick={(name) => nav.openColumn(name, "columns")} className="text-[12px]" />
                            <RoleBadge role={column.role} />
                          </div>
                          {doc?.summary && <p className="mt-1.5 line-clamp-3 text-[11.5px] leading-relaxed text-[#8c96a8]">{plainText(doc.summary, model.columnNames)}</p>}
                        </td>
                      )}
                      <td className="border-b border-[#1a2029] px-3 py-2.5">
                        {row.inputKind === "column" && <ColumnChip name={row.input} onClick={(name) => nav.openColumn(name)} />}
                        {row.inputKind === "self" && (
                          <span className="flex items-center gap-1.5"><ColumnChip name={row.input} muted /><span className="text-[10.5px] text-[#687386]">{t("selfInput")}</span></span>
                        )}
                        {row.inputKind === "lookup" && <span className="rounded-md border border-dashed border-violet-400/30 px-1.5 py-[1px] font-mono text-[11px] text-violet-200">{row.input}</span>}
                        {row.inputKind === "none" && <span className="text-[11.5px] text-[#5d6878]">{t("noInput")}</span>}
                        {row.historical && <p className="mt-1 text-[10px] text-amber-300">{t("historical")}</p>}
                      </td>
                      <td className="border-b border-[#1a2029] px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">{row.transformations.map((item) => <TransformationBadge key={`${item.type}${item.subtype}`} transformation={item} />)}</div>
                      </td>
                      <td className="border-b border-[#1a2029] px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {row.inputKind === "self" && column.role !== "passthrough" && <span className="text-[11px] text-emerald-300/90">{t("keepsInput")}</span>}
                          {column.role === "passthrough" ? <span className="text-[11.5px] text-[#8c96a8]">{t("passthrough")}</span> : row.operations.map((operation) => <OperationChip key={operation} operation={operation} />)}
                        </div>
                      </td>
                      <td className="border-b border-[#1a2029] px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">{row.lines.map((line) => <LineChip key={line} line={line} onClick={nav.openLine} />)}</div>
                      </td>
                      <td className="border-b border-[#1a2029] px-3 py-2.5">
                        <RuntimeCell status={row.verification} />
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            {!groups.size && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-[12px] text-[#687386]">{t("empty")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-[#1f252e] px-4 py-2.5 text-[11px] text-[#8c96a8]">
        <span>{t("count", { rows: filtered.length, outputs: groups.size })}</span>
        <span className="ml-auto">{t("openLineageNote")}</span>
      </div>
    </section>
  );
}

function RuntimeCell({ status }: { status: MappingRow["verification"] }) {
  const t = useTranslations("lineageAgent.mapping.runtime");
  if (status === "confirmed" || status === "passthrough" || status === "confirmed_via") {
    return <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{t(status)}</span>;
  }
  if (status === "not_observable") return <span className="inline-flex items-center gap-1 text-[11.5px] text-amber-300"><CircleDashed className="h-3.5 w-3.5 shrink-0" />{t(status)}</span>;
  return <span className="text-[11.5px] text-[#5d6878]">—</span>;
}
