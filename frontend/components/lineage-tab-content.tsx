"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { GitBranch, RefreshCw, Download, Maximize, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_ENDPOINTS } from "@/lib/api-config";
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
import { ContentLineageTabsSection } from "@/components/content-lineage-tabs-section";
import { ContentLineageSection } from "@/components/content-lineage-section";
import { SemanticLineageGraphSection } from "@/components/semantic-lineage-graph-section";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useClusterSelection } from "@/context/cluster-selection-context";

interface Cluster {
  id: string;
  name: string;
  reporting_date: string;
  dataset_id: string;
  dataset_name: string;
  code_id: string;
  code_filename: string;
}

interface ClusterExecution {
  id: string;
  execution_id: string;
  executed_date: string;
  summary?: { total_values_computed?: number };
}

export type LineageResultData = {
  execution_id?: string;
  data?: unknown[];
  summary?: { columns?: string[]; computed_by_column?: Record<string, number> };
  computed_cells?: { row: number; column: string; value?: unknown }[];
  code_id?: string;
  dataset_id?: string;
} | null;

const STORAGE_EXECUTION = "dataflow_lineage_execution_id";

export type LineageVariant = "content" | "technical" | "semantic";

interface LineageTabContentProps {
  /** Which lineage section to show: content (flow/row-level), technical (input/output/function), or semantic graph. */
  variant?: LineageVariant;
}

