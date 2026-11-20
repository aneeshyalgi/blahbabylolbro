"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { GitBranch, GraduationCap, History, Plus, Trash2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_ENDPOINTS } from "@/lib/api-config";
import { recallInTab, rememberInTab } from "@/lib/tab-memory";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { SectionLanguageProvider, SectionLanguageSwitch } from "@/components/section-language";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDateTime } from "./atoms";
import { LineageView } from "./lineage-view";
import { localizeResult } from "./localize";
import { buildModel } from "./model";
import { LineageOnboarding, type LineageTourController } from "./onboarding/lineage-onboarding";
import { RunProgress } from "./run-progress";
import { SetupPanel } from "./setup-panel";
import type { Focus, Preview, Run, RunListItem, Sources } from "./types";

const POLL_MS = 1000;

/** The run on screen when the user switched to another tab; it is open again when they come back (a reload starts fresh). */
type OpenRun = { runId: string; view: "setup" | "run"; focus: Focus | null };
const OPEN_RUN = "technical-lineage-agent.open-run";

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

/** The most instructive column of an analysis, for the guided tour: the deepest derived output (e.g. RWA), whose
 *  lineage reaches furthest back. */
function tourColumn(run: Run): string | null {
  const columns = run.result?.analysis.columns.filter((column) => column.in_output && column.role !== "passthrough") ?? [];
  return [...columns].sort((a, b) => b.depth - a.depth || b.upstream.length - a.upstream.length)[0]?.name ?? null;
}

/** The tab has its own English / German switch (independent of the app language). */
export function LineageAgentTabContent() {
  return (
    <SectionLanguageProvider storageKey="dataflow_lineage_language">
      <LineageAgentTab />
    </SectionLanguageProvider>
  );
}

