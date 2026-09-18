"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Bot, CheckCircle2, CircleX, Eye, GitBranch, Loader2, Sparkles, X } from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api-config";
import { useClusterSelection } from "@/context/cluster-selection-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Cluster = { id: string; name: string; dataset_version?: string; code_version?: string };
type Execution = { execution_id: string; executed_date: string; code_filename?: string | null };
type RootCauseTableRow = {
  position: string;
  output: string;
  value_a?: unknown;
  value_b?: unknown;
  difference?: number | null;
  lineage: string;
  input: string;
  release_note: string;
  explanation: string;
  confidence: number;
};
type AgentStage = {
  agent: string;
  status: string;
  findings?: Record<string, unknown>;
};
type RankedDriver = { rank?: number; field: string; positions?: string[]; occurrences?: number; total_abs_output_impact?: number; release_note_support?: string[]; why_it_matters?: string };
type DriverSummary = { field?: string; summary?: string; positions?: string[]; support?: string };
type ReleaseNoteAssessment = { position?: string; status?: string; jira_id?: string; workbook?: string; sheet?: string; matched_changed_fields?: string[]; relevance_score?: number; solution_description?: string; assessment?: string; reason?: string; note?: string };
type ReleaseNoteReviewCandidate = {
  candidate_id: string;
  position: string;
  jira_id?: string | null;
  workbook?: string | null;
  sheet?: string | null;
  matched_fields?: string[];
  matched_changed_fields?: string[];
  relevance_score?: number | null;
  solution_description?: string | null;
  problem_description?: string | null;
  record_text?: string | null;
  label?: string | null;
};
type PendingReleaseNoteReview = {
  status: "requires_review";
  review_id: string;
  review_type: "release_notes";
  message?: string;
  release_note_candidates: ReleaseNoteReviewCandidate[];
  agent_stages?: AgentStage[];
  agent_architecture?: RootCauseResult["agent_architecture"] & { human_in_the_loop?: string; paused_node?: string };
};
type ReviewDecision = { decision: "accept" | "partial" | "reject"; comment: string };
type RootCauseResult = {
  review_id?: string;
  post_run_review_available?: boolean;
  comparison_direction?: string;
  stages: {
    dependencies: string[];
    changed_source_fields: { position: string; field: string; value_a: unknown; value_b: unknown }[];
    release_notes: { workbook?: string; sheet?: string; matched_fields?: string[]; jira_id?: string; solution_description?: string; record?: Record<string, unknown> }[];
    deviations: { key: string; columns: { column_name: string; value_a: unknown; value_b: unknown; difference?: number | null }[] }[];
  };
  analysis: {
    explanation?: string;
    root_cause?: string;
    confidence?: number;
    evidence?: unknown[];
    key_evidence?: string[];
    primary_cause?: string;
    changed_fields?: string[];
    release_note_links?: string[];
    next_checks?: unknown[];
    ranked_drivers?: RankedDriver[];
    driver_summaries?: DriverSummary[];
    release_note_assessments?: ReleaseNoteAssessment[];
    uncertainty_notes?: string[];
    uncertainty_summary?: string;
    validation_plan?: string[];
    human_report_instruction?: string;
    rows?: RootCauseTableRow[];
    detail_rows?: RootCauseTableRow[];
  };
  agent_stages?: AgentStage[];
  agent_architecture?: {
    orchestrator?: string;
    graph_nodes?: string[];
    agents?: string[];
    evidence_merger?: string;
    final_report?: string;
    llm_provider?: string;
  };
};
type RootCauseApiResponse = RootCauseResult | PendingReleaseNoteReview;
type PostRunReleaseNoteDecision = { decision: "accept" | "partial" | "reject"; comment: string };

const AGENT_STEPS = [
  {
    name: "Comparison Analyst Agent",
    description: "Compares execution A and B row by row, keeps only the selected output deviation, and preserves B - A direction.",
    processPreview: [
      "Load execution A and execution B result rows.",
      "Find the shared key column and align rows by position.",
      "Filter the comparison to the selected output field and retain changed positions.",
    ],
  },
  {
    name: "Formula/Lineage Analyst Agent",
    description: "Reads the executed Python code, reconstructs dataframe dependencies, and builds the source-to-output lineage path.",
    processPreview: [
      "Read the Python code attached to both selected executions.",
      "Parse dataframe assignments and extract source-to-derived-field links.",
      "Walk dependencies backward from the selected output to build the full lineage chain.",
    ],
  },
  {
    name: "Input-Change Agent",
    description: "Checks lineage fields against input and result rows to identify which fields actually changed for each position.",
    processPreview: [
      "Map input rows and result rows by position.",
      "Check every lineage field for value changes between execution A and B.",
      "Group changed fields by affected position.",
    ],
  },
  {
    name: "Release-Note Agent",
    description: "Scans uploaded release notes, ranks position-specific candidates, and extracts Jira and solution-description evidence.",
    processPreview: [
      "Scan uploaded release-note workbooks for lineage and output-field terms.",
      "Extract candidate Jira IDs, matched fields, and solution descriptions.",
      "Rank candidates by position match, changed-field match, and problem-description relevance.",
    ],
  },
  {
    name: "Final Rootcause Report",
    description: "Merges the evidence and calls the configured LLM to write the final German root-cause report.",
    processPreview: [
      "Merge comparison, lineage, input changes, and release-note evidence.",
      "Ask the configured LLM for German JSON output grounded in supplied evidence.",
      "Normalize the final report, confidence, evidence, and next checks for display.",
    ],
  },
];

const AGENT_PROGRESS_LABELS: Record<string, string> = {
  "Comparison Analyst Agent": "Comparison",
  "Formula/Lineage Analyst Agent": "Lineage",
  "Input-Change Agent": "Input changes",
  "Release-Note Agent": "Release notes",
  "Final Rootcause Report": "Final report",
};

const displayValue = (value: unknown) => value === null || value === undefined ? "-" : String(value);
const displayListItem = (value: unknown) => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};
const displayFindingValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
const formatFindingLabel = (value: string) => value.replace(/_/g, " ");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const lineageParts = (value: unknown) => typeof value === "string"
  ? value.split(/\s*(?:->|→)\s*/).map((part) => part.trim()).filter(Boolean)
  : [];
const isLineageValue = (key: string, value: unknown) =>
  /lineage|calculation_path|path/i.test(key) && lineageParts(value).length > 1;
