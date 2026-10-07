"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  ClipboardList,
  Download,
  FileJson,
  GitCompareArrows,
  GraduationCap,
  Grid3x3,
  History,
  Languages,
  Layers,
  Library,
  Link2,
  Plus,
  ScanSearch,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_ENDPOINTS } from "@/lib/api-config";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { SectionLanguageProvider, SectionLanguageSwitch, useSectionLanguage } from "@/components/section-language";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ConfidenceDial, PANEL, RegulationChip, formatDateTime, formatDuration } from "./atoms";
import { SetupPanel } from "./setup-panel";
import { RunProgress } from "./run-progress";
import { EvidenceView } from "./evidence-view";
import { ProvisionsView, TraceabilityMatrix } from "./traceability-matrix";
import { AuditTrail } from "./audit-trail";
import { localizeRun, textLanguages } from "./localize";
import { ProvisionDrawer } from "./provision-drawer";
import { MATCHER_ONBOARDING_STORAGE_KEY, MatcherOnboarding, type MatcherTourController } from "./onboarding/matcher-onboarding";
import type { ProvisionTarget, Run, RunListItem, Sources } from "./types";

type Tab = "evidence" | "matrix" | "provisions" | "audit";
const POLL_MS = 1200;
/** The note with the most links: the one the guided tour explains. */
function noteWithMostLinks(run: Run) {
  return [...run.notes].sort((a, b) => (b.links?.length ?? 0) - (a.links?.length ?? 0))[0]?.key ?? null;
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { detail: text || response.statusText };
  }
}

