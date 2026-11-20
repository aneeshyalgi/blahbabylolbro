"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Check, CheckCircle2, CircleAlert, Copy, Loader2, Sparkles, Undo2, Wand2, X } from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CodeEditor } from "@/components/code/code-editor";
import { EYEBROW, PANEL, PRIMARY_BUTTON, SECONDARY_BUTTON, WorkingBar } from "@/components/workspace/ui";
import { computedSet, ResultLegend, ResultTable } from "@/components/results/result-table";
import type { DatasetSummary } from "@/components/datasets-section";

export type CodeFile = { id: string; filename?: string; upload_date?: string; version?: string; description?: string };

type ColumnFacts = { name: string; empty: number; total: number };
type TestColumn = { name: string; empty_before: number; filled: number; empty_after: number };
type TestCheck = {
  ok: boolean;
  error?: string | null;
  line?: number | null;
  rows: number;
  filled?: number;
  columns?: TestColumn[];
  new_columns?: string[];
  changed?: number;
  preview?: { columns: string[]; rows: Record<string, unknown>[]; total_rows: number; computed: [number, string][] };
};
type Generated = { code: string; assumptions: string[]; check: TestCheck; datasetName: string; columns: Set<string> };
type Notice = { ok: boolean; text: string; undo?: string };

const DRAFT_KEY = "dataflow_code_generate_draft";
const TRIGGER = "h-9 w-full border-[#252a33] bg-[#0f141b] text-[13px] text-[#e5e9f0] hover:bg-[#121821] dark:bg-[#0f141b] dark:hover:bg-[#121821]";

function StepNumber({ value, done }: { value: number; done: boolean }) {
  return (
    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold", done ? "border-[#f5c400] bg-[#f5c400] text-[#0b0f15]" : "border-[#f5c400]/50 bg-[#f5c400]/10 text-[#f5c400]")}>
      {done ? <Check className="h-3 w-3" strokeWidth={3} /> : value}
    </span>
  );
}

function readDraft(): { datasetId: string; texts: Record<string, string> } {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (parsed && typeof parsed === "object") return { datasetId: String(parsed.datasetId ?? ""), texts: typeof parsed.texts === "object" && parsed.texts ? parsed.texts : {} };
  } catch {
    // Storage unavailable or unreadable: start empty.
  }
  return { datasetId: "", texts: {} };
}

function errorMessage(payload: unknown, status: number): string {
  const detail = (payload as { detail?: unknown } | null)?.detail;
  return typeof detail === "string" && detail ? detail : `HTTP ${status}`;
}

