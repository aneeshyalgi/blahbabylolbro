"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle, Braces, Check, Code2, Copy, Download, FileCode2, Loader2, PenLine, RefreshCw, Save, SlidersHorizontal, Sparkles, Trash2,
  Upload, X,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { parseGuidedCode } from "@/lib/guided-code";
import { GuidedCodeEditor } from "@/components/guided-code-editor";
import { CodeEditor } from "@/components/code/code-editor";
import { GeneratePanel, type CodeFile } from "@/components/code/generate-panel";
import type { DatasetSummary } from "@/components/datasets-section";
import {
  DropOverlay, EmptyState, INPUT, IconAction, PANEL, PRIMARY_BUTTON, SECONDARY_BUTTON, SearchField, Tag, WorkingBar,
  formatBytes, formatDateTime, moveInList, PageHeader, relativeTime, useFileDrop,
} from "@/components/workspace/ui";

type ClusterRef = { id: string; name: string; code_id?: string | null };
type Mode = "guided" | "python";
/** What waits for "Discard": another file, or leaving edit mode. */
type DiscardIntent = { kind: "select"; id: string } | { kind: "cancel" };

const SELECTED_KEY = "dataflow_code_selected_id";
const MODE_KEY = "dataflow_code_editor_mode";
const PYTHON_FILE = /\.py$/i;

const readStored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStored = (key: string, value: string | null) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage unavailable: remembered for this visit only.
  }
};

interface CodeTabContentProps {
  isLoading?: boolean;
}

/**
 * The Code tab: the Python files the runs execute (browse, edit in the guided or Python editor, upload, delete) and AI
 * generation of a new file from a dataset.
 */