/** The tab has its own English / German switch (independent of the app language). */
export function RegulationMatcherTabContent() {
  return (
    <SectionLanguageProvider storageKey="dataflow_matcher_language">
      <RegulationMatcherTab />
    </SectionLanguageProvider>
  );
}
function RegulationMatcherTab() {
  const t = useTranslations("matcher");
  const { language: locale } = useSectionLanguage();
  const { toast } = useToast();
  const [sources, setSources] = useState<Sources | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [view, setView] = useState<"setup" | "run">("setup");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedRegulations, setSelectedRegulations] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [tab, setTab] = useState<Tab>("evidence");
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [focusLink, setFocusLink] = useState<string | null>(null);
  const [provisionTarget, setProvisionTarget] = useState<ProvisionTarget | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  // While the hands-on tour is open, the run it starts is followed by the tour; its progress view stays on screen
  // while the tour explains it, also after the run has finished.
  const [tourMode, setTourMode] = useState(false);
  const [tourRunId, setTourRunId] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(false);
  const initialised = useRef(false);
  const tourAutoStarted = useRef(false);
  // What the page shows: the run in the tab's language (AI texts, verification messages, log lines).
  const display = useMemo(() => (run ? localizeRun(run, locale) : null), [run, locale]);
  const runLanguages = useMemo(() => (run ? textLanguages(run) : []), [run]);

  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const response = await fetch(API_ENDPOINTS.regulationMatcherSources);
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.detail || t("errors.load"));
      setSources(payload);
      // Nothing is selected by default: the user chooses the files for every run. Selections of files that
      // disappeared (or regulations that are no longer ready) are dropped.
      setSelectedFiles((current) => current.filter((id) => payload.release_note_files.some((file: { id: string }) => file.id === id)));
      setSelectedRegulations((current) => {
        const ready = payload.regulations.filter((item: { status?: string }) => item.status === "ready").map((item: { id: string }) => item.id);
        return current.filter((id) => ready.includes(id));
      });
    } catch (error) {
      toast({ title: t("errors.load"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoadingSources(false);
    }
  }, [t, toast]);

  const loadRuns = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.regulationMatcherRuns);
      const payload = await readJson(response);
      if (response.ok) setRuns(payload.runs ?? []);
      return (payload.runs ?? []) as RunListItem[];
    } catch {
      return [] as RunListItem[];
    }
  }, []);

  const openRun = useCallback(
    async (id: string, lite = false) => {
      const response = await fetch(lite ? API_ENDPOINTS.regulationMatcherRunProgress(id) : API_ENDPOINTS.regulationMatcherRun(id));
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.detail || t("errors.load"));
      setRun(payload);
      setView("run");
      if (!lite) {
        setTab("evidence");
        setSelectedNote(payload.notes?.[0]?.key ?? null);
      }
      return payload as Run;
    },
    [t],
  );

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    void loadSources();
    void loadRuns().then(async (list) => {
      // The tab opens on a fresh setup. Finished runs stay in the Runs menu; only a run that is still in
      // progress (e.g. the user left the tab while it ran) is shown again.
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

  // Poll a running run until it finishes, then load the full result.
  const runId = run?.id;
  const running = run?.status === "running";
  useEffect(() => {
    if (!runId || !running) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(API_ENDPOINTS.regulationMatcherRunProgress(runId));
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
          toast({ title: t("toast.completed"), description: t("toast.completedBody", { links: full.summary.links, notes: full.summary.notes }) });
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

  // Leaving the tour keeps what is on screen: the tour's run is a real one and stays in the Runs menu.
  const endTour = useCallback(() => {
    setTourOpen(false);
    setTourMode(false);
    setTourRunId(null);
    setHoldProgress(false);
  }, []);

  // First visit: open the onboarding once the sources are known, unless a run is already on screen.
  useEffect(() => {
    if (tourAutoStarted.current || loadingSources) return;
    tourAutoStarted.current = true;
    let seen = false;
    try {
      seen = localStorage.getItem(MATCHER_ONBOARDING_STORAGE_KEY) === "done";
    } catch {
      seen = false;
    }
    if (!seen && view === "setup") setTourOpen(true);
  }, [loadingSources, view]);

  const readyRegulations = (sources?.regulations ?? []).filter((item) => item.status === "ready");
  const tourRun: MatcherTourController["tourRun"] = !tourRunId
    ? "idle"
    : run?.id !== tourRunId || run.status === "running"
      ? "running"
      : run.status === "completed" && run.summary
        ? "done"
        : "failed";
  const tourController: MatcherTourController = {
    stage: view === "setup" ? "setup" : run && (run.status === "running" || holdProgress) ? "progress" : "results",
    tourRun,
    tourRunError: tourRun === "failed" && run ? run.error || t(`audit.statuses.${run.status}`) : null,
    filesAvailable: (sources?.release_note_files.length ?? 0) > 0,
    regulationsAvailable: readyRegulations.length > 0,
    filesSelected: selectedFiles.length,
    regulationsSelected: selectedRegulations.length,
    showSetup: () => {
      setHoldProgress(false);
      setView("setup");
    },
    showProgress: () => {
      setHoldProgress(true);
      if (tourRunId && run?.id === tourRunId) setView("run");
    },
    showResults: (nextTab) => {
      setHoldProgress(false);
      if (tourRun !== "done" || !run) return;
      setView("run");
      setTab(nextTab);
      // Explain a release note that has links (the first note may have none).
      setSelectedNote((current) => (run.notes.find((note) => note.key === current)?.links?.length ? current : noteWithMostLinks(run)));
    },
    selectFirstFile: () => {
      // The smallest file keeps the tour's real run short.
      const smallest = [...(sources?.release_note_files ?? [])].sort((a, b) => a.notes - b.notes)[0];
      if (smallest) setSelectedFiles((current) => (current.includes(smallest.id) ? current : [...current, smallest.id]));
    },
    selectFirstRegulation: () => {
      const first = readyRegulations[0];
      if (first) setSelectedRegulations((current) => (current.includes(first.id) ? current : [...current, first.id]));
    },
    startRun: () => void start(),
  };

  const newRun = () => {
    // Every new run starts from an empty selection: the user picks the files explicitly.
    setSelectedFiles([]);
    setSelectedRegulations([]);
    setView("setup");
  };

  const start = async () => {
    setStarting(true);
    try {
      const response = await fetch(API_ENDPOINTS.regulationMatcherRuns, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release_note_file_ids: selectedFiles, regulation_ids: selectedRegulations, language: locale }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.detail || t("errors.start"));
      setRun(payload);
      setView("run");
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
      const response = await fetch(API_ENDPOINTS.regulationMatcherCancel(run.id), { method: "POST" });
      if (!response.ok) throw new Error((await readJson(response)).detail);
    } catch (error) {
      setCancelling(false);
      toast({ title: t("errors.cancel"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const remove = async () => {
    if (!run) return;
    try {
      const response = await fetch(API_ENDPOINTS.regulationMatcherRun(run.id), { method: "DELETE" });
      if (!response.ok) throw new Error((await readJson(response)).detail);
      const list = await loadRuns();
      const next = list.find((item) => item.status !== "running");
      if (next) await openRun(next.id);
      else {
        setRun(null);
        setView("setup");
      }
      toast({ title: t("toast.deleted") });
    } catch (error) {
      toast({ title: t("errors.delete"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setDeleteOpen(false);
    }
  };

  const jump = (noteKey: string, provisionKey: string) => {
    setTab("evidence");
    setSelectedNote(noteKey);
    setFocusLink(null);
    window.setTimeout(() => setFocusLink(provisionKey), 60);
  };

  const downloadJson = () => {
    if (!run) return;
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `regulation-traceability-${run.created_at.slice(0, 10)}-${run.id.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const showResults = view === "run" && run && run.status !== "running" && run.summary && !holdProgress;
  const showProgress = view === "run" && run && (run.status === "running" || (holdProgress && Boolean(run.summary)));

  return (
    <div className="space-y-5 pb-10" lang={locale}>
      <header data-tour="matcher-header" className="relative overflow-hidden rounded-lg border border-[#252a33] bg-[#0b0f15] px-6 py-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,196,0,0.10),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(56,189,248,0.05),transparent_45%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#f5c400]/40 bg-[linear-gradient(135deg,rgba(245,196,0,0.22),rgba(245,196,0,0.04))] shadow-[0_0_28px_rgba(245,196,0,0.15)]">
              <GitCompareArrows className="h-6 w-6 text-[#f5c400]" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#f5c400]">{t("eyebrow")}</p>
              <h2 className="text-xl font-semibold tracking-tight text-white">{t("title")}</h2>
              <p className="mt-0.5 max-w-2xl text-xs text-[#8c96a8]">{t("subtitle")}</p>
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
              <DropdownMenuContent align="end" className="w-[360px] border-[#252a33] bg-[#0f141b]">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.14em] text-[#687386]">{t("historyTitle")}</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[#1f252e]" />
                {runs.length === 0 && <p className="px-2 py-3 text-xs text-[#687386]">{t("historyEmpty")}</p>}
                {runs.map((item) => (
                  <DropdownMenuItem key={item.id} onSelect={() => void openRun(item.id, item.status === "running").catch(() => undefined)} className={cn("flex flex-col items-start gap-0.5 py-2", run?.id === item.id && "bg-[#f5c400]/10")}>
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[#e5e9f0]">{formatDateTime(item.created_at, locale)}</span>
                      <span className={cn("text-[10px] uppercase", item.status === "completed" ? "text-emerald-300" : item.status === "running" ? "text-[#f5c400]" : "text-rose-300")}>{t(`audit.statuses.${item.status}`)}</span>
                    </span>
                    <span className="text-[11px] text-[#687386]">
                      {item.summary ? t("historyLine", { notes: item.summary.notes, links: item.summary.links, coverage: item.summary.coverage }) : item.release_note_files.map((file) => file.filename).join(", ")}
                      {" · "}
                      {item.regulations.map((regulation) => regulation.short).join(", ")}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {view === "run" && !showProgress && (
              <Button data-tour="matcher-new-run" size="sm" onClick={newRun} className="gap-2 bg-[#f5c400] font-semibold text-[#0b0f15] hover:bg-[#ffd21f]">
                <Plus className="h-4 w-4" />
                {t("newRun")}
              </Button>
            )}
            {view === "setup" && run && (
              <Button variant="outline" size="sm" onClick={() => setView("run")} className="border-[#2c3440] bg-transparent text-[#c9d1dd]">
                {t("backToResults")}
              </Button>
            )}
            <SectionLanguageSwitch tourId="matcher-language" className="ml-1" />
          </div>
        </div>
      </header>

      {view === "setup" && (
        <SetupPanel
          sources={sources}
          loading={loadingSources}
          selectedFiles={selectedFiles}
          selectedRegulations={selectedRegulations}
          onToggleFile={(id) => setSelectedFiles((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))}
          onToggleRegulation={(id) => setSelectedRegulations((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))}
          onSelectAllFiles={setSelectedFiles}
          onSelectAllRegulations={setSelectedRegulations}
          onStart={() => void start()}
          starting={starting}
          locale={locale}
        />
      )}

      {showProgress && display && <RunProgress run={display} onCancel={() => void cancel()} cancelling={cancelling} locale={locale} />}

      {view === "run" && run && run.status !== "running" && !run.summary && (
        <section className="flex items-start gap-3 rounded-lg border border-rose-400/30 bg-rose-400/[0.06] px-5 py-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
          <div>
            <p className="text-sm font-medium text-rose-200">{t(`audit.statuses.${run.status}`)}</p>
            <p className="mt-1 text-xs text-rose-200/80">{run.error ?? t("errors.noResult")}</p>
          </div>
        </section>
      )}

      {showResults && run && display && run.summary && (
        <>
          <section data-tour="matcher-meta" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#252a33] bg-[#0b0f15] px-5 py-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[#8c96a8]">
              <span className={cn("flex items-center gap-1.5 font-medium", run.status === "completed" ? "text-emerald-300" : "text-amber-300")}>
                <BadgeCheck className="h-4 w-4" />
                {t(`audit.statuses.${run.status}`)}
              </span>
              {!runLanguages.includes(locale) && (
                <span title={t("textsOnlyInHint")} className="flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                  <Languages className="h-3 w-3" />
                  {t("textsOnlyIn", { language: t.has(`languages.${run.language}`) ? t(`languages.${run.language}`) : run.language })}
                </span>
              )}
              <span>{formatDateTime(run.created_at, locale)}</span>
              <span>{t("meta.duration", { value: formatDuration(run.duration_ms) })}</span>
              {run.model && <span className="rounded border border-[#252a33] bg-[#11161e] px-1.5 py-px font-mono text-[10px] text-[#aab3c2]">{run.model}</span>}
              <span className="flex items-center gap-1.5">
                {run.regulations.map((regulation) => (
                  <RegulationChip key={regulation.id} name={regulation.short} />
                ))}
                <span className="max-w-[260px] truncate">{run.release_note_files.map((file) => file.filename).join(", ")}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a href={API_ENDPOINTS.regulationMatcherExport(run.id, locale)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 text-xs font-medium text-emerald-200 hover:bg-emerald-400/20">
                <Download className="h-3.5 w-3.5" />
                {t("exportExcel")}
              </a>
              <Button variant="outline" size="sm" onClick={downloadJson} className="h-8 gap-1.5 border-[#2c3440] bg-transparent text-xs text-[#c9d1dd]">
                <FileJson className="h-3.5 w-3.5" />
                JSON
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)} className="h-8 w-8 text-[#687386] hover:bg-rose-400/10 hover:text-rose-300" aria-label={t("deleteRun")}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </section>

          <KpiStrip run={run} />

          <nav data-tour="matcher-tabs" className="flex items-center gap-1 rounded-lg border border-[#252a33] bg-[#0b0f15] p-1">
            {(
              [
                ["evidence", Layers, t("tabs.evidence")],
                ["matrix", Grid3x3, t("tabs.matrix")],
                ["provisions", Library, t("tabs.provisions")],
                ["audit", ClipboardList, t("tabs.audit")],
              ] as [Tab, typeof Layers, string][]
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  tab === key ? "bg-[#f5c400]/12 text-[#f5c400] shadow-[inset_0_0_0_1px_rgba(245,196,0,0.25)]" : "text-[#8c96a8] hover:bg-[#11161e] hover:text-[#f2f4f7]",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

          {tab === "evidence" && (
            <EvidenceView notes={display.notes} selectedKey={selectedNote} onSelect={setSelectedNote} focusLink={focusLink} onOpenProvision={setProvisionTarget} />
          )}
          {tab === "matrix" && <TraceabilityMatrix notes={display.notes} provisions={run.provisions ?? []} onJump={jump} />}
          {tab === "provisions" && <ProvisionsView provisions={run.provisions ?? []} notes={display.notes} onOpenProvision={setProvisionTarget} onJump={jump} />}
          {tab === "audit" && <AuditTrail run={display} locale={locale} />}
        </>
      )}

      <ProvisionDrawer target={provisionTarget} onClose={() => setProvisionTarget(null)} />

      <MatcherOnboarding
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

function KpiStrip({ run }: { run: Run }) {
  const t = useTranslations("matcher.kpi");
  const summary = run.summary!;
  const quotesPercent = summary.quotes_total ? Math.round((summary.quotes_verified / summary.quotes_total) * 100) : 100;
  const tiles = useMemo(
    () => [
      {
        icon: ClipboardList,
        label: t("notes"),
        value: String(summary.notes),
        sub: t("notesSub", { files: run.release_note_files.length }),
      },
      {
        icon: ScanSearch,
        label: t("coverage"),
        value: `${summary.coverage}%`,
        sub: t("coverageSub", { linked: summary.linked, review: summary.review, none: summary.no_link }),
        bar: [
          { value: summary.linked, color: "bg-emerald-400" },
          { value: summary.review, color: "bg-amber-400" },
          { value: summary.no_link, color: "bg-slate-500" },
          { value: summary.failed, color: "bg-rose-400" },
        ],
      },
      {
        icon: Link2,
        label: t("links"),
        value: String(summary.links),
        sub: t("linksSub", { direct: summary.direct, indirect: summary.indirect }),
        bar: [
          { value: summary.direct, color: "bg-emerald-400" },
          { value: summary.indirect, color: "bg-sky-400" },
        ],
      },
      {
        icon: Library,
        label: t("provisions"),
        value: String(summary.provisions),
        sub: t("provisionsSub", { articles: summary.articles }),
      },
      {
        icon: ShieldCheck,
        label: t("quotes"),
        value: `${summary.quotes_verified}/${summary.quotes_total}`,
        sub: summary.quotes_corrected ? t("quotesCorrected", { count: summary.quotes_corrected }) : t("quotesSub", { percent: quotesPercent }),
        accent: quotesPercent === 100 ? "text-emerald-300" : "text-amber-300",
      },
      {
        icon: ScanSearch,
        label: t("candidates"),
        value: String(summary.candidates_reviewed),
        sub: t("candidatesSub", { rejected: summary.rejected }),
      },
    ],
    [run.release_note_files.length, summary, t, quotesPercent],
  );

  return (
    <section data-tour="matcher-kpis" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {tiles.map((tile) => (
        <Kpi key={tile.label} {...tile} />
      ))}
      <div className={cn(PANEL, "px-4 py-3.5")}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{t("confidence")}</p>
        <div className="mt-1.5 flex items-center gap-3">
          <ConfidenceDial value={summary.average_confidence ?? 0} size={40} />
          <p className="text-[11px] leading-snug text-[#8c96a8]">{t("confidenceSub")}</p>
        </div>
      </div>
    </section>
  );
}

function Kpi({ icon: Icon, label, value, sub, bar, accent }: { icon: typeof Link2; label: string; value: string; sub: string; bar?: { value: number; color: string }[]; accent?: string }) {
  const total = bar?.reduce((sum, item) => sum + item.value, 0) ?? 0;
  return (
    <div className={cn(PANEL, "relative overflow-hidden px-4 py-3.5")}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{label}</p>
        <Icon className="h-3.5 w-3.5 text-[#3a4350]" />
      </div>
      <p className={cn("mt-1.5 font-mono text-2xl font-semibold tabular-nums tracking-tight text-white", accent)}>{value}</p>
      {bar && total > 0 && (
        <div className="mt-2 flex h-1 overflow-hidden rounded-full bg-[#1a2028]">
          {bar.map((item, index) => (
            <span key={index} className={cn("h-full", item.color)} style={{ width: `${(item.value / total) * 100}%` }} />
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[11px] leading-snug text-[#8c96a8]">{sub}</p>
    </div>
  );
}
