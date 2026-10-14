"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, BadgeCheck, Crosshair, FileSpreadsheet, GraduationCap, History, Plus, Trash2, TriangleAlert, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_ENDPOINTS } from "@/lib/api-config";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { SectionLanguageProvider, SectionLanguageSwitch } from "@/components/section-language";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { downloadFrom } from "@/components/lineage-agent/download";
import { formatDateTime, formatDuration } from "./atoms";
import { LineageView } from "./lineage-view";
import { Model, isForwardResult } from "./model";
import { CONTENT_ONBOARDING_STORAGE_KEY, ContentOnboarding, type ContentTourController } from "./onboarding/content-onboarding";
import { RunProgress } from "./run-progress";
import { SetupPanel } from "./setup-panel";
import type { Preview, Run, RunListItem, Sources } from "./types";

const POLL_MS = 1000;

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

/** The field the guided tour (and "Do it for me") follows: the one whose content reaches the most fields. */
export function suggestedField(preview: Preview): string | null {
  const order = { source: 0, derived: 1, intermediate: 2 } as const;
  const candidates = preview.fields.filter((item) => item.fields.length > 0);
  candidates.sort((a, b) => b.fields.length - a.fields.length || b.ends.length - a.ends.length || order[a.origin] - order[b.origin]);
  return candidates[0]?.column ?? null;
}

/** The tab has its own English / German switch (independent of the app language). */
export function ContentLineageAgentTabContent() {
  return (
    <SectionLanguageProvider storageKey="dataflow_content_lineage_language">
      <ContentLineageAgentTab />
    </SectionLanguageProvider>
  );
}

