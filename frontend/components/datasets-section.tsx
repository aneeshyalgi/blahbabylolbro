"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, FileSpreadsheet, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  DropOverlay, EYEBROW, EmptyState, INPUT, IconAction, PANEL, PRIMARY_BUTTON, SECONDARY_BUTTON, SearchField, Tag, WorkingBar,
  formatBytes, formatDateTime, moveInList, relativeTime, useFileDrop,
} from "@/components/workspace/ui";

export type DatasetSummary = { id: string; user_name?: string; filename?: string; upload_date?: string; version?: string };
type ClusterRef = { id: string; name: string; dataset_id?: string | null };

const EXCEL_FILE = /\.(xlsx|xls)$/i;
const ROW_GRID = "lg:grid-cols-[minmax(0,2.3fr)_minmax(0,0.7fr)_minmax(0,1.6fr)_minmax(0,1fr)_36px]";
export const datasetLabel = (dataset: DatasetSummary) => dataset.user_name || dataset.filename || dataset.id;

interface DatasetsSectionProps {
  isLoading?: boolean;
  selectedDatasetId?: string | null;
  onDatasetSelect?: (datasetId: string | null) => void;
  /** After a dataset was deleted (its tables, clusters and runs are gone with it). */
  onDatasetDeleted?: (datasetId: string) => void;
  /** Every time the list is (re)loaded. */
  onDatasetsChange?: (datasets: DatasetSummary[]) => void;
}

/**
 * The uploaded Excel datasets: search, which clusters use each one, upload (button or drop a workbook on the panel) and
 * delete (the confirmation names the clusters that are deleted with it).
 */
