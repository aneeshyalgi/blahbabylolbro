"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Upload, Maximize2, X, Edit2, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface InputDataSectionProps {
  isLoading?: boolean;
  datasetId?: string | null;
}

interface TableColumn {
  name: string;
  index: number;
  data_type: string;
  sample_values: Array<string | number | null>;
  null_count: number;
}

interface InputTable {
  id: string;
  name: string;
  sheet: string;
  confidence: number;
  start_row: number;
  end_row: number;
  columns: TableColumn[];
}

interface EditState {
  isEditing: boolean;
  isSaving: boolean;
  originalRows: Array<Record<string, string | number | null>>;
  editedRows: Array<Record<string, string | number | null>>;
  dirtyCells: Set<string>;
  originalColumnNames: string[];
  editedColumnNames: string[];
}

function buildRowsFromColumns(table: InputTable): Array<Record<string, string | number | null>> {
  const rowCount = table.columns[0]?.sample_values?.length || 0;
  const rows: Array<Record<string, string | number | null>> = [];

  for (let rowIdx = 0; rowIdx < rowCount; rowIdx += 1) {
    const row: Record<string, string | number | null> = {};
    for (const col of table.columns) {
      row[col.name] = col.sample_values[rowIdx] ?? null;
    }
    rows.push(row);
  }

  return rows;
}

