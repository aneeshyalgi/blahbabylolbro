"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, ChartColumnBig, Database, FileCode2, History, Loader2, Maximize2, Play, RefreshCw, Trash2 } from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EmptyState, EYEBROW, FactTile, IconAction, PageHeader, PANEL, PRIMARY_BUTTON, SECONDARY_BUTTON, Tag, formatDateTime, relativeTime } from "@/components/workspace/ui";
import { ResultDataSection, type RunError } from "@/components/result-data-section";
import { RunDataDialog, type RunResult } from "@/components/results/run-data-dialog";

const STORAGE_KEY = "dataflow_results_cluster_id";
const TRIGGER = "h-10 w-full border-[#252a33] bg-[#0f141b] text-[13px] font-medium text-white hover:bg-[#121821] dark:bg-[#0f141b] dark:hover:bg-[#121821]";

interface ClusterOption {
  id: string;
  name: string;
  reporting_date: string;
  dataset_id: string;
  dataset_name?: string | null;
  dataset_version?: string | null;
  code_id: string | null;
  code_filename?: string | null;
  code_version?: string | null;
  is_reference?: boolean | number;
}

interface ClusterExecutionRow {
  id: string;
  cluster_id: string;
  cluster_name: string | null;
  cluster_reporting_date: string | null;
  execution_id: string;
  executed_date: string;
  dataset_name: string | null;
  dataset_version: string | null;
  code_filename: string | null;
  code_version: string | null;
  summary?: { total_values_computed?: number };
}

function formatDay(value: string | null | undefined, locale: string): string {
  if (!value) return "–";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale, { dateStyle: "medium" });
}

function withVersion(name: string | null | undefined, version: string | null | undefined): string {
  if (!name) return "–";
  return version ? `${name} · ${version}` : name;
}

