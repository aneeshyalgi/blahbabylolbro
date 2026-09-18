"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, CircleX, Eye, GitBranch, Loader2, Sparkles, X } from "lucide-react";
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
    evidence?: string[];
    changed_fields?: string[];
    release_note_links?: string[];
    next_checks?: string[];
    rows?: RootCauseTableRow[];
    detail_rows?: RootCauseTableRow[];
  };
};

const displayValue = (value: unknown) => value === null || value === undefined ? "-" : String(value);
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

const ROOT_CAUSE_NORMAL_STORAGE_KEY = "dataflow_root_cause_normal_state_v3";

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

export function RootCauseTabContent() {
  const storageKey = ROOT_CAUSE_NORMAL_STORAGE_KEY;
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
  const [postRunReviewOpen, setPostRunReviewOpen] = useState(false);
  const [postRunSubmitting, setPostRunSubmitting] = useState(false);
  const [postRunPrimaryCause, setPostRunPrimaryCause] = useState("");
  const finalReportRef = useRef<HTMLDivElement | null>(null);
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

  const analyze = async () => {
    if (!executionA || !executionB || !outputColumn.trim()) {
      toast({ title: "Select both executions and an output field", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch(API_ENDPOINTS.rootCauseAnalyze, {
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
      let data: RootCauseResult & { detail?: string };
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(responseText || response.statusText || "Backend returned an invalid response");
      }
      if (!response.ok) throw new Error(data.detail || "Root-cause analysis failed");
      setResult(data);
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

  const openPostRunReview = () => {
    if (!result) return;
    setPostRunPrimaryCause(result.analysis.root_cause || "");
    setPostRunReviewOpen(true);
  };

  const submitPostRunReview = async () => {
    if (!result?.review_id) return;
    setPostRunSubmitting(true);
    setPostRunReviewOpen(false);
    requestAnimationFrame(() => finalReportRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    try {
      const response = await fetch(API_ENDPOINTS.rootCauseAnalyze, {
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
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Post-run review failed");
      setResult(data);
      setShowUnchanged(false);
      setResultView("summary");
      toast({ title: "RootCause report updated", description: "Your post-run review was applied." });
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

      {loading && <Card><CardContent className="space-y-3 p-6"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></CardContent></Card>}
      {result && !loading && <div ref={finalReportRef} className={`relative space-y-6 scroll-mt-6 ${postRunSubmitting ? "pointer-events-none" : ""}`}>
        {postRunSubmitting ? <div className="absolute inset-0 z-30 flex min-h-[620px] items-center justify-center rounded-xl bg-[#080b10]/82 p-6 backdrop-blur-[3px]" aria-live="polite" aria-busy="true">
          <div className="flex min-w-[min(360px,calc(100vw-48px))] flex-col items-center gap-5 rounded-2xl border border-[#f5c400]/45 bg-[#111820]/98 px-10 py-9 text-center shadow-[0_20px_60px_rgba(0,0,0,0.58),0_0_40px_rgba(245,196,0,0.1)]">
            <div className="relative flex h-20 w-20 items-center justify-center"><span className="absolute inset-0 animate-ping rounded-full border border-[#f5c400]/30 bg-[#f5c400]/10" /><span className="absolute inset-1 animate-[spin_2.8s_linear_infinite] rounded-full border-2 border-transparent border-t-[#f5c400] border-r-[#f5c400]/45" /><Loader2 className="relative h-8 w-8 animate-spin text-[#f5c400]" /></div>
            <div><p className="text-base font-semibold text-[#f2f4f7]">Updating RootCause report</p><p className="mt-2 text-sm leading-6 text-[#aeb8c7]">Applying your human review and regenerating the normal RootCause result.</p></div>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-[#252a33]"><div className="normal-post-run-loader h-full w-1/2 rounded-full bg-[#f5c400] shadow-[0_0_12px_rgba(245,196,0,0.8)]" /></div>
          </div>
        </div> : null}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Structured root-cause results</span>
              <div className="flex items-center gap-2">
                <Badge variant={confidence >= 75 ? "default" : "outline"}>{confidence}% overall confidence</Badge>
                {result.review_id ? <Tooltip><TooltipTrigger asChild><Button size="sm" variant="outline" className="normal-post-run-review-button relative overflow-hidden border-amber-300 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-3 font-semibold text-[#16120a] shadow-[0_0_0_1px_rgba(251,191,36,0.22),0_5px_18px_rgba(245,158,11,0.24)]" onClick={openPostRunReview} disabled={postRunSubmitting}><Eye className="mr-2 h-4 w-4" />Post-run human review</Button></TooltipTrigger><TooltipContent side="bottom" sideOffset={8} className="max-w-sm leading-5">Edit the human instruction for the completed normal RootCause report. The backend regenerates the summary and, when your instruction requests it, the row explanations too, while preserving deterministic values, differences, lineage, positions, and inputs. The analysis pipeline itself is not rerun.</TooltipContent></Tooltip> : null}
              </div>
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
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><CardTitle className="text-base">Root cause summary</CardTitle></CardHeader><CardContent><p className="whitespace-pre-line text-sm leading-6">{result.analysis.root_cause || result.analysis.explanation || "No root cause identified."}</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Evidence and next checks</CardTitle></CardHeader><CardContent className="space-y-3">
            {(result.analysis.evidence || []).length === 0 && (result.analysis.next_checks || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No evidence items or next checks were returned for this comparison.</p>
            ) : null}
            {(result.analysis.evidence || []).map((item) => <div key={item} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />{item}</div>)}
            {(result.analysis.next_checks || []).map((item) => <div key={item} className="flex gap-2 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />{item}</div>)}
          </CardContent></Card>
        </div>
        {postRunReviewOpen && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm md:p-8">
          <div className="my-auto flex w-full max-w-5xl flex-col gap-4">
            <div className="flex items-center justify-between gap-4 border-b border-border bg-background/95 pb-4"><div><h3 className="text-xl font-semibold text-foreground">Post-run human review</h3><p className="mt-1 text-sm text-muted-foreground">Edit the normal RootCause inputs and regenerate the final result.</p></div><button type="button" onClick={() => setPostRunReviewOpen(false)} className="rounded-lg border border-border bg-card p-3 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close post-run review"><X className="h-5 w-5" /></button></div>
            <div className="rounded-lg border border-[#f5c400]/40 bg-[#0b0f15] p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f5c400]">Root cause override</p>
              <Textarea value={postRunPrimaryCause} onChange={(event) => setPostRunPrimaryCause(event.target.value)} className="mt-3 min-h-24" placeholder="Enter the primary cause for the updated RootCause report..." />
              <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4"><Button variant="outline" onClick={() => setPostRunReviewOpen(false)} disabled={postRunSubmitting}>Cancel</Button><Button onClick={() => void submitPostRunReview()} disabled={postRunSubmitting}>{postRunSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Regenerate RootCause</Button></div>
            </div>
          </div>
        </div>}
      </div>}
      {!result && !loading && <p className="text-sm text-muted-foreground">Choose two executions and an output field to generate a structured root-cause analysis.</p>}
      <style jsx>{`
        .normal-post-run-loader { animation: normal-post-run-slide 1.4s ease-in-out infinite; }
        .normal-post-run-review-button { background-size: 220% 100%; animation: normal-review-gradient 5.5s ease-in-out infinite; }
        @keyframes normal-post-run-slide { 0%, 100% { transform: translateX(-100%); opacity: .55; } 50% { transform: translateX(100%); opacity: 1; } }
        @keyframes normal-review-gradient { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        @media (prefers-reduced-motion: reduce) { .normal-post-run-loader, .normal-post-run-review-button { animation: none; } }
      `}</style>
    </div>
  );
}
