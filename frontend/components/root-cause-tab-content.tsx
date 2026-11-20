"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, Eye, FileSpreadsheet, FileText, GitBranch, Loader2, MessageSquareText, PenLine, Search, Sparkles, X } from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api-config";
import { useClusterSelection } from "@/context/cluster-selection-context";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { EYEBROW, NoteChip, PANEL, STATUS, StatusChip } from "@/components/root-cause/atoms";
import { ReviewChat } from "@/components/root-cause/review-chat";
import { differenceClass, formatAmount, formatDifference } from "@/components/root-cause/format";
import { ChainSentence, LineageGraph } from "@/components/root-cause/lineage-graph";
import {
  FIELD_LABEL, applyReview, describeChanges, displayValue, editsOf, fieldValue, isChanged, isNarrowingView, requestHistory, requestRows, reviewSuggestions,
  statusOf, undoableTurn, viewLabel, visibleRows,
} from "@/components/root-cause/review";
import type { ReviewChange, ReviewField, ReviewTurn, ReviewView, RootCauseResult, RootCauseRow, RunInfo, Status } from "@/components/root-cause/types";

type Cluster = { id: string; name: string; dataset_version?: string; code_version?: string };
type Execution = { execution_id: string; executed_date: string; code_filename?: string | null };
type FieldOption = { name: string; numeric: boolean; deviations: number };
type ReleaseNoteFile = { id: string; filename: string; upload_date: string; kind?: "excel" | "pdf" };
type ReleaseNoteSummary = { id: string; filename: string; kind: string; notes: number; labels: string[]; sheets: { name: string; range: string; notes: number }[] };
type StepState = "done" | "current" | "waiting";
type Edits = Partial<Record<ReviewField, string>>;

const STORAGE_KEY = "dataflow_root_cause_normal_state_v4";
const LEGACY_STORAGE_KEY = "dataflow_root_cause_normal_state_v3";
type PersistedState = {
  clusterAId: string;
  clusterBId: string;
  executionA: string;
  executionB: string;
  outputColumn: string;
  releaseNoteId: string;
  showUnchanged: boolean;
  result: RootCauseResult | null;
  reviewTurns: ReviewTurn[];
  reviewView: ReviewView | null;
  reviewOpen: boolean;
};

const dateValue = (value: string) => new Date(value).toLocaleString();
// Unique: two release notes can share a Jira ID (RWA Release Notes 1.xlsm has RWA-112752 twice).
const splitList = (value: string) => Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const runLabel = (run: RunInfo) => [run.code, run.dataset].filter(Boolean).join(" on ");

/** The field to preselect whenever the runs' fields load: always the dropdown's last option, the last column of the
 *  results (the calculation's final output, e.g. RWA or Carrying Amount), never an earlier choice. */
function pickField(fields: FieldOption[]): string {
  return fields[fields.length - 1]?.name ?? "";
}

// ---------------------------------------------------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------------------------------------------------

function StepNumber({ value, state }: { value: number; state: StepState }) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold transition-colors",
        state === "done" ? "border-[#f5c400] bg-[#f5c400] text-[#0b0f15]" : state === "current" ? "border-[#f5c400]/50 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#2c3440] text-[#5d6878]",
      )}
    >
      {state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : value}
    </span>
  );
}