export function LineageTabContent({ variant = "content" }: LineageTabContentProps) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const { baseClusterId, setBaseClusterId } = useClusterSelection();
  const [selectedClusterId, setSelectedClusterId] = useState<string>("");
  const [clusterDetails, setClusterDetails] = useState<{ cluster: Cluster; executions: ClusterExecution[] } | null>(null);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string>(() => {
    if (typeof window !== "undefined") return localStorage.getItem(STORAGE_EXECUTION) ?? "";
    return "";
  });
  const [resultData, setResultData] = useState<LineageResultData>(null);
  const [loadingClusters, setLoadingClusters] = useState(true);
  const [loadingClusterDetails, setLoadingClusterDetails] = useState(false);
  const [loadingResult, setLoadingResult] = useState(false);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [resultTableFullScreen, setResultTableFullScreen] = useState(false);
  const { toast } = useToast();
  const t = useTranslations("lineage");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedExecutionId) localStorage.setItem(STORAGE_EXECUTION, selectedExecutionId);
    else localStorage.removeItem(STORAGE_EXECUTION);
  }, [selectedExecutionId]);

  useEffect(() => {
    setSelectedClusterId(baseClusterId || "");
  }, [baseClusterId]);

  const isComputedCell = (rowIdx: number, columnName: string) => {
    if (!resultData?.computed_cells) return false;
    return resultData.computed_cells.some(
      (c) => c.row === rowIdx && c.column === columnName
    );
  };

  useEffect(() => {
    loadClusters();
  }, []);

  useEffect(() => {
    if (!selectedClusterId) {
      setClusterDetails(null);
      setSelectedExecutionId("");
      setResultData(null);
      setDatasetId(null);
      return;
    }
    // Wait for clusters to load so we don't call API with a stale global cluster selection
    if (loadingClusters) return;
    if (clusters.length === 0 || !clusters.some((c) => c.id === selectedClusterId)) {
      setBaseClusterId("");
      return;
    }
    loadClusterDetails(selectedClusterId);
  }, [selectedClusterId, loadingClusters, clusters]);

  useEffect(() => {
    if (!selectedExecutionId) {
      setResultData(null);
      setDatasetId(null);
      return;
    }

    // Avoid fetching with stale localStorage execution IDs that don't belong to the current cluster.
    if (
      !clusterDetails?.executions?.some((e) => e.execution_id === selectedExecutionId)
    ) {
      setSelectedExecutionId("");
      setResultData(null);
      setDatasetId(null);
      return;
    }

    loadExecutionResult(selectedExecutionId);
  }, [selectedExecutionId, clusterDetails]);

  const loadClusters = async () => {
    try {
      setLoadingClusters(true);
      const response = await fetch(API_ENDPOINTS.clusters);
      const data = await response.json();
      const list: Cluster[] = data.clusters || [];
      setClusters(list);
      // Clear global cluster selection if it no longer exists (e.g. no clusters or cluster was removed)
      if (baseClusterId && (list.length === 0 || !list.some((c) => c.id === baseClusterId))) {
        setBaseClusterId("");
      }
    } catch (err) {
      console.error("Error loading clusters:", err);
      toast({
        title: "Error",
        description: "Failed to load clusters",
        variant: "destructive",
      });
    } finally {
      setLoadingClusters(false);
    }
  };

  const loadClusterDetails = async (clusterId: string) => {
    try {
      setLoadingClusterDetails(true);
      setClusterDetails(null);
      const response = await fetch(API_ENDPOINTS.clusterById(clusterId));
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to load cluster");
      const executions: ClusterExecution[] = data.executions || [];
      setClusterDetails({
        cluster: data.cluster,
        executions,
      });
      // Keep previous execution if still valid; otherwise auto-select first execution.
      setSelectedExecutionId((prev) => {
        if (prev && executions.some((e) => e.execution_id === prev)) return prev;
        return executions[0]?.execution_id ?? "";
      });
    } catch (err) {
      console.error("Error loading cluster details:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load cluster details",
        variant: "destructive",
      });
    } finally {
      setLoadingClusterDetails(false);
    }
  };

  const loadExecutionResult = async (executionId: string) => {
    try {
      setLoadingResult(true);
      setResultData(null);
      setDatasetId(null);
      const response = await fetch(API_ENDPOINTS.resultById(executionId));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          setSelectedExecutionId("");
          return;
        }
        throw new Error("Failed to load execution result");
      }
      setResultData(data);
      setDatasetId(data.dataset_id ?? null);
    } catch (err) {
      console.error("Error loading execution result:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load execution result",
        variant: "destructive",
      });
    } finally {
      setLoadingResult(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const formatCellDisplay = (value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "number" && value === 0) return "—";
    if (typeof value === "number") return Number(value).toLocaleString();
    return String(value);
  };

  const hasResult = resultData?.data && resultData.data.length > 0 && resultData?.summary?.columns?.length;

  const variantTitle =
    variant === "content"
      ? t("contentLineageTitle")
      : variant === "technical"
        ? t("technicalLineageTitle")
        : t("semanticLineageTitle");
  const variantDescription =
    variant === "content"
      ? t("contentLineageDesc")
      : variant === "technical"
        ? t("technicalLineageDesc")
        : t("semanticLineageDesc");
  const executionCount = clusterDetails?.executions?.length ?? 0;
  const showExecutionDropdown =
    variant !== "technical" ||
    (selectedClusterId !== "" && !loadingClusterDetails && executionCount > 1);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            {variantTitle}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {variantDescription}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2 min-w-[200px]">
              <Label>{t("cluster")}</Label>
              {loadingClusters ? (
                <Skeleton className="h-10 w-[200px]" />
              ) : (
                <Select value={selectedClusterId} onValueChange={setBaseClusterId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectCluster")} />
                  </SelectTrigger>
                  <SelectContent>
                    {clusters.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {showExecutionDropdown && (
                <div className="space-y-2 min-w-[280px]">
                  <Label>{t("execution")}</Label>
                  {!selectedClusterId ? (
                    <Select value="__none__" onValueChange={() => {}}>
                      <SelectTrigger disabled>
                        <SelectValue placeholder={t("selectClusterFirst")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" disabled>{t("selectClusterFirst")}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : loadingClusterDetails ? (
                    <Skeleton className="h-10 w-[280px]" />
                  ) : !clusterDetails?.executions?.length ? (
                    <Select value="__none__" onValueChange={() => {}}>
                      <SelectTrigger disabled>
                        <SelectValue placeholder={t("noExecutions")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" disabled>{t("noExecutions")}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={selectedExecutionId} onValueChange={setSelectedExecutionId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("selectExecution")} />
                      </SelectTrigger>
                      <SelectContent>
                        {clusterDetails.executions.map((ex) => (
                          <SelectItem key={ex.id} value={ex.execution_id}>
                            {formatDateTime(ex.executed_date)}
                            {ex.summary?.total_values_computed != null
                              ? ` (${ex.summary.total_values_computed} values)`
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={loadClusters} disabled={loadingClusters}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingClusters ? "animate-spin" : ""}`} />
              {t("refresh")}
            </Button>
          </div>
          {selectedClusterId && clusterDetails && !clusterDetails.executions.length && (
            <p className="text-sm text-muted-foreground">
              {t("noExecutionsRunCluster")}
            </p>
          )}
          {selectedExecutionId && loadingResult && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Skeleton className="h-4 w-4 rounded-full" />
              {t("loadingExecutionResult")}
            </div>
          )}
        </CardContent>
      </Card>

      {!hasResult && (selectedExecutionId && !loadingResult) && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            This execution has no result data (or the result could not be loaded). Choose another execution or re-run the cluster.
          </CardContent>
        </Card>
      )}

      {hasResult && datasetId && resultData && (
        <div className="space-y-6">
          {variant !== "technical" && <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-semibold">{t("executionResult")}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Filled output for the selected execution (computed values highlighted)
                  </p>
                </div>
                <div className="flex gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (!resultData?.execution_id) return;
                            try {
                              const res = await fetch(API_ENDPOINTS.exportResult(resultData.execution_id));
                              if (!res.ok) throw new Error("Export failed");
                              const contentDisposition = res.headers.get("content-disposition");
                              let filename = "results.xlsx";
                              if (contentDisposition?.match(/filename="(.+)"/)) {
                                filename = contentDisposition.match(/filename="(.+)"/)![1];
                              }
                              const blob = await res.blob();
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = filename;
                              document.body.appendChild(a);
                              a.click();
                              window.URL.revokeObjectURL(url);
                              document.body.removeChild(a);
                              toast({ title: "Exported", description: "Excel file downloaded." });
                            } catch (e) {
                              toast({
                                title: "Export failed",
                                description: e instanceof Error ? e.message : "Could not export",
                                variant: "destructive",
                              });
                            }
                          }}
                          disabled={!resultData?.execution_id}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          {t("exportExcel")}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Download result as Excel (computed cells highlighted)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setResultTableFullScreen(true)}
                          disabled={!resultData?.data?.length}
                        >
                          <Maximize className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View table full screen</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Summary:</strong>{" "}
                  {resultData.summary?.total_values_computed ?? 0} values computed across{" "}
                  {Object.keys(resultData.summary?.computed_by_column || {}).length} columns
                </p>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      {resultData.summary?.columns?.map((col: string) => (
                        <TableHead key={col} className="whitespace-nowrap">
                          {col}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(resultData.data as Record<string, unknown>[])?.map((row, rowIdx) => (
                      <TableRow key={rowIdx}>
                        {resultData.summary?.columns?.map((col: string) => {
                          const value = row[col];
                          const isComputed = isComputedCell(rowIdx, col);
                          const isNumeric = typeof value === "number";
                          return (
                            <TableCell
                              key={col}
                              className={`whitespace-nowrap ${isNumeric ? "text-right" : ""} ${
                                isComputed ? "bg-success/15 text-success-foreground font-medium" : ""
                              }`}
                            >
                              {formatCellDisplay(value)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-success/15 border border-success/30" />
                  <span>Computed values</span>
                </div>
              </div>
            </CardContent>
          </Card>}

          {variant !== "technical" && resultTableFullScreen && resultData?.data?.length && (
            <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 overflow-y-auto">
              <div className="w-full max-w-7xl flex flex-col gap-4 my-auto">
                <div className="flex items-center justify-between gap-4 sticky top-0 bg-background/95 backdrop-blur-sm pb-4 z-10">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl md:text-2xl font-semibold text-foreground truncate">
                      {t("executionResultFullScreen")}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {resultData.data?.length ?? 0} rows × {resultData.summary?.columns?.length ?? 0} columns
                    </p>
                  </div>
                  <button
                    onClick={() => setResultTableFullScreen(false)}
                    className="p-2 md:p-3 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                    aria-label="Exit fullscreen"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto rounded-lg border border-border bg-card">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        {resultData.summary?.columns?.map((col: string) => (
                          <TableHead key={col} className="whitespace-nowrap">
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(resultData.data as Record<string, unknown>[])?.map((row, rowIdx) => (
                        <TableRow key={rowIdx}>
                          {resultData.summary?.columns?.map((col: string) => {
                            const value = row[col];
                            const isComputed = isComputedCell(rowIdx, col);
                            const isNumeric = typeof value === "number";
                            return (
                              <TableCell
                                key={col}
                                className={`whitespace-nowrap ${isNumeric ? "text-right" : ""} ${
                                  isComputed ? "bg-success/15 text-success-foreground font-medium" : ""
                                }`}
                              >
                                {formatCellDisplay(value)}
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
          )}

          {variant === "content" && (
            <ContentLineageTabsSection
              datasetId={datasetId}
              resultData={resultData}
              isLoading={loadingResult}
            />
          )}
          {variant === "technical" && (
            <ContentLineageSection
              datasetId={datasetId}
              resultData={resultData}
              isLoading={loadingResult}
            />
          )}
          {variant === "semantic" && (
            <SemanticLineageGraphSection
              datasetId={datasetId}
              resultData={resultData}
              isLoading={loadingResult}
            />
          )}
        </div>
      )}
    </div>
  );
}
