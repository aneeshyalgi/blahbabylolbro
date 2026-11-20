"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, CircleAlert, Download, Loader2, Maximize2, Play, TableProperties, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState, PANEL, SECONDARY_BUTTON, Tag, WorkingBar, formatDateTime, relativeTime } from "@/components/workspace/ui";
import { downloadRunExcel, RunResultView, type RunResult } from "@/components/results/run-data-dialog";

export type RunError = { message: string; line?: number | null; traceback?: string | null };

/**
 * The result panel of the Results tab: the cluster's latest run (or the one just made) with its figures and table,
 * the error of a failed run, Excel export and a full-screen view.
 */
export function ResultDataSection({
  result,
  runAt,
  loading,
  running,
  error,
  codeName,
  datasetName,
  onDismissError,
}: {
  result: RunResult | null;
  runAt: string | null;
  loading: boolean;
  running: boolean;
  error: RunError | null;
  codeName: string;
  datasetName: string;
  onDismissError: () => void;
}) {
  const t = useTranslations("resultsTab");
  const locale = useLocale();
  const [fullScreen, setFullScreen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const hasRows = Boolean(result?.data?.length);

  useEffect(() => {
    if (!fullScreen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullScreen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [fullScreen]);

  useEffect(() => {
    setTraceOpen(false);
  }, [error]);

  useEffect(() => {
    setExportError(null);
  }, [result?.execution_id]);

  const exportRun = async () => {
    if (!result?.execution_id || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadRunExcel(result.execution_id);
    } catch (problem) {
      setExportError(`${t("exportFailed")}${problem instanceof Error && problem.message ? `: ${problem.message}` : ""}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className={PANEL} aria-label={t("resultTitle")}>
      <div className="flex flex-wrap items-center gap-3 border-b border-[#1f252e] px-5 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#252a33] bg-[#0f141b]">
          <TableProperties className="h-4 w-4 text-[#aab3c2]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-white">{t("resultTitle")}</h3>
          <p className="mt-0.5 truncate text-[12px] text-[#8c96a8]">
            {runAt ? (
              <span title={formatDateTime(runAt, locale)}>
                {t("shownRun", { time: formatDateTime(runAt, locale), ago: relativeTime(runAt, locale) })}
              </span>
            ) : (
              t("resultDescription")
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className={SECONDARY_BUTTON} onClick={() => void exportRun()} disabled={!hasRows || exporting || running}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t("exportExcel")}
          </button>
          <button type="button" className={cn(SECONDARY_BUTTON, "px-2.5")} onClick={() => setFullScreen(true)} disabled={!hasRows} aria-label={t("fullScreen")} title={t("fullScreen")}>
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {exportError ? <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-400/[0.07] px-3 py-2 text-[12.5px] text-rose-200">{exportError}</p> : null}

        {error ? (
          <div role="alert" className="rounded-lg border border-rose-400/30 bg-rose-400/[0.06] px-4 py-3">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-rose-100">{error.line ? t("runFailedLine", { line: error.line, code: codeName }) : t("runFailed")}</p>
                <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-rose-200">{error.message}</pre>
                {error.traceback ? (
                  <div className="mt-2">
                    <button type="button" onClick={() => setTraceOpen((open) => !open)} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-rose-200/80 hover:text-rose-100" aria-expanded={traceOpen}>
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", traceOpen && "rotate-180")} />
                      {traceOpen ? t("hideDetails") : t("showDetails")}
                    </button>
                    {traceOpen ? (
                      <pre className="mt-2 max-h-[260px] overflow-auto rounded-md border border-rose-400/20 bg-[#0b0f15] p-3 font-mono text-[11px] leading-[18px] text-[#c9d1dc]">{error.traceback}</pre>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={onDismissError} aria-label={t("dismiss")} className="rounded p-1 text-rose-200/70 hover:bg-rose-400/10 hover:text-rose-100">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}

        {running ? (
          <div className="space-y-2" role="status">
            <p className="text-[12.5px] text-[#aab3c2]">{t("runningStatus", { code: codeName, dataset: datasetName })}</p>
            <WorkingBar />
          </div>
        ) : null}

        {loading && !hasRows ? (
          <div className="space-y-3" aria-busy="true">
            <div className="grid grid-cols-3 gap-2.5">
              {[0, 1, 2].map((index) => <Skeleton key={index} className="h-[62px] bg-[#121821]" />)}
            </div>
            <Skeleton className="h-[220px] bg-[#121821]" />
          </div>
        ) : hasRows && result ? (
          <div className={cn("transition-opacity", running && "opacity-50")}>
            <RunResultView result={result} maxHeight="520px" />
          </div>
        ) : !running ? (
          <EmptyState icon={Play} title={t("noResultTitle")} hint={t("noResultHint")} className="py-10" />
        ) : null}
      </div>

      {fullScreen && result ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#05080c]/95 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t("fullResultTitle")}>
          <div className="mx-auto flex w-full max-w-[1800px] min-h-0 flex-1 flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-[17px] font-semibold text-white">{t("fullResultTitle")}</h3>
                <p className="mt-0.5 text-[12.5px] text-[#8c96a8]">
                  {t("fullResultMeta", { rows: result.data?.length ?? 0, columns: result.summary?.columns?.length ?? 0 })}
                  {runAt ? ` · ${formatDateTime(runAt, locale)}` : ""}
                </p>
              </div>
              <Tag>{t("escToClose")}</Tag>
              <button type="button" onClick={() => setFullScreen(false)} aria-label={t("close")} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#2a313c] bg-[#0f141b] text-[#aab3c2] hover:border-[#f5c400]/40 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <RunResultView result={result} maxHeight="calc(100vh - 260px)" />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