function LineageAgentTab() {
  const t = useTranslations("lineageAgent");
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
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // The column or lookup table whose details are shown under the graph (none: every column at a glance).
  const [focus, setFocus] = useState<Focus | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  // The onboarding opens only from the Guided tour button. While its hands-on tour is open, the analysis it starts is
  // followed by the tour; its progress view stays on screen while the tour explains it, also after it has finished.
  const [tourMode, setTourMode] = useState(false);
  const [tourRunId, setTourRunId] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(false);
  const initialised = useRef(false);
  // Set once the run open at the last visit is back (or there was none); from then on, what is open is remembered.
  const restored = useRef(false);

  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const response = await fetch(API_ENDPOINTS.lineageAgentSources);
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
      const response = await fetch(API_ENDPOINTS.lineageAgentRuns);
      const payload = await readJson(response);
      const list = (payload.runs ?? []) as RunListItem[];
      setRuns(list);
      return list;
    } catch {
      return [] as RunListItem[];
    }
  }, []);

  const openRun = useCallback(async (id: string, lite = false) => {
    const response = await fetch(lite ? API_ENDPOINTS.lineageAgentRunProgress(id) : API_ENDPOINTS.lineageAgentRun(id));
    const payload = await readJson(response);
    if (!response.ok) throw new Error(payload.detail || t("errors.load"));
    setRun(payload);
    setView("run");
    if (!lite) setFocus(null);
    return payload as Run;
  }, [t]);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    void loadSources();
    void loadRuns().then(async (list) => {
      // Back from another tab: the run that was open is open again, as it was left. Otherwise the tab opens on a fresh
      // setup; finished runs stay in the Runs menu, and a run still in progress is shown again.
      const left = recallInTab<OpenRun>(OPEN_RUN);
      const again = left ? list.find((item) => item.id === left.runId) : undefined;
      const active = list.find((item) => item.status === "running");
      try {
        if (left && again) {
          await openRun(again.id, again.status === "running");
          setView(left.view);
          setFocus(left.focus);
        } else if (active) {
          await openRun(active.id, true);
        }
      } catch {
        setView("setup");
      } finally {
        if (left && !again) rememberInTab(OPEN_RUN, null);
        restored.current = true;
      }
    });
  }, [loadRuns, loadSources, openRun]);

  // What is open now is what the tab shows again after a visit to another tab.
  useEffect(() => {
    if (!restored.current) return;
    rememberInTab<OpenRun>(OPEN_RUN, run ? { runId: run.id, view, focus } : null);
  }, [run, view, focus]);

  // Preview of the selected execution.
  useEffect(() => {
    if (!selectedExecution) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreview(null);
    fetch(API_ENDPOINTS.lineageAgentPreview(selectedExecution))
      .then(async (response) => {
        const payload = await readJson(response);
        if (!response.ok) throw new Error(payload.detail || t("errors.preview"));
        if (!cancelled) setPreview(payload);
      })
      .catch((error) => !cancelled && toast({ title: t("errors.preview"), description: error instanceof Error ? error.message : undefined, variant: "destructive" }))
      .finally(() => !cancelled && setPreviewLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedExecution, t, toast]);

  // Poll a running run until it finishes, then load the full result.
  const runId = run?.id;
  const running = run?.status === "running";
  useEffect(() => {
    if (!runId || !running) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(API_ENDPOINTS.lineageAgentRunProgress(runId));
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
          toast({ title: t("toast.completed"), description: t("toast.completedBody", { outputs: full.summary.outputs, edges: full.summary.edges }) });
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

  // Leaving the tour keeps what is on screen: the tour's analysis is a real one and stays in the Runs menu.
  const endTour = useCallback(() => {
    setTourOpen(false);
    setTourMode(false);
    setTourRunId(null);
    setHoldProgress(false);
  }, []);

  const executionsAvailable = (sources?.clusters ?? []).some((cluster) => cluster.executions.length > 0);
  const target = useMemo(() => (run?.result ? tourColumn(run) : null), [run]);
  const tourRun: LineageTourController["tourRun"] = !tourRunId
    ? "idle"
    : run?.id !== tourRunId || run.status === "running"
      ? "running"
      : run.status === "completed" && run.summary
        ? "done"
        : "failed";
  const tourController: LineageTourController = {
    stage: view === "setup" ? "setup" : run && (run.status === "running" || !run.summary || holdProgress) ? "progress" : "results",
    tourRun,
    tourRunError: tourRun === "failed" && run ? run.error || t(`status.${run.status}`) : null,
    executionsAvailable,
    executionSelected: Boolean(selectedExecution),
    nodeSelected: focus?.kind === "column" || (tourRun === "done" && !target),
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
    startRun: () => void start(),
    selectNode: () => {
      if (target) setFocus({ kind: "column", name: target });
    },
    clearNode: () => setFocus(null),
  };

  const newRun = () => {
    // Every new analysis starts from an empty selection.
    setSelectedExecution(null);
    setView("setup");
    void loadSources();
  };

  const start = async () => {
    if (!selectedExecution) return;
    setStarting(true);
    try {
      const response = await fetch(API_ENDPOINTS.lineageAgentRuns, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Runtime dependency probes always run; they are what proves the lineage.
        body: JSON.stringify({ execution_id: selectedExecution, language: locale, probes: true }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.detail || t("errors.start"));
      setRun(payload);
      setView("run");
      setFocus(null);
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
      const response = await fetch(API_ENDPOINTS.lineageAgentCancel(run.id), { method: "POST" });
      if (!response.ok) throw new Error((await readJson(response)).detail);
    } catch (error) {
      setCancelling(false);
      toast({ title: t("errors.cancel"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const remove = async () => {
    if (!run) return;
    try {
      const response = await fetch(API_ENDPOINTS.lineageAgentRun(run.id), { method: "DELETE" });
      if (!response.ok) throw new Error((await readJson(response)).detail);
      await loadRuns();
      setRun(null);
      setView("setup");
      setSelectedExecution(null);
      toast({ title: t("toast.deleted") });
    } catch (error) {
      toast({ title: t("errors.delete"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setDeleteOpen(false);
    }
  };

  // AI texts in the UI language (the agent writes every analysis in English and German).
  const runLanguage = run?.language ?? "en";
  const model = useMemo(() => {
    if (!run?.result) return null;
    const localized = localizeResult(run.result, locale, runLanguage);
    return buildModel(localized.result, localized.translatedFrom);
  }, [run?.result, locale, runLanguage]);

  const showProgress = view === "run" && run && (run.status === "running" || !run.summary || holdProgress);
  const showResults = view === "run" && run && run.status !== "running" && run.summary && model && !holdProgress;

  return (
    <div className="space-y-5 pb-10" lang={locale}>
      <header data-tour="lineage-header" className="relative overflow-hidden rounded-lg border border-[#252a33] bg-[#0b0f15] px-6 py-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,196,0,0.10),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(56,189,248,0.06),transparent_45%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#f5c400]/40 bg-[linear-gradient(135deg,rgba(245,196,0,0.22),rgba(245,196,0,0.04))] shadow-[0_0_28px_rgba(245,196,0,0.15)]">
              <GitBranch className="h-6 w-6 text-[#f5c400]" />
            </span>
            <div>
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
              <DropdownMenuContent align="end" className="w-[380px] border-[#252a33] bg-[#0f141b]">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.14em] text-[#687386]">{t("historyTitle")}</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[#1f252e]" />
                {runs.length === 0 && <p className="px-2 py-3 text-xs text-[#687386]">{t("historyEmpty")}</p>}
                {runs.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    onSelect={() => void openRun(item.id, item.status === "running").catch((error) => toast({ title: t("errors.load"), description: error instanceof Error ? error.message : undefined, variant: "destructive" }))}
                    className={cn("flex flex-col items-start gap-0.5 py-2", run?.id === item.id && "bg-[#f5c400]/10")}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-[#e5e9f0]">{item.source.cluster_name ?? "–"} · <span className="font-mono text-[11px] text-[#aab3c2]">{item.source.code_filename}</span></span>
                      <span className={cn("shrink-0 text-[10px] uppercase", item.status === "completed" ? "text-emerald-300" : item.status === "running" ? "text-[#f5c400]" : "text-rose-300")}>{t(`status.${item.status}`)}</span>
                    </span>
                    <span className="text-[11px] text-[#687386]">
                      {formatDateTime(item.created_at, locale)}
                      {item.summary && ` · ${t("historyLine", { outputs: item.summary.outputs, edges: item.summary.edges, verified: item.summary.verified_pct ?? "–" })}`}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {view === "run" && run && run.status !== "running" && (
              <>
                <Button data-tour="lineage-new" size="sm" onClick={newRun} className="gap-2 bg-[#f5c400] font-semibold text-[#0b0f15] hover:bg-[#ffd21f]">
                  <Plus className="h-4 w-4" />
                  {t("newRun")}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)} className="h-8 w-8 text-[#687386] hover:bg-rose-400/10 hover:text-rose-300" aria-label={t("deleteRun")} title={t("deleteRun")}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
            {view === "setup" && run && (
              <Button variant="outline" size="sm" onClick={() => setView("run")} className="border-[#2c3440] bg-transparent text-[#c9d1dd]">
                {run.status === "running" ? t("backToProgress") : t("backToResults")}
              </Button>
            )}
            <SectionLanguageSwitch tourId="lineage-language" className="ml-1" />
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
          starting={starting}
          onStart={() => void start()}
        />
      )}

      {showProgress && run && <RunProgress run={run} cancelling={cancelling} onCancel={() => void cancel()} onNew={newRun} />}

      {view === "run" && run && run.status === "completed" && run.summary && !model && (
        <section className="flex items-start gap-3 rounded-lg border border-rose-400/30 bg-rose-400/[0.06] px-5 py-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
          <p className="text-sm text-rose-200">{t("errors.noResult")}</p>
        </section>
      )}

      {showResults && run && model && <LineageView model={model} run={run} focus={focus} onFocus={setFocus} />}

      <LineageOnboarding
        open={tourOpen}
        controller={tourController}
        onStartTour={() => {
          setTourMode(true);
          setTourRunId(null);
          setHoldProgress(false);
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
