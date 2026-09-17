"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Bot, CheckCircle2, CircleX, Eye, GitBranch, Loader2, Sparkles } from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api-config";
import { useClusterSelection } from "@/context/cluster-selection-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
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
type ReleaseNoteAssessment = { position?: string; status?: string; jira_id?: string; workbook?: string; sheet?: string; matched_changed_fields?: string[]; relevance_score?: number; solution_description?: string; reason?: string; note?: string };
type Contradiction = { severity?: string; source?: string; position?: string; issue?: string };
type ScoredHypothesis = { id?: string; rank?: number; position?: string; field?: string; hypothesis?: string; causal_mechanism?: string; evidence_to_check?: string; rejection_risk?: string; confidence_basis?: string; generation_source?: string; score?: number; decision?: string; score_reason?: string; release_note_candidates?: string[] };
type Counterfactual = { hypothesis_id?: string; position?: string; field?: string; output_difference?: number | null; field_difference?: number | null; estimated_output_effect_if_only_this_changed?: number | null; estimated_explained_share?: number | null; interpretation?: string; caveat?: string; validation_test?: string; generation_source?: string };
type FinalDecision = { primary_cause?: string; primary_position?: string; primary_score?: number; evidence_strength?: string; decision_rationale?: string; secondary_causes?: ScoredHypothesis[]; rejected_causes?: ScoredHypothesis[] };
type RootCauseResult = {
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
    primary_cause?: string;
    changed_fields?: string[];
    release_note_links?: string[];
    next_checks?: unknown[];
    ranked_drivers?: RankedDriver[];
    release_note_assessments?: ReleaseNoteAssessment[];
    contradictions?: Contradiction[];
    uncertainty_notes?: string[];
    uncertainty_summary?: string;
    validation_plan?: string[];
    hypotheses?: ScoredHypothesis[];
    scored_hypotheses?: ScoredHypothesis[];
    counterfactuals?: Counterfactual[];
    rejected_release_notes?: ReleaseNoteAssessment[];
    final_decision?: FinalDecision;
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
    name: "Causal Verification Agent",
    description: "Tests whether the changed fields line up with the observed output movement for each affected position.",
    processPreview: [
      "Read output values for each affected position from both executions.",
      "Connect changed candidate fields to the observed B - A movement.",
      "Classify each position as supported or unable to verify.",
    ],
  },
  {
    name: "Hypothesis Generation Agent",
    description: "Turns changed fields into testable causal hypotheses for each affected position.",
    processPreview: [
      "Create one hypothesis per changed field and affected position.",
      "Attach field movement, output movement, lineage role, and release-note candidates.",
      "Send candidate hypotheses to the scoring agent.",
    ],
  },
  {
    name: "Hypothesis Scoring Agent",
    description: "Scores each hypothesis by lineage proximity, magnitude, direction, and release-note support.",
    processPreview: [
      "Measure whether each field is direct or upstream in the lineage.",
      "Score magnitude, direction alignment, and documentation support.",
      "Rank hypotheses into primary, secondary, and weak candidates.",
    ],
  },
  {
    name: "Counterfactual What-If Agent",
    description: "Estimates how much each candidate field could explain if it were the only changed driver.",
    processPreview: [
      "Group hypotheses by position.",
      "Estimate each field's share of numeric changed-field movement.",
      "Mark limited counterfactuals when values are non-numeric or incomplete.",
    ],
  },
  {
    name: "Release-Note Rejection Agent",
    description: "Documents which broad release-note matches were rejected and why.",
    processPreview: [
      "Compare broad release-note candidates to accepted position-specific matches.",
      "Reject notes that only match generic fields or only position text.",
      "Expose rejected evidence so weak documentation support is visible.",
    ],
  },
  {
    name: "Critic/Consistency Agent",
    description: "Checks the B - A math and records warnings when evidence is incomplete or inconsistent.",
    processPreview: [
      "Recompute available numeric differences as value B minus value A.",
      "Check for direction or math inconsistencies.",
      "Record warning flags for the evidence merger.",
    ],
  },
  {
    name: "Final Decision Agent",
    description: "Selects the primary cause, secondary causes, rejected causes, and evidence strength.",
    processPreview: [
      "Review scored hypotheses, counterfactuals, release-note support, and rejection evidence.",
      "Pick the highest-scoring hypothesis as the primary cause candidate.",
      "Separate secondary and weak causes for final reporting.",
    ],
  },
  {
    name: "Evidence Merger Agent",
    description: "Combines comparison, lineage, input changes, release notes, verification, and warnings into one evidence packet.",
    processPreview: [
      "Collect outputs from all previous agents.",
      "Merge comparison facts, changed fields, release-note candidates, and warnings.",
      "Assign the overall evidence classification.",
    ],
  },
  {
    name: "Final Rootcause Report",
    description: "Calls the configured LLM to write the final German root-cause report from the merged evidence only.",
    processPreview: [
      "Prepare the compact final evidence payload.",
      "Ask the configured LLM for German JSON output grounded in supplied evidence.",
      "Normalize the final report, confidence, evidence, and next checks for display.",
    ],
  },
];