function elapsedText(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * AI writes the Python code for a dataset: pick the dataset, write the rules in one box (or let AI draft them from the
 * table), then review the code with the outcome of its test run - the run the Results tab makes, on the same table -
 * and save it as a new code file.
 */
export const GeneratePanel = forwardRef<HTMLElement, { datasets: DatasetSummary[]; codeFiles: CodeFile[]; onSaved: (id: string | null) => void }>(
  function GeneratePanel({ datasets, codeFiles, onSaved }, ref) {
    const t = useTranslations("codeTab");
    const locale = useLocale();
    const { toast } = useToast();
    const [datasetId, setDatasetId] = useState("");
    const [texts, setTexts] = useState<Record<string, string>>({});
    const [columns, setColumns] = useState<ColumnFacts[]>([]);
    const [loadingColumns, setLoadingColumns] = useState(false);
    const [drafting, setDrafting] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [generating, setGenerating] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [generateError, setGenerateError] = useState<string | null>(null);
    const [generated, setGenerated] = useState<Generated | null>(null);
    const [view, setView] = useState<"code" | "preview">("code");
    const [fileName, setFileName] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const loadedDraft = useRef(false);

    const instructions = texts[datasetId] ?? "";
    const setInstructions = (value: string) => setTexts((previous) => ({ ...previous, [datasetId]: value }));
    const dataset = datasets.find((item) => item.id === datasetId) ?? null;
    const datasetName = dataset ? dataset.user_name || dataset.filename || dataset.id : "";

    // The draft (dataset and instructions) survives switching tabs and reloading the page.
    useEffect(() => {
      const draft = readDraft();
      setTexts(draft.texts);
      if (draft.datasetId) setDatasetId(draft.datasetId);
      loadedDraft.current = true;
    }, []);

    useEffect(() => {
      if (!loadedDraft.current) return;
      try {
        const kept = Object.fromEntries(Object.entries(texts).filter(([id, text]) => id && text.trim()));
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ datasetId, texts: kept }));
      } catch {
        // Storage unavailable: the draft lasts for this visit.
      }
    }, [datasetId, texts]);

    // A dataset that was deleted since is no longer selected.
    useEffect(() => {
      if (datasetId && datasets.length && !datasets.some((item) => item.id === datasetId)) setDatasetId("");
    }, [datasets, datasetId]);

    useEffect(() => {
      setNotice(null);
      setGenerateError(null);
      if (!datasetId) {
        setColumns([]);
        return;
      }
      let cancelled = false;
      setLoadingColumns(true);
      fetch(API_ENDPOINTS.datasetById(datasetId))
        .then((response) => (response.ok ? response.json() : { tables: [] }))
        .then((payload) => {
          if (cancelled) return;
          const list = (payload?.tables?.[0]?.columns ?? []) as { name?: string; null_count?: number; total_count?: number }[];
          setColumns(
            list
              .map((column) => ({ name: (column.name ?? "").trim(), empty: Number(column.null_count ?? 0), total: Number(column.total_count ?? 0) }))
              .filter((column) => column.name),
          );
        })
        .catch(() => {
          if (!cancelled) setColumns([]);
        })
        .finally(() => {
          if (!cancelled) setLoadingColumns(false);
        });
      return () => {
        cancelled = true;
      };
    }, [datasetId]);

    useEffect(() => {
      if (!generating) return;
      setElapsed(0);
      const timer = window.setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
      return () => window.clearInterval(timer);
    }, [generating]);

    // Leaving the tab cancels a generation that is still running.
    useEffect(() => () => abortRef.current?.abort(), []);

    const rows = columns.reduce((most, column) => Math.max(most, column.total), 0);
    const emptyColumns = columns.filter((column) => column.empty > 0);
    const busy = generating || drafting;

    const insertColumn = (name: string) => {
      const area = textareaRef.current;
      if (!area || busy) return;
      const start = area.selectionStart ?? instructions.length;
      const before = instructions.slice(0, start);
      const text = before === "" || before.endsWith("\n") ? `${name}: ` : name;
      area.focus();
      // insertText keeps the browser's undo history; the input event updates the state.
      if (!document.execCommand?.("insertText", false, text)) {
        const end = area.selectionEnd ?? start;
        setInstructions(before + text + instructions.slice(end));
        requestAnimationFrame(() => area.setSelectionRange(start + text.length, start + text.length));
      }
    };

    const draft = async () => {
      if (!datasetId || busy) return;
      const previous = instructions;
      setDrafting(true);
      setNotice(null);
      try {
        const response = await fetch(API_ENDPOINTS.generateColumnInstructions, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataset_id: datasetId, language: locale }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(errorMessage(payload, response.status));
        const text = String(payload?.text ?? "").trim();
        if (!text) throw new Error(t("draftEmpty"));
        setTexts((current) => ({ ...current, [datasetId]: text }));
        setNotice({ ok: true, text: t("autofillDone"), undo: previous });
      } catch (problem) {
        setNotice({ ok: false, text: `${t("autofillFailed")}${problem instanceof Error && problem.message ? `: ${problem.message}` : ""}` });
      } finally {
        setDrafting(false);
      }
    };

    const suggestName = (name: string) => {
      const slug = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "dataset";
      const taken = new Set(codeFiles.map((file) => (file.filename ?? "").toLowerCase()));
      let candidate = `fill_${slug}`;
      for (let index = 2; taken.has(`${candidate}.py`); index += 1) candidate = `fill_${slug}_${index}`;
      return candidate;
    };

    const generate = async () => {
      if (!datasetId || busy) return;
      const controller = new AbortController();
      abortRef.current = controller;
      const name = datasetName;
      const names = new Set(columns.map((column) => column.name));
      setGenerating(true);
      setGenerateError(null);
      setNotice(null);
      try {
        const response = await fetch(API_ENDPOINTS.generateCode, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataset_id: datasetId, prompt: instructions.trim() || undefined, language: locale }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(errorMessage(payload, response.status));
        const code = String(payload?.code ?? "");
        if (!code.trim()) {
          setGenerateError(t("noCode"));
          return;
        }
        setGenerated({
          code,
          assumptions: Array.isArray(payload?.assumptions) ? payload.assumptions.map(String) : [],
          check: (payload?.check ?? { ok: false, rows: 0, error: t("noCheck") }) as TestCheck,
          datasetName: name,
          columns: names,
        });
        setView("code");
        setFileName(suggestName(name));
        setSaveError(null);
        setCopied(false);
      } catch (problem) {
        if (controller.signal.aborted) return;
        setGenerateError(`${t("generateFailed")}${problem instanceof Error && problem.message ? `: ${problem.message}` : ""}`);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setGenerating(false);
      }
    };

    const fullName = useMemo(() => {
      const base = fileName.trim().replace(/\.py$/i, "");
      return base ? `${base}.py` : "";
    }, [fileName]);
    const nameTaken = Boolean(fullName) && codeFiles.some((file) => (file.filename ?? "").toLowerCase() === fullName.toLowerCase());

    const saveAsNew = async () => {
      if (!generated || !fullName || nameTaken || saving) return;
      setSaving(true);
      setSaveError(null);
      try {
        const form = new FormData();
        form.append("file", new File([generated.code], fullName, { type: "text/x-python" }));
        form.append("version", "v1.0.0");
        form.append("description", "AI generated");
        const response = await fetch(API_ENDPOINTS.codeUpload, { method: "POST", body: form });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(errorMessage(payload, response.status));
        setGenerated(null);
        toast({ title: t("savedNew"), description: t("savedNewRun", { name: fullName }) });
        onSaved(payload.id ?? payload.code_id ?? null);
      } catch (problem) {
        setSaveError(problem instanceof Error ? problem.message : t("saveFailed"));
      } finally {
        setSaving(false);
      }
    };

    const copy = async () => {
      if (!generated) return;
      try {
        await navigator.clipboard.writeText(generated.code);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } catch {
        toast({ title: t("copyFailed"), variant: "destructive" });
      }
    };

    const check = generated?.check;
    const remaining = (check?.columns ?? []).reduce((sum, column) => sum + (column.filled > 0 ? column.empty_after : 0), 0);
    const filledColumns = (check?.columns ?? []).filter((column) => column.filled > 0).length;
    const preview = check?.preview;
    const previewComputed = useMemo(() => computedSet(preview?.computed), [preview]);

    return (
      <section ref={ref} className={cn(PANEL, "scroll-mt-4")} aria-label={t("generateTitle")}>
        <div className="flex flex-wrap items-start gap-3 border-b border-[#1f252e] px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#f5c400]/30 bg-[#f5c400]/10">
            <Sparkles className="h-4 w-4 text-[#f5c400]" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold text-white">{t("generateTitle")}</h3>
            <p className="mt-0.5 max-w-3xl text-[12.5px] leading-5 text-[#8c96a8]">{t("generateDescription")}</p>
          </div>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <StepNumber value={1} done={Boolean(datasetId)} />
              <span className="text-[13px] font-semibold text-white">{t("stepDataset")}</span>
            </div>
            <Select value={datasetId || "__none__"} onValueChange={(value) => setDatasetId(value === "__none__" ? "" : value)} disabled={busy}>
              <SelectTrigger className={TRIGGER} aria-label={t("stepDataset")}>
                <SelectValue placeholder={t("selectDataset")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("selectDataset")}</SelectItem>
                {datasets.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.user_name || item.filename || item.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {datasetId ? (
              loadingColumns ? (
                <Skeleton className="h-[46px] w-full bg-[#121821]" />
              ) : (
                <div className="rounded-lg border border-[#1f252e] bg-[#0f141b] px-3 py-2 text-[12px] leading-5">
                  <p className="text-[#c9d1dc]">{t("datasetFacts", { rows, columns: columns.length })}</p>
                  <p className={emptyColumns.length ? "text-amber-300" : "text-emerald-300"}>{t("emptyColumns", { count: emptyColumns.length })}</p>
                </div>
              )
            ) : null}
          </div>

          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <StepNumber value={2} done={Boolean(instructions.trim())} />
              <span className="text-[13px] font-semibold text-white">{t("stepInstructions")}</span>
              <span className="text-[12px] text-[#687386]">{t("optional")}</span>
              <button type="button" className={cn(SECONDARY_BUTTON, "ml-auto h-8")} onClick={() => void draft()} disabled={!datasetId || loadingColumns || busy || !columns.length}>
                {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                {drafting ? t("autofilling") : t("autofill")}
              </button>
            </div>
            <div className={cn("rounded-lg border bg-[#0f141b] transition-colors focus-within:border-[#f5c400]/50", instructions.trim() ? "border-[#f5c400]/25" : "border-[#252a33]", !datasetId && "opacity-60")}>
              <textarea
                ref={textareaRef}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault();
                    void generate();
                  }
                }}
                placeholder={datasetId ? t("instructionsPlaceholder") : t("pickDatasetFirst")}
                disabled={!datasetId || busy}
                aria-label={t("stepInstructions")}
                rows={9}
                spellCheck={false}
                className="block min-h-[180px] w-full resize-y bg-transparent px-3.5 py-3 text-[13px] leading-6 text-[#e5e9f0] outline-none placeholder:text-[#4a5464] disabled:cursor-not-allowed"
              />
              {datasetId && columns.length ? (
                <div className="border-t border-[#1f252e] px-3 py-2.5">
                  <p className="mb-1.5 text-[11px] text-[#687386]">{t("insertColumn")}</p>
                  <div className="flex max-h-[84px] flex-wrap gap-1.5 overflow-y-auto">
                    {columns.map((column) => (
                      <button
                        key={column.name}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertColumn(column.name)}
                        disabled={busy}
                        title={column.empty ? t("columnEmptyTitle", { column: column.name, empty: column.empty, total: column.total }) : t("insertColumnTitle", { column: column.name })}
                        className="inline-flex h-[24px] items-center gap-1.5 rounded border border-[#2a313c] bg-[#121821] px-2 text-[11.5px] text-[#c9d1dc] transition-colors hover:border-[#f5c400]/45 hover:text-white disabled:opacity-50"
                      >
                        {column.name}
                        {column.empty ? <span className="rounded bg-amber-400/10 px-1 font-mono text-[10px] leading-4 text-amber-300">{column.empty}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            {notice ? (
              <p role="status" className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-2 text-[12px] leading-5", notice.ok ? "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-200" : "border-rose-400/30 bg-rose-400/[0.07] text-rose-200")}>
                <span className="min-w-0 flex-1">{notice.text}</span>
                {notice.ok && notice.undo !== undefined ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-medium text-emerald-100 underline-offset-2 hover:underline"
                    onClick={() => {
                      setInstructions(notice.undo ?? "");
                      setNotice(null);
                    }}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    {t("undo")}
                  </button>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#1f252e] px-5 py-3.5">
          {generating ? (
            <div className="mr-auto min-w-[240px] flex-1 space-y-1.5" role="status">
              <p className="text-[12px] text-[#aab3c2]">
                {t("generatingStatus", { dataset: datasetName })} <span className="font-mono text-[#687386]">{elapsedText(elapsed)}</span>
              </p>
              <WorkingBar />
            </div>
          ) : generateError ? (
            <p role="alert" className="mr-auto flex min-w-0 flex-1 items-start gap-2 text-[12px] text-rose-300">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{generateError}</span>
            </p>
          ) : (
            <p className="mr-auto min-w-0 flex-1 text-[12px] text-[#8c96a8]">{datasetId ? t("generateHint") : t("pickDatasetFirst")}</p>
          )}
          {generating ? (
            <button type="button" className={SECONDARY_BUTTON} onClick={() => abortRef.current?.abort()}>
              <X className="h-4 w-4" />
              {t("cancel")}
            </button>
          ) : null}
          <button type="button" className={PRIMARY_BUTTON} onClick={() => void generate()} disabled={!datasetId || busy || loadingColumns}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? t("generating") : t("generate")}
          </button>
        </div>

        <Dialog open={generated !== null} onOpenChange={(open) => { if (!open && !saving) setGenerated(null); }}>
          <DialogContent className="flex max-h-[92vh] flex-col gap-4 overflow-hidden border-[#252a33] bg-[#0b0f15] sm:max-w-[min(1240px,94vw)]">
            <DialogHeader className="pr-8">
              <DialogTitle className="text-white">{t("resultTitle")}</DialogTitle>
              <DialogDescription className="text-[#8c96a8]">{t("resultDescription", { dataset: generated?.datasetName ?? "" })}</DialogDescription>
            </DialogHeader>

            {check ? (
              check.ok ? (
                <div role="status" className={cn("flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-5", remaining ? "border-amber-400/30 bg-amber-400/[0.06] text-amber-100" : "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-100")}>
                  {remaining ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />}
                  <span>
                    <span className="font-semibold">{t("testPassed", { filled: check.filled ?? 0, columns: filledColumns })}</span>{" "}
                    {remaining ? t("testGaps", { count: remaining }) : t("testSameAsResults")}
                  </span>
                </div>
              ) : (
                <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-rose-400/30 bg-rose-400/[0.06] px-3.5 py-2.5 text-[12.5px] leading-5 text-rose-100">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                  <span className="min-w-0">
                    <span className="font-semibold">{check.line ? t("testFailedLine", { line: check.line }) : t("testFailed")}</span>
                    <span className="mt-0.5 block font-mono text-[12px] text-rose-200">{check.error}</span>
                    <span className="mt-1 block text-rose-200/80">{t("testFailedHint")}</span>
                  </span>
                </div>
              )
            ) : null}

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className={cn("min-w-0 space-y-2", preview?.rows?.length && "min-h-[calc(46vh+40px)]")}>
                {preview?.rows?.length ? (
                <div role="tablist" aria-label={t("resultTitle")} className="inline-flex rounded-md border border-[#252a33] bg-[#0f141b] p-0.5">
                  {(["code", "preview"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={view === tab}
                      disabled={tab === "preview" && !preview?.rows?.length}
                      onClick={() => setView(tab)}
                      className={cn("h-7 rounded px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40", view === tab ? "bg-[#f5c400] text-[#0b0f15]" : "text-[#aab3c2] hover:text-white")}
                    >
                      {tab === "code" ? t("tabCode") : t("tabPreview", { rows: preview?.total_rows ?? 0 })}
                    </button>
                  ))}
                </div>
                ) : null}
                {view === "preview" && preview?.rows?.length ? (
                  <div className="space-y-2">
                    <ResultTable columns={preview.columns} rows={preview.rows} computed={previewComputed} locale={locale} maxHeight="46vh" />
                    <ResultLegend computedLabel={t("legendComputed")} emptyLabel={t("legendEmpty")}>
                      {preview.total_rows > preview.rows.length ? <span>{t("previewLimited", { shown: preview.rows.length, total: preview.total_rows })}</span> : null}
                    </ResultLegend>
                  </div>
                ) : (
                  <CodeEditor value={generated?.code ?? ""} readOnly label={t("generatedCode")} maxHeight="46vh" columns={generated?.columns} errorLine={check && !check.ok ? check.line ?? null : null} />
                )}
              </div>

              <aside className="min-w-0 space-y-4">
                {check?.columns?.length ? (
                  <div>
                    <p className={EYEBROW}>{t("columnsFilled")}</p>
                    <ul className="mt-2 space-y-1">
                      {check.columns.map((column) => {
                        const complete = column.empty_after === 0;
                        return (
                          <li key={column.name} className="flex items-center gap-2 rounded-md border border-[#1f252e] bg-[#0f141b] px-2.5 py-1.5 text-[12px]">
                            {column.filled > 0 && complete ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                            ) : column.filled > 0 ? (
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                            ) : (
                              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center"><span className="h-1.5 w-1.5 rounded-full bg-[#3d4655]" /></span>
                            )}
                            <span className="min-w-0 flex-1 truncate text-[#dbe2ec]" title={column.name}>{column.name}</span>
                            <span className={cn("shrink-0 font-mono text-[11px]", column.filled ? "text-emerald-300" : "text-[#687386]")} title={t("columnFilledTitle", { filled: column.filled, empty: column.empty_before })}>
                              {column.filled}/{column.empty_before}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    {check.new_columns?.length ? <p className="mt-2 text-[11.5px] text-[#8c96a8]">{t("newColumns", { columns: check.new_columns.join(", ") })}</p> : null}
                    {check.changed ? <p className="mt-2 text-[11.5px] text-amber-300">{t("changedValues", { count: check.changed })}</p> : null}
                  </div>
                ) : null}
                {generated?.assumptions.length ? (
                  <div>
                    <p className={EYEBROW}>{t("assumptions")}</p>
                    <p className="mt-1 text-[11.5px] leading-4 text-[#8c96a8]">{t("assumptionsHint")}</p>
                    <ul className="mt-2 space-y-1.5">
                      {generated.assumptions.map((item, index) => (
                        <li key={index} className="flex gap-2 rounded-md border border-amber-400/20 bg-amber-400/[0.04] px-2.5 py-1.5 text-[12px] leading-[18px] text-[#e5e1cf]">
                          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                          <span className="min-w-0">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : check?.ok ? (
                  <p className="flex items-center gap-1.5 text-[11.5px] text-[#8c96a8]">
                    <Check className="h-3.5 w-3.5 text-emerald-300" />
                    {t("noAssumptions")}
                  </p>
                ) : null}
              </aside>
            </div>

            <form
              className="space-y-1.5 border-t border-[#1f252e] pt-3.5"
              onSubmit={(event) => {
                event.preventDefault();
                void saveAsNew();
              }}
            >
              <span className={EYEBROW}>{t("fileName")}</span>
              <div className="flex flex-wrap items-center gap-2">
                <div className={cn("flex h-9 min-w-[220px] flex-1 items-center rounded-md border bg-[#0f141b] pr-3 transition-colors focus-within:border-[#f5c400]/50", nameTaken ? "border-rose-400/60" : "border-[#252a33]")}>
                  <input
                    value={fileName}
                    onChange={(event) => setFileName(event.target.value)}
                    placeholder={t("fileNamePlaceholder")}
                    aria-label={t("fileName")}
                    aria-invalid={nameTaken}
                    className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] text-white outline-none placeholder:text-[#4a5464]"
                  />
                  <span className="font-mono text-[13px] text-[#687386]">.py</span>
                </div>
                <button type="button" className={SECONDARY_BUTTON} onClick={() => void copy()}>
                  {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
                  {copied ? t("copied") : t("copy")}
                </button>
                <button type="button" className={SECONDARY_BUTTON} onClick={() => setGenerated(null)} disabled={saving}>
                  {t("discard")}
                </button>
                <button type="submit" className={PRIMARY_BUTTON} disabled={!fullName || nameTaken || saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {saving ? t("saving") : t("saveAsNew")}
                </button>
              </div>
              {nameTaken ? <p className="text-[11.5px] text-rose-300">{t("fileNameTaken", { name: fullName })}</p> : null}
              {saveError ? <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-400/[0.07] px-3 py-2 text-[12.5px] text-rose-200">{saveError}</p> : null}
              {generated && check && !check.ok ? <p className="text-[11.5px] text-[#8c96a8]">{t("saveFailingHint")}</p> : null}
            </form>
          </DialogContent>
        </Dialog>

      </section>
    );
  },
);
