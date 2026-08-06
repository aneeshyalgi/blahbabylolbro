"use client";

import { useState, useEffect } from "react";
import { Network, Loader2, LayoutGrid, FileDown, Maximize, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_ENDPOINTS } from "@/lib/api-config";
import {
  exportToDrawIo,
  downloadDrawIo,
  columnLineageToDrawIoGraph,
} from "@/lib/drawio-export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import {
  LineageGraph,
  type LineageGraphData,
  type ColumnLineageNode,
  type ColumnLineageEdge,
} from "@/components/lineage-graph";

function sanitizeId(s: string): string {
  if (!s || s === "—") return "unknown";
  return s.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "_") || "unknown";
}

/** Infer column type for semantic graph: input, derived, aggregate, lookup */
function inferColumnType(
  columnName: string,
  isOnlyInput: boolean,
  functionLabel: string
): string {
  if (isOnlyInput) return "input";
  const nameLower = (columnName || "").toLowerCase();
  const labelLower = (functionLabel || "").toLowerCase();
  if (
    labelLower.includes("aggregate") ||
    /^(sum_|total|avg_|count_|rwa|ead|amount)/.test(nameLower)
  )
    return "aggregate";
  if (
    labelLower.includes("lookup") ||
    /(lookup|reference|key|id)$/.test(nameLower)
  )
    return "lookup";
  return "derived";
}

const SEMANTIC_LINEAGE_STORAGE_KEY = "dataflow_semantic_lineage";

interface SemanticLineageGraphSectionProps {
  datasetId?: string | null;
  resultData?: {
    data?: unknown[];
    summary?: { columns?: string[]; computed_by_column?: Record<string, number> };
    computed_cells?: { row: number; column: string; value?: unknown }[];
    code_id?: string;
    execution_id?: string;
  } | null;
  isLoading?: boolean;
}