function ContentLineageAgentTab() {
  const t = useTranslations("contentLineageAgent");
  const locale = useLocale();
  const { toast } = useToast();
  const [sources, setSources] = useState<Sources | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [view, setView] = useState<"setup" | "run">("setup");
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [field, setField] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // The field whose details are shown next to the lineage (none: the followed field itself).
  const [selected, setSelected] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  // While the hands-on tour is open, the analysis it starts is followed by the tour; its progress view stays on
  // screen while the tour explains it, also after the analysis has finished.
  const [tourMode, setTourMode] = useState(false);
  const [tourRunId, setTourRunId] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(false);
  const tourAutoStarted = useRef(false);
  // "Do it for me" on the field step before the execution's fields have arrived: select one once they are there.
  const pendingField = useRef(false);
  const initialised = useRef(false);
  const messages = useRef({ t, toast });
  messages.current = { t, toast };

  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const response = await fetch(API_ENDPOINTS.contentLineageAgentSources);
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.detail || t("errors.load"));
      setSources(payload);
      // Keep the selection only while the execution still exists.
      setSelectedExecution((current) => (current && (payload as Sources).clusters.some((cluster) => cluster.executions.some((item) => item.execution_id === current)) ? current : null));
    } catch (error) {
      toast({ title: t("errors.load"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoadingSources(false);
    }
  }, [t, toast]);

  const loadRuns = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.contentLineageAgentRuns);
      const payload = await readJson(response);
      const list = (payload.runs ?? []) as RunListItem[];
      setRuns(list);
      return list;
    } catch {
      return [] as RunListItem[];
    }
  }, []);

  const openRun = useCallback(async (id: string, lite = false) => {
    const response = await fetch(lite ? API_ENDPOINTS.contentLineageAgentRunProgress(id) : API_ENDPOINTS.contentLineageAgentRun(id));
    const payload = await readJson(response);
    if (!response.ok) throw new Error(payload.detail || t("errors.load"));
    setRun(payload);
    setView("run");
    if (!lite) setSelected(null);
    return payload as Run;
  }, [t]);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    void loadSources();
    void loadRuns().then(async (list) => {
      // The tab opens on a fresh setup; finished runs stay in the Analyses menu. A run still in progress is shown again.
      const active = list.find((item) => item.status === "running");
      if (active) {
        try {
          await openRun(active.id, true);
        } catch {
          setView("setup");
        }
      }
    });
  }, [loadRuns, loadSources, openRun]);

  // The fields of the selected execution and what each of them flows into.
  useEffect(() => {
    setField(null);
    if (!selectedExecution) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreview(null);
    fetch(API_ENDPOINTS.contentLineageAgentPreview(selectedExecution))
      .then(async (response) => {
        const payload = await readJson(response);
        if (!response.ok) throw new Error(payload.detail || messages.current.t("errors.preview"));
        if (cancelled) return;
        setPreview(payload);
        if (pendingField.current) {
          pendingField.current = false;
          setField(suggestedField(payload as Preview));
        }
      })
      .catch((error) => !cancelled && messages.current.toast({ title: messages.current.t("errors.preview"), description: error instanceof Error ? error.message : undefined, variant: "destructive" }))
      .finally(() => !cancelled && setPreviewLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedExecution]);

  // Poll a running run until it finishes, then load the full result.
  const runId = run?.id;
  const running = run?.status === "running";
  useEffect(() => {
    if (!runId || !running) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(API_ENDPOINTS.contentLineageAgentRunProgress(runId));
        const payload = await readJson(response);
        if (stopped || !response.ok) return;
        if (payload.status === "running") {
          setRun(payload);
          return;
        }
        window.clearInterval(timer);
        const full = await openRun(runId);
        setCancelling(false);
        void loadRuns();
        if (full.status === "completed" && full.summary) {
          toast({ title: t("toast.completed"), description: t("toast.completedBody", { field: full.settings.field ?? "", fields: full.summary.fields ?? 0 }) });
        } else if (full.status === "failed") {
          toast({ title: t("toast.failed"), description: full.error ?? undefined, variant: "destructive" });
        }
      } catch {
        /* transient network error: keep polling */
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [runId, running, openRun, loadRuns, t, toast]);

  const newRun = () => {
    // Every new analysis starts from an empty selection.
    setSelectedExecution(null);
    setField(null);
    setView("setup");
    void loadSources();
  };

  const start = async () => {
    if (!selectedExecution || !field) return;
    setStarting(true);
    try {
      const response = await fetch(API_ENDPOINTS.contentLineageAgentRuns, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execution_id: selectedExecution, field, language: locale }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.detail || t("errors.start"));
      setRun(payload);
      setView("run");
      setSelected(null);
      if (tourMode) setTourRunId(payload.id);
      void loadRuns();
    } catch (error) {
      toast({ title: t("errors.start"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!run) return;
    setCancelling(true);
    try {
      const response = await fetch(API_ENDPOINTS.contentLineageAgentCancel(run.id), { method: "POST" });
      if (!response.ok) throw new Error((await readJson(response)).detail);
    } catch (error) {
      setCancelling(false);
      toast({ title: t("errors.cancel"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const remove = async () => {
    if (!run) return;
    try {
      const response = await fetch(API_ENDPOINTS.contentLineageAgentRun(run.id), { method: "DELETE" });
      if (!response.ok) throw new Error((await readJson(response)).detail);
      await loadRuns();
      setRun(null);
      newRun();
      toast({ title: t("toast.deleted") });
    } catch (error) {
      toast({ title: t("errors.delete"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setDeleteOpen(false);
    }
  };

  const exportRun = async () => {
    if (!run) return;
    try {
      await downloadFrom(API_ENDPOINTS.contentLineageAgentExport(run.id, locale), "content-lineage.xlsx");
    } catch (error) {
      toast({ title: t("errors.export"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  // AI texts in the tab's language (the agent writes every analysis in English and German).
  const model = useMemo(() => (isForwardResult(run?.result) ? new Model(run!.result!, locale) : null), [run?.result, locale]);
  const legacy = Boolean(run?.status === "completed" && run.result && !isForwardResult(run.result));

  // Leaving the tour keeps what is on screen: the tour's analysis is a real one and stays in the Analyses menu.
  const endTour = useCallback(() => {
    setTourOpen(false);
    setTourMode(false);
    setTourRunId(null);
    setHoldProgress(false);
  }, []);

  // First visit: open the onboarding once the sources are known, unless an analysis is on screen.
  useEffect(() => {
    if (tourAutoStarted.current || loadingSources) return;
    tourAutoStarted.current = true;
    let seen = false;
    try {
      seen = localStorage.getItem(CONTENT_ONBOARDING_STORAGE_KEY) === "done";
    } catch {
      seen = false;
    }
    if (!seen && view === "setup") setTourOpen(true);
  }, [loadingSources, view]);

  const tourRun: ContentTourController["tourRun"] = !tourRunId
    ? "idle"
    : run?.id !== tourRunId || run.status === "running"
      ? "running"
      : run.status === "completed" && run.summary && model
        ? "done"
        : "failed";
  const tourModel = tourRun === "done" ? model : null;
  const tourController: ContentTourController = {
    stage: view === "setup" ? "setup" : run && (run.status === "running" || !run.summary || holdProgress) ? "progress" : "results",
    tourRun,
    tourRunError: tourRun === "failed" && run ? run.error || t(`status.${run.status}`) : null,
    executionsAvailable: (sources?.clusters ?? []).some((cluster) => cluster.executions.length > 0),
    executionSelected: Boolean(selectedExecution),
    fieldsAvailable: preview ? preview.fields.some((item) => item.fields.length > 0) : null,
    fieldSelected: Boolean(field),
    flowFieldSelected: Boolean(selected && model?.flowBy.has(selected)),
    showSetup: () => {
      setHoldProgress(false);
      setView("setup");
    },
    showProgress: () => {
      setHoldProgress(true);
      if (tourRunId && run?.id === tourRunId) setView("run");
    },
    showResults: () => {
      setHoldProgress(false);
      if (tourRun === "done") setView("run");
    },
    selectFirstExecution: () => {
      const first = sources?.clusters.flatMap((cluster) => cluster.executions)[0];
      if (first) setSelectedExecution(first.execution_id);
    },
    selectSuggestedField: () => {
      if (!preview) {
        pendingField.current = true;
        return;
      }
      setField(suggestedField(preview));
    },
    startRun: () => void start(),
    selectFlowField: () => {
      if (!tourModel) return;
      // The most instructive next field: the one whose rule has the most cases, then the one reached in the most records.
      const cases = (column: string) => tourModel.ruleOfColumn.get(column)?.cases.length ?? 0;
      const column = [...tourModel.result.scope.next].sort((a, b) => cases(b) - cases(a) || (tourModel.flowBy.get(b)?.records.reached ?? 0) - (tourModel.flowBy.get(a)?.records.reached ?? 0))[0] ?? tourModel.downstream[0];
      if (column) setSelected(column);
    },
  };

  const showProgress = view === "run" && run && (run.status === "running" || !run.summary || holdProgress);
  const showResults = view === "run" && run && run.status !== "running" && run.summary && model && !holdProgress;

  return (
    <div className="space-y-5 pb-10" lang={locale}>
      <header data-tour="content-header" className="relative overflow-hidden rounded-lg border border-[#252a33] bg-[#0b0f15] px-6 py-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,196,0,0.10),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(251,146,60,0.07),transparent_45%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#f5c400]/40 bg-[linear-gradient(135deg,rgba(245,196,0,0.22),rgba(245,196,0,0.04))] shadow-[0_0_28px_rgba(245,196,0,0.15)]">
              <Waypoints className="h-6 w-6 text-[#f5c400]" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#f5c400]">{t("eyebrow")}</p>
              <h2 className="text-xl font-semibold tracking-tight text-white">{t("title")}</h2>
              <p className="mt-0.5 max-w-3xl text-xs text-[#8c96a8]">{t("subtitle")}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTourOpen(true)}
              disabled={tourOpen || run?.status === "running"}
              className="gap-2 border-[#2c3440] bg-[#0f141b] text-[#c9d1dd] hover:bg-[#151b23]"
            >
              <GraduationCap className="h-4 w-4" />
              {t("tour")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 border-[#2c3440] bg-[#0f141b] text-[#c9d1dd] hover:bg-[#151b23]">
                  <History className="h-4 w-4" />
                  {t("history")}
                  {runs.length > 0 && <span className="rounded bg-[#1f252e] px-1.5 font-mono text-[10px]">{runs.length}</span>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[420px] border-[#252a33] bg-[#0f141b]">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.14em] text-[#687386]">{t("historyTitle")}</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[#1f252e]" />
                {runs.length === 0 && <p className="px-2 py-3 text-xs text-[#687386]">{t("historyEmpty")}</p>}
                {runs.map((item) => {
                  const earlier = !item.settings?.field;
                  return (
                    <DropdownMenuItem
                      key={item.id}
                      onSelect={() => void openRun(item.id, item.status === "running").catch((error) => toast({ title: t("errors.load"), description: error instanceof Error ? error.message : undefined, variant: "destructive" }))}
                      className={cn("flex flex-col items-start gap-0.5 py-2", run?.id === item.id && "bg-[#f5c400]/10")}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-[#e5e9f0]">
                          {item.source.cluster_name ?? "–"} ·{" "}
                          {earlier ? (
                            <span className="text-[11px] text-[#8c96a8]">{t("historyEarlier")}</span>
                          ) : (
                            <span className="font-mono text-[11px] text-[#f5c400]">{item.settings.field}</span>
                          )}
                        </span>
                        <span className={cn("shrink-0 text-[10px] uppercase", item.status === "completed" ? "text-emerald-300" : item.status === "running" ? "text-[#f5c400]" : "text-rose-300")}>{t(`status.${item.status}`)}</span>
                      </span>
                      <span className="text-[11px] text-[#687386]">
                        {formatDateTime(item.created_at, locale)}
                        {item.summary && !earlier && ` · ${t("historyLine", { fields: item.summary.fields ?? 0, rules: item.summary.rules })}`}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            {view === "run" && run && run.status !== "running" && (
              <Button data-tour="content-new" size="sm" onClick={newRun} className="gap-2 bg-[#f5c400] font-semibold text-[#0b0f15] hover:bg-[#ffd21f]">
                <Plus className="h-4 w-4" />
                {t("newRun")}
              </Button>
            )}
            {view === "setup" && run && (
              <Button variant="outline" size="sm" onClick={() => setView("run")} className="border-[#2c3440] bg-transparent text-[#c9d1dd]">
                {run.status === "running" ? t("backToProgress") : t("backToResults")}
              </Button>
            )}
            <SectionLanguageSwitch tourId="content-language" className="ml-1" />
          </div>
        </div>
      </header>

      {view === "setup" && (
        <SetupPanel
          sources={sources}
          loading={loadingSources}
          selected={selectedExecution}
          onSelect={setSelectedExecution}
          preview={preview}
          previewLoading={previewLoading}
          field={field}
          onField={setField}
          starting={starting}
          onStart={() => void start()}
        />
      )}

      {showProgress && run && <RunProgress run={run} cancelling={cancelling} onCancel={() => void cancel()} onNew={newRun} />}

      {view === "run" && run && legacy && (
        <section className="flex flex-wrap items-start gap-4 rounded-lg border border-[#2c3440] bg-[#0b0f15] px-5 py-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-white">{t("legacy.title")}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#aab3c2]">{t("legacy.body")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={newRun} className="gap-2 bg-[#f5c400] font-semibold text-[#0b0f15] hover:bg-[#ffd21f]"><Plus className="h-4 w-4" />{t("newRun")}</Button>
            <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)} className="gap-1.5 text-[#8c96a8] hover:bg-rose-400/10 hover:text-rose-300"><Trash2 className="h-4 w-4" />{t("deleteRun")}</Button>
          </div>
        </section>
      )}

      {view === "run" && run && run.status === "completed" && run.summary && !model && !legacy && (
        <section className="flex items-start gap-3 rounded-lg border border-rose-400/30 bg-rose-400/[0.06] px-5 py-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
          <p className="text-sm text-rose-200">{t("errors.noResult")}</p>
        </section>
      )}

      {showResults && run && model && (
        <>
          <section data-tour="content-meta" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#252a33] bg-[#0b0f15] px-5 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[#8c96a8]">
              <span className="flex items-center gap-1.5 font-medium text-emerald-300"><BadgeCheck className="h-4 w-4" />{t(`status.${run.status}`)}</span>
              <span className="flex items-center gap-1.5 font-semibold text-[#f5c400]"><Crosshair className="h-4 w-4" />{model.termName(model.field)}<ArrowRight className="h-3.5 w-3.5 text-[#8c96a8]" /><span className="font-normal text-[#c9d1dd]">{t("meta.fields", { count: model.downstream.length })}</span></span>
              <span className="font-medium text-white">{run.source.cluster_name}</span>
              <span>{t("meta.execution", { date: formatDateTime(run.source.executed_date, locale) })}</span>
              <span className="font-mono text-[#c2cad5]">{run.source.code_filename}</span>
              <span>{run.source.dataset_name}</span>
              <span>{t("meta.duration", { value: formatDuration(run.duration_ms, locale) })}</span>
              {run.model && <span className="rounded border border-[#252a33] bg-[#11161e] px-1.5 py-px font-mono text-[10px] text-[#aab3c2]">{run.model}</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button data-tour="content-export" size="sm" variant="outline" onClick={() => void exportRun()} title={t("export.excelHint")} className="h-8 gap-1.5 border-emerald-400/30 bg-emerald-400/10 text-xs font-medium text-emerald-200 hover:bg-emerald-400/20">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {t("export.excel")}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)} className="h-8 w-8 text-[#687386] hover:bg-rose-400/10 hover:text-rose-300" aria-label={t("deleteRun")}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </section>

          <LineageView model={model} run={run} selected={selected && model.carriers.has(selected) ? selected : model.field} onSelect={setSelected} />
        </>
      )}

      <ContentOnboarding
        open={tourOpen}
        controller={tourController}
        onStartTour={() => {
          // The hands-on tour starts from an empty setup, like every new analysis.
          setTourMode(true);
          setTourRunId(null);
          setHoldProgress(false);
          setSelectedExecution(null);
          setField(null);
          setView("setup");
        }}
        onClose={endTour}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("deleteRun")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
