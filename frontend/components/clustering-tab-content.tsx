"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowRight,
  Boxes,
  CalendarDays,
  Clock3,
  Database,
  FileCode2,
  GitCompareArrows,
  History,
  Loader2,
  Maximize2,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useClusterSelection } from "@/context/cluster-selection-context";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  EYEBROW,
  FactTile,
  IconAction,
  INPUT,
  PageHeader,
  PANEL,
  PRIMARY_BUTTON,
  SearchField,
  SECONDARY_BUTTON,
  Tag,
  formatDateTime,
  moveInList,
  relativeTime,
} from "@/components/workspace/ui";
import { RunDataDialog } from "@/components/results/run-data-dialog";

interface Cluster {
  id: string;
  name: string;
  reporting_date: string;
  dataset_id: string;
  dataset_name: string | null;
  dataset_version: string | null;
  code_id: string | null;
  code_filename: string | null;
  code_version: string | null;
  created_date: string;
  description: string | null;
  is_reference: boolean | number;
}

interface Dataset {
  id: string;
  user_name: string;
  filename: string;
  version: string;
}

interface CodeFile {
  id: string;
  filename: string;
  version: string;
  description?: string;
}

interface ClusterRun {
  id: string;
  cluster_id: string;
  execution_id: string;
  executed_date: string;
  dataset_name: string | null;
  dataset_version: string | null;
  code_filename: string | null;
  code_version: string | null;
  summary?: { total_values_computed?: number } | null;
}

type ClusterForm = { name: string; reporting_date: string; dataset_id: string; code_id: string; description: string; is_reference: boolean };

const STORAGE_CLUSTER_ID = "dataflow_clusters_selected_id";
const EMPTY_FORM: ClusterForm = { name: "", reporting_date: "", dataset_id: "", code_id: "", description: "", is_reference: false };
const TRIGGER = "h-9 w-full min-w-0 border-[#252a33] bg-[#0f141b] text-[13px] text-[#e5e9f0] hover:bg-[#121821] dark:bg-[#0f141b] dark:hover:bg-[#121821]";

function formatDay(value: string | null | undefined, locale: string): string {
  if (!value) return "–";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale, { dateStyle: "medium" });
}

/** "2026-11-17" for a date input, from a stored date or timestamp. */
function dateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function withVersion(name: string | null | undefined, version: string | null | undefined): string {
  if (!name) return "–";
  return version ? `${name} · ${version}` : name;
}

async function errorText(response: Response): Promise<string> {
  const payload = await response.json().catch(() => ({}));
  return typeof payload?.detail === "string" ? payload.detail : `HTTP ${response.status}`;
}