export function SemanticLineageGraphSection({
  datasetId,
  resultData,
  isLoading = false,
}: SemanticLineageGraphSectionProps) {
  const [graphData, setGraphData] = useState<LineageGraphData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [layoutType, setLayoutType] = useState<"dagre" | "cola" | "circle">("dagre");
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const { toast } = useToast();

  const executionId = resultData?.execution_id ?? "";
  const hasResult =
    resultData?.data &&
    resultData.data.length > 0 &&
    resultData?.summary?.columns?.length;

  useEffect(() => {
    if (!hasResult) {
      setGraphData(null);
      return;
    }
    if (!datasetId || !executionId || typeof window === "undefined") return;
    const key = `${SEMANTIC_LINEAGE_STORAGE_KEY}_${datasetId}_${executionId}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed: LineageGraphData = JSON.parse(raw);
        if (parsed?.semanticLineage?.nodes?.length) {
          setGraphData(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
    setGraphData(null);
  }, [hasResult, datasetId, executionId]);

  const saveSemanticLineage = (data: LineageGraphData) => {
    if (!datasetId || !executionId || typeof window === "undefined") return;
    try {
      const key = `${SEMANTIC_LINEAGE_STORAGE_KEY}_${datasetId}_${executionId}`;
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      // ignore
    }
  };

  const buildSemanticLineage = async () => {
    if (!datasetId || !resultData?.summary?.columns) {
      toast({
        title: "Cannot generate semantic lineage",
        description: "Select a dataset and run code to get results first.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    setGraphData(null);
    try {
      const codeId = resultData.code_id;
      let rows: { input: string; output: string; function_label: string }[] = [];

      if (codeId) {
        const res = await fetch(API_ENDPOINTS.contentLineage, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataset_id: datasetId,
            code_id: codeId,
            output_columns: resultData.summary.columns,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.rows && Array.isArray(data.rows) && data.rows.length > 0) {
            rows = data.rows.map(
              (r: { input?: string; output?: string; function_label?: string }) => ({
                input: (r.input ?? "—").trim(),
                output: (r.output ?? "").trim(),
                function_label: (r.function_label ?? "Derive by code").trim(),
              })
            );
          }
        }
      }

      if (rows.length === 0) {
        const inputColNames = new Set<string>();
        try {
          const metaRes = await fetch(API_ENDPOINTS.datasetById(datasetId));
          const meta = await metaRes.json();
          const tables = meta?.tables ?? [];
          const first = Array.isArray(tables) ? tables[0] : null;
          (first?.columns ?? []).forEach((c: { name?: string }) => {
            if (c?.name) inputColNames.add(c.name);
          });
        } catch {
          // ignore
        }
        const computedCols = new Set(
          (resultData.computed_cells ?? []).map((c) => c.column)
        );
        for (const col of resultData.summary.columns) {
          const inInput = inputColNames.has(col);
          const hasComputed = computedCols.has(col);
          if (inInput && !hasComputed)
            rows.push({ input: col, output: col, function_label: "1:1 Mapping" });
          else if (inInput && hasComputed)
            rows.push({ input: col, output: col, function_label: "Derive by code" });
          else
            rows.push({ input: "—", output: col, function_label: "Derive by code" });
        }
      }

      const outputSet = new Set(rows.map((r) => r.output));
      const inputOnlySet = new Set(
        rows.map((r) => r.input).filter((x) => x && x !== "—")
      );
      const allLabels = new Set<string>();
      rows.forEach((r) => {
        allLabels.add(r.input);
        allLabels.add(r.output);
      });

      const nodes: ColumnLineageNode[] = [];
      const seenIds = new Set<string>();
      for (const label of allLabels) {
        const id = label === "—" ? "unknown" : sanitizeId(label);
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        const isOnlyInput =
          inputOnlySet.has(label) && !outputSet.has(label);
        const outRow = rows.find((r) => r.output === label);
        const type = inferColumnType(
          label,
          isOnlyInput,
          outRow?.function_label ?? ""
        );
        nodes.push({
          id,
          sheet: "",
          header: label === "—" ? "—" : label,
          displayLabel: label === "—" ? "—" : label,
          type,
          stats: {
            formulaCount: 0,
            avgComplexity: 0,
            upstreamHeaderCount: 0,
            downstreamHeaderCount: 0,
          },
        });
      }

      const edgeKeys = new Set<string>();
      const edges: ColumnLineageEdge[] = [];
      for (const r of rows) {
        const fromId = r.input === "—" ? "unknown" : sanitizeId(r.input);
        const toId = sanitizeId(r.output);
        if (!seenIds.has(fromId)) continue;
        if (!seenIds.has(toId)) continue;
        const key = `${fromId}-${toId}`;
        if (edgeKeys.has(key)) {
          const existing = edges.find((e) => e.from === fromId && e.to === toId);
          if (existing && !existing.kinds.includes(r.function_label))
            existing.kinds.push(r.function_label);
          continue;
        }
        edgeKeys.add(key);
        edges.push({
          from: fromId,
          to: toId,
          edgeType: "DERIVES",
          kinds: [r.function_label],
          sampleFormulas: [],
          sourceCellCount: 0,
        });
      }

      const data: LineageGraphData = {
        tables: [],
        nodes: [],
        edges: [],
        semanticLineage: { nodes, edges },
      };
      setGraphData(data);
      saveSemanticLineage(data);
      toast({
        title: "Semantic lineage generated",
        description: `${nodes.length} column(s), ${edges.length} edge(s).`,
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Failed to generate semantic lineage",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const canExport =
    graphData?.semanticLineage?.nodes?.length &&
    graphData?.semanticLineage?.edges?.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Network className="h-4 w-4" />
              Semantic Lineage Graph
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Column-level graph: which input columns feed which output columns (e.g. to RWA). Generate after result data exists.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Button
                    size="sm"
                    onClick={buildSemanticLineage}
                    disabled={generating || !datasetId || !hasResult}
                  >
                    {generating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      "Generate Semantic Lineage"
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {!hasResult
                  ? "Run the code in Result Data first, then generate the graph."
                  : "Build column-level semantic lineage from code analysis."}
              </TooltipContent>
            </Tooltip>
            {graphData?.semanticLineage?.nodes?.length ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFullScreenOpen(true)}
                aria-label="Full screen"
              >
                <Maximize className="h-4 w-4" />
              </Button>
            ) : null}
            {canExport && (
              <>
                <Label className="text-sm text-muted-foreground">Layout</Label>
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!graphData?.semanticLineage) return;
                    const graph = columnLineageToDrawIoGraph(
                      graphData.semanticLineage.nodes,
                      graphData.semanticLineage.edges
                    );
                    const xml = exportToDrawIo(graph, {
                      diagramName: "Semantic Lineage",
                      maxNodesPerRow: 6,
                      nodeWidth: 120,
                      nodeHeight: 40,
                    });
                    downloadDrawIo(xml, "semantic-lineage.drawio");
                  }}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Export to Draw.io
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        ) : !hasResult ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center">
            <Network className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground">
              No result data yet
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Run the code above to get results, then click &quot;Generate Semantic Lineage&quot; to build the column graph.
            </p>
          </div>
        ) : !graphData?.semanticLineage?.nodes?.length ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Click &quot;Generate Semantic Lineage&quot; to build the graph (input → output columns).
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Green = input, blue = derived, purple = aggregate, orange = lookup.
            </p>
            <LineageGraph
              data={graphData}
              layoutType={layoutType}
              viewMode="column"
              className="rounded-lg border border-border"
            />
          </div>
        )}
      </CardContent>

      {fullScreenOpen && graphData?.semanticLineage?.nodes?.length ? (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 overflow-y-auto">
          <div className="w-full max-w-7xl flex flex-col gap-4 my-auto">
            <div className="flex items-center justify-between gap-4 sticky top-0 bg-background/95 backdrop-blur-sm pb-4 z-10">
              <h3 className="text-xl md:text-2xl font-semibold text-foreground">Semantic Lineage — Full Screen</h3>
              <button
                onClick={() => setFullScreenOpen(false)}
                className="p-2 md:p-3 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                aria-label="Exit fullscreen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-[70vh] overflow-auto rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground mb-3">
                Green = input, blue = derived, purple = aggregate, orange = lookup.
              </p>
              <LineageGraph
                data={graphData}
                layoutType={layoutType}
                viewMode="column"
                className="rounded-lg border border-border min-h-[500px]"
              />
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