export function CodeTabContent({ isLoading = false }: CodeTabContentProps) {
  const t = useTranslations("codeTab");
  const locale = useLocale();
  const { toast } = useToast();
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [clusters, setClusters] = useState<ClusterRef[]>([]);
  const [runsByCluster, setRunsByCluster] = useState<Record<string, number>>({});
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesFailed, setFilesFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentFailed, setContentFailed] = useState(false);
  const [contentReload, setContentReload] = useState(0);
  const [preferredMode, setPreferredMode] = useState<Mode>("guided");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; line: number | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [discard, setDiscard] = useState<DiscardIntent | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [version, setVersion] = useState("v1.0.0");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<CodeFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const generator = useRef<HTMLElement | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;
  const savingRef = useRef(false);

  const dirty = editing && draft !== content;
  const selectedFile = files.find((file) => file.id === selectedId) ?? null;

  useEffect(() => {
    const mode = readStored(MODE_KEY);
    if (mode === "guided" || mode === "python") setPreferredMode(mode);
  }, []);

  /** Loads the files (and the clusters that use them); keeps the selection, else the remembered file, else the first. */
  const loadFiles = useCallback(async (prefer?: string | null) => {
    setFilesLoading(true);
    setFilesFailed(false);
    try {
      const [codeResponse, clustersResponse, runsResponse] = await Promise.all([
        fetch(API_ENDPOINTS.code),
        fetch(API_ENDPOINTS.clusters).catch(() => null),
        fetch(API_ENDPOINTS.clustersExecutions).catch(() => null),
      ]);
      if (!codeResponse.ok) throw new Error(`HTTP ${codeResponse.status}`);
      const loaded: CodeFile[] = (await codeResponse.json()).code_files ?? [];
      setFiles(loaded);
      setClusters(clustersResponse?.ok ? ((await clustersResponse.json()).clusters ?? []) : []);
      const runs: { cluster_id: string }[] = runsResponse?.ok ? ((await runsResponse.json()).executions ?? []) : [];
      const counts: Record<string, number> = {};
      for (const run of runs) counts[run.cluster_id] = (counts[run.cluster_id] ?? 0) + 1;
      setRunsByCluster(counts);
      const keep = [prefer, selectedRef.current, readStored(SELECTED_KEY)].find((id) => id && loaded.some((file) => file.id === id));
      setSelectedId(keep ?? loaded[0]?.id ?? null);
    } catch {
      setFilesFailed(true);
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
    fetch(API_ENDPOINTS.datasets)
      .then((response) => (response.ok ? response.json() : { datasets: [] }))
      .then((payload) => setDatasets(payload.datasets ?? []))
      .catch(() => setDatasets([]));
  }, [loadFiles]);

  useEffect(() => {
    if (!filesLoading) writeStored(SELECTED_KEY, selectedId);
  }, [selectedId, filesLoading]);

  useEffect(() => {
    setEditing(false);
    setSaveError(null);
    setCopied(false);
    if (!selectedId) {
      setContent("");
      setDraft("");
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    setContentFailed(false);
    fetch(API_ENDPOINTS.codeById(selectedId))
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (cancelled) return;
        setContent(payload.content ?? "");
        setDraft(payload.content ?? "");
      })
      .catch(() => {
        if (!cancelled) setContentFailed(true);
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, contentReload]);

  // Leaving the page with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const usage = useMemo(() => {
    const byCode = new Map<string, ClusterRef[]>();
    for (const cluster of clusters) if (cluster.code_id) byCode.set(cluster.code_id, [...(byCode.get(cluster.code_id) ?? []), cluster]);
    return byCode;
  }, [clusters]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return files;
    return files.filter((file) => `${file.filename ?? ""} ${file.description ?? ""} ${file.version ?? ""}`.toLowerCase().includes(needle));
  }, [files, query]);

  // The guided view needs mappings or formulas it can show; other files open in Python.
  const hasGuided = useMemo(() => {
    const document = parseGuidedCode(content);
    return document.mappings.length > 0 || document.rules.length > 0;
  }, [content]);
  const mode: Mode = preferredMode === "guided" && hasGuided ? "guided" : "python";
  const lineCount = useMemo(() => (content ? content.replace(/\n$/, "").split("\n").length : 0), [content]);

  const chooseMode = (next: Mode) => {
    setPreferredMode(next);
    writeStored(MODE_KEY, next);
  };

  const selectFile = (id: string) => {
    if (id === selectedId) return;
    if (dirty) {
      setDiscard({ kind: "select", id });
      return;
    }
    setSelectedId(id);
  };

  const cancelEdit = () => {
    if (dirty) {
      setDiscard({ kind: "cancel" });
      return;
    }
    setDraft(content);
    setEditing(false);
    setSaveError(null);
  };

  const confirmDiscard = () => {
    const intent = discard;
    setDiscard(null);
    setDraft(content);
    setEditing(false);
    setSaveError(null);
    if (intent?.kind === "select") setSelectedId(intent.id);
  };

  const save = async () => {
    // A ref, not the state: two save requests in the same tick (a repeated shortcut) would both see `saving` false.
    if (!selectedId || !editing || savingRef.current) return;
    if (!dirty) {
      setEditing(false);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(API_ENDPOINTS.codeById(selectedId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload?.detail === "string" ? payload.detail : `HTTP ${response.status}`);
      setContent(draft);
      setEditing(false);
      toast({ title: t("saved"), description: t("savedDesc", { name: selectedFile?.filename ?? "" }) });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("saveFailed");
      const line = Number(message.match(/line (\d+)/i)?.[1]) || null;
      setSaveError({ message, line });
      // A syntax error is easiest to fix where the line is shown.
      if (line) chooseMode("python");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(editing ? draft : content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({ title: t("copyFailed"), variant: "destructive" });
    }
  };

  const download = () => {
    const blob = new Blob([editing ? draft : content], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = selectedFile?.filename || "code.py";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const chooseUpload = (file: File | null | undefined) => {
    if (!file) return;
    if (!PYTHON_FILE.test(file.name)) {
      toast({ title: t("onlyPython"), variant: "destructive" });
      return;
    }
    setUploadFile(file);
    setVersion("v1.0.0");
    setDescription("");
    setUploadError(null);
  };
  const drop = useFileDrop(chooseUpload, !uploading);
  const uploadNameUsed = Boolean(uploadFile) && files.some((file) => (file.filename ?? "").toLowerCase() === uploadFile!.name.toLowerCase());

  const upload = async () => {
    if (!uploadFile || !version.trim() || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("version", version.trim());
      form.append("description", description.trim());
      const response = await fetch(API_ENDPOINTS.codeUpload, { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload?.detail === "string" ? payload.detail : `HTTP ${response.status}`);
      if (payload.syntax_valid === false) throw new Error(payload.error || t("uploadFailed"));
      toast({ title: t("uploaded"), description: t("uploadedDesc", { name: uploadFile.name, version: version.trim() }) });
      setUploadFile(null);
      if (dirty) {
        // Keep the open file and its edits; the new one is in the list.
        await loadFiles(selectedId);
      } else {
        await loadFiles(payload.id ?? null);
      }
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
      const response = await fetch(API_ENDPOINTS.codeDelete(toDelete.id), { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload?.detail === "string" ? payload.detail : `HTTP ${response.status}`);
      }
      const removed = toDelete;
      setToDelete(null);
      if (removed.id === selectedId) {
        setEditing(false);
        setSelectedId(null);
        selectedRef.current = null;
      }
      await loadFiles();
      toast({ title: t("deleted"), description: t("deletedDesc", { name: removed.filename ?? "" }) });
    } catch (error) {
      toast({ title: t("deleteFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const focusFile = (id: string) =>
    window.requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-file="${CSS.escape(id)}"]`)?.focus());

  const onFileKey = (event: KeyboardEvent<HTMLDivElement>, file: CodeFile) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectFile(file.id);
    } else if (event.key === "Delete") {
      event.preventDefault();
      setToDelete(file);
    } else if (moveInList(event.key, shown, file, (next) => focusFile(next.id))) {
      event.preventDefault();
    }
  };

  const busy = filesLoading || isLoading;
  const deleteClusters = toDelete ? usage.get(toDelete.id) ?? [] : [];
  const deleteRuns = deleteClusters.reduce((sum, cluster) => sum + (runsByCluster[cluster.id] ?? 0), 0);

  return (
    // Bottom room so the last panel can scroll clear of the app's floating assistant button.
    <div className="space-y-5 pb-16">
      <PageHeader icon={Code2} title={t("title")} description={t("description")}>
        <button type="button" className={SECONDARY_BUTTON} onClick={() => generator.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          <Sparkles className="h-4 w-4 text-[#f5c400]" />
          {t("generateWithAi")}
        </button>
        <button type="button" className={PRIMARY_BUTTON} onClick={() => fileInput.current?.click()} disabled={uploading}>
          <Upload className="h-4 w-4" />
          {t("upload")}
        </button>
      </PageHeader>
      <input
        ref={fileInput}
        type="file"
        accept=".py"
        className="hidden"
        onChange={(event) => {
          chooseUpload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <section className={cn(PANEL, "relative flex min-h-[360px] flex-col xl:max-h-[760px]")} aria-label={t("files")} {...drop.handlers}>
          <DropOverlay active={drop.active} title={t("dropTitle")} hint={t("dropHint")} />
          <div className="flex items-center gap-2 border-b border-[#1f252e] px-4 py-3">
            <h3 className="mr-auto text-[14px] font-semibold text-white">
              {t("files")}
              {!busy && files.length ? <span className="ml-2 text-[12px] font-normal text-[#687386]">{t("count", { count: files.length })}</span> : null}
            </h3>
            <IconAction label={t("refresh")} onClick={() => void loadFiles()} disabled={busy}>
              <RefreshCw className={cn("h-4 w-4", filesLoading && "animate-spin")} />
            </IconAction>
          </div>
          {files.length > 0 ? (
            <div className="px-3 pt-3">
              <SearchField value={query} onChange={setQuery} placeholder={t("search")} clearLabel={t("clearSearch")} />
            </div>
          ) : null}
          {busy ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-14 w-full bg-[#121821]" />)}
            </div>
          ) : filesFailed ? (
            <EmptyState icon={AlertTriangle} title={t("loadFailed")}>
              <button type="button" className={SECONDARY_BUTTON} onClick={() => void loadFiles()}>
                <RefreshCw className="h-4 w-4" />
                {t("retry")}
              </button>
            </EmptyState>
          ) : !files.length ? (
            <EmptyState icon={FileCode2} title={t("emptyTitle")} hint={t("emptyHint")} className="flex-1" />
          ) : (
            <div ref={list} role="listbox" aria-label={t("files")} className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
              {shown.map((file) => {
                const selected = file.id === selectedId;
                const used = usage.get(file.id) ?? [];
                const ai = (file.description ?? "").trim().toLowerCase() === "ai generated";
                return (
                  <div
                    key={file.id}
                    role="option"
                    aria-selected={selected}
                    tabIndex={0}
                    data-file={file.id}
                    onClick={() => selectFile(file.id)}
                    onKeyDown={(event) => onFileKey(event, file)}
                    className={cn(
                      "group flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#f5c400]/50",
                      selected ? "bg-[#f5c400]/[0.06] shadow-[inset_3px_0_0_#f5c400]" : "hover:bg-white/[0.03]",
                    )}
                  >
                    <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", selected ? "border-[#f5c400]/40 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#2a313c] bg-[#0f141b] text-sky-300/80")}>
                      <FileCode2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-mono text-[12.5px] font-medium text-white" title={file.filename}>
                        <span className="truncate">{file.filename}</span>
                        {selected && dirty ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#f5c400]" aria-label={t("unsaved")} /> : null}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#687386]">
                        <Tag mono>{file.version || "v1.0.0"}</Tag>
                        <span title={formatDateTime(file.upload_date, locale)}>{relativeTime(file.upload_date, locale)}</span>
                        {ai ? (
                          <Tag tone="gold">
                            <Sparkles className="h-3 w-3" />
                            {t("aiGenerated")}
                          </Tag>
                        ) : null}
                      </div>
                      {used.length ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {used.map((cluster) => (
                            <Tag key={cluster.id} tone="sky" title={t("runs", { count: runsByCluster[cluster.id] ?? 0 })}>{cluster.name}</Tag>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <IconAction
                      label={t("deleteLabel", { name: file.filename ?? "" })}
                      tone="danger"
                      onClick={() => setToDelete(file)}
                      className={cn("opacity-0 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100", selected && "opacity-100")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconAction>
                  </div>
                );
              })}
              {!shown.length ? <p className="px-3 py-6 text-center text-[12.5px] text-[#8c96a8]">{t("noMatch", { query: query.trim() })}</p> : null}
            </div>
          )}
        </section>

        <section
          className={cn(PANEL, "flex min-w-0 flex-col")}
          aria-label={t("editor")}
          onKeyDown={(event) => {
            // The Python editor handles Ctrl+S itself (and marks the event handled); this covers the guided editor.
            if (event.defaultPrevented) return;
            if (editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              void save();
            }
          }}
        >
          {!selectedFile ? (
            <EmptyState icon={FileCode2} title={files.length ? t("selectTitle") : t("noFileTitle")} hint={files.length ? t("selectHint") : t("noFileHint")} className="min-h-[360px]" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-[#1f252e] px-5 py-3.5">
                <div className="mr-auto min-w-0">
                  <p className="flex items-center gap-2 truncate font-mono text-[14px] font-semibold text-white" title={selectedFile.filename}>
                    <FileCode2 className="h-4 w-4 shrink-0 text-[#f5c400]" />
                    <span className="truncate">{selectedFile.filename}</span>
                    {dirty ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-normal text-[#c9a400] [font-family:Inter,sans-serif]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#f5c400]" />
                        {t("unsaved")}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-[#8c96a8]">
                    <span className="font-mono">{selectedFile.version || "v1.0.0"}</span>
                    {!contentLoading && !contentFailed ? <> · {t("lines", { count: lineCount })}</> : null}
                    {selectedFile.upload_date ? <> · {t("uploadedOn", { date: formatDateTime(selectedFile.upload_date, locale) })}</> : null}
                    {selectedFile.description ? <> · {selectedFile.description}</> : null}
                  </p>
                </div>
                <div role="tablist" aria-label={t("modeLabel")} className="flex rounded-lg border border-[#252a33] bg-[#0f141b] p-0.5">
                  {([["guided", SlidersHorizontal, t("modeGuided")], ["python", Braces, t("modePython")]] as const).map(([value, Icon, label]) => {
                    const unavailable = value === "guided" && !hasGuided;
                    const button = (
                      <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={mode === value}
                        aria-disabled={unavailable}
                        onClick={() => !unavailable && chooseMode(value)}
                        className={cn(
                          "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors",
                          mode === value ? "bg-[#f5c400]/12 text-[#f5c400] shadow-[inset_0_0_0_1px_rgba(245,196,0,0.3)]" : "text-[#8c96a8] hover:text-white",
                          unavailable && "cursor-not-allowed opacity-40 hover:text-[#8c96a8]",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    );
                    return unavailable ? (
                      <Tooltip key={value}>
                        <TooltipTrigger asChild>{button}</TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">{t("guidedUnavailable")}</TooltipContent>
                      </Tooltip>
                    ) : (
                      button
                    );
                  })}
                </div>
                <div className="flex items-center gap-0.5">
                  <IconAction label={copied ? t("copied") : t("copy")} onClick={() => void copy()} disabled={contentLoading || contentFailed}>
                    {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
                  </IconAction>
                  <IconAction label={t("download")} onClick={download} disabled={contentLoading || contentFailed}>
                    <Download className="h-4 w-4" />
                  </IconAction>
                </div>
                {editing ? (
                  <div className="flex items-center gap-1.5">
                    <button type="button" className={cn(SECONDARY_BUTTON, "h-8")} onClick={cancelEdit} disabled={saving}>
                      <X className="h-3.5 w-3.5" />
                      {t("cancel")}
                    </button>
                    <button type="button" className={cn(PRIMARY_BUTTON, "h-8 px-3")} onClick={() => void save()} disabled={saving || !dirty}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      {saving ? t("saving") : t("save")}
                    </button>
                  </div>
                ) : (
                  <button type="button" className={cn(SECONDARY_BUTTON, "h-8")} onClick={() => setEditing(true)} disabled={contentLoading || contentFailed}>
                    <PenLine className="h-3.5 w-3.5" />
                    {t("edit")}
                  </button>
                )}
              </div>

              {saveError ? (
                <div role="alert" className="flex items-start gap-2 border-b border-rose-400/20 bg-rose-400/[0.06] px-5 py-2.5 text-[12.5px] text-rose-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{saveError.message}</span>
                </div>
              ) : null}

              <div className="min-h-0 flex-1 p-4">
                {contentLoading || isLoading ? (
                  <Skeleton className="h-[420px] w-full bg-[#10161e]" />
                ) : contentFailed ? (
                  <EmptyState icon={AlertTriangle} title={t("contentFailed")}>
                    <button type="button" className={SECONDARY_BUTTON} onClick={() => setContentReload((value) => value + 1)}>
                      <RefreshCw className="h-4 w-4" />
                      {t("retry")}
                    </button>
                  </EmptyState>
                ) : mode === "guided" ? (
                  <GuidedCodeEditor source={editing ? draft : content} onChange={setDraft} disabled={!editing} />
                ) : (
                  <CodeEditor
                    value={editing ? draft : content}
                    onChange={setDraft}
                    readOnly={!editing}
                    errorLine={saveError?.line ?? null}
                    onSave={() => void save()}
                    label={t("editorLabel", { name: selectedFile.filename ?? "" })}
                    maxHeight="600px"
                  />
                )}
              </div>
              {editing ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#1f252e] px-5 py-2.5 text-[11.5px] text-[#687386]">
                  <span>{mode === "python" ? t("pythonHint") : t("guidedHint")}</span>
                  <span className="ml-auto">{t("saveHint")}</span>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      <GeneratePanel
        ref={generator}
        datasets={datasets}
        codeFiles={files}
        onSaved={(id) => {
          if (dirty) void loadFiles(selectedId);
          else void loadFiles(id);
        }}
      />

      <Dialog open={uploadFile !== null} onOpenChange={(open) => { if (!open && !uploading) setUploadFile(null); }}>
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
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-400/25 bg-sky-400/[0.07] text-sky-300">
                <FileCode2 className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[13px] text-white" title={uploadFile?.name}>{uploadFile?.name}</p>
                <p className="text-[11.5px] text-[#687386]">{uploadFile ? formatBytes(uploadFile.size, locale) : ""}</p>
              </div>
              <button type="button" className="text-[12px] font-medium text-[#f5c400] hover:underline disabled:opacity-50" onClick={() => fileInput.current?.click()} disabled={uploading}>
                {t("changeFile")}
              </button>
            </div>
            {uploadNameUsed ? <p className="rounded-md border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-[12px] text-amber-200">{t("nameUsed")}</p> : null}
            <label className="block space-y-1.5">
              <span className="text-[12px] font-medium text-[#aab3c2]">{t("version")}</span>
              <input className={cn(INPUT, "font-mono")} value={version} onChange={(event) => setVersion(event.target.value)} placeholder="v1.0.0" autoFocus disabled={uploading} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[12px] font-medium text-[#aab3c2]">{t("descriptionLabel")}</span>
              <textarea
                className={cn(INPUT, "h-auto min-h-[76px] resize-y py-2 leading-5")}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("descriptionPlaceholder")}
                disabled={uploading}
              />
            </label>
            {uploading ? <WorkingBar /> : null}
            {uploadError ? (
              <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-400/[0.07] px-3 py-2 text-[12.5px] leading-5 text-rose-200">{uploadError}</p>
            ) : null}
            <DialogFooter className="gap-2">
              <button type="button" className={SECONDARY_BUTTON} onClick={() => setUploadFile(null)} disabled={uploading}>
                {t("cancel")}
              </button>
              <button type="submit" className={PRIMARY_BUTTON} disabled={!version.trim() || uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? t("uploading") : t("uploadAction")}
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
                <p>{t("deleteBody", { name: toDelete?.filename ?? "" })}</p>
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

      <AlertDialog open={discard !== null} onOpenChange={(open) => { if (!open) setDiscard(null); }}>
        <AlertDialogContent className="border-[#252a33] bg-[#0b0f15]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{t("discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-[#aab3c2]">{t("discardBody", { name: selectedFile?.filename ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keepEditing")}</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-500 text-white hover:bg-rose-500/90" onClick={confirmDiscard}>
              {t("discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
