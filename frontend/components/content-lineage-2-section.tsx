"use client";

import { useState, useEffect, useMemo } from "react";
import { GitMerge, Loader2, Maximize, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_ENDPOINTS } from "@/lib/api-config";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export interface RowFlowEntry {
  fromRow: number;
  fromColumn: string;
  toRow: number;
  toColumn: string;
  relationship: string;
  fromValue?: unknown;
  toValue?: unknown;
  groupKey?: string;
}

const CONTENT_FLOW_STORAGE_KEY = "dataflow_content_flow";

interface ContentLineage2SectionProps {
  datasetId?: string | null;
  resultData?: {
    data?: unknown[];
    summary?: { columns?: string[]; computed_by_column?: Record<string, number> };
    computed_cells?: { row: number; column: string; value?: unknown }[];
    code_id?: string;
    execution_id?: string;
  } | null;
  isLoading?: boolean;
  /** When true, render without Card wrapper (for use inside tabbed Content Lineage block). */
  embedded?: boolean;
  /** When set (e.g. in tabs), use this for the section title and button text. */
  displayName?: "Content Lineage" | "Content Lineage 2.0";
}

function formatCellValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  return String(v);
}

export function ContentLineage2Section({
  datasetId,
  resultData,
  isLoading = false,
  embedded = false,
  displayName: displayNameProp,
}: ContentLineage2SectionProps) {
  const sectionTitle = displayNameProp ?? "Content Lineage 2.0";
  const buttonLabel = displayNameProp ? `Generate ${displayNameProp}` : "Generate Content Lineage 2.0";
  const [flowRows, setFlowRows] = useState<RowFlowEntry[]>([]);
  const [generating, setGenerating] = useState(false);
  const [groupByColumn, setGroupByColumn] = useState<string>("");
  const [columnFilter, setColumnFilter] = useState<string>("all");
  const [valueFilter, setValueFilter] = useState("");
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const { toast } = useToast();

  const outputColumns = resultData?.summary?.columns ?? [];
  const resultRows = (resultData?.data ?? []) as Record<string, unknown>[];
  const computedCells = resultData?.computed_cells ?? [];

  const executionId = resultData?.execution_id ?? "";
  const hasResult =
    resultData?.data &&
    resultData.data.length > 0 &&
    resultData?.summary?.columns?.length;

  useEffect(() => {
    if (!hasResult) {
      setFlowRows([]);
      return;
    }
    if (!datasetId || !executionId || typeof window === "undefined") return;
    const key = `${CONTENT_FLOW_STORAGE_KEY}_${datasetId}_${executionId}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed: RowFlowEntry[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setFlowRows(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
    setFlowRows([]);
  }, [hasResult, datasetId, executionId]);

  const saveContentFlow = (rows: RowFlowEntry[]) => {
    if (!datasetId || !executionId || typeof window === "undefined") return;
    try {
      const key = `${CONTENT_FLOW_STORAGE_KEY}_${datasetId}_${executionId}`;
      localStorage.setItem(key, JSON.stringify(rows));
    } catch {
      // ignore
    }
  };

  const buildFlowTable = async () => {
    if (!datasetId || !resultData?.summary?.columns) {
      toast({
        title: `Cannot generate ${sectionTitle}`,
        description: "Select a dataset and run code to get results first.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      const codeId = resultData.code_id;
      let columnMap: Map<string, { inputColumns: string; derivation: string }> = new Map();

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
            const merged = new Map<string, { inputColumns: string; derivation: string }>();
            for (const r of data.rows as { input: string; output: string; function_label: string }[]) {
              const out = r.output ?? "";
              const inp = (r.input ?? "—").trim();
              const deriv = r.function_label ?? "Derive by code";
              if (!merged.has(out)) {
                merged.set(out, { inputColumns: inp || "—", derivation: deriv });
              } else {
                const e = merged.get(out)!;
                const inputs = new Set(e.inputColumns.split(", ").map((s) => s.trim()).filter(Boolean));
                if (inp && inp !== "—") inputs.add(inp);
                e.inputColumns = [...inputs].join(", ") || "—";
              }
            }
            columnMap = merged;
          }
        }
      }
      if (columnMap.size === 0) {
        for (const col of resultData.summary.columns) {
          columnMap.set(col, { inputColumns: "—", derivation: "Derive by code" });
        }
      }

      const flows: RowFlowEntry[] = [];

      // 1) Derived flows from computed cells (input columns → output row/column/value)
      for (const cell of computedCells) {
        const info = columnMap.get(cell.column) ?? { inputColumns: "—", derivation: "Derive by code" };
        const firstInputCol = info.inputColumns.split(",")[0]?.trim() || "—";
        const fromVal =
          firstInputCol !== "—" && resultRows[cell.row]
            ? (resultRows[cell.row] as Record<string, unknown>)[firstInputCol]
            : undefined;
        flows.push({
          fromRow: cell.row,
          fromColumn: info.inputColumns,
          toRow: cell.row,
          toColumn: cell.column,
          relationship: info.derivation,
          fromValue: fromVal,
          toValue: (cell as { value?: unknown }).value ?? (resultRows[cell.row] as Record<string, unknown>)?.[cell.column],
        });
      }

      // 2) Same-row column flow: for each result row, column i → column i+1 (how cells in a row connect)
      const colNames: string[] = resultData.summary!.columns ?? [];
      for (let r = 0; r < resultRows.length; r++) {
        for (let c = 0; c < colNames.length - 1; c++) {
          const fromCol = colNames[c];
          const toCol = colNames[c + 1];
          const row = resultRows[r] as Record<string, unknown>;
          flows.push({
            fromRow: r,
            fromColumn: fromCol,
            toRow: r,
            toColumn: toCol,
            relationship: "Same row",
            fromValue: row?.[fromCol],
            toValue: row?.[toCol],
          });
        }
      }

      setFlowRows(flows);
      saveContentFlow(flows);
      toast({
        title: `${sectionTitle} generated`,
        description: `${flows.length} flow connection(s) — how rows and cells connect.`,
      });
    } catch (e) {
      console.error(e);
      toast({
        title: `Failed to generate ${sectionTitle}`,
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const rowsWithGroup = useMemo(() => {
    if (!groupByColumn || groupByColumn === "all" || !resultRows.length) {
      return flowRows.map((r) => ({ ...r, groupKey: undefined }));
    }
    const distinctGroups = Array.from(
      new Set(resultRows.map((row) => String(row[groupByColumn] ?? "")).filter(Boolean))
    ).sort();
    const expanded: RowFlowEntry[] = [];
    for (const gv of distinctGroups) {
      for (const r of flowRows) {
        const resultRow = resultRows[r.toRow];
        const key = resultRow != null ? String(resultRow[groupByColumn] ?? "") : "";
        if (key === gv) expanded.push({ ...r, groupKey: gv });
      }
    }
    return expanded;
  }, [flowRows, groupByColumn, resultRows]);

  const filteredRows = useMemo(() => {
    let list = rowsWithGroup;
    if (columnFilter !== "all") {
      list = list.filter(
        (r) => r.fromColumn.includes(columnFilter) || r.toColumn === columnFilter
      );
    }
    if (valueFilter.trim()) {
      const q = valueFilter.trim().toLowerCase();
      list = list.filter(
        (r) =>
          String(r.fromRow).includes(q) ||
          r.fromColumn.toLowerCase().includes(q) ||
          String(r.toRow).includes(q) ||
          r.toColumn.toLowerCase().includes(q) ||
          r.relationship.toLowerCase().includes(q) ||
          formatCellValue(r.fromValue).toLowerCase().includes(q) ||
          formatCellValue(r.toValue).toLowerCase().includes(q)
      );
    }
    if (list.some((r) => r.groupKey != null)) {
      list = [...list].sort((a, b) => (a.groupKey ?? "").localeCompare(b.groupKey ?? ""));
    }
    return list;
  }, [rowsWithGroup, columnFilter, valueFilter]);

  const header = (
    <div className="flex flex-row items-center justify-between gap-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <GitMerge className="h-4 w-4" />
          {sectionTitle}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          How rows and cells flow and connect: source row/column → target row/column with values (e.g. Position → Nominal → Book Value → RWA).
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button
                size="sm"
                onClick={buildFlowTable}
                disabled={generating || !datasetId || !hasResult}
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  buttonLabel
                )}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {!hasResult
              ? "Run the code above to get result data, then generate to see row/cell flow."
              : "Build flow table: how each row and cell connects to others (tabular view)."}
          </TooltipContent>
        </Tooltip>
        {flowRows.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setFullScreenOpen(true)} aria-label="Full screen">
            <Maximize className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  const content = (
    <>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !hasResult ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center">
            <GitMerge className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground">No result data yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Run the code above to compute results, then click &quot;{buttonLabel}&quot; to see how rows and cells flow and connect.
            </p>
          </div>
        ) : flowRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Click &quot;{buttonLabel}&quot; to build the flow table: From Row/Column → To Row/Column with relationship and values.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-row flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Group by</Label>
                <Select value={groupByColumn || "all"} onValueChange={(v) => setGroupByColumn(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">None</SelectItem>
                    {outputColumns.map((col) => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Filter by column</Label>
                <Select value={columnFilter} onValueChange={setColumnFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All columns" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All columns</SelectItem>
                    {outputColumns.map((col) => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Filter by value</Label>
                <Input
                  placeholder="Search in row, column, value, relationship..."
                  value={valueFilter}
                  onChange={(e) => setValueFilter(e.target.value)}
                  className="max-w-[280px]"
                />
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Flow table:</strong> {filteredRows.length} connection{filteredRows.length !== 1 ? "s" : ""}
                {groupByColumn && <span> grouped by {groupByColumn}</span>}
                {filteredRows.length !== flowRows.length && !groupByColumn && (
                  <span> (filtered from {flowRows.length})</span>
                )}
                {" — From row/column → To row/column with values."}
              </p>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                    <TableRow className="border-b border-border hover:bg-transparent">
                      {groupByColumn ? (
                        <TableHead className="w-[120px] font-semibold text-foreground">{groupByColumn}</TableHead>
                      ) : null}
                      <TableHead className="font-semibold text-foreground w-[70px]">From Row</TableHead>
                      <TableHead className="font-semibold text-foreground min-w-[100px]">From Column</TableHead>
                      <TableHead className="font-semibold text-foreground min-w-[80px]">From Value</TableHead>
                      <TableHead className="font-semibold text-foreground w-[70px]">To Row</TableHead>
                      <TableHead className="font-semibold text-foreground min-w-[100px]">To Column</TableHead>
                      <TableHead className="font-semibold text-foreground min-w-[80px]">To Value</TableHead>
                      <TableHead className="font-semibold text-foreground min-w-[120px]">Relationship</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={groupByColumn ? 8 : 7}
                          className="text-center text-muted-foreground py-10 text-sm"
                        >
                          No rows match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (() => {
                        const hasGroup = filteredRows.some((r) => r.groupKey != null);
                        let lastGroup: string | undefined;
                        return filteredRows.flatMap((row, idx) => {
                          const elements: React.ReactNode[] = [];
                          if (hasGroup && row.groupKey !== lastGroup) {
                            if (lastGroup !== undefined) {
                              elements.push(
                                <TableRow key={`blank-${lastGroup}`} className="bg-muted/20 hover:bg-muted/20">
                                  <TableCell colSpan={8} className="py-2 border-b border-border/50" />
                                </TableRow>
                              );
                            }
                            lastGroup = row.groupKey;
                          }
                          elements.push(
                            <TableRow key={hasGroup ? `${row.groupKey}-${idx}` : idx} className="border-b border-border/50">
                              {hasGroup && (
                                <TableCell className="text-sm py-2.5 px-3 align-middle w-[120px] font-medium bg-muted/10">
                                  {row.groupKey}
                                </TableCell>
                              )}
                              <TableCell className="text-sm py-2.5 px-3 align-middle font-mono">{row.fromRow}</TableCell>
                              <TableCell className="text-sm py-2.5 px-3 align-middle">{row.fromColumn}</TableCell>
                              <TableCell className="text-sm py-2.5 px-3 align-middle">{formatCellValue(row.fromValue)}</TableCell>
                              <TableCell className="text-sm py-2.5 px-3 align-middle font-mono">{row.toRow}</TableCell>
                              <TableCell className="text-sm py-2.5 px-3 align-middle">{row.toColumn}</TableCell>
                              <TableCell className="text-sm py-2.5 px-3 align-middle">{formatCellValue(row.toValue)}</TableCell>
                              <TableCell className="text-sm py-2.5 px-3 font-medium text-foreground">{row.relationship}</TableCell>
                            </TableRow>
                          );
                          return elements;
                        });
                      })()
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
    </>
  );

  const fullScreenOverlay = flowRows.length > 0 && fullScreenOpen && (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 overflow-y-auto">
      <div className="w-full max-w-7xl flex flex-col gap-4 my-auto">
        <div className="flex items-center justify-between gap-4 sticky top-0 bg-background/95 backdrop-blur-sm pb-4 z-10">
          <h3 className="text-xl md:text-2xl font-semibold text-foreground">{sectionTitle} — Full Screen</h3>
          <button
            onClick={() => setFullScreenOpen(false)}
            className="p-2 md:p-3 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
            aria-label="Exit fullscreen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto rounded-lg border border-border bg-card">
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <TableRow className="border-b border-border hover:bg-transparent">
                  {groupByColumn ? (
                    <TableHead className="w-[120px] font-semibold text-foreground">{groupByColumn}</TableHead>
                  ) : null}
                  <TableHead className="font-semibold text-foreground w-[70px]">From Row</TableHead>
                  <TableHead className="font-semibold text-foreground min-w-[100px]">From Column</TableHead>
                  <TableHead className="font-semibold text-foreground min-w-[80px]">From Value</TableHead>
                  <TableHead className="font-semibold text-foreground w-[70px]">To Row</TableHead>
                  <TableHead className="font-semibold text-foreground min-w-[100px]">To Column</TableHead>
                  <TableHead className="font-semibold text-foreground min-w-[80px]">To Value</TableHead>
                  <TableHead className="font-semibold text-foreground min-w-[120px]">Relationship</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row, idx) => (
                  <TableRow key={idx} className="border-b border-border/50">
                    {groupByColumn && (
                      <TableCell className="text-sm py-2.5 px-3 font-medium bg-muted/10">{row.groupKey}</TableCell>
                    )}
                    <TableCell className="text-sm py-2.5 px-3 align-middle font-mono">{row.fromRow}</TableCell>
                    <TableCell className="text-sm py-2.5 px-3 align-middle">{row.fromColumn}</TableCell>
                    <TableCell className="text-sm py-2.5 px-3 align-middle">{formatCellValue(row.fromValue)}</TableCell>
                    <TableCell className="text-sm py-2.5 px-3 align-middle font-mono">{row.toRow}</TableCell>
                    <TableCell className="text-sm py-2.5 px-3 align-middle">{row.toColumn}</TableCell>
                    <TableCell className="text-sm py-2.5 px-3 align-middle">{formatCellValue(row.toValue)}</TableCell>
                    <TableCell className="text-sm py-2.5 px-3 font-medium text-foreground">{row.relationship}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-4">
        {header}
        {content}
        {fullScreenOverlay}
      </div>
    );
  }
  return (
    <Card>
      <CardHeader>{header}</CardHeader>
      <CardContent>{content}</CardContent>
      {fullScreenOverlay}
    </Card>
  );
}
