"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, Database, FileCode2, Maximize2, Play, RefreshCw, Trash2, X } from "lucide-react";
import { ResultDataSection } from "@/components/result-data-section";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "dataflow_results_cluster_id";

interface DataTabContentProps {
  isLoading?: boolean;
}

export type DataTabResultData = {
  data?: unknown[];
  summary?: { columns?: string[]; computed_by_column?: Record<string, number> };
  computed_cells?: { row: number; column: string; value?: unknown }[];
  code_id?: string;
} | null;

interface ClusterOption {
  id: string;
  name: string;
  reporting_date: string;
  dataset_id: string;
  dataset_name?: string | null;
  code_id: string | null;
  code_filename?: string | null;
}

interface ClusterExecutionRow {
  id: string;
  cluster_id: string;
  cluster_name: string | null;
  cluster_reporting_date: string | null;
  execution_id: string;
  executed_date: string;
  dataset_name: string | null;
  dataset_version: string | null;
  code_filename: string | null;
  code_version: string | null;
  summary?: { total_values_computed?: number };
}

export function DataTabContent({ isLoading = false }: DataTabContentProps) {
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [resultData, setResultData] = useState<DataTabResultData>(null);
  const [clusters, setClusters] = useState<ClusterOption[]>([]);
  const [allExecutions, setAllExecutions] = useState<ClusterExecutionRow[]>([]);
  const [loadingExecutions, setLoadingExecutions] = useState(true);
  const [viewingExecutionData, setViewingExecutionData] = useState<{
    data?: unknown[];
    summary?: { columns?: string[]; computed_by_column?: Record<string, number>; rows_processed?: number; total_values_computed?: number };
    computed_cells?: { row: number; column: string; value?: unknown }[];
  } | null>(null);
  const [loadingExecutionData, setLoadingExecutionData] = useState(false);
  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  const [executionToDelete, setExecutionToDelete] = useState<ClusterExecutionRow | null>(null);
  const [deletingExecution, setDeletingExecution] = useState(false);
  const [runRequestNonce, setRunRequestNonce] = useState(0);
  const [runControls, setRunControls] = useState<{
    disabled: boolean;
    executing: boolean;
    label: string;
  }>({
    disabled: true,
    executing: false,
    label: "",
  });
  const { toast } = useToast();
  const t = useTranslations("data");
  const tResult = useTranslations("resultData");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setSelectedClusterId(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedClusterId) localStorage.setItem(STORAGE_KEY, selectedClusterId);
    else localStorage.removeItem(STORAGE_KEY);
  }, [selectedClusterId]);

  useEffect(() => {
    fetch(API_ENDPOINTS.clusters)
      .then((res) => res.json())
      .then((data) => {
        const list: ClusterOption[] = data.clusters || [];
        setClusters(list);
        if (selectedClusterId && !list.some((c) => c.id === selectedClusterId)) {
          setSelectedClusterId(null);
        }
      })
      .catch(() => setClusters([]));
  }, []);

  const selectedCluster = clusters.find((c) => c.id === selectedClusterId) ?? null;
  const selectedDatasetId = selectedCluster?.dataset_id ?? null;
  const selectedCodeId = selectedCluster?.code_id ?? null;
  const visibleExecutions = selectedClusterId
    ? allExecutions.filter((execution) => execution.cluster_id === selectedClusterId)
    : [];
  const latestVisibleExecutionId = visibleExecutions[0]?.execution_id ?? null;

  const refetchAllExecutions = () => {
    setLoadingExecutions(true);
    fetch(API_ENDPOINTS.clustersExecutions)
      .then((res) => res.json())
      .then((data) => setAllExecutions(data.executions || []))
      .catch(() => setAllExecutions([]))
      .finally(() => setLoadingExecutions(false));
  };

  useEffect(() => {
    refetchAllExecutions();
  }, []);

  useEffect(() => {
    if (!selectedClusterId) {
      setResultData(null);
      return;
    }

    if (!latestVisibleExecutionId) {
      setResultData(null);
      return;
    }

    const currentExecutionId = (resultData as { execution_id?: string } | null)?.execution_id ?? null;
    if (currentExecutionId === latestVisibleExecutionId) {
      return;
    }

    let cancelled = false;

    fetch(API_ENDPOINTS.resultById(latestVisibleExecutionId))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load latest execution result");
        }
        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          setResultData(data as DataTabResultData);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Error loading latest cluster execution result:", error);
          setResultData(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedClusterId, latestVisibleExecutionId]);

  const handleViewExecutionData = async (executionId: string) => {
    setExecutionModalOpen(true);
    setLoadingExecutionData(true);
    setViewingExecutionData(null);
    try {
      const response = await fetch(API_ENDPOINTS.resultById(executionId));
      if (!response.ok) throw new Error("Failed to load execution data");
      const data = await response.json();
      setViewingExecutionData(data);
    } catch (error) {
      console.error("Error loading execution data:", error);
      toast({
        title: t("loadError"),
        description: t("loadErrorDesc"),
        variant: "destructive",
      });
      setExecutionModalOpen(false);
    } finally {
      setLoadingExecutionData(false);
    }
  };

  const formatCellDisplay = (value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "number" && value === 0) return "—";
    if (typeof value === "number") return Number(value).toLocaleString();
    return String(value);
  };

  const handleDeleteExecution = async () => {
    if (!executionToDelete) return;
    setDeletingExecution(true);
    try {
      const response = await fetch(API_ENDPOINTS.clusterExecutionDelete(executionToDelete.id), {
        method: "DELETE",
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || "Delete failed");
      }

      toast({
        title: t("deleteExecutionSuccess"),
        description: t("deleteExecutionSuccessDesc"),
      });
      setExecutionToDelete(null);
      refetchAllExecutions();
    } catch (error) {
      toast({
        title: t("deleteExecutionFailed"),
        description: error instanceof Error ? error.message : t("deleteExecutionFailedDesc"),
        variant: "destructive",
      });
    } finally {
      setDeletingExecution(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">{t("runViewResults")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("runViewResultsDesc")}
        </p>
        <div className="pt-2">
          <div className="min-w-[420px] rounded-xl border border-border/70 bg-gradient-to-br from-muted/70 via-card to-muted/30 px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-[320px] space-y-2">
                  <Label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {t("clusterSelectionLabel")}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={selectedClusterId ?? "__none__"}
                      onValueChange={(v) => setSelectedClusterId(v === "__none__" ? null : v)}
                    >
                      <SelectTrigger className="h-11 w-[320px] bg-background/85 text-sm font-medium">
                        <SelectValue placeholder={t("selectClusterForRun")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t("selectClusterForRun")}</SelectItem>
                        {clusters.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}{c.reporting_date ? ` (${new Date(c.reporting_date).toLocaleDateString()})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={() => setRunRequestNonce((current) => current + 1)}
                      disabled={runControls.disabled}
                      className="h-11 min-w-[136px] shrink-0 px-4"
                    >
                      {runControls.executing ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      {runControls.label || tResult("runCode")}
                    </Button>
                  </div>
                </div>
              </div>
              {selectedCluster?.reporting_date && (
                <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>{new Date(selectedCluster.reporting_date).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            {selectedCluster && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-border/60 bg-background/75 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Database className="h-3.5 w-3.5" />
                    <span>{t("dataset")}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-foreground">
                    {selectedCluster.dataset_name || "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/75 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <FileCode2 className="h-3.5 w-3.5" />
                    <span>{t("code")}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-foreground">
                    {selectedCluster.code_filename || "—"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">{t("allExecutions")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("allExecutionsDesc")}
          </p>
        </CardHeader>
        <CardContent>
          {loadingExecutions ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : visibleExecutions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noExecutionsYet")}</p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/95 z-10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">{t("cluster")}</TableHead>
                    <TableHead className="font-semibold">{t("repDate")}</TableHead>
                    <TableHead className="font-semibold">{t("dataset")}</TableHead>
                    <TableHead className="font-semibold">{t("code")}</TableHead>
                    <TableHead className="font-semibold">{t("timestamp")}</TableHead>
                    <TableHead className="font-semibold text-right">{t("values")}</TableHead>
                    <TableHead className="font-semibold w-[80px]">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleExecutions.map((ex) => (
                    <TableRow key={ex.id}>
                      <TableCell className="font-medium">{ex.cluster_name ?? "—"}</TableCell>
                      <TableCell>{ex.cluster_reporting_date ? new Date(ex.cluster_reporting_date).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>
                        {ex.dataset_name != null ? `${ex.dataset_name}${ex.dataset_version ? ` (${ex.dataset_version})` : ""}` : "—"}
                      </TableCell>
                      <TableCell>
                        {ex.code_filename != null
                          ? `${ex.code_filename}${ex.code_version ? ` (${ex.code_version})` : ""}`
                          : ex.code_version ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(ex.executed_date).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">{ex.summary?.total_values_computed ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleViewExecutionData(ex.execution_id)}
                                >
                                  <Maximize2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t("viewData")}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setExecutionToDelete(ex)}
                                  disabled={deletingExecution}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t("deleteExecution")}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ResultDataSection
        isLoading={isLoading}
        datasetId={selectedDatasetId}
        selectedCodeId={selectedCodeId}
        selectedClusterId={selectedClusterId}
        runRequestNonce={runRequestNonce}
        onRunActionStateChange={setRunControls}
        resultData={resultData}
        onResultDataChange={(data) => setResultData(data as DataTabResultData)}
        onRunComplete={refetchAllExecutions}
      />

      {/* Execution data modal (same as Clusters tab View data) */}
      {executionModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 overflow-y-auto">
          <div className="w-full max-w-7xl flex flex-col gap-4 my-auto">
            <div className="flex items-center justify-between gap-4 sticky top-0 bg-background/95 backdrop-blur-sm pb-4 z-10">
              <div className="flex-1 min-w-0">
                <h3 className="text-xl md:text-2xl font-semibold text-foreground truncate">
                  {t("executionResults")}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("executionResultsDesc")}
                </p>
              </div>
              <button
                onClick={() => setExecutionModalOpen(false)}
                className="p-2 md:p-3 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-6 pb-8">
              {loadingExecutionData ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{t("loadingExecutionData")}</p>
                  </div>
                </div>
              ) : viewingExecutionData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("rowsProcessed")}</Label>
                      <p className="text-lg font-semibold">
                        {viewingExecutionData.summary?.rows_processed ?? 0}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("totalValuesComputed")}</Label>
                      <p className="text-lg font-semibold">
                        {viewingExecutionData.summary?.total_values_computed ?? 0}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("columns")}</Label>
                      <p className="text-lg font-semibold">
                        {viewingExecutionData.summary?.columns?.length ?? 0}
                      </p>
                    </div>
                  </div>
                  {viewingExecutionData.summary?.computed_by_column &&
                   Object.keys(viewingExecutionData.summary.computed_by_column).length > 0 && (
                    <div>
                      <Label className="mb-2 block">{t("computedByColumn")}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(viewingExecutionData.summary.computed_by_column).map(
                          ([column, count]) => (
                            <div
                              key={column}
                              className="flex justify-between items-center p-2 bg-muted rounded"
                            >
                              <span className="text-sm font-medium">{column}</span>
                              <Badge>{count as number} {t("valuesComputed")}</Badge>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                  <div>
                    <Label className="mb-2 block">{t("resultDataLabel")}</Label>
                    <div className="border rounded-lg overflow-hidden">
                      <div className="max-h-[400px] overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {viewingExecutionData.summary?.columns?.map((col: string) => (
                                <TableHead key={col}>{col}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {((viewingExecutionData.data ?? []) as Record<string, unknown>[]).map((row, rowIndex) => (
                              <TableRow key={rowIndex}>
                                {(viewingExecutionData.summary?.columns ?? []).map((col: string) => {
                                  const isComputed = (viewingExecutionData.computed_cells ?? []).some(
                                    (cell: { row: number; column: string }) =>
                                      cell.row === rowIndex && cell.column === col
                                  );
                                  return (
                                    <TableCell
                                      key={col}
                                      className={
                                        isComputed ? "bg-green-100 dark:bg-green-900/20" : ""
                                      }
                                    >
                                      {formatCellDisplay(row[col])}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">{t("noDataAvailable")}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={!!executionToDelete}
        onOpenChange={(open) => {
          if (!open && !deletingExecution) setExecutionToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteExecutionQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteExecutionWarning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingExecution}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteExecution} disabled={deletingExecution}>
              {deletingExecution ? t("deleting") : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