const renderLineageChain = (value: unknown) => {
  const parts = lineageParts(value);
  if (parts.length <= 1) return <p className="break-words text-xs leading-5 text-[#f2f4f7]">{displayFindingValue(value)}</p>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {parts.map((part, index) => (
        <div key={`${part}-${index}`} className="flex items-center gap-1.5">
          <span className={`rounded-sm border px-2 py-1 text-xs font-medium ${index === parts.length - 1 ? "border-[#f5c400]/40 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#252a33] bg-[#080b10] text-[#f2f4f7]"}`}>{part}</span>
          {index < parts.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-[#687386]" aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
};
const renderSummaryRecord = (value: Record<string, unknown>) => {
  const preferred = ["position", "field", "value_a", "value_b", "difference", "classification", "jira_id", "workbook", "sheet", "calculation_path"];
  const parts = preferred
    .filter((key) => value[key] !== undefined && value[key] !== null && value[key] !== "")
    .map((key) => [key, value[key]] as const);
  const entries = parts.length ? parts : Object.entries(value).slice(0, 4);
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {entries.map(([key, item]) => (
        <div key={key} className="rounded-sm border border-[#252a33] bg-[#05080d] px-2 py-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#687386]">{formatFindingLabel(key)}</p>
          <div className="mt-1">{isLineageValue(key, item) ? renderLineageChain(item) : <p className="break-words text-xs leading-5 text-[#f2f4f7]">{displayFindingValue(item)}</p>}</div>
        </div>
      ))}
    </div>
  );
};
const renderFindingValue = (value: unknown, fieldKey = "") => {
  if (isLineageValue(fieldKey, value)) return renderLineageChain(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-xs text-[#8c96a8]">None found</p>;
    if (value.every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean")) {
      return <div className="flex flex-wrap gap-1.5">{value.map((item, index) => <Badge key={`${String(item)}-${index}`} variant="secondary" className="rounded-sm text-[11px]">{String(item)}</Badge>)}</div>;
    }
    return <div className="space-y-2">{value.slice(0, 6).map((item, index) => <div key={index} className="rounded-sm border border-[#252a33] bg-[#080b10] p-2">{isRecord(item) ? renderSummaryRecord(item) : <p className="text-xs leading-5 text-[#f2f4f7]">{displayFindingValue(item)}</p>}</div>)}{value.length > 6 ? <p className="text-xs text-[#8c96a8]">+{value.length - 6} more</p> : null}</div>;
  }
  if (isRecord(value)) {
    return <div className="grid gap-2">{Object.entries(value).slice(0, 8).map(([nestedKey, nestedValue]) => <div key={nestedKey} className="rounded-sm border border-[#252a33] bg-[#05080d] px-2 py-1.5"><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#687386]">{formatFindingLabel(nestedKey)}</p><div className="mt-1 text-xs leading-5 text-[#f2f4f7]">{Array.isArray(nestedValue) ? `${nestedValue.length} item${nestedValue.length === 1 ? "" : "s"}` : isLineageValue(nestedKey, nestedValue) ? renderLineageChain(nestedValue) : displayFindingValue(nestedValue)}</div></div>)}</div>;
  }
  return <p className="break-words text-xs leading-5 text-[#f2f4f7]">{displayFindingValue(value)}</p>;
};
const processSteps = (stage?: AgentStage, previewSteps: string[] = [], isComplete?: boolean, isActive?: boolean) => {
  const value = stage?.findings?.process_steps;
  if (Array.isArray(value)) return value.map(displayFindingValue).filter((item) => item !== "-");
  return isComplete || isActive ? previewSteps : [];
};
const asNumber = (value: unknown) => typeof value === "number" ? value : Number.isFinite(Number(value)) ? Number(value) : 0;
const asText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : "-";
const asRecordValue = (record: Record<string, unknown> | undefined, key: string) => record?.[key];
const summarizeChangedFields = (value: unknown) => {
  if (!isRecord(value)) return "No position-level changed-field map was returned.";
  const entries = Object.entries(value).filter(([, fields]) => Array.isArray(fields) && fields.length > 0);
  if (!entries.length) return "No changed fields were mapped to individual positions.";
  return entries.slice(0, 3).map(([position, fields]) => `${position}: ${(fields as unknown[]).map(String).join(", ")}`).join("; ") + (entries.length > 3 ? `; +${entries.length - 3} more positions` : "");
};
const summarizeReleaseNoteCounts = (value: unknown) => {
  if (!isRecord(value)) return "No position-specific release-note map was returned.";
  const entries = Object.entries(value).filter(([, count]) => asNumber(count) > 0);
  if (!entries.length) return "No release notes matched both position context and changed fields.";
  return entries.slice(0, 4).map(([position, count]) => `${position}: ${asNumber(count)} candidate${asNumber(count) === 1 ? "" : "s"}`).join("; ") + (entries.length > 4 ? `; +${entries.length - 4} more positions` : "");
};
const agentTakeaway = (stepName: string, stage?: AgentStage, isActive?: boolean, isComplete?: boolean) => {
  if (!stage?.findings) {
    if (isActive) return "This agent is currently working through its evidence checks.";
    if (isComplete) return "This agent has passed its processing step; detailed findings will appear when the backend returns the completed graph trace.";
    return "Waiting for this agent to run.";
  }

  const findings = stage.findings;
  switch (stepName) {
    case "Comparison Analyst Agent":
      return `Reviewed ${asNumber(asRecordValue(findings, "positions_reviewed"))} position${asNumber(asRecordValue(findings, "positions_reviewed")) === 1 ? "" : "s"} using key column ${asText(asRecordValue(findings, "key_column"))}; found ${asNumber(asRecordValue(findings, "deviations_found"))} selected output deviation${asNumber(asRecordValue(findings, "deviations_found")) === 1 ? "" : "s"}.`;
    case "Formula/Lineage Analyst Agent":
      return asText(asRecordValue(findings, "calculation_path")) !== "-"
        ? <span className="space-y-2"><span className="block">Reconstructed calculation path:</span>{renderLineageChain(asRecordValue(findings, "calculation_path"))}</span>
        : "Could not reconstruct a full calculation path from the uploaded code.";
    case "Input-Change Agent":
      return `${asNumber(asRecordValue(findings, "changed_source_fields"))} changed lineage/source field${asNumber(asRecordValue(findings, "changed_source_fields")) === 1 ? "" : "s"} found. ${summarizeChangedFields(asRecordValue(findings, "changed_fields_by_position"))}`;
    case "Release-Note Agent":
      if (asRecordValue(findings, "review_required") === true || asRecordValue(findings, "review_type") === "release_notes") {
        return `${asNumber(asRecordValue(findings, "candidate_count"))} release-note candidate${asNumber(asRecordValue(findings, "candidate_count")) === 1 ? "" : "s"} found. Human review is required before the final report can continue.`;
      }
      return `${asNumber(asRecordValue(findings, "release_notes_found"))} broad release-note candidate${asNumber(asRecordValue(findings, "release_notes_found")) === 1 ? "" : "s"} found. ${summarizeReleaseNoteCounts(asRecordValue(findings, "position_specific_release_notes"))}`;
    case "Final Rootcause Report":
      return asRecordValue(findings, "llm_error")
        ? `LLM report fell back because of: ${displayFindingValue(asRecordValue(findings, "llm_error"))}`
        : `Merged evidence and completed the final report with ${Math.round(asNumber(asRecordValue(findings, "confidence")))}% confidence using ${asText(asRecordValue(findings, "llm_model"))}.`;
    default:
      return "This agent completed its assigned evidence step.";
  }
};
const dateValue = (value: string) => new Date(value).toLocaleString();
const displayDifference = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const formatted = Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Number(value) > 0 ? `+${formatted}` : formatted;
};
const formatExplanation = (value: string | undefined) => {
  if (!value) return "-";
  return value
    .replace(/\s*\n\s*/g, "\n")
    .replace(/([.!?])\s+(?=[A-Z0-9"'])/g, "$1\n");
};
const expectationStatus = (releaseNote: string) => releaseNote
  ? { label: "Expected", icon: CheckCircle2, className: "text-emerald-500 dark:text-emerald-400" }
  : { label: "Not expected", icon: CircleX, className: "text-muted-foreground" };
const differenceClassName = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(Number(value)) || Number(value) === 0) {
    return "text-muted-foreground";
  }
  return Number(value) < 0
    ? "font-bold text-red-600 dark:text-red-400"
    : "font-bold text-green-600 dark:text-green-400";
};
const displayLineage = (lineage: string, input: string, output: string) => {
  const inputFields = new Set(
    input
      .split(",")
      .map((field) => field.trim().toLowerCase())
      .filter(Boolean),
  );
  return lineage
    .split("->")
    .map((field) => field.trim())
    .filter((field) => field && field.toLowerCase() !== output.trim().toLowerCase() && !inputFields.has(field.toLowerCase()))
    .join(" -> ");
};

  const displayFullLineage = (lineage: string) => lineage.trim();

const ROOT_CAUSE_AGENTS_STORAGE_KEY = "dataflow_root_cause_agents_state_v3";

type PersistedRootCauseState = {
  clusterAId: string;
  clusterBId: string;
  executionA: string;
  executionB: string;
  outputColumn: string;
  position: string;
  positions: string[];
  showUnchanged: boolean;
  resultView: "summary" | "lineage";
  result: RootCauseResult | null;
};

export function RootCauseAIAgentsTabContent() {
  const storageKey = ROOT_CAUSE_AGENTS_STORAGE_KEY;
  const { baseClusterId, comparisonClusterId } = useClusterSelection();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterAId, setClusterAId] = useState(baseClusterId || "");
  const [clusterBId, setClusterBId] = useState(comparisonClusterId || "");
  const [executionsA, setExecutionsA] = useState<Execution[]>([]);
  const [executionsB, setExecutionsB] = useState<Execution[]>([]);
  const [executionA, setExecutionA] = useState("");
  const [executionB, setExecutionB] = useState("");
  const [selectedRow, setSelectedRow] = useState<RootCauseTableRow | null>(null);
  const [outputColumn, setOutputColumn] = useState("Carrying Amount");
  const [position, setPosition] = useState("all");
  const [positions, setPositions] = useState<string[]>([]);
  const [result, setResult] = useState<RootCauseResult | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [resultView, setResultView] = useState<"summary" | "lineage">("summary");
  const [loading, setLoading] = useState(false);
  const [pendingReview, setPendingReview] = useState<PendingReleaseNoteReview | null>(null);
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, ReviewDecision>>({});
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewFullscreenOpen, setReviewFullscreenOpen] = useState(false);
  const [postRunReviewOpen, setPostRunReviewOpen] = useState(false);
  const [postRunPrimaryCause, setPostRunPrimaryCause] = useState("");
  const [postRunDecisions, setPostRunDecisions] = useState<Record<string, PostRunReleaseNoteDecision>>({});
  const [postRunSubmitting, setPostRunSubmitting] = useState(false);
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [activeAgentStep, setActiveAgentStep] = useState(0);
  const agentCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const finalReportRef = useRef<HTMLDivElement | null>(null);
  const previousLoading = useRef(false);
  const restoredState = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const saved = JSON.parse(stored) as Partial<PersistedRootCauseState>;
        if (typeof saved.clusterAId === "string") setClusterAId(saved.clusterAId);
        if (typeof saved.clusterBId === "string") setClusterBId(saved.clusterBId);
        if (typeof saved.executionA === "string") setExecutionA(saved.executionA);
        if (typeof saved.executionB === "string") setExecutionB(saved.executionB);
        if (typeof saved.outputColumn === "string") setOutputColumn(saved.outputColumn);
        if (typeof saved.position === "string") setPosition(saved.position);
        if (typeof saved.showUnchanged === "boolean") setShowUnchanged(saved.showUnchanged);
        if (saved.resultView === "summary" || saved.resultView === "lineage") {
          setResultView(saved.resultView);
        } else if (typeof (saved as { showLineageDetail?: boolean }).showLineageDetail === "boolean") {
          setResultView((saved as { showLineageDetail: boolean }).showLineageDetail ? "lineage" : "summary");
        }
        if (Array.isArray(saved.positions)) setPositions(saved.positions.filter((item): item is string => typeof item === "string"));
        if (saved.result && typeof saved.result === "object") setResult(saved.result as RootCauseResult);
      }
    } catch {
      localStorage.removeItem(storageKey);
    } finally {
      restoredState.current = true;
    }
  }, [storageKey]);

  useEffect(() => {
    if (!restoredState.current || typeof window === "undefined") return;
    const state: PersistedRootCauseState = {
      clusterAId,
      clusterBId,
      executionA,
      executionB,
      outputColumn,
      position,
      positions,
      showUnchanged,
      resultView,
      result,
    };
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [clusterAId, clusterBId, executionA, executionB, outputColumn, position, positions, showUnchanged, resultView, result, storageKey]);

  useEffect(() => {
    fetch(API_ENDPOINTS.clusters)
      .then((response) => response.json())
      .then((data) => setClusters(data.clusters || []))
      .catch(() => toast({ title: "Could not load clusters", variant: "destructive" }));
  }, [toast]);

  useEffect(() => {
    if (!restoredState.current && baseClusterId) setClusterAId(baseClusterId);
  }, [baseClusterId]);
  useEffect(() => {
    if (!restoredState.current && comparisonClusterId) setClusterBId(comparisonClusterId);
  }, [comparisonClusterId]);

  const loadExecutions = async (clusterId: string, side: "A" | "B") => {
    if (!clusterId) return;
    const response = await fetch(API_ENDPOINTS.clusterById(clusterId));
    const data = await response.json();
    const executions: Execution[] = data.executions || [];
    if (side === "A") {
      setExecutionsA(executions);
      setExecutionA((current) => executions.some((execution) => execution.execution_id === current)
        ? current
        : executions[0]?.execution_id || "");
    } else {
      setExecutionsB(executions);
      setExecutionB((current) => executions.some((execution) => execution.execution_id === current)
        ? current
        : executions[0]?.execution_id || "");
    }
  };

  useEffect(() => { void loadExecutions(clusterAId, "A"); }, [clusterAId]);
  useEffect(() => { void loadExecutions(clusterBId, "B"); }, [clusterBId]);

  useEffect(() => {
    if (!loading) {
      setActiveAgentStep(0);
      return;
    }
    const releaseNoteIndex = AGENT_STEPS.findIndex((step) => step.name === "Release-Note Agent");
    setActiveAgentStep(pendingReview ? Math.min(releaseNoteIndex + 1, AGENT_STEPS.length - 1) : 0);
    const interval = window.setInterval(() => {
      setActiveAgentStep((current) => Math.min(current + 1, AGENT_STEPS.length - 1));
    }, 1400);
    return () => window.clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    const releaseNoteIndex = AGENT_STEPS.findIndex((step) => step.name === "Release-Note Agent");
    const targetIndex = pendingReview && !loading ? releaseNoteIndex : loading ? activeAgentStep : -1;
    if (targetIndex < 0) return;
    const targetName = AGENT_STEPS[targetIndex]?.name;
    if (!targetName) return;
    const target = agentCardRefs.current[targetName];
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeAgentStep, loading, pendingReview]);

  useEffect(() => {
    const finishedRun = Boolean(result && !loading && previousLoading.current);
    previousLoading.current = loading;
    if (!finishedRun) return;
    const frame = window.requestAnimationFrame(() => {
      finalReportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, result]);

  useEffect(() => {
    if (!postRunSubmitting) return;
    const frame = window.requestAnimationFrame(() => {
      finalReportRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [postRunSubmitting]);

  const analyze = async () => {
    if (!executionA || !executionB || !outputColumn.trim()) {
      toast({ title: "Select both executions and an output field", variant: "destructive" });
      return;
    }
    setLoading(true);
    setTraceExpanded(true);
    setResult(null);
    setPendingReview(null);
    setReviewDecisions({});
    setReviewFullscreenOpen(false);
    try {
      const response = await fetch(API_ENDPOINTS.rootCauseAgentsAnalyze, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          execution_id_a: executionA,
          execution_id_b: executionB,
          output_column: outputColumn.trim(),
          position: position === "all" ? null : position,
        }),
      });
      const responseText = await response.text();
      let data: RootCauseApiResponse | { detail?: string } | null = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = null;
      }
      if (!response.ok) {
        const detail = data && "detail" in data ? data.detail : undefined;
        throw new Error(detail || responseText || "Root-cause analysis failed");
      }
      if (data && "status" in data && data.status === "requires_review") {
        const review = data as PendingReleaseNoteReview;
        setPendingReview(review);
        setReviewDecisions(Object.fromEntries(
          review.release_note_candidates.map((candidate) => [candidate.candidate_id, { decision: "accept", comment: "" } satisfies ReviewDecision]),
        ));
        setTraceExpanded(true);
        return;
      }
      if (!data || !("analysis" in data)) throw new Error("Root-cause analysis returned an invalid response");
      setResult(data);
      setTraceExpanded(false);
      setShowUnchanged(false);
      setResultView("summary");
      const keys = (data.stages?.deviations || []).map((row: { key: string }) => String(row.key));
      setPositions(keys);
    } catch (error) {
      toast({ title: "Root-cause analysis failed", description: error instanceof Error ? error.message : "Request failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const submitReleaseNoteReview = async () => {
    if (!pendingReview) return;
    setReviewSubmitting(true);
    setReviewFullscreenOpen(false);
    setLoading(true);
    setTraceExpanded(true);
    try {
      const response = await fetch(API_ENDPOINTS.rootCauseAgentsAnalyze, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          execution_id_a: executionA,
          execution_id_b: executionB,
          output_column: outputColumn.trim(),
          position: position === "all" ? null : position,
          review_id: pendingReview.review_id,
          human_review: {
            review_type: "release_notes",
            decisions: pendingReview.release_note_candidates.map((candidate) => ({
              candidate_id: candidate.candidate_id,
              position: candidate.position,
              jira_id: candidate.jira_id,
              workbook: candidate.workbook,
              sheet: candidate.sheet,
              decision: reviewDecisions[candidate.candidate_id]?.decision || "accept",
              comment: reviewDecisions[candidate.candidate_id]?.comment || "",
            })),
          },
        }),
      });
      const responseText = await response.text();
      let data: RootCauseResult | { detail?: string } | null = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = null;
      }
      if (!response.ok) {
        const detail = data && "detail" in data ? data.detail : undefined;
        throw new Error(detail || responseText || "Release-note review resume failed");
      }
      if (!data || !("analysis" in data)) throw new Error("Resume returned an invalid response");
      setResult(data);
      setPendingReview(null);
      setReviewDecisions({});
      setTraceExpanded(false);
      setShowUnchanged(false);
      setResultView("summary");
      const keys = (data.stages?.deviations || []).map((row: { key: string }) => String(row.key));
      setPositions(keys);
    } catch (error) {
      toast({ title: "Release-note review failed", description: error instanceof Error ? error.message : "Request failed", variant: "destructive" });
    } finally {
      setReviewSubmitting(false);
      setLoading(false);
    }
  };

  const openPostRunReview = () => {
    if (!result) return;
    setPostRunPrimaryCause(result.analysis.primary_cause || "");
    setPostRunDecisions(Object.fromEntries(
      (result.stages?.release_notes || []).map((_, index) => [String(index), { decision: "accept", comment: "" } satisfies PostRunReleaseNoteDecision]),
    ));
    setPostRunReviewOpen(true);
  };

  const submitPostRunReview = async () => {
    if (!result?.review_id) return;
    setPostRunSubmitting(true);
    setPostRunReviewOpen(false);
    try {
      const response = await fetch(API_ENDPOINTS.rootCauseAgentsAnalyze, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          execution_id_a: executionA,
          execution_id_b: executionB,
          output_column: outputColumn.trim(),
          position: position === "all" ? null : position,
          review_id: result.review_id,
          human_review: {
            review_type: "post_run",
            primary_cause_override: postRunPrimaryCause.trim(),
            release_note_decisions: Object.entries(postRunDecisions).map(([index, decision]) => ({
              index,
              decision: decision.decision,
              comment: decision.comment,
            })),
          },
        }),
      });
      const responseText = await response.text();
      let data: RootCauseResult | { detail?: string } | null = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = null;
      }
      if (!response.ok) {
        const detail = data && "detail" in data ? data.detail : undefined;
        throw new Error(detail || responseText || "Post-run review failed");
      }
      if (!data || !("analysis" in data)) throw new Error("Post-run review returned an invalid response");
      setResult(data);
      setTraceExpanded(false);
      setShowUnchanged(false);
      setResultView("summary");
      toast({ title: "Final report regenerated", description: "Your human review overrides were applied to the final report." });
    } catch (error) {
      toast({ title: "Post-run review failed", description: error instanceof Error ? error.message : "Request failed", variant: "destructive" });
    } finally {
      setPostRunSubmitting(false);
    }
  };

  const selectedCluster = (id: string) => clusters.find((cluster) => cluster.id === id);
  const confidence = Math.round(result?.analysis?.confidence ?? 0);
  const resultRows = result?.analysis?.rows || [];
  const summaryRows = resultRows.filter((row) => row.output.trim().toLowerCase() === outputColumn.trim().toLowerCase());
  const changedRows = summaryRows.filter((row) => {
    const difference = Number(row.difference);
    return Number.isFinite(difference) && difference !== 0;
  });
  const displayedRows = showUnchanged ? summaryRows : changedRows;
  const detailRows = result?.analysis?.detail_rows || [];
  const agentStages = result?.agent_stages || pendingReview?.agent_stages || [];
  const stageByAgent = new Map(agentStages.map((stage) => [stage.agent, stage]));
  const finalReportLineage = summaryRows[0]?.lineage || [...(result?.stages?.dependencies || []), outputColumn].filter(Boolean).join(" -> ");
  const finalReportChangedFields = result?.analysis?.changed_fields?.length
    ? result.analysis.changed_fields
    : Array.from(new Set((result?.stages?.changed_source_fields || []).map((item) => item.field).filter(Boolean)));
  const finalReportReleaseNotes = result?.stages?.release_notes || [];
  const rankedDrivers = result?.analysis?.ranked_drivers || [];
  const driverSummaries = result?.analysis?.driver_summaries || [];
  const keyEvidence = result?.analysis?.key_evidence || [];
  const releaseNoteAssessments = result?.analysis?.release_note_assessments || [];
  const releaseNoteAgentIndex = AGENT_STEPS.findIndex((step) => step.name === "Release-Note Agent");
  const reviewPaused = Boolean(pendingReview && !loading);
  const progressPercent = result
    ? postRunSubmitting
      ? 94
      : 100
    : reviewPaused
      ? ((releaseNoteAgentIndex + 1) / AGENT_STEPS.length) * 100
      : loading
        ? ((activeAgentStep + 1) / AGENT_STEPS.length) * 100
        : 0;
  const progressLabel = result
    ? postRunSubmitting
      ? "Applying your review to the final root-cause report"
      : "Root-cause analysis complete"
    : reviewPaused
      ? "Your review is needed for the release-note links"
      : loading
        ? activeAgentStep <= 0
          ? "Building the evidence map"
          : activeAgentStep === 1
            ? "Tracing the calculation path"
            : activeAgentStep === 2
              ? "Comparing changed inputs"
              : activeAgentStep === 3
                ? "Checking release-note evidence"
                : activeAgentStep >= AGENT_STEPS.length - 1
                  ? "Finishing the root-cause report"
                  : "Connecting the evidence"
        : "Ready when you are";
  const completedAgentSteps = result
    ? AGENT_STEPS
    : reviewPaused
      ? AGENT_STEPS.slice(0, releaseNoteAgentIndex)
      : loading
        ? AGENT_STEPS.slice(0, activeAgentStep)
        : [];

  return (
    <div className="space-y-6 pb-20">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GitBranch className="h-5 w-5" /> RootCause analysis</CardTitle>
          <p className="text-sm text-muted-foreground">Explain a result deviation using execution data, technical lineage, changed source fields, and release notes. All deviations are calculated as B - A.</p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>Cluster A (Base)</Label><Select value={clusterAId} onValueChange={setClusterAId}><SelectTrigger><SelectValue placeholder="Select base cluster" /></SelectTrigger><SelectContent>{clusters.map((cluster) => <SelectItem key={cluster.id} value={cluster.id}>{cluster.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Cluster B (Compare)</Label><Select value={clusterBId} onValueChange={setClusterBId}><SelectTrigger><SelectValue placeholder="Select comparison cluster" /></SelectTrigger><SelectContent>{clusters.map((cluster) => <SelectItem key={cluster.id} value={cluster.id}>{cluster.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Execution A</Label><Select value={executionA} onValueChange={setExecutionA}><SelectTrigger><SelectValue placeholder="Select execution" /></SelectTrigger><SelectContent>{executionsA.map((execution) => <SelectItem key={execution.execution_id} value={execution.execution_id}>{dateValue(execution.executed_date)}{execution.code_filename ? ` - ${execution.code_filename}` : ""}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Execution B</Label><Select value={executionB} onValueChange={setExecutionB}><SelectTrigger><SelectValue placeholder="Select execution" /></SelectTrigger><SelectContent>{executionsB.map((execution) => <SelectItem key={execution.execution_id} value={execution.execution_id}>{dateValue(execution.executed_date)}{execution.code_filename ? ` - ${execution.code_filename}` : ""}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Output field</Label><input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={outputColumn} onChange={(event) => setOutputColumn(event.target.value)} placeholder="Carrying Amount" /></div>
          <div className="space-y-2"><Label>Position</Label><Select value={position} onValueChange={setPosition}><SelectTrigger><SelectValue placeholder="All positions" /></SelectTrigger><SelectContent><SelectItem value="all">All positions</SelectItem>{positions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
          <div className="md:col-span-2"><Button onClick={() => void analyze()} disabled={loading || reviewSubmitting}><Sparkles className="mr-2 h-4 w-4" />{loading ? "Analyzing..." : "Generate root cause analysis"}</Button></div>
        </CardContent>
      </Card>

      {(loading || result || pendingReview) && <Card className="border-[#f5c400]/25 bg-[#0b0f15]">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2"><Bot className="h-5 w-5 text-[#f5c400]" /> Agent reasoning trace</span>
              <div className="flex items-center gap-2">
                {result && !loading ? <Button size="sm" variant="outline" onClick={() => setTraceExpanded((current) => !current)}>{traceExpanded ? "Hide trace" : "Show trace"}</Button> : null}
                <Badge variant="outline">{result?.agent_architecture?.orchestrator || pendingReview?.agent_architecture?.orchestrator || "LangGraph StateGraph"}</Badge>
              </div>
          </CardTitle>
          <p className="text-sm text-muted-foreground">{loading ? AGENT_STEPS[activeAgentStep]?.description : pendingReview ? "Paused at the Release-Note Agent for human review" : `${agentStages.length || AGENT_STEPS.length} graph stages completed`}</p>
        </CardHeader>
          {(loading || traceExpanded) ? <CardContent className="space-y-3">
          {AGENT_STEPS.map((step, index) => {
            const stage = stageByAgent.get(step.name);
            const isActive = loading && index === activeAgentStep;
            const isComplete = Boolean(stage) || (loading && index < activeAgentStep);
            const reviewWasSubmitted = reviewSubmitting && step.name === "Release-Note Agent";
            const status = reviewWasSubmitted ? "completed" : stage?.status || (isComplete ? "completed" : isActive ? "running" : "queued");
            const requiresReview = status === "requires_review";
            const steps = processSteps(stage, step.processPreview, isComplete, isActive);
            const findingEntries = stage?.findings ? Object.entries(stage.findings).filter(([key]) => key !== "process_steps") : [];
            const takeaway = reviewWasSubmitted
              ? "Release-note links reviewed. Continuing to the final report."
              : agentTakeaway(step.name, stage, isActive, isComplete);
            return (
              <div ref={(node) => { agentCardRefs.current[step.name] = node; }} key={step.name} className={`rounded-md border p-3 ${requiresReview ? "border-amber-400/70 bg-amber-400/10" : isActive ? "border-[#f5c400]/50 bg-[#f5c400]/10" : isComplete ? "border-emerald-500/25 bg-emerald-500/5" : "border-[#252a33] bg-[#080b10]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#f2f4f7]">
                      {requiresReview ? <AlertCircle className="h-4 w-4 text-amber-400" /> : isActive ? <Loader2 className="h-4 w-4 animate-spin text-[#f5c400]" /> : isComplete ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <CircleX className="h-4 w-4 text-[#687386]" />}
                      <span>{step.name}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#8c96a8]">{step.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge className={requiresReview ? "border-amber-400/60 bg-amber-400/15 text-amber-200" : undefined} variant={status === "completed" ? "default" : status === "running" ? "outline" : "secondary"}>{status}</Badge>
                    {requiresReview && pendingReview ? (
                      <Button size="sm" variant="outline" className="rootcause-review-button relative overflow-hidden border-amber-300 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-3 font-semibold text-[#16120a] shadow-[0_0_0_1px_rgba(251,191,36,0.22),0_5px_18px_rgba(245,158,11,0.24)] transition-[transform,box-shadow,filter] duration-300 hover:scale-[1.03] hover:border-yellow-200 hover:bg-gradient-to-r hover:from-amber-200 hover:via-yellow-300 hover:to-amber-400 hover:text-[#16120a] hover:shadow-[0_0_0_1px_rgba(253,224,71,0.38),0_8px_24px_rgba(245,158,11,0.34)] focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111820]" onClick={() => setReviewFullscreenOpen(true)} disabled={reviewSubmitting}>
                        <Eye className="mr-2 h-4 w-4" />
                        Review
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 rounded-sm border border-[#f5c400]/20 bg-[#f5c400]/5 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f5c400]">Agent takeaway</p>
                  <div className="mt-1 text-sm leading-5 text-[#f2f4f7]">{takeaway}</div>
                </div>
                {steps.length > 0 ? (
                  <div className="mt-3 rounded-sm border border-[#252a33] bg-[#05080d] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Agent process</p>
                    <div className="mt-3 space-y-2">
                      {steps.map((item, stepIndex) => (
                        <div key={`${step.name}-process-${stepIndex}`} className="flex gap-3 rounded-sm border border-[#252a33] bg-[#080b10] px-3 py-2">
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-[#f5c400]/30 bg-[#f5c400]/10 text-[10px] font-bold text-[#f5c400]">{stepIndex + 1}</span>
                          <p className="text-xs leading-5 text-[#f2f4f7]">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {findingEntries.length > 0 ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {findingEntries.map(([key, value]) => (
                      <div key={`${step.name}-${key}`} className="rounded-sm border border-[#252a33] bg-[#05080d] p-2">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">{formatFindingLabel(key)}</p>
                        {renderFindingValue(value, key)}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent> : null}
      </Card>}
      {pendingReview && reviewFullscreenOpen && !loading && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm md:p-8">
        <div className="my-auto flex w-full max-w-7xl flex-col gap-4">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background/95 pb-4 backdrop-blur-sm">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-xl font-semibold text-foreground md:text-2xl">Release-note human review</h3>
              <p className="mt-1 text-sm text-muted-foreground">Review links proposed by the Release-Note Agent before the LangGraph run continues.</p>
            </div>
            <button type="button" onClick={() => setReviewFullscreenOpen(false)} className="rounded-lg border border-border bg-card p-2 text-muted-foreground transition-all hover:bg-accent hover:text-foreground md:p-3" aria-label="Close release-note review">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="rounded-lg border border-[#f5c400]/40 bg-[#0b0f15] p-4 md:p-6">
            <div className="mb-5 flex items-start gap-3 rounded-md border border-[#f5c400]/25 bg-[#f5c400]/5 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#f5c400]" />
              <p className="text-sm leading-6 text-[#f2f4f7]">{pendingReview.message || "Approve, reject, or mark release-note links as partial before the LangGraph run continues."}</p>
            </div>
            <div className="space-y-3">
              {pendingReview.release_note_candidates.map((candidate) => {
                const decision = reviewDecisions[candidate.candidate_id] || { decision: "accept", comment: "" };
                return (
                  <div key={candidate.candidate_id} className="rounded-md border border-[#252a33] bg-[#05080d] p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{candidate.position}</Badge>
                          <Badge variant="secondary">{candidate.jira_id ? `Jira ${candidate.jira_id}` : candidate.label || "Release note"}</Badge>
                          {candidate.relevance_score !== null && candidate.relevance_score !== undefined ? <Badge variant="outline">Score {candidate.relevance_score}</Badge> : null}
                        </div>
                        <p className="text-sm font-medium text-[#f2f4f7]">{candidate.solution_description || "No solution description in evidence data"}</p>
                        <p className="text-xs leading-5 text-[#8c96a8]">{[candidate.workbook, candidate.sheet].filter(Boolean).join(" / ") || "No workbook metadata"}</p>
                        {candidate.matched_changed_fields?.length ? <p className="text-xs text-[#8c96a8]">Changed-field match: {candidate.matched_changed_fields.join(", ")}</p> : null}
                        {candidate.record_text ? <p className="line-clamp-3 text-xs leading-5 text-[#8c96a8]">{candidate.record_text}</p> : null}
                      </div>
                      <div className="grid min-w-[220px] gap-2">
                        <Select value={decision.decision} onValueChange={(value) => setReviewDecisions((current) => ({ ...current, [candidate.candidate_id]: { ...decision, decision: value as ReviewDecision["decision"] } }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="accept">Accept link</SelectItem>
                            <SelectItem value="partial">Mark partial</SelectItem>
                            <SelectItem value="reject">Reject link</SelectItem>
                          </SelectContent>
                        </Select>
                        <Textarea value={decision.comment} onChange={(event) => setReviewDecisions((current) => ({ ...current, [candidate.candidate_id]: { ...decision, comment: event.target.value } }))} placeholder="Optional review note" className="min-h-20" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setReviewFullscreenOpen(false)} disabled={reviewSubmitting}>Close</Button>
              <Button onClick={() => void submitReleaseNoteReview()} disabled={reviewSubmitting}>
                {reviewSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Continue LangGraph run
              </Button>
            </div>
          </div>
        </div>
      </div>}
      {loading && <Card><CardContent className="space-y-3 p-6"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></CardContent></Card>}
      {result && !loading && <div className="flex flex-col gap-6">
        <Card className={`relative order-2 overflow-hidden transition-[filter,opacity] duration-500 ${postRunSubmitting ? "pointer-events-none opacity-45 grayscale-[0.35]" : ""}`}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Structured root-cause results</span>
              <Badge variant={confidence >= 75 ? "default" : "outline"}>{confidence}% overall confidence</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">The rows below combine result deviations, code lineage, changed source inputs, release-note matches, and the LLM explanation.</p>
            <div className="flex items-center gap-3 pt-2">
              <Button size="sm" variant="outline" onClick={() => setShowUnchanged((current) => !current)}>
                {showUnchanged ? "Show changed rows only" : "Show unchanged rows"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Showing {displayedRows.length} of {summaryRows.length} positions
              </span>
            </div>
            <div className="mt-3 flex w-fit max-w-fit self-start rounded-lg border border-border/80 bg-background p-1 shadow-sm">
              <Button
                size="sm"
                variant={resultView === "summary" ? "default" : "ghost"}
                onClick={() => setResultView("summary")}
                className="h-8 rounded-md px-3 text-xs font-semibold"
              >
                Summary
              </Button>
              <Button
                size="sm"
                variant={resultView === "lineage" ? "default" : "ghost"}
                onClick={() => setResultView("lineage")}
                className="h-8 rounded-md px-3 text-xs font-semibold"
              >
                Lineage breakdown
              </Button>
            </div>
          </CardHeader>
          {postRunSubmitting ? <div className="absolute inset-0 z-20 flex min-h-[520px] items-center justify-center bg-[#080b10]/70 p-6 backdrop-blur-[3px]" aria-hidden="true">
            <div className="flex min-w-[min(360px,calc(100vw-48px))] flex-col items-center gap-5 rounded-2xl border border-[#f5c400]/45 bg-[#111820]/98 px-10 py-9 text-center shadow-[0_20px_60px_rgba(0,0,0,0.58),0_0_40px_rgba(245,196,0,0.1)]">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full border border-[#f5c400]/30 bg-[#f5c400]/10" />
                <span className="absolute inset-1 animate-[spin_2.8s_linear_infinite] rounded-full border-2 border-transparent border-t-[#f5c400] border-r-[#f5c400]/45" />
                <span className="absolute inset-3 rounded-full border border-[#f5c400]/25" />
                <Loader2 className="relative h-8 w-8 animate-spin text-[#f5c400]" />
              </div>
              <div>
                <p className="text-base font-semibold text-[#f2f4f7]">Refreshing structured results</p>
                <p className="mt-2 text-sm leading-6 text-[#aeb8c7]">Updating the table with the reviewed final explanation.</p>
              </div>
              <div className="h-1 w-40 overflow-hidden rounded-full bg-[#252a33]"><div className="post-run-loader-rail h-full w-1/2 rounded-full bg-[#f5c400] shadow-[0_0_12px_rgba(245,196,0,0.8)]" /></div>
            </div>
          </div> : null}
          {resultView === "summary" && <CardContent>
            <div className="w-full overflow-hidden rounded-md border border-border [&_[data-slot=table-container]]:overflow-x-hidden">
              <Table className="w-full table-fixed">
                <TableHeader className="bg-muted/80">
                  <TableRow>
                    <TableHead className="w-[9%] whitespace-normal break-words">Deviation</TableHead>
                    <TableHead className="w-[9%] whitespace-normal break-words">Output (B - A)</TableHead>
                    <TableHead className="w-[14%] whitespace-normal break-words">Lineage</TableHead>
                    <TableHead className="w-[12%] whitespace-normal break-words">Input</TableHead>
                    <TableHead className="w-[8%] whitespace-normal break-words">Release Note</TableHead>
                    <TableHead className="w-[9%] whitespace-normal break-words">Expectation Status</TableHead>
                    <TableHead className="w-[28%] whitespace-normal break-words">Explanation</TableHead>
                    <TableHead className="w-[5%] whitespace-normal break-words text-right">Score</TableHead>
                    <TableHead className="w-[6%] whitespace-normal break-words text-center">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedRows.map((row) => (
                    <TableRow key={`${row.position}-${row.output}`}>
                      <TableCell className="min-w-0 whitespace-normal break-words align-top font-medium">{row.position}</TableCell>
                      <TableCell className="min-w-0 whitespace-normal break-words align-top">{row.output}<div className={`text-xs ${differenceClassName(row.difference)}`}>{displayDifference(row.difference)}</div></TableCell>
                      <TableCell className="min-w-0 whitespace-normal break-words align-top">{row.lineage ? renderLineageChain(row.lineage) : "-"}</TableCell>
                      <TableCell className="min-w-0 whitespace-normal break-words align-top">{row.input || "-"}</TableCell>
                      <TableCell className="min-w-0 whitespace-normal break-words align-top">{row.release_note || "-"}</TableCell>
                      <TableCell className="min-w-0 whitespace-normal break-words align-top">
                        {(() => {
                          const status = expectationStatus(row.release_note);
                          const StatusIcon = status.icon;
                          return <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${status.className}`} title={status.label}><StatusIcon className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{status.label}</span></span>;
                        })()}
                      </TableCell>
                      <TableCell className="min-w-0 whitespace-pre-line break-words align-top text-sm leading-5">{formatExplanation(row.explanation)}</TableCell>
                      <TableCell className="min-w-0 whitespace-normal break-words align-top text-right font-semibold">{Math.round(row.confidence)}%</TableCell>
                      <TableCell className="align-top text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:bg-[#f5c400]/10 hover:text-[#f5c400]"
                          title={`View details for ${row.position} ${row.output}`}
                          aria-label={`View details for ${row.position} ${row.output}`}
                          onClick={() => setSelectedRow(row)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!displayedRows.length && <p className="py-6 text-sm text-muted-foreground">No changed final-output rows were returned.</p>}
          </CardContent>}
          {resultView === "lineage" && <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">Detailed dependency rows for the positions shown above.</p>
              <div className="w-full overflow-hidden rounded-md border border-border [&_[data-slot=table-container]]:overflow-x-hidden">
                <Table className="w-full table-fixed">
                  <TableHeader className="bg-muted/80">
                    <TableRow>
                      <TableHead className="w-[9%] whitespace-normal break-words">Deviation</TableHead>
                      <TableHead className="w-[9%] whitespace-normal break-words">Output (B - A)</TableHead>
                      <TableHead className="w-[14%] whitespace-normal break-words">Lineage</TableHead>
                      <TableHead className="w-[12%] whitespace-normal break-words">Input</TableHead>
                      <TableHead className="w-[8%] whitespace-normal break-words">Release Note</TableHead>
                      <TableHead className="w-[9%] whitespace-normal break-words">Expectation Status</TableHead>
                      <TableHead className="w-[28%] whitespace-normal break-words">Explanation</TableHead>
                      <TableHead className="w-[5%] whitespace-normal break-words text-right">Score</TableHead>
                      <TableHead className="w-[6%] whitespace-normal break-words text-center">View</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRows
                      .filter((row) => showUnchanged || changedRows.some((summary) => summary.position === row.position))
                      .map((row, index) => (
                        <TableRow key={`${row.position}-${row.output}-${index}`}>
                          <TableCell className="min-w-0 whitespace-normal break-words align-top font-medium">{row.position}</TableCell>
                          <TableCell className="min-w-0 whitespace-normal break-words align-top">{row.output}<div className={`text-xs ${differenceClassName(row.difference)}`}>{displayDifference(row.difference)}</div></TableCell>
                          <TableCell className="min-w-0 whitespace-normal break-words align-top">{displayLineage(row.lineage, row.input, row.output) || "-"}</TableCell>
                          <TableCell className="min-w-0 whitespace-normal break-words align-top">{row.input || "-"}</TableCell>
                          <TableCell className="min-w-0 whitespace-normal break-words align-top">{row.release_note || "-"}</TableCell>
                          <TableCell className="min-w-0 whitespace-normal break-words align-top">
                            {(() => {
                              const status = expectationStatus(row.release_note);
                              const StatusIcon = status.icon;
                              return <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${status.className}`} title={status.label}><StatusIcon className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{status.label}</span></span>;
                            })()}
                          </TableCell>
                          <TableCell className="min-w-0 whitespace-pre-line break-words align-top text-sm leading-5">{formatExplanation(row.explanation)}</TableCell>
                          <TableCell className="min-w-0 whitespace-normal break-words align-top text-right font-semibold">{Math.round(row.confidence)}%</TableCell>
                          <TableCell className="align-top text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:bg-[#f5c400]/10 hover:text-[#f5c400]"
                              title={`View details for ${row.position} ${row.output}`}
                              aria-label={`View details for ${row.position} ${row.output}`}
                              onClick={() => setSelectedRow(row)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>}
        </Card>
        <Dialog open={selectedRow !== null} onOpenChange={(open) => !open && setSelectedRow(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto border-[#303845] bg-[#0f141c] text-[#f2f4f7] sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#f2f4f7]">
                <Eye className="h-4 w-4 text-[#f5c400]" />
                {selectedRow ? `${selectedRow.position} · ${selectedRow.output}` : "Row details"}
              </DialogTitle>
              <DialogDescription className="text-[#8c96a8]">
                Complete structured root-cause data for this table row.
              </DialogDescription>
            </DialogHeader>
            {selectedRow && (
              <div className="space-y-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-sm border border-[#252a33] bg-[#080b10] p-3"><p className="text-xs text-[#8c96a8]">Value A</p><p className="mt-1 font-mono text-[#f2f4f7]">{displayValue(selectedRow.value_a)}</p></div>
                  <div className="rounded-sm border border-[#252a33] bg-[#080b10] p-3"><p className="text-xs text-[#8c96a8]">Value B</p><p className="mt-1 font-mono text-[#f2f4f7]">{displayValue(selectedRow.value_b)}</p></div>
                  <div className="rounded-sm border border-[#252a33] bg-[#080b10] p-3"><p className="text-xs text-[#8c96a8]">Difference (B - A)</p><p className={`mt-1 font-mono ${differenceClassName(selectedRow.difference)}`}>{displayDifference(selectedRow.difference)}</p></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-[#8c96a8]">Lineage</p><div className="mt-2">{selectedRow.lineage ? renderLineageChain(selectedRow.lineage) : <p className="text-[#f2f4f7]">-</p>}</div></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-[#8c96a8]">Input</p><p className="mt-1 break-words text-[#f2f4f7]">{selectedRow.input || "-"}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-[#8c96a8]">Release note</p><p className="mt-1 break-words text-[#f5c400]">{selectedRow.release_note || "-"}</p></div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#8c96a8]">Expectation status</p>
                    {(() => {
                      const status = expectationStatus(selectedRow.release_note);
                      const StatusIcon = status.icon;
                      return <p className={`mt-1 inline-flex items-center gap-1.5 font-semibold ${status.className}`}><StatusIcon className="h-4 w-4" aria-hidden="true" />{status.label}</p>;
                    })()}
                  </div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-[#8c96a8]">Confidence</p><p className="mt-1 text-[#f2f4f7]">{Math.round(selectedRow.confidence)}%</p></div>
                </div>
                <div className="border-t border-[#252a33] pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#8c96a8]">Explanation</p><p className="mt-2 whitespace-pre-line break-words leading-6 text-[#f2f4f7]">{formatExplanation(selectedRow.explanation)}</p></div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        {postRunReviewOpen && result && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm md:p-8">
          <div className="my-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background/95 pb-4 backdrop-blur-sm">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-xl font-semibold text-foreground md:text-2xl">Post-run human review</h3>
                <p className="mt-1 text-sm text-muted-foreground">Adjust the report inputs, then regenerate only the Final Rootcause Report.</p>
              </div>
              <button type="button" onClick={() => setPostRunReviewOpen(false)} className="rounded-lg border border-border bg-card p-2 text-muted-foreground transition-all hover:bg-accent hover:text-foreground md:p-3" aria-label="Close post-run review">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="rounded-lg border border-[#f5c400]/40 bg-[#0b0f15] p-4 md:p-6">
              <div className="mb-5 rounded-md border border-[#f5c400]/25 bg-[#f5c400]/5 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f5c400]">Final report instruction</p>
                <p className="mt-1 text-xs leading-5 text-[#8c96a8]">Describe exactly how the completed report should change; the instruction is applied across the final conclusion and position explanations.</p>
                <Textarea value={postRunPrimaryCause} onChange={(event) => setPostRunPrimaryCause(event.target.value)} className="mt-3 min-h-24" placeholder="Describe the changes required in the final report and position explanations..." />
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f5c400]">Release-note matches</p>
                  <p className="mt-1 text-xs text-[#8c96a8]">Accept, mark partial, or reject each linked release note before regeneration.</p>
                </div>
                {finalReportReleaseNotes.map((note, index) => {
                  const decision = postRunDecisions[String(index)] || { decision: "accept", comment: "" };
                  return (
                    <div key={`${note.workbook || "workbook"}-${note.sheet || "sheet"}-${note.jira_id || index}`} className="rounded-md border border-[#252a33] bg-[#05080d] p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{note.jira_id || `Match ${index + 1}`}</Badge>
                            <Badge variant="secondary">{note.sheet || "Release note"}</Badge>
                          </div>
                          <p className="text-sm font-medium text-[#f2f4f7]">{note.solution_description || "No solution description available"}</p>
                          <p className="text-xs text-[#8c96a8]">{note.workbook || "Unknown workbook"}</p>
                          {note.matched_fields?.length ? <div className="flex flex-wrap gap-1.5">{note.matched_fields.map((field) => <Badge key={`${index}-${field}`} variant="outline" className="rounded-sm text-[11px]">{field}</Badge>)}</div> : null}
                        </div>
                        <div className="grid min-w-[220px] gap-2">
                          <Select value={decision.decision} onValueChange={(value) => setPostRunDecisions((current) => ({ ...current, [String(index)]: { ...decision, decision: value as PostRunReleaseNoteDecision["decision"] } }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="accept">Accept link</SelectItem>
                              <SelectItem value="partial">Mark partial</SelectItem>
                              <SelectItem value="reject">Reject link</SelectItem>
                            </SelectContent>
                          </Select>
                          <Textarea value={decision.comment} onChange={(event) => setPostRunDecisions((current) => ({ ...current, [String(index)]: { ...decision, comment: event.target.value } }))} placeholder="Optional review note" className="min-h-20" />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!finalReportReleaseNotes.length ? <p className="rounded-md border border-[#252a33] bg-[#05080d] p-4 text-sm text-muted-foreground">No release-note matches are currently linked.</p> : null}
              </div>
              <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Button variant="outline" onClick={() => setPostRunReviewOpen(false)} disabled={postRunSubmitting}>Cancel</Button>
                <Button onClick={() => void submitPostRunReview()} disabled={postRunSubmitting}>
                  {postRunSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Regenerate final report
                </Button>
              </div>
            </div>
          </div>
        </div>}
        <Card ref={finalReportRef} className="relative order-1 scroll-mt-6 overflow-hidden border-[#f5c400]/25 bg-[#0b0f15]">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[#f5c400]" /> Final Rootcause Report</span>
              <div className="flex items-center gap-2">
                <Badge variant={confidence >= 75 ? "default" : "outline"}>{confidence}% confidence</Badge>
                {result.review_id ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" className="rootcause-review-button relative overflow-hidden border-amber-300 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-3 font-semibold text-[#16120a] shadow-[0_0_0_1px_rgba(251,191,36,0.22),0_5px_18px_rgba(245,158,11,0.24)] transition-[transform,box-shadow,filter] duration-300 hover:scale-[1.03] hover:border-yellow-200 hover:bg-gradient-to-r hover:from-amber-200 hover:via-yellow-300 hover:to-amber-400 hover:text-[#16120a] hover:shadow-[0_0_0_1px_rgba(253,224,71,0.38),0_8px_24px_rgba(245,158,11,0.34)] focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111820]" onClick={openPostRunReview} disabled={postRunSubmitting}>
                        <Eye className="mr-2 h-4 w-4" />
                        Post-run human review
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8} className="max-w-xs leading-5">
                      Edit the primary cause and release-note decisions in the completed report, then regenerate only the final report. Earlier agent evidence remains unchanged.
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </CardTitle>
            <p className="text-sm text-muted-foreground">Consolidated AI-agent report built from comparison, lineage, changed fields, release-note evidence, and final LLM synthesis.</p>
          </CardHeader>
          {postRunSubmitting ? <div className="absolute inset-0 z-20 flex min-h-[520px] items-center justify-center bg-[#080b10]/82 p-6 backdrop-blur-[3px]" aria-live="polite" aria-busy="true">
            <div className="flex min-w-[min(360px,calc(100vw-48px))] flex-col items-center gap-5 rounded-2xl border border-[#f5c400]/45 bg-[#111820]/98 px-10 py-9 text-center shadow-[0_20px_60px_rgba(0,0,0,0.58),0_0_40px_rgba(245,196,0,0.1)]">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full border border-[#f5c400]/30 bg-[#f5c400]/10" />
                <span className="absolute inset-1 animate-[spin_2.8s_linear_infinite] rounded-full border-2 border-transparent border-t-[#f5c400] border-r-[#f5c400]/45" />
                <span className="absolute inset-3 rounded-full border border-[#f5c400]/25" />
                <Loader2 className="relative h-8 w-8 animate-spin text-[#f5c400]" />
              </div>
              <div>
                <p className="text-base font-semibold text-[#f2f4f7]">Updating the final report</p>
                <p className="mt-2 text-sm leading-6 text-[#aeb8c7]">Applying your human review and regenerating the final AI explanation.</p>
              </div>
              <div className="h-1 w-40 overflow-hidden rounded-full bg-[#252a33]">
                <div className="post-run-loader-rail h-full w-1/2 rounded-full bg-[#f5c400] shadow-[0_0_12px_rgba(245,196,0,0.8)]" />
              </div>
            </div>
          </div> : null}
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Primary cause</p><p className="mt-1 text-base font-semibold text-[#f5c400]">{result.analysis.primary_cause || "-"}</p></div>
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Output</p><p className="mt-1 text-sm font-semibold text-[#f2f4f7]">{outputColumn}</p></div>
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Positions</p><p className="mt-1 text-sm font-semibold text-[#f2f4f7]">{summaryRows.length}</p></div>
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Release notes</p><p className="mt-1 text-sm font-semibold text-[#f2f4f7]">{finalReportReleaseNotes.length}</p></div>
            </div>

            <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f5c400]">Executive conclusion</p>
              {result.analysis.human_report_instruction ? <div className="mt-3 border-l-2 border-[#f5c400] bg-[#f5c400]/5 px-3 py-2 text-xs leading-5 text-[#f5c400]">Post-run instruction applied: {result.analysis.human_report_instruction}</div> : null}
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#f2f4f7]">{result.analysis.root_cause || "-"}</p>
              {result.analysis.explanation && result.analysis.explanation !== result.analysis.root_cause ? <p className="mt-3 whitespace-pre-line border-t border-[#252a33] pt-3 text-sm leading-6 text-[#cbd5e1]">{result.analysis.explanation}</p> : null}
            </div>

            <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Key evidence</p>
                <div className="space-y-3">
                  <div>{renderLineageChain(finalReportLineage)}</div>
                  <div className="flex flex-wrap gap-2">{finalReportChangedFields.length ? finalReportChangedFields.map((field) => <Badge key={field} variant="secondary" className="rounded-sm">{field}</Badge>) : <span className="text-sm text-muted-foreground">-</span>}</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {keyEvidence.map((item, index) => <div key={`key-evidence-${index}`} className="rounded-sm border border-[#252a33] bg-[#080b10] px-3 py-3 text-sm leading-6 text-[#f2f4f7]">{item}</div>)}
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {driverSummaries.slice(0, 3).map((driver, index) => <div key={`${driver.field || index}-summary`} className="rounded-sm border border-[#252a33] bg-[#080b10] px-3 py-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">#{index + 1}</Badge><span className="font-semibold text-[#f2f4f7]">{driver.field || "-"}</span>{driver.support ? <Badge variant="secondary" className="rounded-sm">{driver.support}</Badge> : null}</div>{driver.summary ? <p className="mt-1 text-xs leading-5 text-[#cbd5e1]">{driver.summary}</p> : null}{driver.positions?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{driver.positions.map((position) => <Badge key={`${driver.field}-${position}`} variant="outline" className="rounded-sm text-[11px]">{position}</Badge>)}</div> : null}</div>)}
                  </div>
                </div>
            </div>

            <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Affected positions</p>
              <div className="grid gap-3 md:grid-cols-2">
                {summaryRows.map((row) => (
                  <div key={`${row.position}-${row.output}-final-report`} className="rounded-sm border border-[#252a33] bg-[#080b10] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[#f2f4f7]">{row.position}</p>
                      <Badge variant="outline">{displayDifference(row.difference)}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-4">
                      <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#687386]">Value A</p><p className="mt-1 text-sm text-[#f2f4f7]">{displayValue(row.value_a)}</p></div>
                      <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#687386]">Value B</p><p className="mt-1 text-sm text-[#f2f4f7]">{displayValue(row.value_b)}</p></div>
                      <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#687386]">Inputs</p><p className="mt-1 text-sm text-[#f2f4f7]">{row.input || "-"}</p></div>
                      <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#687386]">Release note</p><p className="mt-1 text-sm text-[#f5c400]">{row.release_note || "-"}</p></div>
                    </div>
                    {row.explanation ? <p className="mt-3 line-clamp-4 whitespace-pre-line border-t border-[#252a33] pt-3 text-sm leading-6 text-[#cbd5e1]">{formatExplanation(row.explanation)}</p> : null}
                  </div>
                ))}
                {!summaryRows.length ? <p className="text-sm text-muted-foreground">-</p> : null}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Release-note support assessment</p>
                <div className="space-y-2">
                  {releaseNoteAssessments.slice(0, 4).map((item, index) => <div key={`release-assessment-${index}`} className="rounded-sm border border-[#252a33] bg-[#080b10] p-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{item.status || "-"}</Badge><span className="text-xs text-[#8c96a8]">{item.position || "-"}</span>{item.jira_id ? <Badge variant="outline">{item.jira_id}</Badge> : null}</div>{item.assessment ? <p className="mt-2 text-sm leading-6 text-[#f2f4f7]">{item.assessment}</p> : null}{item.solution_description ? <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#cbd5e1]">{item.solution_description}</p> : null}</div>)}
                  {!releaseNoteAssessments.length ? <p className="text-sm text-muted-foreground">-</p> : null}
                </div>
              </div>
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Linked release-note evidence</p>
                <div className="grid min-h-[18rem] max-h-[36rem] content-start gap-3 overflow-y-auto pr-2">
                {finalReportReleaseNotes.slice(0, 6).map((note, index) => (
                  <div key={`${note.workbook || "workbook"}-${note.sheet || "sheet"}-${note.jira_id || index}`} className="rounded-sm border border-[#252a33] bg-[#080b10] p-4">
                    <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{note.jira_id || `Match ${index + 1}`}</Badge><span className="text-xs text-[#8c96a8]">{note.sheet || "-"}</span></div>
                    <p className="mt-2 text-sm font-medium text-[#f2f4f7]">{note.workbook || "Unknown workbook"}</p>
                    {note.matched_fields?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{note.matched_fields.map((field) => <Badge key={`${note.jira_id || index}-${field}`} variant="outline" className="rounded-sm text-[11px]">{field}</Badge>)}</div> : null}
                    {note.solution_description ? <p className="mt-2 text-xs leading-5 text-[#cbd5e1]">{note.solution_description}</p> : null}
                  </div>
                ))}
                {!finalReportReleaseNotes.length ? <p className="text-sm text-muted-foreground">-</p> : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>}
      {!result && !loading && <p className="text-sm text-muted-foreground">Choose two executions and an output field to generate a structured root-cause analysis.</p>}
      <div className="rootcause-progress-dock fixed bottom-4 left-72 right-24 z-40 rounded-xl border border-[#2d3542]/90 bg-[#111820]/90 px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.28)] backdrop-blur-xl md:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className={`flex min-w-0 items-center gap-2 font-semibold ${reviewPaused ? "text-amber-300" : result ? "text-emerald-400" : "text-[#f2f4f7]"}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${reviewPaused || postRunSubmitting ? "bg-amber-400" : result ? "bg-emerald-400" : "bg-[#f5c400]"}`} />
                <span key={progressLabel} className="rootcause-progress-copy truncate">{progressLabel}</span>
              </span>
            </div>
            <div className="rootcause-progress-track h-2.5 overflow-hidden rounded-full border border-[#2d3542]/80 bg-[#080c11]/90" role="progressbar" aria-label="RootCause AI Agents progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)}>
              <div className={`rootcause-progress-fill relative h-full rounded-full transition-[width] duration-[1200ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${reviewPaused || postRunSubmitting ? "bg-amber-400" : result ? "bg-emerald-500" : "bg-[#f5c400]"}`} style={{ width: `${progressPercent}%` }} />
            </div>
            {completedAgentSteps.length > 0 ? (
              <div className="mt-2 flex items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Completed agents">
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#687386]">Completed</span>
                {completedAgentSteps.map((step, index) => (
                  <span key={step.name} className="rootcause-completed-step inline-flex shrink-0 items-center gap-1.5 text-[11px] text-[#aeb8c7]" title={`${step.name} completed`}>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    <span>{AGENT_PROGRESS_LABELS[step.name] || step.name}</span>
                    {index < completedAgentSteps.length - 1 ? <span className="ml-1 text-[#3d4857]">/</span> : null}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <style jsx>{`
        .rootcause-progress-copy {
          animation: rootcause-copy-arrival 420ms cubic-bezier(0.32, 0.72, 0, 1) both;
        }

        .post-run-loader-rail {
          animation: post-run-loader-slide 1.4s ease-in-out infinite;
        }

        .rootcause-review-button::after {
          content: "";
          position: absolute;
          top: -40%;
          bottom: -40%;
          left: -34%;
          width: 22%;
          background: rgba(255, 255, 255, 0.42);
          filter: blur(5px);
          transform: skewX(-16deg);
          animation: rootcause-review-sheen 3.8s cubic-bezier(0.32, 0.72, 0, 1) infinite;
          pointer-events: none;
        }

        .rootcause-review-button {
          background-size: 220% 100%;
          animation: rootcause-review-gradient 5.5s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }

        .rootcause-review-button:hover {
          animation-duration: 1.8s;
          filter: saturate(1.12) brightness(1.04);
        }

        .rootcause-completed-step {
          animation: rootcause-step-arrival 420ms cubic-bezier(0.32, 0.72, 0, 1) both;
        }

        .rootcause-progress-dock {
          animation: rootcause-dock-arrival 700ms cubic-bezier(0.32, 0.72, 0, 1) both;
        }

        .rootcause-progress-fill::after {
          content: "";
          position: absolute;
          top: -4px;
          bottom: -4px;
          left: -24%;
          width: 16%;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.62);
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.5), 0 0 20px rgba(245, 196, 0, 0.4);
          filter: blur(4px);
          animation: rootcause-progress-glide 3.6s cubic-bezier(0.32, 0.72, 0, 1) infinite;
        }

        .rootcause-progress-track:has(.bg-emerald-500) .rootcause-progress-fill::after {
          animation-duration: 2.4s;
          background: rgba(209, 255, 229, 0.72);
          box-shadow: 0 0 10px rgba(209, 255, 229, 0.6), 0 0 20px rgba(52, 211, 153, 0.4);
        }

        @keyframes rootcause-copy-arrival {
          from { opacity: 0; transform: translateY(3px); filter: blur(2px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }

        @keyframes rootcause-dock-arrival {
          from { opacity: 0; transform: translateY(12px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes rootcause-step-arrival {
          from { opacity: 0; transform: translateX(-5px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes post-run-loader-slide {
          0%, 100% { transform: translateX(-100%); opacity: 0.55; }
          50% { transform: translateX(100%); opacity: 1; }
        }

        @keyframes rootcause-review-sheen {
          0%, 30% { transform: translateX(0) skewX(-16deg); opacity: 0; }
          42% { opacity: 0.7; }
          62%, 100% { transform: translateX(620%) skewX(-16deg); opacity: 0; }
        }

        @keyframes rootcause-review-gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        @keyframes rootcause-progress-glide {
          0% { transform: translateX(0) scaleX(0.7); opacity: 0; }
          18% { opacity: 0.58; }
          62% { opacity: 0.28; }
          100% { transform: translateX(760%) scaleX(1.2); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .rootcause-progress-dock,
          .rootcause-progress-copy,
          .rootcause-review-button,
          .rootcause-review-button::after,
          .rootcause-progress-fill::after,
          .post-run-loader-rail { animation: none; }
        }
      `}</style>
    </div>
  );
}