export function DatasetsSection({ isLoading = false, selectedDatasetId, onDatasetSelect, onDatasetDeleted, onDatasetsChange }: DatasetsSectionProps) {
  const t = useTranslations("dataTab");
  const locale = useLocale();
  const { toast } = useToast();
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [clusters, setClusters] = useState<ClusterRef[]>([]);
  const [runsByCluster, setRunsByCluster] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("v1.0.0");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<DatasetSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const reportList = useRef(onDatasetsChange);
  reportList.current = onDatasetsChange;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const [datasetsResponse, clustersResponse, runsResponse] = await Promise.all([
        fetch(API_ENDPOINTS.datasets),
        fetch(API_ENDPOINTS.clusters).catch(() => null),
        fetch(API_ENDPOINTS.clustersExecutions).catch(() => null),
      ]);
      if (!datasetsResponse.ok) throw new Error(`HTTP ${datasetsResponse.status}`);
      const loaded: DatasetSummary[] = (await datasetsResponse.json()).datasets ?? [];
      setDatasets(loaded);
      reportList.current?.(loaded);
      setClusters(clustersResponse?.ok ? ((await clustersResponse.json()).clusters ?? []) : []);
      const runs: { cluster_id: string }[] = runsResponse?.ok ? ((await runsResponse.json()).executions ?? []) : [];
      const counts: Record<string, number> = {};
      for (const run of runs) counts[run.cluster_id] = (counts[run.cluster_id] ?? 0) + 1;
      setRunsByCluster(counts);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clustersOf = useMemo(() => {
    const byDataset = new Map<string, ClusterRef[]>();
    for (const cluster of clusters) {
      if (cluster.dataset_id) byDataset.set(cluster.dataset_id, [...(byDataset.get(cluster.dataset_id) ?? []), cluster]);
    }
    return byDataset;
  }, [clusters]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return datasets;
    return datasets.filter((dataset) => `${dataset.user_name ?? ""} ${dataset.filename ?? ""} ${dataset.version ?? ""}`.toLowerCase().includes(needle));
  }, [datasets, query]);

  const choose = (candidate: File | null | undefined) => {
    if (!candidate) return;
    if (!EXCEL_FILE.test(candidate.name)) {
      toast({ title: t("onlyExcel"), variant: "destructive" });
      return;
    }
    setFile(candidate);
    setName(candidate.name.replace(/\.[^/.]+$/, ""));
    setVersion("v1.0.0");
    setUploadError(null);
  };
  const drop = useFileDrop(choose, !uploading);

  const nameTaken = useMemo(() => {
    const wanted = name.trim().toLowerCase();
    return Boolean(wanted) && datasets.some((dataset) => (dataset.user_name ?? "").trim().toLowerCase() === wanted);
  }, [name, datasets]);
  const canUpload = Boolean(file && name.trim() && version.trim() && !nameTaken && !uploading);

  const upload = async () => {
    if (!file || !canUpload) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("dataset_name", name.trim());
      form.append("version", version.trim());
      const response = await fetch(API_ENDPOINTS.datasetsUpload, { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload?.detail === "string" ? payload.detail : `HTTP ${response.status}`);
      const notes = [t("uploadSuccess", { count: Array.isArray(payload.tables) ? payload.tables.length : 0 })];
      if (payload.auto_cluster?.created) notes.push(t("autoClusterCreated", { name: payload.auto_cluster.name }));
      else if (payload.auto_cluster?.reason === "duplicate_name") notes.push(t("autoClusterSkippedDuplicate", { name: payload.auto_cluster.name }));
      else if (payload.auto_cluster?.reason === "no_code_files") notes.push(t("autoClusterSkippedNoCode"));
      toast({ title: t("uploaded", { name: name.trim() }), description: notes.join(" ") });
      setFile(null);
      await load();
      if (payload.id) onDatasetSelect?.(payload.id);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(API_ENDPOINTS.datasetDelete(toDelete.id), { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload?.detail === "string" ? payload.detail : `HTTP ${response.status}`);
      }
      const removed = toDelete;
      setToDelete(null);
      onDatasetDeleted?.(removed.id);
      await load();
      toast({ title: t("deleted"), description: t("deletedDesc", { name: datasetLabel(removed) }) });
    } catch (error) {
      toast({ title: t("deleteFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const focusRow = (id: string) =>
    window.requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-dataset="${CSS.escape(id)}"]`)?.focus());

  const onRowKey = (event: KeyboardEvent<HTMLDivElement>, dataset: DatasetSummary) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onDatasetSelect?.(dataset.id);
    } else if (event.key === "Delete") {
      event.preventDefault();
      setToDelete(dataset);
    } else if (moveInList(event.key, shown, dataset, (next) => focusRow(next.id))) {
      event.preventDefault();
    }
  };

  const busy = loading || isLoading;
  const deleteClusters = toDelete ? clustersOf.get(toDelete.id) ?? [] : [];
  const deleteRuns = deleteClusters.reduce((sum, cluster) => sum + (runsByCluster[cluster.id] ?? 0), 0);
  const uploadButton = (
    <button type="button" className={PRIMARY_BUTTON} onClick={() => fileInput.current?.click()} disabled={uploading}>
      <Upload className="h-4 w-4" />
      {t("upload")}
    </button>
  );

  return (
    <section className={cn(PANEL, "relative")} aria-label={t("datasets")} {...drop.handlers}>
      <DropOverlay active={drop.active} title={t("dropTitle")} hint={t("dropHint")} />
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(event) => {
          choose(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-2.5 border-b border-[#1f252e] px-5 py-3.5">
        <div className="mr-auto flex items-baseline gap-2">
          <h3 className="text-[14px] font-semibold text-white">{t("datasets")}</h3>
          {!busy && datasets.length ? <span className="text-[12px] text-[#687386]">{t("count", { count: datasets.length })}</span> : null}
        </div>
        {datasets.length ? <SearchField value={query} onChange={setQuery} placeholder={t("search")} clearLabel={t("clearSearch")} className="w-full sm:w-60" /> : null}
        <IconAction label={t("refresh")} onClick={() => void load()} disabled={busy}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </IconAction>
        {uploadButton}
      </div>

      {busy ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((index) => <Skeleton key={index} className="h-12 w-full bg-[#121821]" />)}
        </div>
      ) : loadFailed ? (
        <EmptyState icon={AlertTriangle} title={t("loadFailed")}>
          <button type="button" className={SECONDARY_BUTTON} onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            {t("retry")}
          </button>
        </EmptyState>
      ) : !datasets.length ? (
        <EmptyState icon={FileSpreadsheet} title={t("emptyTitle")} hint={t("emptyHint")}>
          {uploadButton}
        </EmptyState>
      ) : (
        <div className="p-2">
          <div className={cn("hidden gap-3 px-3 pb-1.5 pt-1 lg:grid", ROW_GRID)}>
            <span className={EYEBROW}>{t("colDataset")}</span>
            <span className={EYEBROW}>{t("colVersion")}</span>
            <span className={EYEBROW}>{t("colUsedBy")}</span>
            <span className={EYEBROW}>{t("colUploaded")}</span>
            <span />
          </div>
          <div ref={list} role="listbox" aria-label={t("datasets")} className="space-y-0.5">
            {shown.map((dataset) => {
              const selected = dataset.id === selectedDatasetId;
              const used = clustersOf.get(dataset.id) ?? [];
              const label = datasetLabel(dataset);
              return (
                <div
                  key={dataset.id}
                  role="option"
                  aria-selected={selected}
                  tabIndex={0}
                  data-dataset={dataset.id}
                  onClick={() => onDatasetSelect?.(dataset.id)}
                  onKeyDown={(event) => onRowKey(event, dataset)}
                  className={cn(
                    "group grid cursor-pointer grid-cols-[minmax(0,1fr)_36px] items-center gap-3 rounded-lg px-3 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#f5c400]/50",
                    ROW_GRID,
                    selected ? "bg-[#f5c400]/[0.06] shadow-[inset_3px_0_0_#f5c400]" : "hover:bg-white/[0.03]",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                        selected ? "border-[#f5c400]/40 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#2a313c] bg-[#0f141b] text-emerald-300/80",
                      )}
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-white" title={label}>{label}</p>
                      <p className="truncate font-mono text-[11px] text-[#687386]" title={dataset.filename}>{dataset.filename}</p>
                    </div>
                  </div>
                  <div className="hidden lg:block">
                    <Tag mono>{dataset.version || "v1.0.0"}</Tag>
                  </div>
                  <div className="hidden min-w-0 flex-wrap items-center gap-1 lg:flex">
                    {used.length ? (
                      <>
                        {used.slice(0, 3).map((cluster) => (
                          <Tag key={cluster.id} tone="sky" title={t("runs", { count: runsByCluster[cluster.id] ?? 0 })}>{cluster.name}</Tag>
                        ))}
                        {used.length > 3 ? <Tag>+{used.length - 3}</Tag> : null}
                      </>
                    ) : (
                      <span className="text-[12px] text-[#5d6878]">{t("notUsed")}</span>
                    )}
                  </div>
                  <div className="hidden min-w-0 truncate text-[12px] text-[#aab3c2] lg:block" title={formatDateTime(dataset.upload_date, locale)}>
                    {relativeTime(dataset.upload_date, locale)}
                  </div>
                  <div className="flex justify-end">
                    <IconAction
                      label={t("deleteLabel", { name: label })}
                      tone="danger"
                      onClick={() => setToDelete(dataset)}
                      className={cn("opacity-0 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100", selected && "opacity-100")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconAction>
                  </div>
                </div>
              );
            })}
          </div>
          {!shown.length ? <p className="px-3 py-6 text-center text-[12.5px] text-[#8c96a8]">{t("noMatch", { query: query.trim() })}</p> : null}
        </div>
      )}

      <Dialog open={file !== null} onOpenChange={(open) => { if (!open && !uploading) setFile(null); }}>
        <DialogContent
          className="border-[#252a33] bg-[#0b0f15] sm:max-w-lg"
          onEscapeKeyDown={(event) => { if (uploading) event.preventDefault(); }}
          onInteractOutside={(event) => { if (uploading) event.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle className="text-white">{t("uploadTitle")}</DialogTitle>
            <DialogDescription className="text-[#8c96a8]">{t("uploadDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void upload();
            }}
          >
            <div className="flex items-center gap-3 rounded-lg border border-[#252a33] bg-[#0f141b] px-3.5 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300">
                <FileSpreadsheet className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-white" title={file?.name}>{file?.name}</p>
                <p className="text-[11.5px] text-[#687386]">{file ? formatBytes(file.size, locale) : ""}</p>
              </div>
              <button type="button" className="text-[12px] font-medium text-[#f5c400] hover:underline disabled:opacity-50" onClick={() => fileInput.current?.click()} disabled={uploading}>
                {t("changeFile")}
              </button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-[12px] font-medium text-[#aab3c2]">{t("name")}</span>
              <input
                className={cn(INPUT, nameTaken && "border-rose-400/60 focus:border-rose-400/70")}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("namePlaceholder")}
                autoFocus
                disabled={uploading}
                aria-invalid={nameTaken}
              />
              {nameTaken ? <span className="block text-[11.5px] text-rose-300">{t("nameTaken")}</span> : null}
            </label>
            <label className="block space-y-1.5">
              <span className="text-[12px] font-medium text-[#aab3c2]">{t("version")}</span>
              <input className={cn(INPUT, "font-mono")} value={version} onChange={(event) => setVersion(event.target.value)} placeholder="v1.0.0" disabled={uploading} />
            </label>
            {uploading ? (
              <div className="space-y-2">
                <WorkingBar />
                <p className="flex items-center gap-2 text-[12px] text-[#8c96a8]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("uploadingStatus")}
                </p>
              </div>
            ) : null}
            {uploadError ? (
              <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-400/[0.07] px-3 py-2 text-[12.5px] leading-5 text-rose-200">
                {uploadError}
              </p>
            ) : null}
            <DialogFooter className="gap-2">
              <button type="button" className={SECONDARY_BUTTON} onClick={() => setFile(null)} disabled={uploading}>
                {t("cancel")}
              </button>
              <button type="submit" className={PRIMARY_BUTTON} disabled={!canUpload}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {t("uploadAction")}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => { if (!open && !deleting) setToDelete(null); }}>
        <AlertDialogContent className="border-[#252a33] bg-[#0b0f15]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2.5 text-[13px] leading-5 text-[#aab3c2]">
                <p>{t("deleteBody", { name: toDelete ? datasetLabel(toDelete) : "" })}</p>
                {deleteClusters.length ? (
                  <p className="rounded-md border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-amber-200">
                    {t("deleteClusters", { count: deleteClusters.length, names: deleteClusters.map((cluster) => cluster.name).join(", "), runs: deleteRuns })}
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
              disabled={deleting}
              className="bg-rose-500 text-white hover:bg-rose-500/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? t("deleting") : t("deleteAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