/** One setup step: number, title, hint and its controls. All steps have the same height, so the button below never moves. */
function StepPanel({ step, state, title, hint, children }: { step: number; state: StepState; title: string; hint: string; children: ReactNode }) {
  return (
    <section className={cn(PANEL, "flex h-[244px] flex-col overflow-hidden transition-colors", state === "current" && "border-[#f5c400]/35 shadow-[0_0_0_1px_rgba(245,196,0,0.08)]")}>
      <div className="flex items-start gap-3 border-b border-[#1f252e] px-4 py-3">
        <StepNumber value={step} state={state} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-[13.5px] font-semibold", state === "waiting" ? "text-[#aab3c2]" : "text-white")}>{title}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-[#8c96a8]" title={hint}>{hint}</p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3.5">{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 text-[11px] font-medium text-[#8c96a8]">{children}</p>;
}

const TRIGGER = "h-9 w-full border-[#252a33] bg-[#0f141b] text-[13px] text-[#e5e9f0] hover:bg-[#121821] dark:bg-[#0f141b] dark:hover:bg-[#121821]";

function Section({ title, hint, tone, children }: { title: string; hint?: string; tone?: "warn" | "review"; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h4 className={cn(EYEBROW, tone === "warn" && "text-amber-400", tone === "review" && "text-[#c9a400]")}>{title}</h4>
        {hint ? <span className="text-[11.5px] text-[#687386]">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function ValueBox({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-[#1f252e] bg-[#0f141b] px-3.5 py-3">
      <p className="text-[11px] text-[#8c96a8]">{label}</p>
      <p className={cn("mt-1 font-mono text-[14px] tabular-nums text-white", className)}>{value}</p>
    </div>
  );
}

/** A gold dot beside a value the post-run review changed; the tooltip names the computed value. */
function EditedMark({ field, computed }: { field: ReviewField; computed: string }) {
  const text = field === "explanation" ? "see the details" : displayValue(field, computed);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={`Changed in review; computed: ${text}`}
          className="ml-1.5 inline-block h-1.5 w-1.5 shrink-0 cursor-help rounded-full bg-[#f5c400] align-middle shadow-[0_0_6px_rgba(245,196,0,0.75)]"
        />
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-xs leading-5">Changed in the review · computed: {text}</TooltipContent>
    </Tooltip>
  );
}

function RowDetails({ row, computed, edits, layoutKey, dataset, onGraphFullscreen }: {
  row: RootCauseRow;
  computed?: RootCauseRow;
  edits: Edits;
  /** Identifies the run, field and position, for the fields the user moves in the lineage graph. */
  layoutKey: string;
  /** The compare run's dataset. */
  dataset: string;
  onGraphFullscreen?: (fullscreen: boolean) => void;
}) {
  const status = statusOf(row);
  const values = row.values ?? {};
  const chains = row.chains ?? [];
  const otherChains = row.other_chains ?? [];
  const notes = row.notes ?? [];
  const covered = chains.some((chain) => chain.covered);
  // After the review changed the release notes, the lineage shows only the notes the row has now.
  const currentNotes = new Set(splitList(row.release_note || ""));
  const showNote = (label: string) => edits.release_note === undefined || currentNotes.has(label);
  // The graph marks the computed input of each chain; a reviewed input is marked where the lineage has it.
  const inputs = new Set(edits.input === undefined ? chains.map((chain) => chain.input) : splitList(row.input || ""));
  const reviewed = (Object.keys(edits) as ReviewField[]).filter((field) => field !== "comment");
  return (
    <div className="space-y-5 text-sm">
      <DialogHeader>
        <DialogTitle className="pr-6 text-[17px] text-white">{row.position} · {row.output}</DialogTitle>
        <DialogDescription className="text-[#8c96a8]">Deviation calculated as B − A (compare minus base).</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2">
          <span className={EYEBROW}>Explanation Status</span>
          <StatusChip status={status} />
        </span>
        {status !== "unchanged" ? (
          <span className="flex items-center gap-2">
            <span className={EYEBROW}>Score</span>
            <span className="text-sm font-semibold tabular-nums text-white">{Math.round(row.confidence)}%</span>
          </span>
        ) : null}
      </div>
      {reviewed.length || row.comment ? (
        <Section title="Post-run review" tone="review">
          <div className="space-y-2 rounded-lg border border-[#f5c400]/25 bg-[#f5c400]/[0.04] px-3.5 py-3">
            {reviewed.map((field) => (
              <p key={field} className="text-[12.5px] leading-5 text-[#dbe2ec]">
                <span className="text-[#8c96a8]">{FIELD_LABEL[field]}: </span>
                {field === "explanation" ? "rewritten (the computed text is below the explanation)" : (
                  <>
                    <span className="text-[#8c96a8] line-through decoration-[#5d6878]">{displayValue(field, edits[field] ?? "")}</span> <span aria-hidden="true">→</span>{" "}
                    <span className="font-medium text-white">{displayValue(field, fieldValue(row, field))}</span>
                  </>
                )}
              </p>
            ))}
            {row.comment ? (
              <p className={cn("text-[12.5px] leading-5 text-white", reviewed.length && "border-t border-[#f5c400]/15 pt-2")}>
                <span className="text-[#8c96a8]">Reviewer note: </span>
                {row.comment}
              </p>
            ) : null}
          </div>
        </Section>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <ValueBox label="Base (A)" value={formatAmount(row.value_a)} />
        <ValueBox label="Compare (B)" value={formatAmount(row.value_b)} />
        <ValueBox label="Difference (B − A)" value={formatDifference(row.difference)} className={differenceClass(row.difference)} />
      </div>
      {chains.length ? (
        <Section title="Lineage" hint={covered ? "compare run · fields changed by the release note" : "compare run · changed fields"}>
          <LineageGraph key={layoutKey} row={row} inputs={inputs} showNote={showNote} layoutKey={layoutKey} dataset={dataset} onFullscreenChange={onGraphFullscreen} />
        </Section>
      ) : status !== "unchanged" && row.lineage ? (
        <Section title="Lineage"><p className="text-[#dbe2ec]">{row.lineage}</p></Section>
      ) : null}
      {notes.length ? (
        <Section title={notes.length > 1 ? "Release notes" : "Release note"}>
          <div className="space-y-2">
            {notes.map((note, index) => (
              <div key={`${note.id}-${index}`} className="rounded-lg border border-[#f5c400]/25 bg-[linear-gradient(110deg,rgba(245,196,0,0.07),rgba(11,15,21,0.4)_60%)] px-3.5 py-3">
                <NoteChip label={note.id} />
                {note.solution ? <p className="mt-2 leading-6 text-white">{note.solution}</p> : null}
                {note.problem ? <p className="mt-1 text-[12px] leading-5 text-[#8c96a8]">Problem: {note.problem}</p> : null}
                {note.workbook || note.sheet ? (
                  <p className="mt-1.5 text-[11px] text-[#687386]">{[note.workbook, note.sheet].filter(Boolean).join(" · ")}</p>
                ) : (
                  <p className="mt-1.5 text-[11px] text-[#687386]">Linked in the review; not in the release notes file.</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      ) : status !== "unchanged" && row.release_note ? (
        <Section title="Release note"><div className="flex flex-wrap gap-1.5">{splitList(row.release_note).map((label) => <NoteChip key={label} label={label} />)}</div></Section>
      ) : null}
      {otherChains.length ? (
        <Section title="Not covered by a release note" tone="warn">
          <div className="space-y-1.5 rounded-lg border border-rose-400/20 bg-rose-400/[0.04] px-3.5 py-3">
            {otherChains.map((chain, index) => <ChainSentence key={`${chain.origin}-${index}`} chain={chain} value={values[chain.origin]} dataset={dataset} showNote={showNote} />)}
          </div>
        </Section>
      ) : null}
      {row.effects ? (
        <Section title="Split of the deviation">
          <div className="grid gap-3 sm:grid-cols-2">
            <ValueBox label="New calculation (on the base data)" value={formatDifference(row.effects.calculation)} className={differenceClass(row.effects.calculation)} />
            <ValueBox label="Changed input data" value={formatDifference(row.effects.data)} className={differenceClass(row.effects.data)} />
          </div>
        </Section>
      ) : null}
      <Section title="Explanation">
        <p className="whitespace-pre-line break-words leading-6 text-[#dbe2ec]">{row.explanation || "No explanation."}</p>
        {edits.explanation !== undefined && computed ? (
          <details className="group rounded-lg border border-[#1f252e] bg-[#0d1218] px-3.5 py-2.5">
            <summary className="cursor-pointer select-none text-[12px] text-[#8c96a8] hover:text-white">Computed explanation</summary>
            <p className="mt-2 whitespace-pre-line break-words text-[12.5px] leading-6 text-[#aab3c2]">{computed.explanation || "No explanation."}</p>
          </details>
        ) : null}
      </Section>
    </div>
  );
}

/** A summary line that starts with a position ("Limit_5 (-7.000): …") shows the position in bold. */
function SummaryLine({ line, positions }: { line: string; positions: Set<string> }) {
  const match = line.match(/^(\S+)( \([^)]*\))?: (.*)$/);
  if (match && positions.has(match[1])) {
    return (
      <p className="leading-6 text-[#dbe2ec]">
        <span className="font-semibold text-white">{match[1]}</span>
        {match[2] ? <span className="tabular-nums text-[#8c96a8]">{match[2]}</span> : null}: {match[3]}
      </p>
    );
  }
  return <p className="leading-6 text-[#dbe2ec]">{line}</p>;
}

function ReviewedTag({ note }: { note?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="mt-1.5 inline-flex cursor-help items-center gap-1 rounded border border-[#f5c400]/30 bg-[#f5c400]/[0.08] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[#f5c400]">
          <PenLine className="h-2.5 w-2.5" aria-hidden="true" />
          Reviewed
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={6} className="max-w-xs leading-5">{note ? <>Reviewer note: {note}</> : "Changed in the post-run review"}</TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------------------------------------------------

export function RootCauseTabContent() {
  const { baseClusterId, comparisonClusterId } = useClusterSelection();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterAId, setClusterAId] = useState(baseClusterId || "");
  const [clusterBId, setClusterBId] = useState(comparisonClusterId || "");
  const [executionsA, setExecutionsA] = useState<Execution[]>([]);
  const [executionsB, setExecutionsB] = useState<Execution[]>([]);
  const [executionA, setExecutionA] = useState("");
  const [executionB, setExecutionB] = useState("");
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [positionCount, setPositionCount] = useState(0);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [outputColumn, setOutputColumn] = useState("");
  const [noteFiles, setNoteFiles] = useState<ReleaseNoteFile[] | null>(null);
  const [releaseNoteId, setReleaseNoteId] = useState("");
  const [noteSummary, setNoteSummary] = useState<ReleaseNoteSummary | null>(null);
  const [noteSummaryLoading, setNoteSummaryLoading] = useState(false);
  const [result, setResult] = useState<RootCauseResult | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [filter, setFilter] = useState("");
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewTurns, setReviewTurns] = useState<ReviewTurn[]>([]);
  const [reviewView, setReviewView] = useState<ReviewView | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSending, setReviewSending] = useState(false);
  const [flashed, setFlashed] = useState<string[]>([]);
  const finalReportRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const flashTimer = useRef<number | null>(null);
  // The lineage graph in the details can go full screen; Escape then leaves full screen instead of closing the details.
  const graphFullscreen = useRef(false);
  const onGraphFullscreen = useCallback((fullscreen: boolean) => {
    graphFullscreen.current = fullscreen;
  }, []);
  // Bumped by every new analysis and every "start over": an answer for an earlier review is dropped.
  const reviewSession = useRef(0);
  const restoredState = useRef(false);
  const { toast } = useToast();

  // A remembered result whose runs were deleted since (e.g. the data was uploaded and executed again) is not shown:
  // its values and lineage describe data that is no longer there.
  const forgetIfRunsDeleted = (stored: RootCauseResult) => {
    const ids = [stored.runs?.base?.execution_id, stored.runs?.compare?.execution_id];
    if (!ids[0] || !ids[1]) return;
    const session = reviewSession.current;
    fetch(API_ENDPOINTS.clustersExecutions)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { executions?: { execution_id?: string }[] } | null) => {
        const executions = data?.executions;
        if (!Array.isArray(executions) || reviewSession.current !== session) return;
        const known = new Set(executions.map((item) => item.execution_id));
        if (ids.every((id) => known.has(id))) return;
        setResult(null);
        setReviewTurns([]);
        setReviewView(null);
        setReviewOpen(false);
        setSelectedPosition(null);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const saved = JSON.parse(stored) as Partial<PersistedState>;
        if (typeof saved.clusterAId === "string") setClusterAId(saved.clusterAId);
        if (typeof saved.clusterBId === "string") setClusterBId(saved.clusterBId);
        if (typeof saved.executionA === "string") setExecutionA(saved.executionA);
        if (typeof saved.executionB === "string") setExecutionB(saved.executionB);
        if (typeof saved.outputColumn === "string") setOutputColumn(saved.outputColumn);
        if (typeof saved.releaseNoteId === "string") setReleaseNoteId(saved.releaseNoteId);
        if (typeof saved.showUnchanged === "boolean") setShowUnchanged(saved.showUnchanged);
        if (saved.result && typeof saved.result === "object") {
          setResult(saved.result);
          if (Array.isArray(saved.reviewTurns)) setReviewTurns(saved.reviewTurns.filter((turn) => turn && typeof turn.id === "string" && typeof turn.text === "string"));
          if (saved.reviewView && typeof saved.reviewView === "object") setReviewView(saved.reviewView);
          if (typeof saved.reviewOpen === "boolean") setReviewOpen(saved.reviewOpen);
          forgetIfRunsDeleted(saved.result);
        }
      }
    } catch {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
    } finally {
      restoredState.current = true;
    }
    // Results of the earlier analysis format are not shown any more; free their space.
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    if (!restoredState.current) return;
    const state: PersistedState = { clusterAId, clusterBId, executionA, executionB, outputColumn, releaseNoteId, showUnchanged, result, reviewTurns, reviewView, reviewOpen };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage full or unavailable */ }
  }, [clusterAId, clusterBId, executionA, executionB, outputColumn, releaseNoteId, showUnchanged, result, reviewTurns, reviewView, reviewOpen]);

  useEffect(() => () => { if (flashTimer.current) window.clearTimeout(flashTimer.current); }, []);

  useEffect(() => {
    fetch(API_ENDPOINTS.clusters)
      .then((response) => response.json())
      .then((data) => setClusters(data.clusters || []))
      .catch(() => toast({ title: "Could not load clusters", variant: "destructive" }));
    fetch(API_ENDPOINTS.releaseNotes)
      .then((response) => (response.ok ? response.json() : { workbooks: [] }))
      .then((data: { workbooks?: ReleaseNoteFile[] }) => setNoteFiles(data.workbooks || []))
      .catch(() => setNoteFiles([]));
  }, [toast]);

  useEffect(() => {
    if (!restoredState.current && baseClusterId) setClusterAId(baseClusterId);
  }, [baseClusterId]);
  useEffect(() => {
    if (!restoredState.current && comparisonClusterId) setClusterBId(comparisonClusterId);
  }, [comparisonClusterId]);

  // A remembered release-notes file that was deleted since is no longer selected.
  useEffect(() => {
    if (noteFiles && releaseNoteId && !noteFiles.some((file) => file.id === releaseNoteId)) setReleaseNoteId("");
  }, [noteFiles, releaseNoteId]);

  // So is a remembered cluster (its execution is cleared when its executions fail to load).
  useEffect(() => {
    if (!clusters.length) return;
    if (clusterAId && !clusters.some((cluster) => cluster.id === clusterAId)) setClusterAId("");
    if (clusterBId && !clusters.some((cluster) => cluster.id === clusterBId)) setClusterBId("");
  }, [clusters, clusterAId, clusterBId]);

  const loadExecutions = async (clusterId: string, side: "A" | "B") => {
    if (!clusterId) return;
    try {
      const response = await fetch(API_ENDPOINTS.clusterById(clusterId));
      const data = await response.json();
      const executions: Execution[] = data.executions || [];
      const keep = (current: string) => (executions.some((execution) => execution.execution_id === current) ? current : executions[0]?.execution_id || "");
      if (side === "A") {
        setExecutionsA(executions);
        setExecutionA(keep);
      } else {
        setExecutionsB(executions);
        setExecutionB(keep);
      }
    } catch {
      toast({ title: "Could not load the executions of the cluster", variant: "destructive" });
    }
  };

  useEffect(() => { void loadExecutions(clusterAId, "A"); }, [clusterAId]);
  useEffect(() => { void loadExecutions(clusterBId, "B"); }, [clusterBId]);

  // The fields both executions have, with how many positions deviate in each.
  useEffect(() => {
    if (!executionA || !executionB) {
      setFields([]);
      return;
    }
    let cancelled = false;
    setFieldsLoading(true);
    fetch(API_ENDPOINTS.rootCauseFields(executionA, executionB))
      .then((response) => (response.ok ? response.json() : { fields: [] }))
      .then((data: { fields?: FieldOption[]; positions?: number }) => {
        if (cancelled) return;
        const list = data.fields || [];
        setFields(list);
        setPositionCount(data.positions || 0);
        setOutputColumn(pickField(list));
      })
      .catch(() => { if (!cancelled) setFields([]); })
      .finally(() => { if (!cancelled) setFieldsLoading(false); });
    return () => { cancelled = true; };
  }, [executionA, executionB]);

  // What the analysis will read from the chosen release-notes file.
  useEffect(() => {
    if (!releaseNoteId) {
      setNoteSummary(null);
      return;
    }
    let cancelled = false;
    setNoteSummaryLoading(true);
    fetch(API_ENDPOINTS.rootCauseReleaseNoteSummary(releaseNoteId))
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ReleaseNoteSummary | null) => { if (!cancelled) setNoteSummary(data); })
      .catch(() => { if (!cancelled) setNoteSummary(null); })
      .finally(() => { if (!cancelled) setNoteSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [releaseNoteId]);

  const selectedField = fields.find((field) => field.name === outputColumn);
  const noteFile = noteFiles?.find((file) => file.id === releaseNoteId) ?? null;
  const hasNoteFiles = (noteFiles?.length ?? 0) > 0;
  const done = {
    base: Boolean(executionA),
    compare: Boolean(executionB),
    field: Boolean(selectedField),
    notes: hasNoteFiles ? Boolean(noteFile) : noteFiles !== null,
  };
  const order = ["base", "compare", "field", "notes"] as const;
  const firstOpen = order.find((key) => !done[key]);
  const stepState = (key: (typeof order)[number]): StepState => (done[key] ? "done" : key === firstOpen ? "current" : "waiting");
  const ready = order.every((key) => done[key]);
  const clusterName = (id: string) => clusters.find((cluster) => cluster.id === id)?.name ?? "";

  const analyze = async () => {
    if (!ready) {
      toast({ title: "Complete the four steps first", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    setSelectedPosition(null);
    setFilter("");
    reviewSession.current += 1;
    setReviewSending(false);
    setReviewTurns([]);
    setReviewView(null);
    try {
      const response = await fetch(API_ENDPOINTS.rootCauseAnalyze, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          execution_id_a: executionA,
          execution_id_b: executionB,
          output_column: outputColumn.trim(),
          position: null,
          release_note_id: releaseNoteId || null,
        }),
      });
      const responseText = await response.text();
      let data: RootCauseResult & { detail?: string };
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(responseText || response.statusText || "Backend returned an invalid response");
      }
      if (!response.ok) throw new Error(data.detail || "Root-cause analysis failed");
      setResult(data);
      setShowUnchanged(false);
      requestAnimationFrame(() => finalReportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      toast({ title: "Root-cause analysis failed", description: error instanceof Error ? error.message : "Request failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------------------------------------------------------------
  // The report as the post-run review left it
  // ------------------------------------------------------------------------------------------------------------------

  const computedRows = useMemo(() => result?.analysis?.rows ?? [], [result]);
  const computedByPosition = useMemo(() => new Map(computedRows.map((row) => [row.position, row])), [computedRows]);
  const report = useMemo(() => (result ? applyReview(result, reviewTurns) : null), [result, reviewTurns]);
  const rows = useMemo(() => report?.rows ?? [], [report]);
  const edits = useMemo(() => new Map(rows.map((row) => [row.position, editsOf(row, computedByPosition.get(row.position))])), [rows, computedByPosition]);
  const editCount = useMemo(
    () => [...edits.values()].reduce((sum, item) => sum + Object.keys(item).length, 0) + (report?.summaryEdited ? 1 : 0) + (report?.nextChecksEdited ? 1 : 0),
    [edits, report],
  );
  const changedRows = useMemo(() => rows.filter(isChanged), [rows]);
  const shownRows = useMemo(() => visibleRows(rows, reviewView, showUnchanged, filter), [rows, reviewView, showUnchanged, filter]);
  const counts = useMemo(() => {
    const found: Record<Status, number> = { explained: 0, partial: 0, unexplained: 0, unchanged: 0 };
    rows.forEach((row) => { found[statusOf(row)] += 1; });
    return found;
  }, [rows]);
  const positionKeys = useMemo(() => new Set(rows.map((row) => row.position)), [rows]);
  const undoableId = useMemo(() => undoableTurn(reviewTurns), [reviewTurns]);
  const suggestions = useMemo(() => reviewSuggestions(rows), [rows]);
  const selectedRow = selectedPosition ? rows.find((row) => row.position === selectedPosition) ?? null : null;
  const resultField = result?.output_column || outputColumn;
  const resultNotesFile = result?.release_note_files?.[0] ?? noteFiles?.find((file) => file.id === result?.release_note_id)?.filename;
  const summaryLines = (report?.summary ?? "").split("\n").filter((line) => line.trim());
  const nextChecks = report?.nextChecks ?? [];
  const narrowed = isNarrowingView(reviewView) ? reviewView : null;
  const missing = [
    !done.base && "the base run",
    !done.compare && "the compare run",
    !done.field && "the field to explain",
    !done.notes && "the release notes file",
  ].filter(Boolean) as string[];

  const flashRows = (positions: string[]) => {
    setFlashed(positions);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashed([]), 2400);
  };

  const openReview = () => {
    setReviewOpen((open) => !open);
    // Below the table on narrower screens: bring the chat into view.
    requestAnimationFrame(() => chatRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const sendReview = async (text: string) => {
    if (!result || !report || reviewSending) return;
    const session = reviewSession.current;
    const history = requestHistory(reviewTurns);
    const before = report.rows;
    setReviewTurns((turns) => [...turns, { id: newId(), role: "user", text, at: Date.now() }]);
    setReviewSending(true);
    try {
      const response = await fetch(API_ENDPOINTS.rootCauseReview, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          output_column: resultField,
          release_note_id: result.release_note_id ?? null,
          runs: result.runs ? { base: runLabel(result.runs.base), compare: runLabel(result.runs.compare) } : {},
          rows: requestRows(before, computedRows),
          summary: report.summary,
          summary_edited: report.summaryEdited,
          next_checks: report.nextChecks,
          next_checks_edited: report.nextChecksEdited,
          view: reviewView ? { ...reviewView, show_unchanged: showUnchanged } : null,
          show_unchanged: showUnchanged,
        }),
      });
      const responseText = await response.text();
      let data: Record<string, unknown>;
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(responseText || response.statusText || "The backend returned an invalid response");
      }
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "The review assistant did not answer");
      if (session !== reviewSession.current) return;
      const changes = (Array.isArray(data.changes) ? data.changes : []) as ReviewChange[];
      const view = (data.view && typeof data.view === "object" ? data.view : null) as ReviewView | null;
      const answer: ReviewTurn = {
        id: newId(),
        role: "assistant",
        text: typeof data.reply === "string" && data.reply.trim() ? data.reply : "Done.",
        at: Date.now(),
        changes,
        lines: describeChanges(before, computedRows, changes),
        summary: typeof data.summary === "string" ? data.summary : null,
        restoreSummary: Boolean(data.restore_summary),
        nextChecks: Array.isArray(data.next_checks) ? (data.next_checks as string[]) : null,
        restoreNextChecks: Boolean(data.restore_next_checks),
        view,
        viewBefore: reviewView,
        showUnchangedBefore: showUnchanged,
        rejected: Array.isArray(data.rejected) ? (data.rejected as string[]) : [],
      };
      setReviewTurns((turns) => [...turns, answer]);
      if (view) {
        setReviewView(isNarrowingView(view) ? view : null);
        setShowUnchanged(view.show_unchanged);
      }
      if (changes.length) flashRows(changes.map((change) => change.position));
    } catch (error) {
      if (session !== reviewSession.current) return;
      const reason = error instanceof Error ? error.message : "Request failed";
      setReviewTurns((turns) => [...turns, { id: newId(), role: "assistant", text: `The review assistant could not answer: ${reason}`, at: Date.now(), error: true }]);
    } finally {
      if (session === reviewSession.current) setReviewSending(false);
    }
  };

  const retryReview = (turnId: string) => {
    const index = reviewTurns.findIndex((turn) => turn.id === turnId);
    const question = index > 0 ? reviewTurns[index - 1] : undefined;
    if (!question || question.role !== "user") return;
    setReviewTurns((turns) => turns.filter((turn) => turn.id !== turnId && turn.id !== question.id));
    void sendReview(question.text);
  };

  const undoReview = (turnId: string) => {
    const turn = reviewTurns.find((item) => item.id === turnId);
    if (!turn) return;
    setReviewTurns((turns) => turns.map((item) => (item.id === turnId ? { ...item, undone: true } : item)));
    if (turn.view) {
      setReviewView(turn.viewBefore ?? null);
      if (typeof turn.showUnchangedBefore === "boolean") setShowUnchanged(turn.showUnchangedBefore);
    }
    flashRows((turn.changes ?? []).map((change) => change.position));
  };

  const resetReview = () => {
    reviewSession.current += 1;
    setReviewSending(false);
    setReviewTurns([]);
    setReviewView(null);
  };

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#f5c400]/30 bg-[#f5c400]/10">
          <GitBranch className="h-5 w-5 text-[#f5c400]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[18px] font-semibold tracking-tight text-white">RootCause analysis</h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[#8c96a8]">
            Explains why a result field differs between two executions: the compare run&apos;s lineage of every position, what changed and which release note covers it. Deviations are B − A.
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <StepPanel step={1} state={stepState("base")} title="Base run" hint="Execution A, the reference">
          <div>
            <FieldLabel>Cluster</FieldLabel>
            <Select value={clusterAId} onValueChange={setClusterAId}>
              <SelectTrigger className={TRIGGER} aria-label="Cluster A"><SelectValue placeholder="Select cluster" /></SelectTrigger>
              <SelectContent>{clusters.map((cluster) => <SelectItem key={cluster.id} value={cluster.id}>{cluster.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Execution</FieldLabel>
            <Select value={executionA} onValueChange={setExecutionA} disabled={!executionsA.length}>
              <SelectTrigger className={TRIGGER} aria-label="Execution A"><SelectValue placeholder="Select execution" /></SelectTrigger>
              <SelectContent>
                {executionsA.map((item) => (
                  <SelectItem key={item.execution_id} value={item.execution_id}>{dateValue(item.executed_date)}{item.code_filename ? ` · ${item.code_filename}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </StepPanel>

        <StepPanel step={2} state={stepState("compare")} title="Compare run" hint="Execution B, the run to explain">
          <div>
            <FieldLabel>Cluster</FieldLabel>
            <Select value={clusterBId} onValueChange={setClusterBId}>
              <SelectTrigger className={TRIGGER} aria-label="Cluster B"><SelectValue placeholder="Select cluster" /></SelectTrigger>
              <SelectContent>{clusters.map((cluster) => <SelectItem key={cluster.id} value={cluster.id}>{cluster.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Execution</FieldLabel>
            <Select value={executionB} onValueChange={setExecutionB} disabled={!executionsB.length}>
              <SelectTrigger className={TRIGGER} aria-label="Execution B"><SelectValue placeholder="Select execution" /></SelectTrigger>
              <SelectContent>
                {executionsB.map((item) => (
                  <SelectItem key={item.execution_id} value={item.execution_id}>{dateValue(item.executed_date)}{item.code_filename ? ` · ${item.code_filename}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </StepPanel>

        <StepPanel step={3} state={stepState("field")} title="Field to explain" hint="A result field of both runs">
          <div>
            <FieldLabel>Output field</FieldLabel>
            <Select value={outputColumn} onValueChange={setOutputColumn} disabled={!fields.length}>
              <SelectTrigger className={TRIGGER} aria-label="Output field">
                <SelectValue placeholder={fieldsLoading ? "Loading fields…" : "Choose both runs first"} />
              </SelectTrigger>
              <SelectContent>
                {fields.map((field) => (
                  <SelectItem key={field.name} value={field.name}>
                    <span>{field.name}</span>
                    <span className="text-xs text-muted-foreground">{field.deviations ? `· ${field.deviations} deviating` : "· no deviations"}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedField ? (
            <div className="rounded-lg border border-[#1f252e] bg-[#0d1218] px-3 py-2.5">
              <p className="text-[22px] font-semibold leading-none tabular-nums text-white">
                {selectedField.deviations}
                <span className="ml-1.5 text-[12px] font-normal text-[#8c96a8]">of {positionCount} positions deviate</span>
              </p>
              {!selectedField.deviations ? <p className="mt-1.5 text-[11px] text-[#8c96a8]">Same value in both runs everywhere.</p> : null}
            </div>
          ) : (
            <p className="text-[11.5px] leading-5 text-[#687386]">The fields both runs have are listed with the number of positions that differ.</p>
          )}
        </StepPanel>

        <StepPanel step={4} state={stepState("notes")} title="Release notes" hint="The notes that may explain the changes">
          {noteFiles !== null && !hasNoteFiles ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <FileSpreadsheet className="h-7 w-7 text-[#3f4957]" />
              <p className="mt-2 max-w-[230px] text-[11.5px] leading-5 text-[#8c96a8]">No release notes uploaded. Upload them in the Release Notes tab; until then every deviation shows as not explained.</p>
            </div>
          ) : (
            <>
              <div>
                <FieldLabel>File</FieldLabel>
                <Select value={releaseNoteId} onValueChange={setReleaseNoteId} disabled={!hasNoteFiles}>
                  <SelectTrigger className={TRIGGER} aria-label="Release notes file">
                    <SelectValue placeholder={noteFiles === null ? "Loading files…" : "Select release notes"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(noteFiles ?? []).map((file) => (
                      <SelectItem key={file.id} value={file.id}>
                        {file.kind === "pdf" ? <FileText className="h-3.5 w-3.5 text-[#8c96a8]" /> : <FileSpreadsheet className="h-3.5 w-3.5 text-[#8c96a8]" />}
                        <span>{file.filename}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {releaseNoteId && noteSummaryLoading ? (
                <p className="flex items-center gap-2 text-[11.5px] text-[#8c96a8]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the file…</p>
              ) : noteSummary && noteSummary.id === releaseNoteId ? (
                <div className="min-h-0 rounded-lg border border-[#1f252e] bg-[#0d1218] px-3 py-2.5">
                  <p className="text-[12px] text-[#dbe2ec]">
                    <span className="font-semibold tabular-nums text-white">{noteSummary.notes}</span> {noteSummary.notes === 1 ? "note" : "notes"}
                    {noteSummary.sheets.length === 1 ? (
                      <span className="text-[#8c96a8]"> · {noteSummary.sheets[0].name}{noteSummary.sheets[0].range ? ` · ${noteSummary.sheets[0].range}` : ""}</span>
                    ) : noteSummary.sheets.length > 1 ? (
                      <span className="text-[#8c96a8]"> · {noteSummary.sheets.length} sheets</span>
                    ) : null}
                  </p>
                  {noteSummary.labels.length ? (
                    <div className="mt-2 flex max-h-[46px] flex-wrap gap-1 overflow-hidden">{noteSummary.labels.map((label) => <NoteChip key={label} label={label} />)}</div>
                  ) : noteSummary.notes === 0 ? (
                    <p className="mt-1 text-[11px] text-amber-300">No release notes were found in this file.</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-[11.5px] leading-5 text-[#687386]">Only the chosen file is used to explain the deviations.</p>
              )}
            </>
          )}
        </StepPanel>
      </div>

      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-[#f5c400]/25 bg-[linear-gradient(110deg,rgba(245,196,0,0.09),rgba(11,15,21,1)_45%)] px-5 py-4">
        <Sparkles className="h-5 w-5 shrink-0 text-[#f5c400]" />
        <div className="min-w-0 flex-1">
          {ready ? (
            <>
              <p className="truncate text-[13.5px] font-semibold text-white">
                {clusterName(clusterAId) || "A"} <span className="text-[#687386]">→</span> {clusterName(clusterBId) || "B"} <span className="text-[#687386]">·</span> {outputColumn}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-[#aab3c2]">
                {selectedField ? `${selectedField.deviations} of ${positionCount} positions deviate` : ""}
                {noteFile ? ` · explained with ${noteFile.filename}` : " · no release notes uploaded"}
              </p>
            </>
          ) : (
            <>
              <p className="text-[13.5px] font-semibold text-white">Set up the analysis</p>
              <p className="mt-0.5 text-[12px] text-[#8c96a8]">Still to choose: {missing.join(", ")}.</p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={!ready || loading}
          className="flex items-center gap-2 rounded-md bg-[#f5c400] px-5 py-2.5 text-[13px] font-semibold text-[#0b0f15] shadow-[0_0_24px_rgba(245,196,0,0.25)] transition-colors hover:bg-[#ffd633] disabled:cursor-not-allowed disabled:bg-[#3a3a2a] disabled:text-[#8c8a70] disabled:shadow-none"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Analyzing…" : "Generate root cause analysis"}
        </button>
      </section>

      {loading ? (
        <div className={cn(PANEL, "space-y-3 p-6")}><Skeleton className="h-5 w-1/3" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
      ) : null}

      {result && report && !loading ? (
        <div ref={finalReportRef} className={cn("grid scroll-mt-6 gap-5", reviewOpen && "2xl:grid-cols-[minmax(0,1fr)_400px] 2xl:items-start")}>
          {/* Below 2xl the chat sits between the table and the summary (display: contents lets the grid order them). */}
          <div className={cn("min-w-0", reviewOpen ? "contents 2xl:block 2xl:space-y-5" : "space-y-5")}>
            <section className={cn(PANEL, "order-1 min-w-0")}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1f252e] px-5 py-4">
                <div className="min-w-0">
                  <p className={EYEBROW}>Results</p>
                  <h3 className="mt-1 text-[16px] font-semibold text-white">
                    {resultField} <span className="font-normal text-[#8c96a8]">· {changedRows.length} of {rows.length} positions deviate</span>
                  </h3>
                  <p className="mt-1 truncate text-[12px] text-[#8c96a8]">
                    {result.runs ? <>{result.runs.base.code || "A"} vs. {result.runs.compare.code || "B"}</> : null}
                    {resultNotesFile ? <> · release notes: {resultNotesFile}</> : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openReview}
                  aria-expanded={reviewOpen}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                    reviewOpen ? "border-[#f5c400] bg-[#f5c400] text-[#0b0f15] hover:bg-[#ffd633]" : "border-[#f5c400]/45 text-[#f5c400] hover:bg-[#f5c400]/10",
                  )}
                  title={reviewOpen ? "Close the post-run review" : "Review the result in a chat: ask questions or say what to change"}
                >
                  <MessageSquareText className="h-4 w-4" />
                  Post-run human review
                  {editCount ? <span className={cn("rounded-full px-1.5 text-[10.5px] font-bold tabular-nums", reviewOpen ? "bg-[#0b0f15]/15" : "bg-[#f5c400]/15")}>{editCount}</span> : null}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
                {(["explained", "partial", "unexplained"] as Status[]).filter((status) => counts[status]).map((status) => <StatusChip key={status} status={status} count={counts[status]} />)}
                {narrowed ? (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#f5c400]/35 bg-[#f5c400]/[0.07] py-[3px] pl-2.5 pr-1 text-[11.5px] text-[#f5c400]">
                    <MessageSquareText className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Review view: {viewLabel(narrowed)}</span>
                    <button type="button" onClick={() => setReviewView(null)} className="rounded-full p-0.5 transition-colors hover:bg-[#f5c400]/15" aria-label="Show every position" title="Show every position">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : null}
                <div className="ml-auto flex flex-wrap items-center gap-3">
                  {rows.length > 10 ? (
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5d6878]" />
                      <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter positions" aria-label="Filter positions" className="h-8 w-44 rounded-md border border-[#252a33] bg-[#0f141b] pl-8 pr-2 text-[12px] text-white outline-none placeholder:text-[#5d6878] focus:border-[#f5c400]/50" />
                    </div>
                  ) : null}
                  {counts.unchanged ? (
                    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#8c96a8]">
                      <Switch checked={showUnchanged} onCheckedChange={setShowUnchanged} aria-label="Show unchanged positions" />
                      Show unchanged ({counts.unchanged})
                    </label>
                  ) : null}
                </div>
              </div>

              <div className="p-5 pt-3">
                <div className="overflow-hidden rounded-lg border border-[#1f252e]">
                  <table className="w-full table-fixed text-[13px]">
                    <thead className="bg-[#0f141b]">
                      <tr className="border-b border-[#1f252e] text-left">
                        <th className={cn(EYEBROW, "w-[15%] px-4 py-3")}>Deviation</th>
                        <th className={cn(EYEBROW, "w-[18%] px-4 py-3")}>Output (B − A)</th>
                        <th className={cn(EYEBROW, "w-[18%] px-4 py-3")}>Input</th>
                        <th className={cn(EYEBROW, "w-[14%] px-4 py-3")}>Release Note</th>
                        <th className={cn(EYEBROW, "w-[19%] px-4 py-3")} title="Explained: a release note covers every change behind the deviation. Partially: some of them. Not explained: none.">Explanation Status</th>
                        <th className={cn(EYEBROW, "w-[10%] px-4 py-3 text-right")} title="How well the release notes fit the changes (field, product type, new source) and how many of the changes they cover.">Score</th>
                        <th className={cn(EYEBROW, "w-[6%] px-2 py-3 text-center")}>View</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownRows.map((row) => {
                        const status = statusOf(row);
                        const score = Math.round(row.confidence);
                        const rowEdits = edits.get(row.position) ?? {};
                        const reviewed = Object.keys(rowEdits).length > 0;
                        return (
                          <tr
                            key={`${row.position}-${row.output}`}
                            className={cn(
                              "cursor-pointer border-b border-[#1a2029] align-top transition-colors duration-700 last:border-0 hover:bg-white/[0.025]",
                              reviewed && "shadow-[inset_2px_0_0_rgba(245,196,0,0.7)]",
                              flashed.includes(row.position) && "bg-[#f5c400]/[0.09]",
                            )}
                            onClick={() => setSelectedPosition(row.position)}
                          >
                            <td className="break-words px-4 py-3.5">
                              <div className="font-semibold text-white">{row.position}</div>
                              {reviewed ? <ReviewedTag note={row.comment} /> : null}
                            </td>
                            <td className="break-words px-4 py-3.5">
                              <span className="text-[11.5px] text-[#8c96a8]">{row.output}</span>
                              <div className={cn("font-semibold tabular-nums", differenceClass(row.difference))}>{formatDifference(row.difference)}</div>
                              <div className="text-[11px] tabular-nums text-[#687386]">{formatAmount(row.value_a)} → {formatAmount(row.value_b)}</div>
                            </td>
                            <td className="break-words px-4 py-3.5 font-medium text-[#e5e9f0]">
                              {row.input || <span className="text-[#5d6878]">–</span>}
                              {rowEdits.input !== undefined ? <EditedMark field="input" computed={rowEdits.input} /> : null}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex flex-wrap items-center gap-1" title={(row.notes ?? []).map((note) => `${note.id}: ${note.solution || note.problem}`).join("\n") || undefined}>
                                {row.release_note ? splitList(row.release_note).map((label) => <NoteChip key={label} label={label} />) : <span className="text-[#5d6878]">–</span>}
                                {rowEdits.release_note !== undefined ? <EditedMark field="release_note" computed={rowEdits.release_note} /> : null}
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="inline-flex items-center">
                                <StatusChip status={status} />
                                {rowEdits.status !== undefined ? <EditedMark field="status" computed={rowEdits.status} /> : null}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              {status === "unchanged" ? <span className="text-[#5d6878]">–</span> : (
                                <div className="ml-auto w-14">
                                  <span className="inline-flex items-center justify-end font-semibold tabular-nums text-white">
                                    {rowEdits.score !== undefined ? <EditedMark field="score" computed={rowEdits.score} /> : null}
                                    <span className={cn(rowEdits.score !== undefined && "ml-1")}>{score}%</span>
                                  </span>
                                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#1c232d]">
                                    <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: STATUS[status].bar }} />
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-3 text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-[#8c96a8] hover:bg-[#f5c400]/10 hover:text-[#f5c400]"
                                title={`View details for ${row.position} ${row.output}`}
                                aria-label={`View details for ${row.position} ${row.output}`}
                                onClick={(event) => { event.stopPropagation(); setSelectedPosition(row.position); }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!shownRows.length ? (
                    <div className="py-8 text-center text-[13px] text-[#8c96a8]">
                      {filter ? "No position matches the filter." : narrowed ? (
                        <>
                          No position fits the review view.{" "}
                          <button type="button" onClick={() => setReviewView(null)} className="font-medium text-[#f5c400] hover:underline">Show every position</button>
                        </>
                      ) : `No position deviates in ${resultField}.`}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className={cn(PANEL, "order-3 min-w-0 px-5 py-4")}>
              <div className="flex items-center gap-2">
                <p className={EYEBROW}>Summary</p>
                {report.summaryChanged || report.nextChecksEdited ? (
                  <span className="inline-flex items-center gap-1 rounded border border-[#f5c400]/30 bg-[#f5c400]/[0.08] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[#f5c400]">
                    <PenLine className="h-2.5 w-2.5" aria-hidden="true" />
                    Reviewed
                  </span>
                ) : null}
              </div>
              <div className="mt-3 space-y-1 break-words text-[13.5px]">
                {summaryLines.length ? summaryLines.map((line, index) => <SummaryLine key={`${index}-${line.slice(0, 24)}`} line={line} positions={positionKeys} />) : <p className="text-[#8c96a8]">No root cause identified.</p>}
              </div>
              {nextChecks.length ? (
                <div className="mt-5 border-t border-[#1f252e] pt-4">
                  <p className={EYEBROW}>Next checks</p>
                  <div className="mt-2.5 space-y-2">
                    {nextChecks.map((item) => (
                      <div key={item} className="flex gap-2.5 break-words text-[13px] leading-6 text-[#dbe2ec]"><AlertCircle className="mt-1 h-4 w-4 shrink-0 text-amber-400" />{item}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              {(result.analysis.evidence ?? []).length ? (
                <p className="mt-4 border-t border-[#1f252e] pt-3 text-[11.5px] leading-5 text-[#687386]">{(result.analysis.evidence ?? []).join(" ")}</p>
              ) : null}
            </section>
          </div>

          {reviewOpen ? (
            <div ref={chatRef} className="order-2 h-[540px] min-w-0 scroll-mt-6 2xl:h-[min(780px,calc(100vh-140px))]">
              <ReviewChat
                className="h-full"
                turns={reviewTurns}
                sending={reviewSending}
                undoableId={undoableId}
                suggestions={suggestions}
                editCount={editCount}
                onSend={(text) => void sendReview(text)}
                onRetry={retryReview}
                onUndo={undoReview}
                onReset={resetReview}
                onClose={() => setReviewOpen(false)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog open={selectedRow !== null} onOpenChange={(open) => { if (!open) setSelectedPosition(null); }}>
        <DialogContent
          // Under a transformed parent, position: fixed would keep the lineage graph's full screen inside the dialog. So
          // the dialog is centred without a CSS translate, and while it is open its zoom-in animation does not keep the
          // final (identity) transform; the closing animation still holds its last frame.
          className="max-h-[94vh] overflow-y-auto border-[#252a33] bg-[#0b0f15] data-[state=open]:[--tw-animation-fill-mode:none] sm:max-w-6xl"
          style={{ translate: "none", top: "3vh", left: 0, right: 0, marginInline: "auto" }}
          onEscapeKeyDown={(event) => {
            if (graphFullscreen.current) event.preventDefault();
          }}
        >
          {selectedRow ? (
            <RowDetails
              row={selectedRow}
              computed={computedByPosition.get(selectedRow.position)}
              edits={edits.get(selectedRow.position) ?? {}}
              layoutKey={`${result?.runs?.compare.execution_id ?? "run"}:${selectedRow.output}:${selectedRow.position}`}
              dataset={result?.runs?.compare.dataset ?? ""}
              onGraphFullscreen={onGraphFullscreen}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
