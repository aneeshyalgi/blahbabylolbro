"use client";

import { useState, useMemo, useEffect } from "react";
import { GitBranch, Loader2, LayoutGrid, FileDown, Maximize, X } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { API_ENDPOINTS } from "@/lib/api-config";
import {
  exportToDrawIo,
  downloadDrawIo,
  pipelineToDrawIoGraph,
} from "@/lib/drawio-export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LineageGraph, type LineageGraphData } from "@/components/lineage-graph";

export interface ContentLineageRow {
  input: string;
  output: string;
  functionLabel: string;
  /** When set, table shows Group column and blank rows between groups */
  groupKey?: string;
}

function sanitizeNodeId(s: string): string {
  if (!s || s === "—") return "unknown";
  return s.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "_") || "unknown";
}

/** One transform node per function label; multiple inputs/outputs per function. */
function buildLineageGraphData(rows: ContentLineageRow[]): LineageGraphData | null {
  if (rows.length === 0) return null;
  const inputLabels = Array.from(new Set(rows.map((r) => r.input)));
  const outputLabels = Array.from(new Set(rows.map((r) => r.output)));
  const functionLabels = Array.from(new Set(rows.map((r) => r.functionLabel)));
  const transformNodes = [
    ...inputLabels.map((l) => ({
      id: "in_" + sanitizeNodeId(l),
      type: "dataset" as const,
      label: l,
      operation: "input",
      params: {},
    })),
    ...functionLabels.map((label, i) => ({
      id: "t_" + sanitizeNodeId(label) + "_" + i,
      type: "transform" as const,
      label,
      operation: "mapping",
      params: {},
    })),
    ...outputLabels.map((l) => ({
      id: "out_" + sanitizeNodeId(l),
      type: "dataset" as const,
      label: l,
      operation: "output",
      params: {},
    })),
  ];
  const funcToId = new Map<string, string>();
  functionLabels.forEach((label, i) => {
    funcToId.set(label, "t_" + sanitizeNodeId(label) + "_" + i);
  });
  const edgeSet = new Set<string>();
  const transformEdges: { from: string; to: string; note?: string }[] = [];
  rows.forEach((r) => {
    const fromIn = "in_" + sanitizeNodeId(r.input);
    const toOut = "out_" + sanitizeNodeId(r.output);
    const tId = funcToId.get(r.functionLabel)!;
    if (!edgeSet.has(fromIn + "->" + tId)) {
      edgeSet.add(fromIn + "->" + tId);
      transformEdges.push({ from: fromIn, to: tId, note: "in" });
    }
    if (!edgeSet.has(tId + "->" + toOut)) {
      edgeSet.add(tId + "->" + toOut);
      transformEdges.push({ from: tId, to: toOut, note: "writes" });
    }
  });
  return {
    tables: [],
    nodes: [],
    edges: [],
    transformNodes,
    transformEdges,
  };
}

const TECHNICAL_LINEAGE_STORAGE_KEY = "dataflow_technical_lineage";

interface ContentLineageSectionProps {
  datasetId?: string | null;
  resultData?: {
    data?: unknown[];
    summary?: { columns?: string[]; computed_by_column?: Record<string, number> };
    computed_cells?: { row: number; column: string }[];
    code_id?: string;
    execution_id?: string;
  } | null;
  isLoading?: boolean;
}