/** The Clusters tab: a cluster ties a dataset and a code file to a reporting date; its runs are listed here. */
export function ClusteringTabContent() {
  const t = useTranslations("clustersTab");
  const locale = useLocale();
  const { toast } = useToast();
  const { baseClusterId, comparisonClusterId, setBaseClusterId, setComparisonClusterId } = useClusterSelection();
  const [clusters, setClusters] = useState<Cluster[] | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [codeFiles, setCodeFiles] = useState<CodeFile[]>([]);
  const [runs, setRuns] = useState<ClusterRun[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<ClusterForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Cluster | null>(null);
  const [editForm, setEditForm] = useState<ClusterForm>(EMPTY_FORM);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Cluster | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewing, setViewing] = useState<ClusterRun | null>(null);
  const [runToRemove, setRunToRemove] = useState<ClusterRun | null>(null);
  const [removingRun, setRemovingRun] = useState(false);
  const restored = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const loadAll = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [clustersResponse, datasetsResponse, codeResponse, runsResponse] = await Promise.all([
        fetch(API_ENDPOINTS.clusters),
        fetch(API_ENDPOINTS.datasets),
        fetch(API_ENDPOINTS.code),
        fetch(API_ENDPOINTS.clustersExecutions),
      ]);
      if (!clustersResponse.ok) throw new Error(`HTTP ${clustersResponse.status}`);
      const list: Cluster[] = (await clustersResponse.json()).clusters ?? [];
      setClusters(list);
      setDatasets(datasetsResponse.ok ? (await datasetsResponse.json()).datasets ?? [] : []);
      setCodeFiles(codeResponse.ok ? (await codeResponse.json()).code_files ?? [] : []);
      setRuns(runsResponse.ok ? (await runsResponse.json()).executions ?? [] : []);
    } catch {
      setLoadFailed(true);
      setClusters((current) => current ?? []);
      setRuns((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // The remembered selection, once the clusters are known; comparison defaults pointing at deleted clusters are cleared.
  useEffect(() => {
    if (!clusters || loadFailed) return;
    if (!restored.current) {
      restored.current = true;
      try {
        const saved = localStorage.getItem(STORAGE_CLUSTER_ID);
        if (saved && clusters.some((cluster) => cluster.id === saved)) setSelectedId(saved);
      } catch {
        // Storage unavailable: nothing remembered.
      }
    } else if (selectedId && !clusters.some((cluster) => cluster.id === selectedId)) {
      setSelectedId(null);
    }
    if (baseClusterId && !clusters.some((cluster) => cluster.id === baseClusterId)) setBaseClusterId("");
    if (comparisonClusterId && !clusters.some((cluster) => cluster.id === comparisonClusterId)) setComparisonClusterId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters]);

  useEffect(() => {
    if (!restored.current) return;
    try {
      if (selectedId) localStorage.setItem(STORAGE_CLUSTER_ID, selectedId);
      else localStorage.removeItem(STORAGE_CLUSTER_ID);
    } catch {
      // Storage unavailable: the selection lasts for this visit.
    }
  }, [selectedId]);

  const runsByCluster = useMemo(() => {
    const grouped: Record<string, ClusterRun[]> = {};
    for (const run of runs ?? []) (grouped[run.cluster_id] ??= []).push(run);
    return grouped;
  }, [runs]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clusters ?? [];
    return (clusters ?? []).filter((cluster) =>
      [cluster.name, cluster.description, cluster.dataset_name, cluster.code_filename].some((text) => (text ?? "").toLowerCase().includes(needle)),
    );
  }, [clusters, query]);

  const selected = clusters?.find((cluster) => cluster.id === selectedId) ?? null;
  const selectedRuns = selected ? runsByCluster[selected.id] ?? [] : [];

  const nameTaken = (name: string, except?: string) => {
    const wanted = name.trim().toLowerCase();
    return Boolean(wanted) && (clusters ?? []).some((cluster) => cluster.id !== except && cluster.name.trim().toLowerCase() === wanted);
  };
  const createNameTaken = nameTaken(form.name);
  const canCreate = Boolean(form.name.trim() && form.reporting_date && form.dataset_id && form.code_id) && !createNameTaken && !creating;

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch(API_ENDPOINTS.clusters, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, name: form.name.trim(), description: form.description.trim() }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      const payload = await response.json().catch(() => ({}));
      toast({ title: t("created"), description: t("createdDesc", { name: form.name.trim() }) });
      setForm(EMPTY_FORM);
      await loadAll();
      if (payload?.cluster_id) setSelectedId(payload.cluster_id);
    } catch (problem) {
      setCreateError(problem instanceof Error ? problem.message : t("createFailed"));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (cluster: Cluster) => {
    setEditing(cluster);
    setEditError(null);
    setEditForm({
      name: cluster.name ?? "",
      reporting_date: dateInputValue(cluster.reporting_date),
      dataset_id: cluster.dataset_id ?? "",
      code_id: cluster.code_id ?? "",
      description: cluster.description ?? "",
      is_reference: Boolean(cluster.is_reference),
    });
  };

  const editNameTaken = editing ? nameTaken(editForm.name, editing.id) : false;
  const canSaveEdit = Boolean(editing && editForm.name.trim() && editForm.reporting_date) && !editNameTaken && !savingEdit;

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || !canSaveEdit) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const response = await fetch(API_ENDPOINTS.clusterById(editing.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          reporting_date: editForm.reporting_date,
          dataset_id: editForm.dataset_id,
          code_id: editForm.code_id,
        }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      toast({ title: t("updated"), description: t("updatedDesc", { name: editForm.name.trim() }) });
      setEditing(null);
      await loadAll();
    } catch (problem) {
      setEditError(problem instanceof Error ? problem.message : t("updateFailed"));
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteCluster = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(API_ENDPOINTS.clusterById(confirmDelete.id), { method: "DELETE" });
      if (!response.ok) throw new Error(await errorText(response));
      toast({ title: t("deleted"), description: t("deletedDesc", { name: confirmDelete.name }) });
      if (selectedId === confirmDelete.id) setSelectedId(null);
      setConfirmDelete(null);
      setEditing(null);
      await loadAll();
    } catch (problem) {
      toast({ title: t("deleteFailed"), description: problem instanceof Error ? problem.message : undefined, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const removeRun = async () => {
    if (!runToRemove) return;
    setRemovingRun(true);
    try {
      const response = await fetch(API_ENDPOINTS.clusterExecutionDelete(runToRemove.id), { method: "DELETE" });
      if (!response.ok) throw new Error(await errorText(response));
      toast({ title: t("runRemoved"), description: t("runRemovedDesc") });
      setRunToRemove(null);
      await loadAll();
    } catch (problem) {
      toast({ title: t("removeFailed"), description: problem instanceof Error ? problem.message : undefined, variant: "destructive" });
    } finally {
      setRemovingRun(false);
    }
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).dataset?.clusterRow) return;
    const current = visible.find((cluster) => cluster.id === selectedId);
    if (moveInList(event.key, visible, current, (cluster) => {
      setSelectedId(cluster.id);
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-cluster-row="${cluster.id}"]`)?.focus());
    })) {
      event.preventDefault();
    } else if ((event.key === "Enter" || event.key === "F2") && current) {
      event.preventDefault();
      openEdit(current);
    }
  };

  const loading = clusters === null;
  const total = clusters?.length ?? 0;

  return (
    <div className="space-y-5 pb-16">
      <PageHeader icon={Boxes} title={t("title")} description={t("description")}>
        <button type="button" className={SECONDARY_BUTTON} onClick={() => void loadAll()}>
          <RefreshCw className="h-4 w-4" />
          {t("refresh")}
        </button>
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
        {/* Left: a new cluster */}
        <div className="min-w-0">
          <form className={PANEL} onSubmit={(event) => void create(event)} aria-label={t("newTitle")}>
            <PanelHeading icon={Plus} title={t("newTitle")} description={t("newDescription")} />
            <div className="space-y-3.5 p-5">
              <Field label={t("name")} required htmlFor="cluster-name" error={createNameTaken ? t("nameTaken") : undefined}>
                <input
                  id="cluster-name"
                  className={cn(INPUT, createNameTaken && "border-rose-400/60")}
                  placeholder={t("namePlaceholder")}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  aria-invalid={createNameTaken}
                />
              </Field>
              <Field label={t("reportingDate")} required htmlFor="cluster-date">
                <input id="cluster-date" type="date" className={cn(INPUT, "[color-scheme:dark]")} value={form.reporting_date} onChange={(event) => setForm({ ...form, reporting_date: event.target.value })} />
              </Field>
              <Field label={t("dataset")} required>
                <Select value={form.dataset_id} onValueChange={(value) => setForm({ ...form, dataset_id: value })}>
                  <SelectTrigger className={TRIGGER} aria-label={t("dataset")}>
                    <SelectValue placeholder={t("selectDataset")} />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={dataset.id}>{withVersion(dataset.user_name || dataset.filename, dataset.version)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("code")} required>
                <Select value={form.code_id} onValueChange={(value) => setForm({ ...form, code_id: value })}>
                  <SelectTrigger className={TRIGGER} aria-label={t("code")}>
                    <SelectValue placeholder={t("selectCode")} />
                  </SelectTrigger>
                  <SelectContent>
                    {codeFiles.map((code) => (
                      <SelectItem key={code.id} value={code.id}>{withVersion(code.filename, code.version)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("descriptionLabel")} htmlFor="cluster-description">
                <textarea
                  id="cluster-description"
                  rows={2}
                  className={cn(INPUT, "h-auto resize-y py-2 leading-5")}
                  placeholder={t("descriptionPlaceholder")}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </Field>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[#1f252e] bg-[#0f141b] px-3 py-2.5">
                <Checkbox checked={form.is_reference} onCheckedChange={(checked) => setForm({ ...form, is_reference: checked === true })} className="mt-0.5 border-[#3a4352] bg-[#0b0f15] data-[state=checked]:border-[#f5c400] data-[state=checked]:bg-[#f5c400] data-[state=checked]:text-[#0b0f15] dark:bg-[#0b0f15] dark:data-[state=checked]:bg-[#f5c400]" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium text-white">{t("reference")}</span>
                  <span className="block text-[11.5px] leading-4 text-[#8c96a8]">{t("referenceHint")}</span>
                </span>
              </label>
              {createError ? <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-400/[0.07] px-3 py-2 text-[12.5px] text-rose-200">{createError}</p> : null}
              <button type="submit" className={cn(PRIMARY_BUTTON, "w-full justify-center")} disabled={!canCreate}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creating ? t("creating") : t("create")}
              </button>
              {!datasets.length || !codeFiles.length ? <p className="text-[11.5px] leading-4 text-[#8c96a8]">{t("needSources")}</p> : null}
            </div>
          </form>
        </div>

        {/* Right: the clusters and the selected one's runs */}
        <div className="min-w-0 space-y-5">
          <section className={PANEL} aria-label={t("listTitle")}>
            <div className="flex flex-wrap items-center gap-3 border-b border-[#1f252e] px-5 py-3.5">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold text-white">
                {t("listTitle")}
                {!loading ? <Tag className="font-mono">{total}</Tag> : null}
              </h3>
              <SearchField value={query} onChange={setQuery} placeholder={t("search")} clearLabel={t("clearSearch")} className="ml-auto w-full max-w-[260px]" />
            </div>
            {/* The comparison defaults: which clusters the compare and lineage tabs start with (tagged in the rows below). */}
            {total ? (
              <div role="group" aria-labelledby="cluster-defaults-title" className="@container border-b border-[#1f252e] bg-white/[0.015] px-5 py-3">
                <div className="flex flex-col gap-2.5 @3xl:flex-row @3xl:items-center @3xl:gap-6">
                  <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    <GitCompareArrows className="mt-px h-4 w-4 shrink-0 text-[#8c96a8]" aria-hidden="true" />
                    <div className="min-w-0">
                      <p id="cluster-defaults-title" className="text-[12.5px] font-medium leading-4 text-[#e5e9f0]">{t("defaultsTitle")}</p>
                      <p className="mt-0.5 text-[11.5px] leading-4 text-[#8c96a8]">{t("defaultsDescription")}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 @3xl:w-[min(440px,54%)] @3xl:shrink-0">
                    <DefaultClusterSelect
                      label={t("baseCluster")}
                      tag={t("baseTag")}
                      tone="sky"
                      value={baseClusterId}
                      clusters={clusters ?? []}
                      noneLabel={t("none")}
                      onChange={setBaseClusterId}
                    />
                    <ArrowRight className="h-3.5 w-3.5 text-[#5d6878]" aria-hidden="true" />
                    <DefaultClusterSelect
                      label={t("comparisonCluster")}
                      tag={t("comparisonTag")}
                      tone="amber"
                      value={comparisonClusterId}
                      clusters={clusters ?? []}
                      noneLabel={t("none")}
                      onChange={setComparisonClusterId}
                    />
                  </div>
                </div>
              </div>
            ) : null}
            {loading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((index) => <Skeleton key={index} className="h-[58px] w-full bg-[#121821]" />)}
              </div>
            ) : loadFailed && !total ? (
              <EmptyState icon={Boxes} title={t("loadFailed")}>
                <button type="button" className={SECONDARY_BUTTON} onClick={() => void loadAll()}>
                  <RefreshCw className="h-4 w-4" />
                  {t("retry")}
                </button>
              </EmptyState>
            ) : !total ? (
              <EmptyState icon={Boxes} title={t("emptyTitle")} hint={t("emptyHint")} />
            ) : !visible.length ? (
              <p className="px-5 py-8 text-center text-[12.5px] text-[#8c96a8]">{t("noMatch", { query: query.trim() })}</p>
            ) : (
              <div ref={listRef} role="listbox" aria-label={t("listTitle")} tabIndex={-1} onKeyDown={onListKeyDown} className="max-h-[420px] overflow-y-auto p-2">
                {visible.map((cluster) => {
                  const active = cluster.id === selectedId;
                  const clusterRuns = runsByCluster[cluster.id] ?? [];
                  const lastRun = clusterRuns[0]?.executed_date;
                  return (
                    <div
                      key={cluster.id}
                      role="option"
                      aria-selected={active}
                      tabIndex={active || (!selectedId && cluster === visible[0]) ? 0 : -1}
                      data-cluster-row={cluster.id}
                      onClick={() => setSelectedId(cluster.id)}
                      onDoubleClick={() => openEdit(cluster)}
                      className={cn(
                        "group flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#f5c400]/40",
                        active ? "border-[#f5c400]/45 bg-[#f5c400]/[0.05]" : "border-transparent hover:border-[#252a33] hover:bg-white/[0.02]",
                      )}
                    >
                      <span className={cn("h-8 w-1 shrink-0 rounded-full", active ? "bg-[#f5c400]" : "bg-[#252a33]")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-[13.5px] font-semibold text-white">{cluster.name}</span>
                          {cluster.is_reference ? (
                            <Tag tone="gold">
                              <Star className="h-3 w-3" />
                              {t("referenceTag")}
                            </Tag>
                          ) : null}
                          {cluster.id === baseClusterId ? <Tag tone="sky">{t("baseTag")}</Tag> : null}
                          {cluster.id === comparisonClusterId ? <Tag tone="amber">{t("comparisonTag")}</Tag> : null}
                        </div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-[#8c96a8]">
                          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDay(cluster.reporting_date, locale)}</span>
                          <span className={cn("inline-flex min-w-0 items-center gap-1", !cluster.dataset_name && "text-amber-300")}>
                            <Database className="h-3 w-3 shrink-0" />
                            <span className="truncate">{cluster.dataset_name ? withVersion(cluster.dataset_name, cluster.dataset_version) : t("missing")}</span>
                          </span>
                          <span className={cn("inline-flex min-w-0 items-center gap-1", !cluster.code_filename && "text-amber-300")}>
                            <FileCode2 className="h-3 w-3 shrink-0" />
                            <span className="truncate font-mono">{cluster.code_filename ? withVersion(cluster.code_filename, cluster.code_version) : t("missing")}</span>
                          </span>
                        </div>
                      </div>
                      <div className="hidden shrink-0 text-right text-[11.5px] sm:block">
                        <p className="text-[#c9d1dc]">{t("runCount", { count: clusterRuns.length })}</p>
                        <p className="text-[#687386]" title={lastRun ? formatDateTime(lastRun, locale) : undefined}>{lastRun ? relativeTime(lastRun, locale) : t("neverRun")}</p>
                      </div>
                      <IconAction label={t("editLabel", { name: cluster.name })} onClick={() => openEdit(cluster)} className="opacity-60 group-hover:opacity-100">
                        <Pencil className="h-3.5 w-3.5" />
                      </IconAction>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {selected ? (
            <section className={PANEL} aria-label={selected.name}>
              <div className="flex flex-wrap items-start gap-3 border-b border-[#1f252e] px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[16px] font-semibold text-white">{selected.name}</h3>
                    {selected.is_reference ? (
                      <Tag tone="gold">
                        <Star className="h-3 w-3" />
                        {t("referenceTag")}
                      </Tag>
                    ) : null}
                    {selected.id === baseClusterId ? <Tag tone="sky">{t("baseTag")}</Tag> : null}
                    {selected.id === comparisonClusterId ? <Tag tone="amber">{t("comparisonTag")}</Tag> : null}
                  </div>
                  {selected.description ? <p className="mt-1 text-[12.5px] leading-5 text-[#aab3c2]">{selected.description}</p> : null}
                </div>
                <button type="button" className={SECONDARY_BUTTON} onClick={() => openEdit(selected)}>
                  <Pencil className="h-4 w-4" />
                  {t("edit")}
                </button>
              </div>
              <div className="grid gap-2.5 px-5 pt-4 sm:grid-cols-2 2xl:grid-cols-4">
                <FactTile icon={CalendarDays} label={t("reportingDate")} value={formatDay(selected.reporting_date, locale)} />
                <FactTile icon={Database} label={t("dataset")} value={selected.dataset_name ? withVersion(selected.dataset_name, selected.dataset_version) : t("missing")} warning={!selected.dataset_name} />
                <FactTile icon={FileCode2} label={t("code")} value={selected.code_filename ? withVersion(selected.code_filename, selected.code_version) : t("missing")} mono={Boolean(selected.code_filename)} warning={!selected.code_filename} />
                <FactTile icon={Clock3} label={t("createdLabel")} value={formatDateTime(selected.created_date, locale)} />
              </div>

              <div className="px-5 pb-5 pt-4">
                <div className="mb-2 flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-[#8c96a8]" />
                  <span className={EYEBROW}>{t("runsTitle")}</span>
                  <Tag className="font-mono">{selectedRuns.length}</Tag>
                </div>
                {!selectedRuns.length ? (
                  <p className="rounded-lg border border-dashed border-[#2a313c] px-4 py-6 text-center text-[12.5px] text-[#8c96a8]">{t("noRuns")}</p>
                ) : (
                  <div className="max-h-[320px] overflow-auto rounded-lg border border-[#1f252e]">
                    <table className="w-full border-separate border-spacing-0 text-[12.5px]">
                      <thead className="sticky top-0 z-10 bg-[#0f141b]">
                        <tr className="whitespace-nowrap text-left text-[10.5px] uppercase tracking-[0.14em] text-[#687386]">
                          <th scope="col" className="border-b border-[#1f252e] px-4 py-2 font-semibold">{t("colRun")}</th>
                          <th scope="col" className="border-b border-[#1f252e] px-3 py-2 font-semibold">{t("dataset")}</th>
                          <th scope="col" className="border-b border-[#1f252e] px-3 py-2 font-semibold">{t("code")}</th>
                          <th scope="col" className="border-b border-[#1f252e] px-3 py-2 text-right font-semibold max-2xl:w-px max-2xl:whitespace-normal">{t("colValues")}</th>
                          <th scope="col" className="w-[84px] border-b border-[#1f252e] px-4 py-2"><span className="sr-only">{t("colActions")}</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRuns.map((run) => (
                          <tr key={run.id} className="transition-colors hover:bg-white/[0.02]">
                            <td className="whitespace-nowrap border-b border-[#161b22] px-4 py-2.5">
                              <span className="block text-[#e5e9f0]">{formatDateTime(run.executed_date, locale)}</span>
                              <span className="text-[11px] text-[#687386]">{relativeTime(run.executed_date, locale)}</span>
                            </td>
                            {/* Dataset and code share the width left over (max-w-0) and truncate, so the actions never scroll out of view. */}
                            <td className="w-[22%] max-w-0 truncate border-b border-[#161b22] px-3 py-2.5 text-[#c9d1dc]" title={withVersion(run.dataset_name, run.dataset_version)}>{withVersion(run.dataset_name, run.dataset_version)}</td>
                            <td className="w-[28%] max-w-0 truncate border-b border-[#161b22] px-3 py-2.5 font-mono text-[12px] text-[#c9d1dc]" title={withVersion(run.code_filename, run.code_version)}>{withVersion(run.code_filename, run.code_version)}</td>
                            <td className="border-b border-[#161b22] px-3 py-2.5 text-right font-mono tabular-nums text-emerald-300">{(run.summary?.total_values_computed ?? 0).toLocaleString(locale)}</td>
                            <td className="border-b border-[#161b22] px-4 py-2.5">
                              <div className="flex items-center justify-end gap-0.5">
                                <IconAction label={t("viewData")} onClick={() => setViewing(run)}>
                                  <Maximize2 className="h-3.5 w-3.5" />
                                </IconAction>
                                <IconAction label={t("removeRun")} tone="danger" onClick={() => setRunToRemove(run)} disabled={removingRun}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </IconAction>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          ) : !loading && total ? (
            <section className={PANEL}>
              <EmptyState icon={History} title={t("pickTitle")} hint={t("pickHint")} className="py-10" />
            </section>
          ) : null}
        </div>
      </div>

      {/* Edit */}
      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !savingEdit) setEditing(null); }}>
        <DialogContent className="border-[#252a33] bg-[#0b0f15] sm:max-w-2xl">
          <form onSubmit={(event) => void saveEdit(event)} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-white">{t("editTitle")}</DialogTitle>
              <DialogDescription className="text-[#8c96a8]">{t("editDescription")}</DialogDescription>
            </DialogHeader>
            {editing ? (
              <>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <Field label={t("name")} required htmlFor="edit-cluster-name" error={editNameTaken ? t("nameTaken") : undefined}>
                    <input id="edit-cluster-name" className={cn(INPUT, editNameTaken && "border-rose-400/60")} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} aria-invalid={editNameTaken} />
                  </Field>
                  <Field label={t("reportingDate")} required htmlFor="edit-cluster-date">
                    <input id="edit-cluster-date" type="date" className={cn(INPUT, "[color-scheme:dark]")} value={editForm.reporting_date} onChange={(event) => setEditForm({ ...editForm, reporting_date: event.target.value })} />
                  </Field>
                  <Field label={t("dataset")}>
                    <Select value={editForm.dataset_id} onValueChange={(value) => setEditForm({ ...editForm, dataset_id: value })}>
                      <SelectTrigger className={TRIGGER} aria-label={t("dataset")}>
                        <SelectValue placeholder={t("selectDataset")} />
                      </SelectTrigger>
                      <SelectContent>
                        {datasets.map((dataset) => <SelectItem key={dataset.id} value={dataset.id}>{withVersion(dataset.user_name || dataset.filename, dataset.version)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={t("code")}>
                    <Select value={editForm.code_id} onValueChange={(value) => setEditForm({ ...editForm, code_id: value })}>
                      <SelectTrigger className={TRIGGER} aria-label={t("code")}>
                        <SelectValue placeholder={t("selectCode")} />
                      </SelectTrigger>
                      <SelectContent>
                        {codeFiles.map((code) => <SelectItem key={code.id} value={code.id}>{withVersion(code.filename, code.version)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <FactTile icon={Star} label={t("status")} value={editing.is_reference ? t("referenceTag") : t("standard")} />
                  <FactTile icon={Clock3} label={t("createdLabel")} value={formatDateTime(editing.created_date, locale)} />
                </div>
                {editing.description ? (
                  <div className="rounded-lg border border-[#1f252e] bg-[#0f141b] px-3 py-2">
                    <p className={EYEBROW}>{t("descriptionLabel")}</p>
                    <p className="mt-0.5 text-[12.5px] leading-5 text-[#c9d1dc]">{editing.description}</p>
                  </div>
                ) : null}
                {editError ? <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-400/[0.07] px-3 py-2 text-[12.5px] text-rose-200">{editError}</p> : null}
                <DialogFooter className="items-center gap-2 border-t border-[#1f252e] pt-4 sm:justify-between">
                  <button type="button" className={cn(SECONDARY_BUTTON, "border-rose-400/30 text-rose-300 hover:border-rose-400/60 hover:text-rose-200")} onClick={() => setConfirmDelete(editing)} disabled={savingEdit}>
                    <Trash2 className="h-4 w-4" />
                    {t("deleteCluster")}
                  </button>
                  <div className="flex gap-2">
                    <button type="button" className={SECONDARY_BUTTON} onClick={() => setEditing(null)} disabled={savingEdit}>{t("cancel")}</button>
                    <button type="submit" className={PRIMARY_BUTTON} disabled={!canSaveEdit}>
                      {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {savingEdit ? t("saving") : t("save")}
                    </button>
                  </div>
                </DialogFooter>
              </>
            ) : null}
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete cluster */}
      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => { if (!open && !deleting) setConfirmDelete(null); }}>
        <AlertDialogContent className="border-[#252a33] bg-[#0b0f15]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{t("deleteTitle", { name: confirmDelete?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription className="text-[#aab3c2]">
              {t("deleteBody", { count: confirmDelete ? (runsByCluster[confirmDelete.id] ?? []).length : 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void deleteCluster();
              }}
            >
              {deleting ? t("deleting") : t("deleteAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove a run from the history */}
      <AlertDialog open={runToRemove !== null} onOpenChange={(open) => { if (!open && !removingRun) setRunToRemove(null); }}>
        <AlertDialogContent className="border-[#252a33] bg-[#0b0f15]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{t("removeRunTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-[#aab3c2]">
              {t("removeRunBody", { time: runToRemove ? formatDateTime(runToRemove.executed_date, locale) : "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingRun}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              disabled={removingRun}
              onClick={(event) => {
                event.preventDefault();
                void removeRun();
              }}
            >
              {removingRun ? t("removing") : t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RunDataDialog
        executionId={viewing?.execution_id ?? null}
        title={t("runOf", { cluster: selected?.name ?? "" })}
        description={viewing ? `${formatDateTime(viewing.executed_date, locale)} · ${withVersion(viewing.dataset_name, viewing.dataset_version)} · ${withVersion(viewing.code_filename, viewing.code_version)}` : undefined}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}

const NO_CLUSTER = "__none__";

/** One comparison default: the tag its cluster carries in the list, then the chosen cluster. */
function DefaultClusterSelect({ label, tag, tone, value, clusters, noneLabel, onChange }: {
  label: string;
  tag: string;
  tone: "sky" | "amber";
  value: string;
  clusters: Cluster[];
  noneLabel: string;
  onChange: (clusterId: string) => void;
}) {
  const chosen = clusters.find((cluster) => cluster.id === value);
  return (
    <Select value={value || NO_CLUSTER} onValueChange={(next) => onChange(next === NO_CLUSTER ? "" : next)}>
      <SelectTrigger className={cn(TRIGGER, "gap-2 pl-1.5", !value && "text-[#8c96a8]")} aria-label={label} title={chosen ? `${label}: ${chosen.name}` : label}>
        <Tag tone={tone} className="shrink-0">{tag}</Tag>
        <span className="min-w-0 flex-1 truncate text-left">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_CLUSTER}>{noneLabel}</SelectItem>
        {clusters.map((cluster) => <SelectItem key={cluster.id} value={cluster.id}>{cluster.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function PanelHeading({ icon: Icon, title, description }: { icon: typeof Plus; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-[#1f252e] px-5 py-3.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#252a33] bg-[#0f141b]">
        <Icon className="h-4 w-4 text-[#aab3c2]" />
      </span>
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold text-white">{title}</h3>
        <p className="mt-0.5 text-[12px] leading-[18px] text-[#8c96a8]">{description}</p>
      </div>
    </div>
  );
}

function Field({ label, required, htmlFor, error, children }: { label: string; required?: boolean; htmlFor?: string; error?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-[12px] font-medium text-[#c9d1dc]">
        {label}
        {required ? <span className="text-[#f5c400]" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {error ? <p className="text-[11.5px] text-rose-300">{error}</p> : null}
    </div>
  );
}