export function InputDataSection({ isLoading = false, datasetId }: InputDataSectionProps) {
  const t = useTranslations("inputData");
  const { toast } = useToast();
  const [tableData, setTableData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const [fullScreenTableId, setFullScreenTableId] = useState<string | null>(null);
  const [columnDescriptions, setColumnDescriptions] = useState<Record<string, any>>({});
  const [editStates, setEditStates] = useState<Record<string, EditState>>({});

  const tables: InputTable[] = useMemo(() => tableData?.tables || [], [tableData]);
  const fullScreenTable = useMemo(
    () => tables.find((table) => table.id === fullScreenTableId) || null,
    [tables, fullScreenTableId],
  );

  useEffect(() => {
    if (datasetId) {
      void fetchDataset(datasetId);
    } else {
      setTableData(null);
      setLoading(false);
    }
  }, [datasetId]);

  const fetchDataset = async (id: string) => {
    try {
      setLoading(true);
      const response = await fetch(API_ENDPOINTS.datasetById(id));
      const data = await response.json();
      setTableData(data);

      if (data.tables && data.tables.length > 0) {
        await fetchColumnMappings(id);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Failed to load dataset",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchColumnMappings = async (id: string) => {
    try {
      const response = await fetch(API_ENDPOINTS.datasetMappings(id));
      const result = await response.json();

      const mappingsDict: Record<string, any> = {};
      Object.values(result.mappings).flat().forEach((mapping: any) => {
        if (mapping.abacus_field) {
          mappingsDict[mapping.column_name] = {
            field: mapping.abacus_field,
            description: mapping.abacus_description,
            similarity: mapping.similarity_score,
          };
        }
      });

      setColumnDescriptions(mappingsDict);
    } catch (error) {
      console.error("Error fetching column mappings:", error);
    }
  };

  const startEditMode = (table: InputTable) => {
    const rows = buildRowsFromColumns(table);

    setEditStates((prev) => ({
      ...prev,
      [table.id]: {
        isEditing: true,
        isSaving: false,
        originalRows: JSON.parse(JSON.stringify(rows)),
        editedRows: JSON.parse(JSON.stringify(rows)),
        dirtyCells: new Set<string>(),
        originalColumnNames: table.columns.map((col) => col.name),
        editedColumnNames: table.columns.map((col) => col.name),
      },
    }));
  };

  const cancelEditMode = (tableId: string) => {
    setEditStates((prev) => {
      const next = { ...prev };
      delete next[tableId];
      return next;
    });
  };

  const onCellChange = (tableId: string, rowIdx: number, colName: string, rawValue: string) => {
    setEditStates((prev) => {
      const current = prev[tableId];
      if (!current) return prev;

      const editedRows = [...current.editedRows];
      editedRows[rowIdx] = { ...editedRows[rowIdx], [colName]: rawValue === "" ? null : rawValue };

      const originalValue = current.originalRows[rowIdx]?.[colName] ?? null;
      const nextValue = editedRows[rowIdx][colName] ?? null;
      const cellKey = `${rowIdx}:${colName}`;
      const dirtyCells = new Set(current.dirtyCells);

      if (String(originalValue) === String(nextValue)) {
        dirtyCells.delete(cellKey);
      } else {
        dirtyCells.add(cellKey);
      }

      return {
        ...prev,
        [tableId]: {
          ...current,
          editedRows,
          dirtyCells,
        },
      };
    });
  };

  const onColumnNameChange = (tableId: string, colIdx: number, rawValue: string) => {
    setEditStates((prev) => {
      const current = prev[tableId];
      if (!current) return prev;

      const editedColumnNames = [...current.editedColumnNames];
      editedColumnNames[colIdx] = rawValue;

      return {
        ...prev,
        [tableId]: {
          ...current,
          editedColumnNames,
        },
      };
    });
  };

  const saveTableEdits = async (table: InputTable) => {
    if (!datasetId) return;
    const state = editStates[table.id];
    if (!state) return;

    const normalizedNames = state.editedColumnNames.map((name) => name.trim());
    if (normalizedNames.some((name) => !name)) {
      toast({
        title: "Column name required",
        description: "Column names cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    const uniqueNameCount = new Set(normalizedNames.map((n) => n.toLowerCase())).size;
    if (uniqueNameCount !== normalizedNames.length) {
      toast({
        title: "Duplicate column names",
        description: "Each column name must be unique.",
        variant: "destructive",
      });
      return;
    }

    const renamedCount = normalizedNames.reduce((count, name, idx) => {
      return count + (name !== (state.originalColumnNames[idx] || "") ? 1 : 0);
    }, 0);

    if (state.dirtyCells.size === 0 && renamedCount === 0) return;

    setEditStates((prev) => ({
      ...prev,
      [table.id]: {
        ...prev[table.id],
        isSaving: true,
      },
    }));

    try {
      const response = await fetch(API_ENDPOINTS.datasetTableData(datasetId, table.id), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: state.editedRows,
          column_names: normalizedNames,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || "Failed to save edits");
      }

      const payload = await response.json();
      const invalidatedLinks = Number(payload?.invalidated_cluster_execution_links || 0);
      const saveDescription =
        invalidatedLinks > 0
          ? `Saved ${state.dirtyCells.size} cell changes and ${renamedCount} column name changes. Cleared ${invalidatedLinks} stale cluster execution links; rerun in Results tab.`
          : `Saved ${state.dirtyCells.size} cell changes and ${renamedCount} column name changes`;

      toast({
        title: "Input data updated",
        description: saveDescription,
      });

      await fetchDataset(datasetId);
      cancelEditMode(table.id);
    } catch (error) {
      console.error("Error saving table edits:", error);
      toast({
        title: "Save failed",
        description: "Could not save table edits",
        variant: "destructive",
      });

      setEditStates((prev) => ({
        ...prev,
        [table.id]: {
          ...prev[table.id],
          isSaving: false,
        },
      }));
    }
  };

  const renderTableGrid = (table: InputTable, mode: "normal" | "fullscreen") => {
    const editState = editStates[table.id];
    const isEditing = !!editState?.isEditing;
    const rows = isEditing ? editState.editedRows : buildRowsFromColumns(table);

    return (
      <div
        className={cn(
          "overflow-x-auto overflow-y-auto",
          mode === "normal" ? "max-h-[300px]" : "max-h-[75vh]",
        )}
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              {table.columns.map((col, colIdx) => {
                const renderedName = isEditing
                  ? (editState?.editedColumnNames?.[colIdx] ?? col.name)
                  : col.name;
                const colDesc = columnDescriptions[col.name];
                const hasDescription = colDesc && colDesc.description;

                return (
                  <TableHead key={col.index} className="whitespace-nowrap">
                    {isEditing ? (
                      <Input
                        value={renderedName}
                        onChange={(e) => onColumnNameChange(table.id, colIdx, e.target.value)}
                        className="h-8 min-w-[140px] border-0 px-1 font-medium"
                      />
                    ) : hasDescription ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dotted">
                              {renderedName}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">
                            <div className="space-y-1">
                              <p className="font-semibold text-xs">{t("field")}: {colDesc.field}</p>
                              <p className="text-xs">{colDesc.description}</p>
                              <p className="text-xs text-muted-foreground">
                                {t("match")}: {(colDesc.similarity * 100).toFixed(0)}%
                              </p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span>{renderedName}</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-1">({col.data_type})</span>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {table.columns.map((col) => {
                  const value = row[col.name];
                  const isMissing = value === null || value === undefined;
                  const cellKey = `${rowIdx}:${col.name}`;
                  const isDirty = !!editState?.dirtyCells?.has(cellKey);

                  return (
                    <TableCell
                      key={col.index}
                      className={cn(
                        "min-w-[120px]",
                        isMissing && !isEditing && "bg-destructive/15 text-destructive font-medium",
                        isDirty && "ring-1 ring-amber-400 bg-amber-50/40 dark:bg-amber-900/20",
                      )}
                    >
                      {isEditing ? (
                        <Input
                          value={value == null ? "" : String(value)}
                          onChange={(e) => onCellChange(table.id, rowIdx, col.name, e.target.value)}
                          className="h-8 border-0 shadow-none px-1"
                          placeholder=""
                        />
                      ) : (
                        <span>{isMissing ? "-" : String(value)}</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold">{t("title")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading || isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !tableData || !tables.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground">{t("noInputData")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("noInputDataHint")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tables.map((table) => {
              const editState = editStates[table.id];
              const isEditing = !!editState?.isEditing;
              const dirtyCount = editState?.dirtyCells?.size ?? 0;
              const isSaving = !!editState?.isSaving;
              const renamedCount = (editState?.editedColumnNames || []).reduce((count, name, idx) => {
                return count + (name.trim() !== (editState?.originalColumnNames?.[idx] || "") ? 1 : 0);
              }, 0);

              return (
                <div key={table.id} className="border rounded-lg p-4">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-lg">{table.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t("sheet")}: {table.sheet} | {t("confidence")}: {(table.confidence * 100).toFixed(0)}% | {t("rows")}: {table.end_row - table.start_row} | {t("columns")}: {table.columns.length}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isEditing && (
                        <Button variant="outline" size="sm" onClick={() => startEditMode(table)}>
                          <Edit2 className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      )}

                      {isEditing && (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => void saveTableEdits(table)}
                            disabled={(dirtyCount === 0 && renamedCount === 0) || isSaving}
                          >
                            <Save className="h-4 w-4 mr-1" />
                            {isSaving ? "Saving..." : `Save (${dirtyCount + renamedCount})`}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => cancelEditMode(table.id)}
                            disabled={isSaving}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                        </>
                      )}

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setFullScreenTableId(table.id);
                                setFullScreenOpen(true);
                              }}
                            >
                              <Maximize2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t("fullScreenTooltip")}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="mb-3 rounded-md border border-amber-300/50 bg-amber-100/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                      Excel-like edit mode is on. Edit cell values and column names. Changed cells are highlighted.
                    </div>
                  )}

                  {renderTableGrid(table, "normal")}

                  <div className="mt-3 flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded bg-destructive/15 border border-destructive/30" />
                      <span className="text-muted-foreground">
                        {t("missingValues")}: {table.columns.reduce((sum: number, col) => sum + col.null_count, 0)} {t("total")}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {fullScreenOpen && fullScreenTable && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 overflow-y-auto">
          <div className="w-full max-w-7xl flex flex-col gap-4 my-auto">
            <div className="flex items-center justify-between gap-4 sticky top-0 bg-background/95 backdrop-blur-sm pb-4 z-10">
              <div className="flex-1 min-w-0">
                <h3 className="text-xl md:text-2xl font-semibold text-foreground truncate">{fullScreenTable.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {fullScreenTable.columns[0]?.sample_values?.length || 0} rows x {fullScreenTable.columns.length} columns
                </p>
              </div>
              <button
                onClick={() => {
                  setFullScreenOpen(false);
                  setFullScreenTableId(null);
                }}
                className="p-2 md:p-3 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                aria-label="Exit fullscreen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="rounded-lg border border-border bg-card p-2 md:p-4">
              {renderTableGrid(fullScreenTable, "fullscreen")}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
