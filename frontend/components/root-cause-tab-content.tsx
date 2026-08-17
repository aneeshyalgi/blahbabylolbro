"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, GitBranch, Sparkles } from "lucide-react";
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

type Cluster = { id: string; name: string; dataset_version?: string; code_version?: string };
type Execution = { execution_id: string; executed_date: string; code_filename?: string | null };
type RootCauseResult = {
  stages: {
    dependencies: string[];
    changed_source_fields: { position: string; field: string; value_a: unknown; value_b: unknown }[];
    release_notes: { workbook?: string; sheet?: string; matched_fields?: string[]; record?: Record<string, unknown> }[];
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
    rows?: {
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
    }[];
    detail_rows?: {
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
    }[];
  };
};

const displayValue = (value: unknown) => value === null || value === undefined ? "-" : String(value);
const dateValue = (value: string) => new Date(value).toLocaleString();
const displayDifference = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const formatted = Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Number(value) > 0 ? `+${formatted}` : formatted;
};
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

const ROOT_CAUSE_STORAGE_KEY = "dataflow_root_cause_state";

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
  const { baseClusterId, comparisonClusterId } = useClusterSelection();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterAId, setClusterAId] = useState(baseClusterId || "");
  const [clusterBId, setClusterBId] = useState(comparisonClusterId || "");
  const [executionsA, setExecutionsA] = useState<Execution[]>([]);
  const [executionsB, setExecutionsB] = useState<Execution[]>([]);
  const [executionA, setExecutionA] = useState("");
  const [executionB, setExecutionB] = useState("");
  const [outputColumn, setOutputColumn] = useState("RWA");
  const [position, setPosition] = useState("all");
  const [positions, setPositions] = useState<string[]>([]);
  const [result, setResult] = useState<RootCauseResult | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [resultView, setResultView] = useState<"summary" | "lineage">("summary");
  const [loading, setLoading] = useState(false);
  const restoredState = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem(ROOT_CAUSE_STORAGE_KEY);
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
      localStorage.removeItem(ROOT_CAUSE_STORAGE_KEY);
    } finally {
      restoredState.current = true;
    }
  }, []);

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
    localStorage.setItem(ROOT_CAUSE_STORAGE_KEY, JSON.stringify(state));
  }, [clusterAId, clusterBId, executionA, executionB, outputColumn, position, positions, showUnchanged, resultView, result]);

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
      const data = await response.json();
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
          <p className="text-sm text-muted-foreground">Explain a result deviation using execution data, technical lineage, changed source fields, and release notes.</p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>Cluster A (Base)</Label><Select value={clusterAId} onValueChange={setClusterAId}><SelectTrigger><SelectValue placeholder="Select base cluster" /></SelectTrigger><SelectContent>{clusters.map((cluster) => <SelectItem key={cluster.id} value={cluster.id}>{cluster.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Cluster B (Compare)</Label><Select value={clusterBId} onValueChange={setClusterBId}><SelectTrigger><SelectValue placeholder="Select comparison cluster" /></SelectTrigger><SelectContent>{clusters.map((cluster) => <SelectItem key={cluster.id} value={cluster.id}>{cluster.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Execution A</Label><Select value={executionA} onValueChange={setExecutionA}><SelectTrigger><SelectValue placeholder="Select execution" /></SelectTrigger><SelectContent>{executionsA.map((execution) => <SelectItem key={execution.execution_id} value={execution.execution_id}>{dateValue(execution.executed_date)}{execution.code_filename ? ` - ${execution.code_filename}` : ""}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Execution B</Label><Select value={executionB} onValueChange={setExecutionB}><SelectTrigger><SelectValue placeholder="Select execution" /></SelectTrigger><SelectContent>{executionsB.map((execution) => <SelectItem key={execution.execution_id} value={execution.execution_id}>{dateValue(execution.executed_date)}{execution.code_filename ? ` - ${execution.code_filename}` : ""}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Output field</Label><input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={outputColumn} onChange={(event) => setOutputColumn(event.target.value)} placeholder="RWA" /></div>
          <div className="space-y-2"><Label>Position</Label><Select value={position} onValueChange={setPosition}><SelectTrigger><SelectValue placeholder="All positions" /></SelectTrigger><SelectContent><SelectItem value="all">All positions</SelectItem>{positions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
          <div className="md:col-span-2"><Button onClick={() => void analyze()} disabled={loading}><Sparkles className="mr-2 h-4 w-4" />{loading ? "Analyzing..." : "Generate root cause analysis"}</Button></div>
        </CardContent>
      </Card>

      {loading && <Card><CardContent className="space-y-3 p-6"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></CardContent></Card>}
      {result && !loading && <div className="space-y-6">
        <Card>
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
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader className="bg-muted/80">
                  <TableRow>
                    <TableHead>Deviation</TableHead>
                    <TableHead>Output</TableHead>
                    <TableHead>Lineage</TableHead>
                    <TableHead>Input</TableHead>
                    <TableHead>Release Note</TableHead>
                    <TableHead className="min-w-[360px]">Explanation</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedRows.map((row) => (
                    <TableRow key={`${row.position}-${row.output}`}>
                      <TableCell className="whitespace-nowrap font-medium">{row.position}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.output}<div className={`text-xs ${differenceClassName(row.difference)}`}>{displayDifference(row.difference)}</div></TableCell>
                      <TableCell className="min-w-[180px]">{displayLineage(row.lineage, row.input, row.output) || "-"}</TableCell>
                      <TableCell className="min-w-[150px]">{row.input || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.release_note || "-"}</TableCell>
                      <TableCell className="min-w-[360px] text-sm leading-5">{row.explanation || "No explanation returned."}</TableCell>
                      <TableCell className="text-right font-semibold">{Math.round(row.confidence)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!displayedRows.length && <p className="py-6 text-sm text-muted-foreground">No changed final-output rows were returned.</p>}
          </CardContent>}
          {resultView === "lineage" && <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">Detailed dependency rows for the positions shown above.</p>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader className="bg-muted/80">
                    <TableRow>
                      <TableHead>Deviation</TableHead>
                      <TableHead>Output</TableHead>
                      <TableHead>Lineage</TableHead>
                      <TableHead>Input</TableHead>
                      <TableHead>Release Note</TableHead>
                      <TableHead className="min-w-[360px]">Explanation</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRows
                      .filter((row) => showUnchanged || changedRows.some((summary) => summary.position === row.position))
                      .map((row, index) => (
                        <TableRow key={`${row.position}-${row.output}-${index}`}>
                          <TableCell className="whitespace-nowrap font-medium">{row.position}</TableCell>
                          <TableCell className="whitespace-nowrap">{row.output}<div className={`text-xs ${differenceClassName(row.difference)}`}>{displayDifference(row.difference)}</div></TableCell>
                          <TableCell>{displayLineage(row.lineage, row.input, row.output) || "-"}</TableCell>
                          <TableCell>{row.input || "-"}</TableCell>
                          <TableCell className="whitespace-nowrap">{row.release_note || "-"}</TableCell>
                          <TableCell className="min-w-[360px] text-sm leading-5">{row.explanation || "No explanation returned."}</TableCell>
                          <TableCell className="text-right font-semibold">{Math.round(row.confidence)}%</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>}
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><CardTitle className="text-base">Root cause summary</CardTitle></CardHeader><CardContent><p className="whitespace-pre-line text-sm leading-6">{result.analysis.root_cause || result.analysis.explanation || "No root cause identified."}</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Evidence and next checks</CardTitle></CardHeader><CardContent className="space-y-3">{(result.analysis.evidence || []).map((item) => <div key={item} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />{item}</div>)}{(result.analysis.next_checks || []).map((item) => <div key={item} className="flex gap-2 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />{item}</div>)}</CardContent></Card>
        </div>
      </div>}
      {!result && !loading && <p className="text-sm text-muted-foreground">Choose two executions and an output field to generate a structured root-cause analysis.</p>}
    </div>
  );
}
