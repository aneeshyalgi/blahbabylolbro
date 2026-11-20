"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download, Loader2, TableProperties } from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SECONDARY_BUTTON } from "@/components/workspace/ui";
import { computedSet, ResultLegend, ResultTable, StatTile, type ComputedCell, type ResultRow } from "@/components/results/result-table";

export type RunResult = {
  execution_id?: string;
  dataset_id?: string;
  code_id?: string;
  data?: ResultRow[];
  computed_cells?: ComputedCell[];
  summary?: { columns?: string[]; computed_by_column?: Record<string, number>; rows_processed?: number; total_values_computed?: number };
};

/** Saves a run as an Excel file (computed cells green), the way the backend exports it. */
export async function downloadRunExcel(executionId: string): Promise<void> {
  const response = await fetch(API_ENDPOINTS.exportResult(executionId));
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload?.detail === "string" ? payload.detail : `HTTP ${response.status}`);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? "results.xlsx";
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Figures, filled columns and table of one run. */
export function RunResultView({ result, maxHeight = "58vh" }: { result: RunResult; maxHeight?: string }) {
  const t = useTranslations("resultsTab");
  const locale = useLocale();
  const columns = useMemo(() => result.summary?.columns ?? Object.keys(result.data?.[0] ?? {}), [result]);
  const computed = useMemo(() => computedSet(result.computed_cells), [result]);
  const counts = result.summary?.computed_by_column ?? {};
  const rows = result.data ?? [];
  const filledColumns = Object.values(counts).filter((count) => count > 0).length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2.5">
        <StatTile label={t("statRows")} value={(result.summary?.rows_processed ?? rows.length).toLocaleString(locale)} />
        <StatTile label={t("statComputed")} value={(result.summary?.total_values_computed ?? computed.size).toLocaleString(locale)} tone="green" />
        <StatTile label={t("statColumns")} value={filledColumns.toLocaleString(locale)} />
      </div>
      {rows.length ? (
        <ResultTable columns={columns} rows={rows} computed={computed} locale={locale} maxHeight={maxHeight} />
      ) : (
        <p className="rounded-lg border border-dashed border-[#2a313c] px-4 py-8 text-center text-[12.5px] text-[#8c96a8]">{t("noRows")}</p>
      )}
      <ResultLegend computedLabel={t("legendComputed")} emptyLabel={t("legendEmpty")} />
    </div>
  );
}

/** One stored run in a dialog ("View data" in the run lists of the Results and Clusters tabs). */
export function RunDataDialog({
  executionId,
  title,
  description,
  onClose,
}: {
  executionId: string | null;
  title: string;
  description?: string;
  onClose: () => void;
}) {
  const t = useTranslations("resultsTab");
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
    setExportError(null);
    if (!executionId) return;
    let cancelled = false;
    fetch(API_ENDPOINTS.resultById(executionId))
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as RunResult;
      })
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        if (!cancelled) setError(t("runLoadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [executionId, t]);

  const exportRun = async () => {
    if (!executionId || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadRunExcel(executionId);
    } catch (problem) {
      setExportError(`${t("exportFailed")}${problem instanceof Error && problem.message ? `: ${problem.message}` : ""}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={executionId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[92vh] grid-cols-[minmax(0,1fr)] overflow-y-auto border-[#252a33] bg-[#0b0f15] sm:max-w-[min(1320px,94vw)]">
        <DialogHeader className="pr-8">
          <div className="flex flex-wrap items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#f5c400]/30 bg-[#f5c400]/10">
              <TableProperties className="h-4 w-4 text-[#f5c400]" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[16px] text-white">{title}</DialogTitle>
              <DialogDescription className="mt-0.5 text-[12.5px] text-[#8c96a8]">{description ?? t("runDialogDescription")}</DialogDescription>
            </div>
            <button type="button" className={SECONDARY_BUTTON} onClick={() => void exportRun()} disabled={!result || exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t("exportExcel")}
            </button>
          </div>
        </DialogHeader>
        {exportError ? <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-400/[0.07] px-3 py-2 text-[12.5px] text-rose-200">{exportError}</p> : null}
        {error ? (
          <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-400/[0.07] px-3 py-6 text-center text-[12.5px] text-rose-200">{error}</p>
        ) : !result ? (
          <div className="space-y-3" aria-busy="true" aria-label={t("loadingRun")}>
            <div className="grid grid-cols-3 gap-2.5">
              {[0, 1, 2].map((index) => <Skeleton key={index} className="h-[62px] bg-[#121821]" />)}
            </div>
            <Skeleton className="h-[280px] bg-[#121821]" />
          </div>
        ) : (
          <RunResultView result={result} />
        )}
      </DialogContent>
    </Dialog>
  );
}