/** The Results tab: run a cluster's code on its dataset, see the computed values and the cluster's runs. */
export function DataTabContent() {
  const t = useTranslations("resultsTab");
  const locale = useLocale();
  const { toast } = useToast();
  const [clusters, setClusters] = useState<ClusterOption[] | null>(null);
  const [executions, setExecutions] = useState<ClusterExecutionRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<RunError | null>(null);
  const [viewing, setViewing] = useState<ClusterExecutionRow | null>(null);
  const [toDelete, setToDelete] = useState<ClusterExecutionRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedClusterId;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSelectedClusterId(saved);
    } catch {
      // Storage unavailable: nothing remembered.
    }
  }, []);

  useEffect(() => {
    try {
      if (selectedClusterId) localStorage.setItem(STORAGE_KEY, selectedClusterId);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable: the selection lasts for this visit.
    }
  }, [selectedClusterId]);

  const loadExecutions = useCallback(async () => {
    const response = await fetch(API_ENDPOINTS.clustersExecutions);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    setExecutions(payload.executions ?? []);
  }, []);

  const loadAll = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [clustersResponse] = await Promise.all([fetch(API_ENDPOINTS.clusters), loadExecutions()]);
      if (!clustersResponse.ok) throw new Error(`HTTP ${clustersResponse.status}`);
      const payload = await clustersResponse.json();
      setClusters(payload.clusters ?? []);
    } catch {
      setLoadFailed(true);
      setClusters((current) => current ?? []);
      setExecutions((current) => current ?? []);
    }
  }, [loadExecutions]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // A remembered cluster that was deleted since is no longer selected.
  useEffect(() => {
    if (clusters && selectedClusterId && !clusters.some((cluster) => cluster.id === selectedClusterId)) setSelectedClusterId(null);
  }, [clusters, selectedClusterId]);

  const selectedCluster = clusters?.find((cluster) => cluster.id === selectedClusterId) ?? null;
  const runs = useMemo(
    () => (selectedClusterId ? (executions ?? []).filter((execution) => execution.cluster_id === selectedClusterId) : []),
    [executions, selectedClusterId],
  );
  const latestExecutionId = runs[0]?.execution_id ?? null;
  const shownRun = runs.find((run) => run.execution_id === result?.execution_id) ?? null;

  // A different cluster: its own error and result.
  useEffect(() => {
    setRunError(null);
  }, [selectedClusterId]);

  // The cluster's latest run is shown.
  useEffect(() => {
    if (!selectedClusterId || !latestExecutionId) {
      setResult(null);
      setLoadingResult(false);
      return;
    }
    if (result?.execution_id === latestExecutionId) return;
    let cancelled = false;
    setLoadingResult(true);
    fetch(API_ENDPOINTS.resultById(latestExecutionId))
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as RunResult;
      })
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingResult(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClusterId, latestExecutionId]);

  const missingSource = Boolean(selectedCluster && (!selectedCluster.dataset_id || !selectedCluster.code_id || !selectedCluster.dataset_name || !selectedCluster.code_filename));

  const run = async () => {
    if (!selectedCluster || missingSource || running) return;
    const clusterId = selectedCluster.id;
    setRunning(true);
    setRunError(null);
    try {
      const response = await fetch(API_ENDPOINTS.execute, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset_id: selectedCluster.dataset_id, code_id: selectedCluster.code_id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.status === "error" || !payload.execution_id) {
        if (selectedRef.current === clusterId) {
          setRunError({
            message: payload.error || (typeof payload.detail === "string" ? payload.detail : "") || t("runFailedStatus", { status: response.status }),
            line: payload.line ?? null,
            traceback: payload.traceback ?? null,
          });
        }
        return;
      }
      const link = await fetch(API_ENDPOINTS.clusterLinkExecution(clusterId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execution_id: payload.execution_id }),
      }).catch(() => null);
      if (!link?.ok) toast({ title: t("linkFailed"), description: t("linkFailedDesc"), variant: "destructive" });
      if (selectedRef.current === clusterId) setResult(payload as RunResult);
      await loadExecutions().catch(() => undefined);
    } catch (problem) {
      if (selectedRef.current === clusterId) setRunError({ message: problem instanceof Error ? problem.message : String(problem) });
    } finally {
      setRunning(false);
    }
  };

  const removeRun = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(API_ENDPOINTS.clusterExecutionDelete(toDelete.id), { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload?.detail === "string" ? payload.detail : `HTTP ${response.status}`);
      }
      toast({ title: t("runRemoved"), description: t("runRemovedDesc") });
      if (result?.execution_id === toDelete.execution_id) setResult(null);
      setToDelete(null);
      await loadExecutions().catch(() => undefined);
    } catch (problem) {
      toast({ title: t("removeFailed"), description: problem instanceof Error ? problem.message : t("removeFailedDesc"), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const loading = clusters === null;
  const datasetName = selectedCluster?.dataset_name ?? "";
  const codeName = selectedCluster?.code_filename ?? "";

  return (
    <div className="space-y-5 pb-16">
      <PageHeader icon={ChartColumnBig} title={t("title")} description={t("description")}>
        <button type="button" className={SECONDARY_BUTTON} onClick={() => void loadAll()} aria-label={t("refresh")}>
          <RefreshCw className="h-4 w-4" />
          {t("refresh")}
        </button>
      </PageHeader>

      <section className={cn(PANEL, "p-5")} aria-label={t("runTitle")}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[240px] max-w-[340px] flex-1 space-y-1.5">
            <label className={EYEBROW} htmlFor="results-cluster">{t("cluster")}</label>
            {loading ? (
              <Skeleton className="h-10 w-full bg-[#121821]" />
            ) : (
              <Select value={selectedClusterId ?? "__none__"} onValueChange={(value) => setSelectedClusterId(value === "__none__" ? null : value)}>
                <SelectTrigger id="results-cluster" className={TRIGGER} aria-label={t("cluster")}>
                  <SelectValue placeholder={t("selectCluster")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("selectCluster")}</SelectItem>
                  {(clusters ?? []).map((cluster) => (
                    <SelectItem key={cluster.id} value={cluster.id}>
                      {cluster.name}
                      {cluster.reporting_date ? ` · ${formatDay(cluster.reporting_date, locale)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="order-last grid w-full min-w-0 grid-cols-3 gap-2.5 2xl:order-none 2xl:w-auto 2xl:flex-1">
            <FactTile icon={Database} label={t("dataset")} value={!selectedCluster ? "–" : selectedCluster.dataset_name ? withVersion(selectedCluster.dataset_name, selectedCluster.dataset_version) : t("missing")} warning={Boolean(selectedCluster && !selectedCluster.dataset_name)} />
            <FactTile icon={FileCode2} label={t("code")} value={!selectedCluster ? "–" : selectedCluster.code_filename ? withVersion(selectedCluster.code_filename, selectedCluster.code_version) : t("missing")} mono={Boolean(selectedCluster?.code_filename)} warning={Boolean(selectedCluster && !selectedCluster.code_filename)} />
            <FactTile icon={CalendarDays} label={t("reportingDate")} value={selectedCluster ? formatDay(selectedCluster.reporting_date, locale) : "–"} />
          </div>

          <button type="button" className={cn(PRIMARY_BUTTON, "ml-auto h-10 min-w-[148px] justify-center")} onClick={() => void run()} disabled={!selectedCluster || missingSource || running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? t("running") : t("run")}
          </button>
        </div>
        <p className="mt-3 text-[12px] text-[#8c96a8]">
          {loadFailed ? (
            <span className="text-rose-300">{t("loadFailed")}</span>
          ) : !loading && !(clusters ?? []).length ? (
            t("noClusters")
          ) : !selectedCluster ? (
            t("pickCluster")
          ) : missingSource ? (
            <span className="text-amber-300">{t("missingSource")}</span>
          ) : (
            t("runHint", { code: codeName, dataset: datasetName })
          )}
        </p>
      </section>

      {selectedCluster ? (
        <>
          <ResultDataSection
            result={result}
            runAt={shownRun?.executed_date ?? null}
            loading={loadingResult}
            running={running}
            error={runError}
            codeName={codeName}
            datasetName={datasetName}
            onDismissError={() => setRunError(null)}
          />

          <section className={PANEL} aria-label={t("runsTitle")}>
            <div className="flex flex-wrap items-center gap-3 border-b border-[#1f252e] px-5 py-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#252a33] bg-[#0f141b]">
                <History className="h-4 w-4 text-[#aab3c2]" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-2 text-[14px] font-semibold text-white">
                  {t("runsTitle")}
                  {executions ? <Tag className="font-mono">{runs.length}</Tag> : null}
                </h3>
                <p className="mt-0.5 text-[12px] text-[#8c96a8]">{t("runsDescription", { cluster: selectedCluster.name })}</p>
              </div>
            </div>
            {executions === null ? (
              <div className="space-y-2 p-5">
                {[0, 1].map((index) => <Skeleton key={index} className="h-10 w-full bg-[#121821]" />)}
              </div>
            ) : !runs.length ? (
              <EmptyState icon={History} title={t("noRunsTitle")} hint={t("noRunsHint")} className="py-9" />
            ) : (
              <div className="max-h-[360px] overflow-auto">
                <table className="w-full border-separate border-spacing-0 text-[12.5px]">
                  <thead className="sticky top-0 z-10 bg-[#0f141b]">
                    <tr className="whitespace-nowrap text-left text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#687386]">
                      <th scope="col" className="border-b border-[#1f252e] px-5 py-2 font-semibold">{t("colRun")}</th>
                      <th scope="col" className="border-b border-[#1f252e] px-3 py-2 font-semibold">{t("dataset")}</th>
                      <th scope="col" className="border-b border-[#1f252e] px-3 py-2 font-semibold">{t("code")}</th>
                      <th scope="col" className="border-b border-[#1f252e] px-3 py-2 text-right font-semibold">{t("colValues")}</th>
                      <th scope="col" className="w-[92px] border-b border-[#1f252e] px-5 py-2"><span className="sr-only">{t("colActions")}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((entry) => {
                      const shown = entry.execution_id === result?.execution_id;
                      return (
                        <tr key={entry.id} className={cn("group transition-colors hover:bg-white/[0.02]", shown && "bg-[#f5c400]/[0.04]")}>
                          <td className="whitespace-nowrap border-b border-[#161b22] px-5 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[#e5e9f0]" title={formatDateTime(entry.executed_date, locale)}>{formatDateTime(entry.executed_date, locale)}</span>
                              {shown ? <Tag tone="gold">{t("shownTag")}</Tag> : null}
                            </div>
                            <span className="text-[11px] text-[#687386]">{relativeTime(entry.executed_date, locale)}</span>
                          </td>
                          <td className="max-w-[240px] truncate border-b border-[#161b22] px-3 py-2.5 text-[#c9d1dc]" title={withVersion(entry.dataset_name, entry.dataset_version)}>
                            {withVersion(entry.dataset_name, entry.dataset_version)}
                          </td>
                          <td className="max-w-[240px] truncate border-b border-[#161b22] px-3 py-2.5 font-mono text-[12px] text-[#c9d1dc]" title={withVersion(entry.code_filename, entry.code_version)}>
                            {withVersion(entry.code_filename, entry.code_version)}
                          </td>
                          <td className="border-b border-[#161b22] px-3 py-2.5 text-right font-mono tabular-nums text-emerald-300">
                            {(entry.summary?.total_values_computed ?? 0).toLocaleString(locale)}
                          </td>
                          <td className="border-b border-[#161b22] px-5 py-2.5">
                            <div className="flex items-center justify-end gap-0.5">
                              <IconAction label={t("viewData")} onClick={() => setViewing(entry)}>
                                <Maximize2 className="h-3.5 w-3.5" />
                              </IconAction>
                              <IconAction label={t("removeRun")} tone="danger" onClick={() => setToDelete(entry)} disabled={deleting}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </IconAction>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : !loading && (clusters ?? []).length ? (
        <section className={PANEL}>
          <EmptyState icon={ChartColumnBig} title={t("pickClusterTitle")} hint={t("pickCluster")} />
        </section>
      ) : null}

      <RunDataDialog
        executionId={viewing?.execution_id ?? null}
        title={t("runOf", { cluster: viewing?.cluster_name ?? selectedCluster?.name ?? "" })}
        description={viewing ? `${formatDateTime(viewing.executed_date, locale)} · ${withVersion(viewing.dataset_name, viewing.dataset_version)} · ${withVersion(viewing.code_filename, viewing.code_version)}` : undefined}
        onClose={() => setViewing(null)}
      />

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => { if (!open && !deleting) setToDelete(null); }}>
        <AlertDialogContent className="border-[#252a33] bg-[#0b0f15]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{t("removeRunTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-[#aab3c2]">
              {t("removeRunBody", { time: toDelete ? formatDateTime(toDelete.executed_date, locale) : "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void removeRun();
              }}
            >
              {deleting ? t("removing") : t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