export function ContentLineageSection({
  datasetId,
  resultData,
  isLoading = false,
}: ContentLineageSectionProps) {
  const [lineageRows, setLineageRows] = useState<ContentLineageRow[]>([]);
  const [lineageSource, setLineageSource] = useState<"code" | "fallback" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [columnFilter, setColumnFilter] = useState<string>("all");
  const [valueFilter, setValueFilter] = useState("");
  const [layoutType, setLayoutType] = useState<"dagre" | "cola" | "circle">("dagre");
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const { toast } = useToast();

  const hasResult = resultData?.data && resultData.data.length > 0 && resultData?.summary?.columns?.length;
  const outputColumns = resultData?.summary?.columns ?? [];
  const resultRows = (resultData?.data ?? []) as Record<string, unknown>[];

  const executionId = resultData?.execution_id ?? "";

  useEffect(() => {
    if (!hasResult) {
      setLineageRows([]);
      setLineageSource(null);
      return;
    }
    if (!datasetId || !executionId || typeof window === "undefined") return;
    const key = `${TECHNICAL_LINEAGE_STORAGE_KEY}_${datasetId}_${executionId}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed: { rows: ContentLineageRow[]; source: "code" | "fallback" } = JSON.parse(raw);
        if (Array.isArray(parsed?.rows) && parsed.rows.length > 0) {
          setLineageRows(parsed.rows);
          setLineageSource(parsed.source ?? "code");
          return;
        }
      }
    } catch {
      // ignore
    }
    setLineageRows([]);
    setLineageSource(null);
  }, [hasResult, datasetId, executionId]);

  const saveTechnicalLineage = (rows: ContentLineageRow[], source: "code" | "fallback") => {
    if (!datasetId || !executionId || typeof window === "undefined") return;
    try {
      const key = `${TECHNICAL_LINEAGE_STORAGE_KEY}_${datasetId}_${executionId}`;
      localStorage.setItem(key, JSON.stringify({ rows, source }));
    } catch {
      // ignore
    }
  };

  const buildLineage = async () => {
    if (!datasetId || !resultData?.summary?.columns) {
      toast({
        title: "Cannot generate lineage",
        description: "Select a dataset and run code to get results first.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      const codeId = resultData.code_id;
      if (codeId) {
        const res = await fetch(API_ENDPOINTS.contentLineage, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataset_id: datasetId,
            code_id: codeId,
            output_columns: resultData.summary!.columns!,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.rows && Array.isArray(data.rows) && data.rows.length > 0) {
            const rows: ContentLineageRow[] = data.rows.map(
              (r: { input: string; output: string; function_label: string }) => ({
                input: r.input ?? "—",
                output: r.output,
                functionLabel: r.function_label ?? "Derive by code",
              })
            );
            setLineageRows(rows);
            setLineageSource("code");
            saveTechnicalLineage(rows, "code");
            toast({
              title: "Technical lineage generated",
              description: `${rows.length} row(s) from code analysis.`,
            });
            return;
          }
        }
      }
      const res = await fetch(API_ENDPOINTS.datasetById(datasetId));
      const datasetMeta = await res.json();
      const tables = datasetMeta?.tables ?? [];
      const firstTable = Array.isArray(tables) ? tables[0] : null;
      const inputColNames = new Set(
        (firstTable?.columns ?? []).map((c: { name?: string }) => c?.name).filter(Boolean)
      );
      const computedCols = new Set(
        (resultData.computed_cells ?? []).map((c) => c.column)
      );
      const rows: ContentLineageRow[] = [];
      for (const col of resultData.summary!.columns!) {
        const inInput = inputColNames.has(col);
        const hasComputed = computedCols.has(col);
        if (inInput && !hasComputed) {
          rows.push({ input: col, output: col, functionLabel: "1:1 Mapping" });
        } else if (inInput && hasComputed) {
          rows.push({ input: col, output: col, functionLabel: "Derive by code" });
        } else {
          rows.push({ input: "—", output: col, functionLabel: "Derive by code" });
        }
      }
      setLineageRows(rows);
      setLineageSource("fallback");
      saveTechnicalLineage(rows, "fallback");
      toast({ title: "Technical lineage generated", description: `${rows.length} row(s).` });
    } catch (e) {
      console.error(e);
      toast({
        title: "Failed to generate lineage",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const filteredRows = useMemo(() => {
    let list = lineageRows;
    if (columnFilter !== "all") {
      list = list.filter(
        (r) => r.input === columnFilter || r.output === columnFilter
      );
    }
    if (valueFilter.trim()) {
      const q = valueFilter.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.input.toLowerCase().includes(q) ||
          r.output.toLowerCase().includes(q) ||
          r.functionLabel.toLowerCase().includes(q)
      );
    }
    return list;
  }, [lineageRows, columnFilter, valueFilter]);

  const lineageGraphData = useMemo(
    () => buildLineageGraphData(filteredRows),
    [filteredRows]
  );

  const exportLineageToExcel = () => {
    if (!filteredRows.length) {
      toast({
        title: "Nothing to export",
        description: "No technical lineage rows match the current filters.",
        variant: "destructive",
      });
      return;
    }

    const rows = filteredRows.map((row) => ({
      Input: row.input,
      Output: row.output,
      Function: row.functionLabel,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Technical Lineage");
    XLSX.writeFileXLSX(workbook, "technical-lineage.xlsx");
    toast({
      title: "Exported",
      description: "Technical lineage downloaded as Excel.",
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <GitBranch className="h-4 w-4" />
              Technical Lineage
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              After running code, generate a lineage table: Input → Output and the function responsible.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Button
                    size="sm"
                    onClick={buildLineage}
                    disabled={generating || !datasetId || !hasResult}
                  >
                    {generating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      "Generate Technical Lineage"
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {!hasResult
                  ? "Run the code above to generate result data, then you can generate Technical Lineage."
                  : "Generate lineage from the current result data."}
              </TooltipContent>
            </Tooltip>
            {lineageRows.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFullScreenOpen(true)}
                aria-label="Full screen"
              >
                <Maximize className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !hasResult ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center">
            <GitBranch className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground">
              No result data yet
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Run the code above to compute results, then click &quot;Generate Technical Lineage&quot; to build the lineage table.
            </p>
          </div>
        ) : lineageRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Click &quot;Generate Technical Lineage&quot; to build the Input → Output → Function table from the current result.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Lineage graph: Input → Function → Output (same style as Technical Lineage Visual Pipeline) */}
            {lineageGraphData && lineageGraphData.transformNodes && lineageGraphData.transformNodes.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label className="text-sm font-medium">Lineage graph</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={exportLineageToExcel}
                      disabled={!filteredRows.length}
                    >
                      <FileDown className="mr-2 h-4 w-4" />
                      Export to Excel
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!lineageGraphData?.transformNodes?.length || !lineageGraphData?.transformEdges) return;
                        const graph = pipelineToDrawIoGraph(
                          lineageGraphData.transformNodes,
                          lineageGraphData.transformEdges
                        );
                        const xml = exportToDrawIo(graph, {
                          diagramName: "Technical Lineage",
                          maxNodesPerRow: 6,
                          nodeWidth: 120,
                          nodeHeight: 40,
                        });
                        downloadDrawIo(xml, "technical-lineage.drawio");
                      }}
                    >
                      <FileDown className="mr-2 h-4 w-4" />
                      Export to Draw.io
                    </Button>
                    <Label className="text-sm text-muted-foreground">Layout:</Label>
                    <Select
                      value={layoutType}
                      onValueChange={(v) => setLayoutType(v as "dagre" | "cola" | "circle")}
                    >
                      <SelectTrigger className="w-[200px]">
                        <LayoutGrid className="mr-2 h-4 w-4" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dagre">Hierarchical (Dagre)</SelectItem>
                        <SelectItem value="cola">Force-directed (Cola)</SelectItem>
                        <SelectItem value="circle">Circle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Input (blue) → Function (orange) → Output (blue). Filters below apply to both graph and table.
                </p>
                <LineageGraph
                  data={lineageGraphData}
                  layoutType={layoutType}
                  viewMode="pipeline"
                  className="rounded-lg border border-border"
                />
              </div>
            )}
            <div className="flex flex-row flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Filter by column</Label>
                <Select value={columnFilter} onValueChange={setColumnFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All columns" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All columns</SelectItem>
                    {outputColumns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Filter by value</Label>
                <Input
                  placeholder="Search in Input, Output, Function..."
                  value={valueFilter}
                  onChange={(e) => setValueFilter(e.target.value)}
                  className="max-w-[280px]"
                />
              </div>
            </div>
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Lineage table:</strong> {filteredRows.length} mapping{filteredRows.length !== 1 ? "s" : ""}
                {filteredRows.length !== lineageRows.length && (
                  <span> (filtered from {lineageRows.length})</span>
                )}
              </p>
            </div>
            {lineageSource === "fallback" && (
              <div className="mb-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <strong>Generic lineage:</strong> No code analysis was used. Function names are generic (1:1 Mapping / Derive by code). Run code and ensure the same code file is selected to get best-effort labels from code.
              </div>
            )}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 border-b border-border bg-muted/30">
                <p className="text-sm font-medium text-foreground">Output as Table</p>
                <p className="text-xs text-muted-foreground mt-1">
                  When checking inputs and outputs of each function: if Input is not blank, it is assumed to be used.
                </p>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                    <TableRow className="border-b border-border hover:bg-transparent">
                      <TableHead className="font-semibold text-foreground w-[35%]">
                        Input
                      </TableHead>
                      <TableHead className="font-semibold text-foreground w-[25%]">
                        Output
                      </TableHead>
                      <TableHead className="font-semibold text-foreground w-[25%]">
                        Function
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-10 text-sm">
                          No rows match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (() => {
                        return filteredRows.map((row, idx) => (
                          <TableRow key={idx} className="border-b border-border/50">
                            <TableCell className="text-sm py-2.5 px-3 align-middle">{row.input}</TableCell>
                            <TableCell className="text-sm py-2.5 px-3 align-middle">{row.output}</TableCell>
                            <TableCell className="text-sm py-2.5 px-3 font-medium text-foreground">{row.functionLabel}</TableCell>
                          </TableRow>
                        ));
                      })()
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {fullScreenOpen && lineageRows.length > 0 && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 overflow-y-auto">
          <div className="w-full max-w-7xl flex flex-col gap-4 my-auto">
            <div className="flex items-center justify-between gap-4 sticky top-0 bg-background/95 backdrop-blur-sm pb-4 z-10">
              <h3 className="text-xl md:text-2xl font-semibold text-foreground">Technical Lineage — Full Screen</h3>
              <button
                onClick={() => setFullScreenOpen(false)}
                className="p-2 md:p-3 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                aria-label="Exit fullscreen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-4 flex-1 overflow-auto rounded-lg border border-border bg-card p-4">
              {lineageGraphData && lineageGraphData.transformNodes && lineageGraphData.transformNodes.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Lineage graph</Label>
                  <div className="min-h-[400px] rounded-lg border border-border bg-muted/20">
                    <LineageGraph
                      data={lineageGraphData}
                      layoutType={layoutType}
                      viewMode="pipeline"
                      className="rounded-lg"
                    />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  <strong>Lineage table:</strong> {filteredRows.length} mapping{filteredRows.length !== 1 ? "s" : ""}
                </p>
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto rounded border border-border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                      <TableRow className="border-b border-border hover:bg-transparent">
                        <TableHead className="font-semibold text-foreground">Input</TableHead>
                        <TableHead className="font-semibold text-foreground">Output</TableHead>
                        <TableHead className="font-semibold text-foreground">Function</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((row, idx) => (
                        <TableRow key={idx} className="border-b border-border/50">
                          <TableCell className="text-sm py-2.5 px-3">{row.input}</TableCell>
                          <TableCell className="text-sm py-2.5 px-3">{row.output}</TableCell>
                          <TableCell className="text-sm py-2.5 px-3 font-medium text-foreground">{row.functionLabel}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
