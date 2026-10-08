"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  BadgeCheck, BookOpen, Download, FileSpreadsheet, GraduationCap, History, Network, PieChart, Plus, Scale, ShieldCheck, Trash2, TriangleAlert, Waypoints,
} from "lucide-react";
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
import { ProvisionDrawer } from "@/components/regulation-matcher/provision-drawer";
import type { ProvisionTarget } from "@/components/regulation-matcher/types";
import { downloadFrom } from "@/components/lineage-agent/download";
import { VerdictBadge, formatDateTime, formatDuration } from "./atoms";
import { FiguresView } from "./figures-view";
import { GlossaryView } from "./glossary-view";
import { GraphView } from "./graph-view";
import { Model } from "./model";
import { CONTENT_ONBOARDING_STORAGE_KEY, ContentOnboarding, type ContentTourController } from "./onboarding/content-onboarding";
import { RegulationView } from "./regulation-view";
import { RunProgress } from "./run-progress";
import { SetupPanel } from "./setup-panel";
import type { Navigator, Preview, Run, RunListItem, Selection, Sources, View } from "./types";
import { VerificationView } from "./verification-view";

const POLL_MS = 1000;

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
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
  const [tab, setTab] = useState<View>("graph");
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [figures, setFigures] = useState<string[]>([]);
  const [regulations, setRegulations] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [glossaryFocus, setGlossaryFocus] = useState<{ kind: "term" | "rule"; id: string } | null>(null);
  const [regulationFocus, setRegulationFocus] = useState<string | null>(null);
  const [figure, setFigure] = useState<string | null>(null);
  const [record, setRecord] = useState<string | null>(null);
  const [provisionTarget, setProvisionTarget] = useState<ProvisionTarget | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  // While the hands-on tour is open, the analysis it starts is followed by the tour; its progress view stays on
  // screen while the tour explains it, also after the analysis has finished.
  const [tourMode, setTourMode] = useState(false);
  const [tourRunId, setTourRunId] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(false);
  const tourAutoStarted = useRef(false);
  // "Do it for me" on the figures step before the execution's preview has arrived: tick them once it is there.
  const pendingFigures = useRef(false);
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
      // Keep the selection only while the execution and the regulations still exist.
      setSelectedExecution((current) => (current && (payload as Sources).clusters.some((cluster) => cluster.executions.some((item) => item.execution_id === current)) ? current : null));
      setRegulations((current) => current.filter((id) => (payload as Sources).regulations.some((item) => item.id === id && item.ready)));
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

  const resetSelections = () => {
    setSelection(null);
    setGlossaryFocus(null);
    setRegulationFocus(null);
    setFigure(null);
    setRecord(null);
  };

  const openRun = useCallback(async (id: string, lite = false) => {
    const response = await fetch(lite ? API_ENDPOINTS.contentLineageAgentRunProgress(id) : API_ENDPOINTS.contentLineageAgentRun(id));
    const payload = await readJson(response);
    if (!response.ok) throw new Error(payload.detail || t("errors.load"));
    setRun(payload);
    setView("run");
    if (!lite) {
      setTab("graph");
      resetSelections();
    }
    return payload as Run;
  }, [t]);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    void loadSources();
    void loadRuns().then(async (list) => {
      // The tab opens on a fresh setup; finished runs stay in the Runs menu. A run still in progress is shown again.
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

  // What the selected execution derives: the reported figures to choose from.
  useEffect(() => {
    setFigures([]);
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
        if (pendingFigures.current) {
          pendingFigures.current = false;
          const suggested = (payload as Preview).figures.length ? (payload as Preview).figures : (payload as Preview).derived.slice(0, 1).map((item) => item.column);
          setFigures(suggested);
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
          toast({ title: t("toast.completed"), description: t("toast.completedBody", { terms: full.summary.terms, rules: full.summary.rules, provisions: full.summary.provisions }) });
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
    setRegulations([]);
    setFigures([]);
    setView("setup");
    void loadSources();
  };

  const start = async () => {
    if (!selectedExecution || !figures.length) return;
    setStarting(true);
    try {
      const response = await fetch(API_ENDPOINTS.contentLineageAgentRuns, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execution_id: selectedExecution, figures, regulation_ids: regulations, language: locale }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.detail || t("errors.start"));
      setRun(payload);
      setView("run");
      resetSelections();
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
      try {
        localStorage.removeItem(`dataflow_content_lineage_graph_positions:${run.id}`);
      } catch {
        // Storage unavailable: nothing to clean up.
      }
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
  const model = useMemo(() => (run?.result ? new Model(run.result, locale) : null), [run?.result, locale]);
  const currentFigure = figure && model?.figures.includes(figure) ? figure : model?.figures[0] ?? null;

  const nav: Navigator = useMemo(() => ({
    openTerm: (column, target = "graph") => {
      if (target === "graph") setSelection({ kind: "term", id: column });
      if (target === "glossary") setGlossaryFocus({ kind: "term", id: column });
      if (target === "figures") setFigure(column);
      setTab(target);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    openRule: (rule, target = "graph") => {
      if (target === "graph") setSelection({ kind: "rule", id: rule });
      if (target === "glossary") setGlossaryFocus({ kind: "rule", id: rule });
      if (target === "regulation") setRegulationFocus(rule);
      setTab(target);
    },
    openProvision: (key) => {
      const provision = model?.provisionBy.get(key);
      if (!provision) return;
      const highlights = provision.rules.flatMap((entry) => model?.assessment(entry.rule)?.links[entry.index]?.highlights ?? []);
      setProvisionTarget({ regulationId: provision.link.regulation_id, unit: provision.link.unit, reference: provision.link.reference, paragraph: null, highlights, page: provision.link.page });
    },
    openRecord: (name, label) => {
      setFigure(name);
      setRecord(label);
      setTab("figures");
    },
  }), [model]);

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
      : run.status === "completed" && run.summary
        ? "done"
        : "failed";
  const tourModel = tourRun === "done" ? model : null;
  const tourController: ContentTourController = {
    stage: view === "setup" ? "setup" : run && (run.status === "running" || !run.summary || holdProgress) ? "progress" : "results",
    tourRun,
    tourRunError: tourRun === "failed" && run ? run.error || t(`status.${run.status}`) : null,
    executionsAvailable: (sources?.clusters ?? []).some((cluster) => cluster.executions.length > 0),
    executionSelected: Boolean(selectedExecution),
    figuresAvailable: preview ? preview.derived.length > 0 : null,
    figuresSelected: figures.length > 0,
    regulationsAvailable: (sources?.regulations ?? []).some((item) => item.ready),
    regulationsSelected: regulations.length > 0,
    available: {
      regulation: tourModel ? tourModel.result.regulation.enabled : null,
      provisions: tourModel ? tourModel.provisions.length > 0 : null,
      segments: tourModel ? tourModel.result.scope.dimensions.length > 0 : null,
    },
    figureNodeSelected: selection?.kind === "term" && Boolean(model?.figures.includes(selection.id)),
    ruleSelected: selection?.kind === "rule",
    provisionSelected: selection?.kind === "provision",
    recordSelected: Boolean(record),
    showSetup: () => {
      setHoldProgress(false);
      setView("setup");
    },
    showProgress: () => {
      setHoldProgress(true);
      if (tourRunId && run?.id === tourRunId) setView("run");
    },
    showResults: (next) => {
      setHoldProgress(false);
      if (tourRun !== "done") return;
      setView("run");
      setTab(next);
    },
    selectFirstExecution: () => {
      const first = sources?.clusters.flatMap((cluster) => cluster.executions)[0];
      if (first) setSelectedExecution(first.execution_id);
    },
    selectSuggestedFigures: () => {
      if (!preview) {
        pendingFigures.current = true;
        return;
      }
      setFigures(preview.figures.length ? preview.figures : preview.derived.slice(0, 1).map((item) => item.column));
    },
    selectFirstRegulation: () => {
      const first = sources?.regulations.find((item) => item.ready);
      if (first) setRegulations((current) => (current.includes(first.id) ? current : [...current, first.id]));
    },
    startRun: () => void start(),
    selectFigureNode: () => {
      if (model?.figures[0]) setSelection({ kind: "term", id: model.figures[0] });
    },
    selectRule: () => {
      if (!model) return;
      // The most instructive rule: one the regulation finds simplified or deviating, else the one with the most cases.
      const severity = (id: string) => ["not_covered", "unverified", "consistent", "simplified", "deviation"].indexOf(model.assessment(id)?.verdict ?? "not_covered");
      const rule = [...model.result.rules].sort((a, b) => severity(b.id) - severity(a.id) || b.cases.length - a.cases.length || (b.cases.some((item) => item.lookup) ? 1 : 0) - (a.cases.some((item) => item.lookup) ? 1 : 0))[0];
      if (rule) setSelection({ kind: "rule", id: rule.id });
    },
    selectProvision: () => {
      if (!model?.provisions.length) return;
      // The provision behind the most serious verdict, then the one governing the most rules.
      const order = (verdict: string) => ["not_covered", "unverified", "consistent", "simplified", "deviation"].indexOf(verdict);
      const provision = [...model.provisions].sort((a, b) => order(b.verdict) - order(a.verdict) || b.rules.length - a.rules.length)[0];
      setSelection({ kind: "provision", id: provision.key });
    },
    selectRecord: () => {
      if (!model || !currentFigure) return;
      // A record of the longest content path among the largest ones: it shows the most cases.
      const paths = model.result.figures[currentFigure]?.paths ?? [];
      const path = [...paths.slice(0, 5)].sort((a, b) => b.tokens.length - a.tokens.length)[0];
      const label = path?.examples[0] ?? model.result.records.items[0]?.label;
      if (label) {
        setFigure(currentFigure);
        setRecord(label);
      }
    },
  };

  const showProgress = view === "run" && run && (run.status === "running" || !run.summary || holdProgress);
  const showResults = view === "run" && run && run.status !== "running" && run.summary && model && !holdProgress;

  const tabs: [View, typeof Network, string][] = [
    ["graph", Network, t("tabs.graph")],
    ["figures", PieChart, t("tabs.figures")],
    ["glossary", BookOpen, t("tabs.glossary")],
    ["regulation", Scale, t("tabs.regulation")],
    ["verification", ShieldCheck, t("tabs.verification")],
  ];

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
              <DropdownMenuContent align="end" className="w-[400px] border-[#252a33] bg-[#0f141b]">
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
                      <span className="truncate text-xs font-medium text-[#e5e9f0]">{item.source.cluster_name ?? "–"} · <span className="font-mono text-[11px] text-[#aab3c2]">{(item.settings?.figures_traced?.length ? item.settings.figures_traced : item.settings?.figures ?? []).join(", ") || item.source.code_filename}</span></span>
                      <span className={cn("shrink-0 text-[10px] uppercase", item.status === "completed" ? "text-emerald-300" : item.status === "running" ? "text-[#f5c400]" : "text-rose-300")}>{t(`status.${item.status}`)}</span>
                    </span>
                    <span className="text-[11px] text-[#687386]">
                      {formatDateTime(item.created_at, locale)}
                      {item.summary && ` · ${t("historyLine", { terms: item.summary.terms, rules: item.summary.rules, provisions: item.summary.provisions })}`}
                    </span>
                  </DropdownMenuItem>
                ))}
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
          figures={figures}
          onFigures={setFigures}
          regulations={regulations}
          onRegulations={setRegulations}
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

      {showResults && run && model && currentFigure && (
        <>
          <section data-tour="content-meta" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#252a33] bg-[#0b0f15] px-5 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[#8c96a8]">
              <span className="flex items-center gap-1.5 font-medium text-emerald-300"><BadgeCheck className="h-4 w-4" />{t(`status.${run.status}`)}</span>
              <span className="font-medium text-white">{run.source.cluster_name}</span>
              <span>{t("meta.execution", { date: formatDateTime(run.source.executed_date, locale) })}</span>
              <span className="font-mono text-[#c2cad5]">{run.source.code_filename}</span>
              <span>{run.source.dataset_name}</span>
              <span>{t("meta.figures", { figures: model.figures.map((name) => model.termName(name)).join(", ") })}</span>
              <span>{t("meta.duration", { value: formatDuration(run.duration_ms, locale) })}</span>
              {run.model && <span className="rounded border border-[#252a33] bg-[#11161e] px-1.5 py-px font-mono text-[10px] text-[#aab3c2]">{run.model}</span>}
              {run.summary?.verdicts && (["deviation", "simplified"] as const).map((verdict) => (run.summary?.verdicts[verdict] ?? 0) > 0 && (
                <button key={verdict} type="button" onClick={() => setTab("regulation")}><VerdictBadge verdict={verdict} className="cursor-pointer" /></button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 border-emerald-400/30 bg-emerald-400/10 text-xs font-medium text-emerald-200 hover:bg-emerald-400/20">
                    <Download className="h-3.5 w-3.5" />
                    {t("export.title")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[300px] border-[#252a33] bg-[#0f141b]">
                  <DropdownMenuItem onSelect={() => void exportRun()} className="flex items-start gap-2.5 py-2">
                    <FileSpreadsheet className="mt-0.5 h-4 w-4 text-emerald-300" />
                    <span><span className="block text-xs font-medium text-[#e5e9f0]">{t("export.excel")}</span><span className="block text-[11px] text-[#687386]">{t("export.excelHint")}</span></span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTab("graph")} className="flex items-start gap-2.5 py-2">
                    <Network className="mt-0.5 h-4 w-4 text-violet-300" />
                    <span><span className="block text-xs font-medium text-[#e5e9f0]">{t("export.drawio")}</span><span className="block text-[11px] text-[#687386]">{t("export.drawioHint")}</span></span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)} className="h-8 w-8 text-[#687386] hover:bg-rose-400/10 hover:text-rose-300" aria-label={t("deleteRun")}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </section>

          <nav data-tour="content-tabs" className="flex items-center gap-1 overflow-x-auto rounded-lg border border-[#252a33] bg-[#0b0f15] p-1">
            {tabs.map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                  tab === key ? "bg-[#f5c400]/12 text-[#f5c400] shadow-[inset_0_0_0_1px_rgba(245,196,0,0.25)]" : "text-[#8c96a8] hover:bg-[#11161e] hover:text-[#f2f4f7]",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

          {tab === "graph" && <GraphView key={run.id} layoutKey={run.id} model={model} selected={selection} onSelect={setSelection} nav={nav} />}
          {tab === "figures" && <FiguresView model={model} figure={currentFigure} onFigure={(name) => { setFigure(name); setRecord(null); }} record={record} onRecord={setRecord} nav={nav} />}
          {tab === "glossary" && <GlossaryView model={model} focus={glossaryFocus} nav={nav} />}
          {tab === "regulation" && <RegulationView model={model} focus={regulationFocus} nav={nav} />}
          {tab === "verification" && <VerificationView model={model} run={run} nav={nav} />}
        </>
      )}

      <ProvisionDrawer target={provisionTarget} onClose={() => setProvisionTarget(null)} />

      <ContentOnboarding
        open={tourOpen}
        controller={tourController}
        onStartTour={() => {
          // The hands-on tour starts from an empty setup, like every new analysis.
          setTourMode(true);
          setTourRunId(null);
          setHoldProgress(false);
          setSelectedExecution(null);
          setFigures([]);
          setRegulations([]);
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