const CLASSIFICATION_DEFINITIONS = [
  { label: "Confirmed Cause", meaning: "Strongest label: changed fields were found, the evidence merged cleanly, and no major critic warning blocked the conclusion." },
  { label: "Likely Cause", meaning: "A plausible cause was found, but one or more stages had limited evidence, missing documentation, or a warning." },
  { label: "Partially supported", meaning: "Position-level label: changed candidate fields support the output movement, but this step alone is not full proof." },
  { label: "Unable to verify", meaning: "The agent could see the output movement, but did not find enough changed lineage/source fields for that position." },
  { label: "Unresolved Issue", meaning: "No strong changed-field evidence was found, so the workflow cannot identify a reliable cause." },
];

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
const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
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
const renderReportEvidence = (value: unknown, index: number) => {
  const parsed = parseMaybeJson(value);
  if (!isRecord(parsed)) {
    return <div key={`evidence-${index}`} className="flex gap-2 rounded-sm border border-[#252a33] bg-[#05080d] px-3 py-2 text-sm leading-6"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-green-600" /><span>{displayListItem(parsed)}</span></div>;
  }
  return (
    <div key={`evidence-${index}`} className="rounded-sm border border-[#252a33] bg-[#05080d] p-3">
      <div className="mb-2 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#687386]">Evidence item {index + 1}</p>
      </div>
      {renderSummaryRecord(parsed)}
    </div>
  );
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
      return `${asNumber(asRecordValue(findings, "release_notes_found"))} broad release-note candidate${asNumber(asRecordValue(findings, "release_notes_found")) === 1 ? "" : "s"} found. ${summarizeReleaseNoteCounts(asRecordValue(findings, "position_specific_release_notes"))}`;
    case "Causal Verification Agent":
      return `Verified ${asNumber(asRecordValue(findings, "positions_verified"))} position${asNumber(asRecordValue(findings, "positions_verified")) === 1 ? "" : "s"}; ${asNumber(asRecordValue(findings, "supported_positions"))} had changed candidate fields supporting the output movement.`;
    case "Hypothesis Generation Agent":
      return `Generated ${asNumber(asRecordValue(findings, "hypotheses_generated"))} testable causal hypothesis${asNumber(asRecordValue(findings, "hypotheses_generated")) === 1 ? "" : "es"} from changed fields, lineage roles, output movement, and release-note candidates.`;
    case "Hypothesis Scoring Agent":
      return Array.isArray(asRecordValue(findings, "scored_hypotheses")) && (asRecordValue(findings, "scored_hypotheses") as unknown[]).length > 0
        ? `Scored and ranked ${(asRecordValue(findings, "scored_hypotheses") as unknown[]).length} hypotheses; the highest-ranked candidate is used by the final decision agent.`
        : "No hypotheses were available to score.";
    case "Counterfactual What-If Agent":
      return Array.isArray(asRecordValue(findings, "counterfactuals"))
        ? `Built ${(asRecordValue(findings, "counterfactuals") as unknown[]).length} what-if estimates showing how much each field could explain if isolated.`
        : "No counterfactual estimates were returned.";
    case "Release-Note Rejection Agent":
      return Array.isArray(asRecordValue(findings, "rejected_release_notes"))
        ? `Rejected or downgraded ${(asRecordValue(findings, "rejected_release_notes") as unknown[]).length} weak release-note links so generic matches do not look like proof.`
        : "No rejected release-note list was returned.";
    case "Critic/Consistency Agent":
      return asNumber(asRecordValue(findings, "evidence_warnings")) > 0
        ? `Found ${asNumber(asRecordValue(findings, "evidence_warnings"))} evidence/math warning${asNumber(asRecordValue(findings, "evidence_warnings")) === 1 ? "" : "s"}; review the warning details before trusting the answer.`
        : `No B - A consistency issues found; direction checked as ${asText(asRecordValue(findings, "direction"))}.`;
    case "Final Decision Agent":
      return `Selected ${asText(asRecordValue(findings, "primary_cause"))} as primary cause with ${asText(asRecordValue(findings, "evidence_strength"))} evidence strength; secondary and weak causes were separated for the final report.`;
    case "Evidence Merger Agent":
      return `Merged the evidence into classification ${asText(asRecordValue(findings, "classification"))}; this combines comparison facts, changed fields, release-note support, and critic warnings.`;
    case "Final Rootcause Report":
      return asRecordValue(findings, "llm_error")
        ? `LLM report fell back because of: ${displayFindingValue(asRecordValue(findings, "llm_error"))}`
        : `Final report completed with ${Math.round(asNumber(asRecordValue(findings, "confidence")))}% confidence using ${asText(asRecordValue(findings, "llm_model"))}.`;
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
  if (!value) return "No explanation returned.";
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
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [activeAgentStep, setActiveAgentStep] = useState(0);
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
    setActiveAgentStep(0);
    const interval = window.setInterval(() => {
      setActiveAgentStep((current) => Math.min(current + 1, AGENT_STEPS.length - 1));
    }, 1400);
    return () => window.clearInterval(interval);
  }, [loading]);

  const analyze = async () => {
    if (!executionA || !executionB || !outputColumn.trim()) {
      toast({ title: "Select both executions and an output field", variant: "destructive" });
      return;
    }
    setLoading(true);
    setTraceExpanded(true);
    setResult(null);
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
      let data: RootCauseResult | { detail?: string } | null = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = null;
      }
      if (!response.ok) {
        const detail = data && "detail" in data ? data.detail : undefined;
        throw new Error(detail || responseText || "Root-cause analysis failed");
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
  const agentStages = result?.agent_stages || [];
  const stageByAgent = new Map(agentStages.map((stage) => [stage.agent, stage]));
  const finalReportLineage = summaryRows[0]?.lineage || [...(result?.stages?.dependencies || []), outputColumn].filter(Boolean).join(" -> ");
  const finalReportChangedFields = result?.analysis?.changed_fields?.length
    ? result.analysis.changed_fields
    : Array.from(new Set((result?.stages?.changed_source_fields || []).map((item) => item.field).filter(Boolean)));
  const finalReportReleaseNotes = result?.stages?.release_notes || [];
  const finalReportEvidence = result?.analysis?.evidence || [];
  const finalReportNextChecks = result?.analysis?.next_checks || [];
  const rankedDrivers = result?.analysis?.ranked_drivers || [];
  const releaseNoteAssessments = result?.analysis?.release_note_assessments || [];
  const contradictions = result?.analysis?.contradictions || [];
  const uncertaintyNotes = result?.analysis?.uncertainty_notes || [];
  const validationPlan = result?.analysis?.validation_plan || [];
  const scoredHypotheses = result?.analysis?.scored_hypotheses || [];
  const counterfactuals = result?.analysis?.counterfactuals || [];
  const rejectedReleaseNotes = result?.analysis?.rejected_release_notes || [];
  const finalDecision = result?.analysis?.final_decision;

  return (
    <div className="space-y-6">
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
          <div className="md:col-span-2"><Button onClick={() => void analyze()} disabled={loading}><Sparkles className="mr-2 h-4 w-4" />{loading ? "Analyzing..." : "Generate root cause analysis"}</Button></div>
        </CardContent>
      </Card>

      {(loading || result) && <Card className="border-[#f5c400]/25 bg-[#0b0f15]">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2"><Bot className="h-5 w-5 text-[#f5c400]" /> Agent reasoning trace</span>
              <div className="flex items-center gap-2">
                {result && !loading ? <Button size="sm" variant="outline" onClick={() => setTraceExpanded((current) => !current)}>{traceExpanded ? "Hide trace" : "Show trace"}</Button> : null}
                <Badge variant="outline">{result?.agent_architecture?.orchestrator || "LangGraph StateGraph"}</Badge>
              </div>
          </CardTitle>
          <p className="text-sm text-muted-foreground">{loading ? AGENT_STEPS[activeAgentStep]?.description : `${agentStages.length || AGENT_STEPS.length} graph stages completed`}</p>
        </CardHeader>
          {(loading || traceExpanded) ? <CardContent className="space-y-3">
          <div className="rounded-md border border-[#252a33] bg-[#080b10] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f5c400]">Classification labels</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {CLASSIFICATION_DEFINITIONS.map((item) => (
                <div key={item.label} className="rounded-sm border border-[#252a33] bg-[#05080d] px-3 py-2">
                  <p className="text-xs font-semibold text-[#f2f4f7]">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-[#8c96a8]">{item.meaning}</p>
                </div>
              ))}
            </div>
          </div>
          {AGENT_STEPS.map((step, index) => {
            const stage = stageByAgent.get(step.name);
            const isActive = loading && index === activeAgentStep;
            const isComplete = Boolean(stage) || (loading && index < activeAgentStep);
            const status = stage?.status || (isComplete ? "completed" : isActive ? "running" : "queued");
            const steps = processSteps(stage, step.processPreview, isComplete, isActive);
            const findingEntries = stage?.findings ? Object.entries(stage.findings).filter(([key]) => key !== "process_steps") : [];
            return (
              <div key={step.name} className={`rounded-md border p-3 ${isActive ? "border-[#f5c400]/50 bg-[#f5c400]/10" : isComplete ? "border-emerald-500/25 bg-emerald-500/5" : "border-[#252a33] bg-[#080b10]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#f2f4f7]">
                      {isActive ? <Loader2 className="h-4 w-4 animate-spin text-[#f5c400]" /> : isComplete ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <CircleX className="h-4 w-4 text-[#687386]" />}
                      <span>{step.name}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#8c96a8]">{step.description}</p>
                  </div>
                  <Badge variant={status === "completed" ? "default" : status === "running" ? "outline" : "secondary"}>{status}</Badge>
                </div>
                <div className="mt-3 rounded-sm border border-[#f5c400]/20 bg-[#f5c400]/5 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f5c400]">Agent takeaway</p>
                  <div className="mt-1 text-sm leading-5 text-[#f2f4f7]">{agentTakeaway(step.name, stage, isActive, isComplete)}</div>
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
      {loading && <Card><CardContent className="space-y-3 p-6"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></CardContent></Card>}
      {result && !loading && <div className="flex flex-col gap-6">
        <Card className="order-2">
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
                      <TableCell className="min-w-0 whitespace-normal break-words align-top">{displayFullLineage(row.lineage) || "-"}</TableCell>
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
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-[#8c96a8]">Lineage</p><p className="mt-1 break-words text-[#f2f4f7]">{selectedRow.lineage || "-"}</p></div>
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
        <Card className="order-1 border-[#f5c400]/25 bg-[#0b0f15]">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[#f5c400]" /> Final Rootcause Report</span>
              <Badge variant={confidence >= 75 ? "default" : "outline"}>{confidence}% confidence</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">Consolidated AI-agent report built from comparison, lineage, changed fields, release-note evidence, verification, and final LLM synthesis.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Output field</p><p className="mt-1 text-sm font-semibold text-[#f2f4f7]">{outputColumn}</p></div>
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Affected positions</p><p className="mt-1 text-sm font-semibold text-[#f2f4f7]">{summaryRows.length}</p></div>
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Changed fields</p><p className="mt-1 text-sm font-semibold text-[#f2f4f7]">{finalReportChangedFields.length}</p></div>
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Release-note matches</p><p className="mt-1 text-sm font-semibold text-[#f2f4f7]">{finalReportReleaseNotes.length}</p></div>
            </div>

            <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f5c400]">Executive conclusion</p>
              <div className="mt-3 rounded-sm border border-[#f5c400]/25 bg-[#f5c400]/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f5c400]">Primary cause</p>
                <p className="mt-1 text-lg font-semibold text-[#f2f4f7]">{result.analysis.primary_cause || finalDecision?.primary_cause || rankedDrivers[0]?.field || "Unresolved"}</p>
                {finalDecision ? <p className="mt-2 text-xs leading-5 text-[#cbd5e1]">Evidence strength: <span className="font-semibold text-[#f5c400]">{finalDecision.evidence_strength || "-"}</span>{finalDecision.primary_score !== undefined ? `, score ${finalDecision.primary_score}` : ""}{finalDecision.primary_position ? `, strongest at ${finalDecision.primary_position}` : ""}.</p> : null}
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#f2f4f7]">{result.analysis.root_cause || "No root cause identified."}</p>
              {result.analysis.explanation && result.analysis.explanation !== result.analysis.root_cause ? <p className="mt-3 whitespace-pre-line border-t border-[#252a33] pt-3 text-sm leading-6 text-[#cbd5e1]">{result.analysis.explanation}</p> : null}
              {finalDecision?.decision_rationale ? <p className="mt-3 whitespace-pre-line border-t border-[#252a33] pt-3 text-sm leading-6 text-[#cbd5e1]">Decision rationale: {finalDecision.decision_rationale}</p> : null}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Hypothesis scoring board</p><Badge variant="outline">{scoredHypotheses.length} hypotheses</Badge></div>
                <div className="space-y-2">
                  {scoredHypotheses.slice(0, 8).map((item, index) => <div key={`${item.id || index}-${item.field}`} className="rounded-sm border border-[#252a33] bg-[#080b10] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">#{item.rank || index + 1}</Badge><span className="font-semibold text-[#f2f4f7]">{item.field || "Unknown field"}</span><span className="text-xs text-[#8c96a8]">{item.position || "-"}</span>{item.generation_source ? <Badge variant="outline">{item.generation_source}</Badge> : null}</div><Badge variant={asNumber(item.score) >= 70 ? "default" : "outline"}>{item.score ?? "-"}</Badge></div><p className="mt-2 text-sm leading-6 text-[#cbd5e1]">{item.hypothesis || "No hypothesis text returned."}</p>{item.causal_mechanism ? <p className="mt-2 text-sm leading-6 text-[#f2f4f7]">Mechanism: {item.causal_mechanism}</p> : null}{item.evidence_to_check ? <p className="mt-2 text-xs leading-5 text-[#cbd5e1]">Evidence to check: {item.evidence_to_check}</p> : null}{item.rejection_risk ? <p className="mt-2 text-xs leading-5 text-amber-300">Rejection risk: {item.rejection_risk}</p> : null}{item.confidence_basis ? <p className="mt-2 text-xs leading-5 text-[#8c96a8]">Confidence basis: {item.confidence_basis}</p> : null}<p className="mt-2 border-t border-[#252a33] pt-2 text-xs leading-5 text-[#8c96a8]">{item.score_reason || "No score rationale returned."}</p>{item.release_note_candidates?.length ? <p className="mt-2 text-xs text-[#f5c400]">Release-note candidates: {item.release_note_candidates.join(", ")}</p> : null}</div>)}
                  {!scoredHypotheses.length ? <p className="text-sm text-muted-foreground">No scored hypotheses were returned.</p> : null}
                </div>
              </div>
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Counterfactual what-if analysis</p><Badge variant="outline">{counterfactuals.length} estimates</Badge></div>
                <div className="space-y-2">
                  {counterfactuals.slice(0, 8).map((item, index) => <div key={`${item.hypothesis_id || index}-${item.field}`} className="rounded-sm border border-[#252a33] bg-[#080b10] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-[#f2f4f7]">{item.field || "Unknown field"}</span>{item.generation_source ? <Badge variant="outline">{item.generation_source}</Badge> : null}</div><Badge variant="outline">{item.estimated_explained_share ?? "limited"}{item.estimated_explained_share !== null && item.estimated_explained_share !== undefined ? "%" : ""}</Badge></div><p className="mt-1 text-xs text-[#8c96a8]">{item.position || "-"} | output {displayValue(item.output_difference)} | field {displayValue(item.field_difference)}</p><p className="mt-2 text-sm leading-6 text-[#cbd5e1]">{item.interpretation || "No counterfactual interpretation returned."}</p>{item.caveat ? <p className="mt-2 text-xs leading-5 text-amber-300">Caveat: {item.caveat}</p> : null}{item.validation_test ? <p className="mt-2 text-xs leading-5 text-[#f2f4f7]">Validation test: {item.validation_test}</p> : null}{item.estimated_output_effect_if_only_this_changed !== null && item.estimated_output_effect_if_only_this_changed !== undefined ? <p className="mt-2 text-xs text-[#f5c400]">Estimated isolated output effect: {displayDifference(item.estimated_output_effect_if_only_this_changed)}</p> : null}</div>)}
                  {!counterfactuals.length ? <p className="text-sm text-muted-foreground">No counterfactual estimates were returned.</p> : null}
                </div>
              </div>
            </div>

            <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Ranked causal drivers</p>
                <Badge variant="outline">{rankedDrivers.length} ranked</Badge>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                {rankedDrivers.map((driver) => (
                  <div key={`${driver.rank}-${driver.field}`} className="rounded-sm border border-[#252a33] bg-[#080b10] p-3">
                    <div className="flex items-center justify-between gap-2"><Badge variant="secondary">#{driver.rank || "-"}</Badge><span className="text-xs text-[#8c96a8]">{driver.occurrences || 0} changes</span></div>
                    <p className="mt-2 text-base font-semibold text-[#f2f4f7]">{driver.field}</p>
                    <p className="mt-2 text-xs leading-5 text-[#cbd5e1]">{driver.why_it_matters || "No driver rationale returned."}</p>
                    {driver.positions?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{driver.positions.map((position) => <Badge key={`${driver.field}-${position}`} variant="outline" className="rounded-sm text-[11px]">{position}</Badge>)}</div> : null}
                    {driver.release_note_support?.length ? <p className="mt-2 text-xs text-[#f5c400]">Release-note support: {driver.release_note_support.join(", ")}</p> : <p className="mt-2 text-xs text-[#8c96a8]">No direct release-note support.</p>}
                  </div>
                ))}
                {!rankedDrivers.length ? <p className="text-sm text-muted-foreground">No causal drivers were ranked.</p> : null}
              </div>
            </div>

            <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Calculation lineage</p>
              {renderLineageChain(finalReportLineage)}
            </div>

            <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Changed lineage/source fields</p>
                <Badge variant="outline">{finalReportChangedFields.length} total</Badge>
              </div>
              {finalReportChangedFields.length ? <div className="flex flex-wrap gap-2">{finalReportChangedFields.map((field) => <Badge key={field} variant="secondary" className="rounded-sm">{field}</Badge>)}</div> : <p className="text-sm text-muted-foreground">No changed fields were returned.</p>}
            </div>

            <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Position-level report</p>
              <div className="grid gap-3">
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
                    <p className="mt-3 whitespace-pre-line border-t border-[#252a33] pt-3 text-sm leading-6 text-[#cbd5e1]">{formatExplanation(row.explanation)}</p>
                  </div>
                ))}
                {!summaryRows.length ? <p className="text-sm text-muted-foreground">No position-level report rows were returned.</p> : null}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Evidence used by final report</p>
                <div className="space-y-2">{finalReportEvidence.length ? finalReportEvidence.map(renderReportEvidence) : <p className="text-sm text-muted-foreground">No evidence items were returned.</p>}</div>
              </div>
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Uncertainty and contradictions</p>
                <div className="space-y-2">
                  {contradictions.map((item, index) => <div key={`contradiction-${index}`} className="rounded-sm border border-amber-500/30 bg-amber-500/5 px-3 py-2"><div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-500" /><Badge variant="outline">{item.severity || "review"}</Badge><span className="text-xs text-[#8c96a8]">{item.source || "Agent"}</span></div><p className="mt-2 text-sm leading-6 text-[#f2f4f7]">{item.position ? `${item.position}: ` : ""}{item.issue || "Review required."}</p></div>)}
                  {uncertaintyNotes.map((item, index) => <div key={`uncertainty-${index}`} className="flex gap-2 rounded-sm border border-[#252a33] bg-[#080b10] px-3 py-2 text-sm leading-6"><AlertCircle className="mt-1 h-4 w-4 shrink-0 text-amber-600" /><span>{item}</span></div>)}
                  {!contradictions.length && !uncertaintyNotes.length ? <p className="text-sm text-muted-foreground">No uncertainty items were returned.</p> : null}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Release-note support assessment</p>
                <div className="space-y-2">
                  {releaseNoteAssessments.map((item, index) => <div key={`release-assessment-${index}`} className="rounded-sm border border-[#252a33] bg-[#080b10] p-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{item.status || "assessment"}</Badge><span className="text-xs text-[#8c96a8]">{item.position || "position"}</span>{item.jira_id ? <Badge variant="outline">{item.jira_id}</Badge> : null}</div><p className="mt-2 text-sm leading-6 text-[#f2f4f7]">{item.reason || item.note || "No rationale returned."}</p>{item.matched_changed_fields?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{item.matched_changed_fields.map((field) => <Badge key={`${index}-${field}`} variant="outline" className="rounded-sm text-[11px]">{field}</Badge>)}</div> : null}{item.solution_description ? <p className="mt-2 text-xs leading-5 text-[#cbd5e1]">{item.solution_description}</p> : null}</div>)}
                  {!releaseNoteAssessments.length ? <p className="text-sm text-muted-foreground">No release-note assessments were returned.</p> : null}
                </div>
              </div>
              <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Validation plan</p>
                <div className="space-y-2">{(validationPlan.length ? validationPlan : finalReportNextChecks.map(displayListItem)).map((item, index) => <div key={`validation-${index}`} className="flex gap-3 rounded-sm border border-[#252a33] bg-[#080b10] px-3 py-2"><span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-[#f5c400]/30 bg-[#f5c400]/10 text-[10px] font-bold text-[#f5c400]">{index + 1}</span><p className="text-sm leading-6 text-[#f2f4f7]">{item}</p></div>)}</div>
              </div>
            </div>

            <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Rejected or weak release-note matches</p><Badge variant="outline">{rejectedReleaseNotes.length} rejected</Badge></div>
              <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                {rejectedReleaseNotes.map((item, index) => <div key={`rejected-note-${index}`} className="rounded-sm border border-[#252a33] bg-[#080b10] p-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{item.position || "position"}</Badge>{item.jira_id ? <Badge variant="secondary">{item.jira_id}</Badge> : null}<span className="text-xs text-[#8c96a8]">{item.workbook || "release note"}</span></div><p className="mt-2 text-sm leading-6 text-[#cbd5e1]">{item.reason || item.note || "Rejected as weak evidence."}</p>{item.matched_changed_fields?.length ? <p className="mt-2 text-xs text-[#f5c400]">Field hits: {item.matched_changed_fields.join(", ")}</p> : null}</div>)}
                {!rejectedReleaseNotes.length ? <p className="text-sm text-muted-foreground">No rejected release-note matches were returned.</p> : null}
              </div>
            </div>

            <div className="rounded-sm border border-[#252a33] bg-[#05080d] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">Release-note evidence</p>
                <Badge variant="outline">{finalReportReleaseNotes.length} linked rows</Badge>
              </div>
              <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                {finalReportReleaseNotes.map((note, index) => (
                  <div key={`${note.workbook || "workbook"}-${note.sheet || "sheet"}-${note.jira_id || index}`} className="rounded-sm border border-[#252a33] bg-[#080b10] p-3">
                    <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{note.jira_id || `Match ${index + 1}`}</Badge><span className="text-xs text-[#8c96a8]">{note.sheet || "-"}</span></div>
                    <p className="mt-2 text-sm font-medium text-[#f2f4f7]">{note.workbook || "Unknown workbook"}</p>
                    {note.matched_fields?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{note.matched_fields.map((field) => <Badge key={`${note.jira_id || index}-${field}`} variant="outline" className="rounded-sm text-[11px]">{field}</Badge>)}</div> : null}
                    {note.solution_description ? <p className="mt-2 text-xs leading-5 text-[#cbd5e1]">{note.solution_description}</p> : null}
                  </div>
                ))}
                {!finalReportReleaseNotes.length ? <p className="text-sm text-muted-foreground">No release-note evidence was linked.</p> : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>}
      {!result && !loading && <p className="text-sm text-muted-foreground">Choose two executions and an output field to generate a structured root-cause analysis.</p>}
    </div>
  );
}
