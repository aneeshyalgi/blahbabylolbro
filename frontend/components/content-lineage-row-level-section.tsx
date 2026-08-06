"use client";

import { useState, useEffect, useMemo } from "react";
import { ListOrdered, Loader2, Maximize, X } from "lucide-react";
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

export interface RowLevelLineageEntry {
  inputRow: number;
  inputColumns: string;
  outputRow: number;
  outputColumn: string;
  value: unknown;
  derivation: string;
  /** When set, table shows Group column (from result row) */
  groupKey?: string;
}

const CONTENT_ROWLEVEL_STORAGE_KEY = "dataflow_content_rowlevel";

interface ContentLineageRowLevelSectionProps {
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

export function ContentLineageRowLevelSection({
  datasetId,
  resultData,
  isLoading = false,
  embedded = false,
  displayName: displayNameProp,
}: ContentLineageRowLevelSectionProps) {
  const sectionTitle = displayNameProp ?? "Content Lineage (row-level)";
  const buttonLabel = displayNameProp ? `Generate ${displayNameProp}` : "Generate Content Lineage";
  const [rowLevelRows, setRowLevelRows] = useState<RowLevelLineageEntry[]>([]);
  const [generating, setGenerating] = useState(false);
  const [groupByColumn, setGroupByColumn] = useState<string>("");
  const [columnFilter, setColumnFilter] = useState<string>("all");
  const [valueFilter, setValueFilter] = useState("");
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const { toast } = useToast();

  const outputColumns = resultData?.summary?.columns ?? [];
  const resultRows = (resultData?.data ?? []) as Record<string, unknown>[];

  const executionId = resultData?.execution_id ?? "";
  const hasResult =
    resultData?.data &&
    resultData.data.length > 0 &&
    resultData?.summary?.columns?.length;
  const computedCells = resultData?.computed_cells ?? [];

  useEffect(() => {
    if (!hasResult) {
      setRowLevelRows([]);
      return;
    }
    if (!datasetId || !executionId || typeof window === "undefined") return;
    const key = `${CONTENT_ROWLEVEL_STORAGE_KEY}_${datasetId}_${executionId}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed: RowLevelLineageEntry[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRowLevelRows(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
    setRowLevelRows([]);
  }, [hasResult, datasetId, executionId]);

  const saveContentRowLevel = (rows: RowLevelLineageEntry[]) => {
    if (!datasetId || !executionId || typeof window === "undefined") return;
    try {
      const key = `${CONTENT_ROWLEVEL_STORAGE_KEY}_${datasetId}_${executionId}`;
      localStorage.setItem(key, JSON.stringify(rows));
    } catch {
      // ignore
    }
  };

  const buildContentLineage = async () => {
    if (!datasetId || !resultData?.summary?.columns) {
      toast({
        title: "Cannot generate content lineage",
        description: "Select a dataset and run code to get results first.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      // 1) Get column-level lineage (input column(s) → output column → derivation)
      let columnMap: Map<string, { inputColumns: string; derivation: string }> = new Map();
      const codeId = resultData.code_id;
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
      // Fallback: no code analysis — use generic derivation per output column
      if (columnMap.size === 0) {
        for (const col of resultData.summary.columns) {
          columnMap.set(col, { inputColumns: "—", derivation: "Derive by code" });
        }
      }

      // 2) Build row-level entries from computed_cells
      const rows: RowLevelLineageEntry[] = [];
      for (const cell of computedCells) {
        const info = columnMap.get(cell.column) ?? {
          inputColumns: "—",
          derivation: "Derive by code",
        };
        rows.push({
          inputRow: cell.row,
          inputColumns: info.inputColumns,
          outputRow: cell.row,
          outputColumn: cell.column,
          value: (cell as { value?: unknown }).value,
          derivation: info.derivation,
        });
      }
      setRowLevelRows(rows);
      saveContentRowLevel(rows);
      toast({
        title: "Content lineage generated",
        description: `${rows.length} row-level mapping(s) from input to result.`,
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Failed to generate content lineage",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const formatValue = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
    return String(v);
  };

  /** Expand row-level entries with groupKey when "Group by" is set (from result row). */
  const rowsWithGroup = useMemo(() => {
    if (!groupByColumn || groupByColumn === "all" || !resultRows.length) {
      return rowLevelRows.map((r) => ({ ...r, groupKey: undefined }));
    }
    const distinctGroups = Array.from(
      new Set(resultRows.map((row) => String(row[groupByColumn] ?? "")).filter(Boolean))
    ).sort();
    const expanded: RowLevelLineageEntry[] = [];
    for (const gv of distinctGroups) {
      for (const r of rowLevelRows) {
        const resultRow = resultRows[r.outputRow];
        const key = resultRow != null ? String(resultRow[groupByColumn] ?? "") : "";
        if (key === gv) {
          expanded.push({ ...r, groupKey: gv });
        }
      }
    }
    return expanded;
  }, [rowLevelRows, groupByColumn, resultRows]);

  const filteredRows = useMemo(() => {
    let list = rowsWithGroup;
    if (columnFilter !== "all") {
      list = list.filter((r) => r.outputColumn === columnFilter || r.inputColumns.includes(columnFilter));
    }
    if (valueFilter.trim()) {
      const q = valueFilter.trim().toLowerCase();
      list = list.filter(
        (r) =>
          String(r.inputRow).toLowerCase().includes(q) ||
          r.inputColumns.toLowerCase().includes(q) ||
          String(r.outputRow).toLowerCase().includes(q) ||
          r.outputColumn.toLowerCase().includes(q) ||
          formatValue(r.value).toLowerCase().includes(q) ||
          r.derivation.toLowerCase().includes(q)
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
          <ListOrdered className="h-4 w-4" />
          {sectionTitle}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          How input rows and columns become result values (e.g. RWA). One row per computed cell.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button
                size="sm"
                onClick={buildContentLineage}
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
              ? "Run the code above to generate result data, then you can generate."
              : "Build row-level lineage from result data and code analysis."}
          </TooltipContent>
        </Tooltip>
        {rowLevelRows.length > 0 && (
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
            <ListOrdered className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground">
              No result data yet
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Run the code above to compute results, then click &quot;{buttonLabel}&quot; to see row-level input → output.
            </p>
          </div>
        ) : rowLevelRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Click &quot;{buttonLabel}&quot; to build the table: Input Row, Input Column(s), Output Row, Output Column, Value, Derivation.
            </p>
            {computedCells.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                No computed cells in this result; run code that fills missing values to see lineage.
              </p>
            )}
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
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
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
                  placeholder="Search in row, column, value, derivation..."
                  value={valueFilter}
                  onChange={(e) => setValueFilter(e.target.value)}
                  className="max-w-[280px]"
                />
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Row-level lineage:</strong> {filteredRows.length} computed cell{filteredRows.length !== 1 ? "s" : ""}
                {groupByColumn && <span> grouped by {groupByColumn}</span>}
                {filteredRows.length !== rowLevelRows.length && !groupByColumn && (
                  <span> (filtered from {rowLevelRows.length})</span>
                )}
                {" — from input row/columns to result value."}
              </p>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                    <TableRow className="border-b border-border hover:bg-transparent">
                      {groupByColumn ? (
                        <TableHead className="w-[140px] font-semibold text-foreground">{groupByColumn}</TableHead>
                      ) : null}
                      <TableHead className="font-semibold text-foreground w-[80px]">Input Row</TableHead>
                      <TableHead className="font-semibold text-foreground min-w-[140px]">Input Column(s)</TableHead>
                      <TableHead className="font-semibold text-foreground w-[80px]">Output Row</TableHead>
                      <TableHead className="font-semibold text-foreground min-w-[120px]">Output Column</TableHead>
                      <TableHead className="font-semibold text-foreground min-w-[100px]">Value</TableHead>
                      <TableHead className="font-semibold text-foreground min-w-[140px]">Derivation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={groupByColumn ? 7 : 6}
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
                                  <TableCell colSpan={7} className="py-2 border-b border-border/50" />
                                </TableRow>
                              );
                            }
                            lastGroup = row.groupKey;
                          }
                          elements.push(
                            <TableRow key={hasGroup ? `${row.groupKey}-${idx}` : idx} className="border-b border-border/50">
                              {hasGroup && (
                                <TableCell className="text-sm py-2.5 px-3 align-middle w-[140px] font-medium bg-muted/10">
                                  {row.groupKey}
                                </TableCell>
                              )}
                              <TableCell className="text-sm py-2.5 px-3 align-middle font-mono">{row.inputRow}</TableCell>
                              <TableCell className="text-sm py-2.5 px-3 align-middle">{row.inputColumns}</TableCell>
                              <TableCell className="text-sm py-2.5 px-3 align-middle font-mono">{row.outputRow}</TableCell>
                              <TableCell className="text-sm py-2.5 px-3 align-middle">{row.outputColumn}</TableCell>
                              <TableCell className="text-sm py-2.5 px-3 align-middle">{formatValue(row.value)}</TableCell>
                              <TableCell className="text-sm py-2.5 px-3 font-medium text-foreground">{row.derivation}</TableCell>
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

  const fullScreenOverlay = rowLevelRows.length > 0 && fullScreenOpen && (
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
                    <TableHead className="w-[140px] font-semibold text-foreground">{groupByColumn}</TableHead>
                  ) : null}
                  <TableHead className="font-semibold text-foreground w-[80px]">Input Row</TableHead>
                  <TableHead className="font-semibold text-foreground min-w-[140px]">Input Column(s)</TableHead>
                  <TableHead className="font-semibold text-foreground w-[80px]">Output Row</TableHead>
                  <TableHead className="font-semibold text-foreground min-w-[120px]">Output Column</TableHead>
                  <TableHead className="font-semibold text-foreground min-w-[100px]">Value</TableHead>
                  <TableHead className="font-semibold text-foreground min-w-[140px]">Derivation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row, idx) => (
                  <TableRow key={idx} className="border-b border-border/50">
                    {groupByColumn && (
                      <TableCell className="text-sm py-2.5 px-3 font-medium bg-muted/10">{row.groupKey}</TableCell>
                    )}
                    <TableCell className="text-sm py-2.5 px-3 align-middle font-mono">{row.inputRow}</TableCell>
                    <TableCell className="text-sm py-2.5 px-3 align-middle">{row.inputColumns}</TableCell>
                    <TableCell className="text-sm py-2.5 px-3 align-middle font-mono">{row.outputRow}</TableCell>
                    <TableCell className="text-sm py-2.5 px-3 align-middle">{row.outputColumn}</TableCell>
                    <TableCell className="text-sm py-2.5 px-3 align-middle">{formatValue(row.value)}</TableCell>
                    <TableCell className="text-sm py-2.5 px-3 font-medium text-foreground">{row.derivation}</TableCell>
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
