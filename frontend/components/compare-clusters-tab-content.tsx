"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Download, GitCompare, RefreshCw, Maximize2, TrendingUp, TrendingDown, Minus, X } from "lucide-react";
import * as XLSX from "xlsx";
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
import { useToast } from "@/hooks/use-toast";
import { useClusterSelection } from "@/context/cluster-selection-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface Cluster {
  id: string;
  name: string;
  reporting_date: string;
  dataset_id: string;
  dataset_name: string;
  dataset_version: string;
  code_id: string;
  code_filename: string;
  code_version: string;
  created_date: string;
  description: string;
  is_reference: boolean;
}

interface ClusterExecution {
  id: string;
  execution_id: string;
  executed_date: string;
  dataset_name: string;
  dataset_version: string;
  code_filename?: string | null;
  code_version?: string | null;
  summary: any;
}

export function CompareClustersTabContent() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const {
    baseClusterId,
    comparisonClusterId,
    setBaseClusterId,
    setComparisonClusterId,
  } = useClusterSelection();
  const [clusterAId, setClusterAId] = useState<string>("");
  const [clusterBId, setClusterBId] = useState<string>("");
  const [clusterAData, setClusterAData] = useState<any>(null);
  const [clusterBData, setClusterBData] = useState<any>(null);
  const [clusterAExecutions, setClusterAExecutions] = useState<ClusterExecution[]>([]);
  const [clusterBExecutions, setClusterBExecutions] = useState<ClusterExecution[]>([]);
  const [selectedExecutionA, setSelectedExecutionA] = useState<string>(() => {
      return localStorage.getItem("selectedA") ?? "";
    });
  const [selectedExecutionB, setSelectedExecutionB] = useState<string>(() => {
      return localStorage.getItem("selectedB") ?? "";
    });
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [deviationFilter, setDeviationFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mode, setMode] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("compareMode") ?? "standard";
    }
    return "standard";
  });
  const [rawA, setRawA] = useState<{
    data: Record<string, unknown>[];
    columns: { name: string; [k: string]: unknown }[];
    total_rows: number;
  } | null>(null);
  const [rawB, setRawB] = useState<{
    data: Record<string, unknown>[];
    columns: { name: string; [k: string]: unknown }[];
    total_rows: number;
  } | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const { toast } = useToast();
  const t = useTranslations("compareClusters");

  useEffect(() => {
    loadClusters();
  }, []);

  useEffect(() => {
    setClusterAId(baseClusterId || "");
  }, [baseClusterId]);

  useEffect(() => {
    setClusterBId(comparisonClusterId || "");
  }, [comparisonClusterId]);

  useEffect(() => {
    if (clusterAId) {
      loadClusterDetails(clusterAId, 'A');
    } else {
      setClusterAData(null);
      setClusterAExecutions([]);
      setSelectedExecutionA("");
      setRawA(null);
      localStorage.setItem("selectedA","")
    }
  }, [clusterAId]);

  useEffect(() => {
    if (clusterBId) {
      loadClusterDetails(clusterBId, 'B');
    } else {
      setClusterBData(null);
      setClusterBExecutions([]);
      setSelectedExecutionB("");
      setRawB(null);
      localStorage.setItem("selectedB","")
    }
  }, [clusterBId]);

  useEffect(() => {
    if (clusterAData?.dataset_id && clusterBData?.dataset_id) {
      setRawLoading(true);
      Promise.all([
        fetch(`${API_ENDPOINTS.datasetById(clusterAData.dataset_id)}?table_id=table_0`).then((r) => r.json()),
        fetch(`${API_ENDPOINTS.datasetById(clusterBData.dataset_id)}?table_id=table_0`).then((r) => r.json()),
      ])
        .then(([resA, resB]) => {
          setRawA(resA);
          setRawB(resB);
        })
        .catch((err) => {
          console.error("Error loading dataset tables:", err);
          toast({
            title: "Error",
            description: "Failed to load dataset tables",
            variant: "destructive",
          });
        })
        .finally(() => setRawLoading(false));
    } else {
      setRawA(null);
      setRawB(null);
    }
  }, [clusterAData?.dataset_id, clusterBData?.dataset_id, toast]);

  useEffect(() => {
    if (!selectedExecutionA || !selectedExecutionB) {
      setComparisonData(null);
      return;
    }

    const hasExecutionA = clusterAExecutions.some((e) => e.execution_id === selectedExecutionA);
    const hasExecutionB = clusterBExecutions.some((e) => e.execution_id === selectedExecutionB);

    if (!hasExecutionA) {
      setSelectedExecutionA("");
      localStorage.setItem("selectedA", "");
      setComparisonData(null);
      return;
    }
    if (!hasExecutionB) {
      setSelectedExecutionB("");
      localStorage.setItem("selectedB", "");
      setComparisonData(null);
      return;
    }

    compareExecutions(selectedExecutionA, selectedExecutionB);
  }, [selectedExecutionA, selectedExecutionB, clusterAExecutions, clusterBExecutions]);

  const loadClusters = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_ENDPOINTS.clusters);
      const data = await response.json();
      const list: Cluster[] = data.clusters || [];
      setClusters(list);

      if (baseClusterId && !list.some((c) => c.id === baseClusterId)) {
        setBaseClusterId("");
      }
      if (comparisonClusterId && !list.some((c) => c.id === comparisonClusterId)) {
        setComparisonClusterId("");
      }
    } catch (error) {
      console.error("Error loading clusters:", error);
      toast({
        title: "Error",
        description: "Failed to load clusters",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadClusterDetails = async (clusterId: string, side: 'A' | 'B') => {
    try {
      const response = await fetch(API_ENDPOINTS.clusterById(clusterId));
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data.detail || data.message || response.statusText || "Request failed";
        if (response.status === 404) {
          if (side === "A") {
            setBaseClusterId("");
            setClusterAData(null);
            setClusterAExecutions([]);
            setSelectedExecutionA("");
            localStorage.setItem("selectedA", "");
          } else {
            setComparisonClusterId("");
            setClusterBData(null);
            setClusterBExecutions([]);
            setSelectedExecutionB("");
            localStorage.setItem("selectedB", "");
          }
        }
        toast({
          title: side === "A" ? t("clusterANotFound") : t("clusterBNotFound"),
          description: typeof message === "string" ? message : "Cluster may have been deleted. Please select another.",
          variant: "destructive",
        });
        return;
      }

      if (side === 'A') {
        setClusterAData(data.cluster);
        const executions: ClusterExecution[] = data.executions || [];
        setClusterAExecutions(executions);

        const savedA = localStorage.getItem("selectedA") || "";
        const nextA = (savedA && executions.some((e) => e.execution_id === savedA))
          ? savedA
          : (executions[0]?.execution_id ?? "");
        setSelectedExecutionA(nextA);
        localStorage.setItem("selectedA", nextA);
      } else {
        setClusterBData(data.cluster);
        const executions: ClusterExecution[] = data.executions || [];
        setClusterBExecutions(executions);

        const savedB = localStorage.getItem("selectedB") || "";
        const nextB = (savedB && executions.some((e) => e.execution_id === savedB))
          ? savedB
          : (executions[0]?.execution_id ?? "");
        setSelectedExecutionB(nextB);
        localStorage.setItem("selectedB", nextB);
      }
    } catch (error) {
      console.error(`Error loading cluster ${side} details:`, error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load cluster details",
        variant: "destructive",
      });
    }
  };

  const compareExecutions = async (executionIdA: string, executionIdB: string) => {
    try {
      setComparing(true);
      const response = await fetch(API_ENDPOINTS.clustersCompare, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          execution_id_a: executionIdA,
          execution_id_b: executionIdB
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.detail || data.message || response.statusText || "Failed to compare clusters";
        throw new Error(typeof message === "string" ? message : "Failed to compare clusters");
      }
      
      if (data.status === 'error') {
        toast({
          title: "Comparison Error",
          description: data.message,
          variant: "destructive",
        });
        setComparisonData(null);
      } else {
        setComparisonData(data);
      }
    } catch (error) {
      console.error("Error comparing clusters:", error);
      toast({
        title: "Comparison failed",
        description: error instanceof Error ? error.message : "Failed to compare cluster executions",
        variant: "destructive",
      });
      setComparisonData(null);
    } finally {
      setComparing(false);
    }
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === 'number') {
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(value);
  };

  const getDeviationType = (value_a: any, value_b: any, diff: any): string => {
    if (!value_a && !value_b) return "Not applicable";
    if (!value_a) return "Value only exists in compare cluster";
    if (!value_b) return "Value only exists in base cluster";
    if (diff != null && diff > 0) return "Amount variance positive";
    if (diff != null && diff < 0) return "Amount variance negative";
    if (diff != null && isNaN(Number(diff))) return "Different value";
    if (diff == null && value_a != null && value_b != null) {
      if (String(value_a) !== String(value_b)) return "Different value";
      return "Not applicable";
    }
    return "Not applicable";
  };

  const isAllNull = (row: Record<string, unknown> | undefined): boolean => {
    if (!row) return true;
    for (const key in row) {
      if (row[key] != null) return false;
    }
    return true;
  };

  const formatDifference = (diff: number | null): string => {
    if (diff === null) return "—";
    const formatted = diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return diff > 0 ? `+${formatted}` : formatted;
  };

  const getDifferenceColor = (diff: number | null): string => {
    if (diff === null || diff === 0) return "";
    return diff > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
  };

  const getDifferenceIcon = (diff: number | null) => {
    if (diff === null || diff === 0) return <Minus className="h-3 w-3" />;
    return diff > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />;
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const handleExportRootcauseExcel = () => {
    if (!comparisonData || filteredComparisonData.length === 0) {
      toast({
        title: "Nothing to export",
        description: "There is no filtered Rootcause data available to export.",
        variant: "destructive",
      });
      return;
    }

    const rows = filteredComparisonData.flatMap((rowComparison: any) =>
      (rowComparison.columns || []).map((colData: any) => ({
        key_column: comparisonData.key_column,
        key_value: rowComparison.key,
        match_status: rowComparison.match_status,
        column_name: colData.column_name,
        cluster_a: clusterAData?.name || "Cluster A",
        value_a: colData.value_a,
        cluster_b: clusterBData?.name || "Cluster B",
        value_b: colData.value_b,
        deviation_type: getDeviationType(colData.value_a, colData.value_b, colData.difference),
        difference_a_minus_b: colData.difference,
      }))
    );

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rootcause");

    const safeBase = (clusterAData?.name || "cluster-a").replace(/[^a-z0-9]+/gi, "-");
    const safeCompare = (clusterBData?.name || "cluster-b").replace(/[^a-z0-9]+/gi, "-");
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    const filename = `rootcause-${safeBase}-vs-${safeCompare}-${timestamp}.xlsx`;

    XLSX.writeFileXLSX(workbook, filename);
    toast({
      title: "Exported",
      description: "Rootcause table downloaded as Excel.",
    });
  };

  const filteredComparisonData = comparisonData
    ? comparisonData.comparison_data
        .map((rowComparison: any) => ({
          ...rowComparison,
          columns: (rowComparison.columns || []).filter((colData: any) => {
            if (deviationFilter === "all") return true;
            return getDeviationType(colData.value_a, colData.value_b, colData.difference) === deviationFilter;
          }),
        }))
        .filter((rowComparison: any) => (rowComparison.columns || []).length > 0)
    : [];

  const availableDeviationTypes = comparisonData
    ? Array.from(
        new Set(
          comparisonData.comparison_data.flatMap((rowComparison: any) =>
            (rowComparison.columns || []).map((colData: any) =>
              getDeviationType(colData.value_a, colData.value_b, colData.difference)
            )
          )
        )
      )
    : [];

  const rawComparisonRowsBase = rawA && rawB
    ? Array.from(
        {
          length: Math.max(rawA.total_rows ?? rawA.data?.length ?? 0, rawB.total_rows ?? rawB.data?.length ?? 0),
        },
        (_, rowIdx) => {
          const rowA = rawA.data?.[rowIdx];
          const rowB = rawB.data?.[rowIdx];
          const emptyA = isAllNull(rowA);
          const emptyB = isAllNull(rowB);
          if (emptyA && emptyB) return null;

          const allColumnNames = Array.from(
            new Set([
              ...(rawA.columns ?? []).map((c: { name: string }) => c.name),
              ...(rawB.columns ?? []).map((c: { name: string }) => c.name),
            ])
          );

          const columns = allColumnNames
            .map((colName) => {
              const valueA = rowA?.[colName];
              const valueB = rowB?.[colName];
              return {
                column_name: colName,
                value_a: valueA,
                value_b: valueB,
                deviation_type: getDeviationType(valueA, valueB, null),
              };
            });

          if (columns.length === 0) return null;

          return {
            row_index: rowIdx,
            only_in_a: !!rowA && !rowB,
            only_in_b: !!rowB && !rowA,
            columns,
          };
        }
      ).filter(Boolean)
    : [];

  const rawComparisonRows = rawComparisonRowsBase
    .map((row: any) => ({
      ...row,
      columns: (row.columns || []).filter((col: any) => deviationFilter === "all" || col.deviation_type === deviationFilter),
    }))
    .filter((row: any) => (row.columns || []).length > 0);

  const availableRawDeviationTypes = rawA && rawB
    ? Array.from(
        new Set(
          rawComparisonRowsBase.flatMap((row: any) => (row?.columns || []).map((col: any) => col.deviation_type))
        )
      )
    : [];

  const handleExportInputComparisonExcel = () => {
    if (!rawComparisonRows.length) {
      toast({
        title: "Nothing to export",
        description: "There is no filtered input comparison data available to export.",
        variant: "destructive",
      });
      return;
    }

    const rows = rawComparisonRows.flatMap((row: any) =>
      (row.columns || []).map((col: any) => ({
        row_number: row.row_index + 1,
        row_scope: row.only_in_a
          ? `Row only in ${clusterAData?.name || "Cluster A"}`
          : row.only_in_b
            ? `Row only in ${clusterBData?.name || "Cluster B"}`
            : "Matched row index",
        column_name: col.column_name,
        cluster_a: clusterAData?.name || "Cluster A",
        value_a: col.value_a,
        cluster_b: clusterBData?.name || "Cluster B",
        value_b: col.value_b,
        deviation_type: col.deviation_type,
      }))
    );

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Input Compare");

    const safeBase = (clusterAData?.name || "cluster-a").replace(/[^a-z0-9]+/gi, "-");
    const safeCompare = (clusterBData?.name || "cluster-b").replace(/[^a-z0-9]+/gi, "-");
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    const filename = `input-compare-${safeBase}-vs-${safeCompare}-${timestamp}.xlsx`;

    XLSX.writeFileXLSX(workbook, filename);
    toast({
      title: "Exported",
      description: "Input comparison table downloaded as Excel.",
    });
  };

  const renderComparisonTable = () => {
    if (!comparisonData) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <GitCompare className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-medium text-foreground">
            {t("selectClustersAndExecutions")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("chooseTwoClustersHint")}
          </p>
        </div>
      );
    }

    if (comparisonData.common_columns.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <GitCompare className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-medium text-foreground">
            {t("noCommonColumns")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("noCommonColumnsHint")}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
          <div>
            <Label className="text-xs text-muted-foreground">{t("clusterA")}</Label>
            <p className="font-semibold">{clusterAData?.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatDate(clusterAData?.reporting_date)} | {clusterAData?.dataset_version} | {clusterAData?.code_version}
            </p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("clusterB")}</Label>
            <p className="font-semibold">{clusterBData?.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatDate(clusterBData?.reporting_date)} | {clusterBData?.dataset_version} | {clusterBData?.code_version}
            </p>
          </div>
        </div>

        {comparisonData.match_statistics && (
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Key Column:</span>
              <Badge variant="outline">{comparisonData.key_column}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Matched rows:</span>
                <span className="ml-2 font-semibold">{comparisonData.match_statistics.matched_rows}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Rows only in {clusterAData?.name}:</span>
                <span className="ml-2 font-semibold text-orange-600">{comparisonData.match_statistics.only_in_a}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Rows only in {clusterBData?.name}:</span>
                <span className="ml-2 font-semibold text-blue-600">{comparisonData.match_statistics.only_in_b}</span>
              </div>
            </div>
            {(comparisonData.match_statistics.only_in_a > 0 || comparisonData.match_statistics.only_in_b > 0) && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                ⚠️ Warning: Some rows exist in only one dataset. Differences are only calculated for matched rows.
              </p>
            )}
          </div>
        )}

        <div className="mb-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Comparison table:</strong> {comparisonData.comparison_data.length} key group{comparisonData.comparison_data.length !== 1 ? "s" : ""}
            {comparisonData.comparison_data.reduce((acc: number, r: any) => acc + (r.columns?.length ?? 0), 0) > 0 && (
              <span> · {comparisonData.comparison_data.reduce((acc: number, r: any) => acc + (r.columns?.length ?? 0), 0)} column comparison{comparisonData.comparison_data.reduce((acc: number, r: any) => acc + (r.columns?.length ?? 0), 0) !== 1 ? "s" : ""}</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <div className="min-w-[240px] space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Deviation type filter
            </Label>
            <Select value={deviationFilter} onValueChange={setDeviationFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All deviation types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All deviation types</SelectItem>
                {availableDeviationTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={handleExportRootcauseExcel} disabled={filteredComparisonData.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export to Excel
          </Button>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableHead className="w-[180px] font-semibold text-foreground">Key / Column</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">{t("clusterA")}</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">{t("clusterB")}</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">Deviation type</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">Difference (A - B)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredComparisonData.map((rowComparison: any, idx: number) => {
                  const key = rowComparison.key;
                  const matchStatus = rowComparison.match_status;
                  const isUnmatched = matchStatus !== "matched";
                  const rowBgClass = isUnmatched 
                    ? (matchStatus === "only_in_a" ? "bg-orange-50 dark:bg-orange-950/20" : "bg-blue-50 dark:bg-blue-950/20")
                    : "";

                  return (
                    <React.Fragment key={key}>
                      {idx % 10 === 0 && (
                        <TableRow className="bg-muted/30 border-b border-border/50 hover:bg-muted/40">
                          <TableCell colSpan={5} className="font-semibold text-sm py-2.5 px-3">
                            {comparisonData.key_column} Group (starting at {key})
                          </TableCell>
                        </TableRow>
                      )}
                      
                      {/* Key row header */}
                      <TableRow className={`${rowBgClass} border-t-2 border-border/50`}>
                        <TableCell colSpan={5} className="font-semibold text-sm py-2.5 px-3">
                          <div className="flex items-center justify-between">
                            <span>{comparisonData.key_column}: {key}</span>
                            {isUnmatched && (
                              <Badge variant="outline" className="text-xs">
                                {matchStatus === "only_in_a" 
                                  ? `Row only in ${clusterAData?.name}` 
                                  : `Row only in ${clusterBData?.name}`}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      
                      {rowComparison.columns.map((colData: any) => {
                        const diff = colData.difference;

                        return (
                          <TableRow key={`${key}-${colData.column_name}`} className={`${rowBgClass} border-b border-border/50`}>
                            <TableCell className="font-medium text-sm py-2.5 px-3 pl-8">
                              {colData.column_name}
                            </TableCell>
                            <TableCell className="text-right text-sm py-2.5 px-3 font-mono">
                              {formatValue(colData.value_a)}
                            </TableCell>
                            <TableCell className="text-right text-sm py-2.5 px-3 font-mono">
                              {formatValue(colData.value_b)}
                            </TableCell>
                            <TableCell className="text-right text-sm py-2.5 px-3">
                              {getDeviationType(colData.value_a, colData.value_b, diff)}
                            </TableCell>
                            <TableCell className={`text-right text-sm py-2.5 px-3 font-semibold font-mono ${getDifferenceColor(diff)}`}>
                              <div className="flex items-center justify-end gap-1">
                                {getDifferenceIcon(diff)}
                                {formatDifference(diff)}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3 w-3 text-green-600" />
            <span>Positive difference (A &gt; B)</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingDown className="h-3 w-3 text-red-600" />
            <span>Negative difference (A &lt; B)</span>
          </div>
          <div className="flex items-center gap-2">
            <Minus className="h-3 w-3" />
            <span>No change or N/A</span>
          </div>
        </div>
      </div>
    );
  };

  const renderDatasetComparisonTable = () => {
    if (!clusterAData || !clusterBData) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <GitCompare className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-medium text-foreground">Select clusters to compare</h3>
          <p className="mt-1 text-sm text-muted-foreground">Choose two clusters from the dropdowns above</p>
        </div>
      );
    }
    if (!rawA || !rawB) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <GitCompare className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-medium text-foreground">No data loaded</h3>
          <p className="mt-1 text-sm text-muted-foreground">Select a table from each cluster above</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
          <div>
            <Label className="text-xs text-muted-foreground">Cluster A (Base)</Label>
            <p className="font-semibold">{clusterAData.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatDate(clusterAData.reporting_date)} | {clusterAData.dataset_version} | Input table (first table)
            </p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Cluster B (Compare)</Label>
            <p className="font-semibold">{clusterBData.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatDate(clusterBData.reporting_date)} | {clusterBData.dataset_version} | Input table (first table)
            </p>
          </div>
        </div>

        <div className="mb-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Input Data Comparison:</strong> Rows aligned by index (row 0 vs row 0, row 1 vs row 1). No key matching.
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <div className="min-w-[240px] space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Deviation type filter
            </Label>
            <Select value={deviationFilter} onValueChange={setDeviationFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All deviation types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All deviation types</SelectItem>
                {availableRawDeviationTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={handleExportInputComparisonExcel} disabled={rawComparisonRows.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export to Excel
          </Button>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="w-[150px]">Key / Column</TableHead>
                  <TableHead className="text-right">{t("clusterA")}</TableHead>
                  <TableHead className="text-right">{t("clusterB")}</TableHead>
                  <TableHead className="text-right">Deviation Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rawComparisonRows.map((row: any) => {
                  const onlyInA = row.only_in_a;
                  const onlyInB = row.only_in_b;
                  const rowBgClass = onlyInA
                    ? "bg-orange-50 dark:bg-orange-950/20"
                    : onlyInB
                    ? "bg-blue-50 dark:bg-blue-950/20"
                    : "";
                  const rowIdx = row.row_index;

                  return (
                    <React.Fragment key={rowIdx}>
                      {rowIdx % 10 === 0 && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={4} className="font-semibold text-xs py-2">
                            Row Group (starting at row {rowIdx + 1})
                          </TableCell>
                        </TableRow>
                      )}

                      <TableRow className={`${rowBgClass} border-t-2`}>
                        <TableCell colSpan={4} className="font-semibold text-sm py-2">
                          <div className="flex items-center justify-between">
                            <span>Row {rowIdx + 1}</span>
                            {(onlyInA || onlyInB) && (
                              <Badge variant="outline" className="text-xs">
                                {onlyInA
                                  ? `Row only in ${clusterAData.name}`
                                  : `Row only in ${clusterBData.name}`}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {row.columns.map((col: any) => {
                        return (
                          <TableRow key={`${rowIdx}-${col.column_name}`} className={rowBgClass}>
                            <TableCell className="font-medium text-sm pl-8">{col.column_name}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatValue(col.value_a)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatValue(col.value_b)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {col.deviation_type}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    );
  };

  const handleTableRender = () => {
    if (mode === "raw") {
      return renderDatasetComparisonTable();
    }
    return renderComparisonTable();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">{t("clusterABase")}</Label>
                {clusterAData?.is_reference && (
                  <Badge variant="default" className="text-xs">{t("reference")}</Badge>
                )}
              </div>
              <Select
                value={clusterAId}
                onValueChange={(value) => {
                  setBaseClusterId(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectClusterA")} />
                </SelectTrigger>
                <SelectContent>
                  {clusters.map((cluster) => (
                    <SelectItem key={cluster.id} value={cluster.id}>
                      {cluster.name} ({formatDate(cluster.reporting_date)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {clusterAData && (
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Dataset:</span>{" "}
                    <span className="font-medium">{clusterAData.dataset_name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Version:</span>{" "}
                    <span className="font-medium">{clusterAData.dataset_version}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Code:</span>{" "}
                    <span className="font-medium">{clusterAData.code_version}</span>
                  </div>
                </div>
              )}

              {clusterAExecutions.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">{t("selectExecutionLabel")}</Label>
                  <Select value={selectedExecutionA} onValueChange={
                    (value) => {
                        setSelectedExecutionA(value);
                        localStorage.setItem("selectedA", value);
                      }}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("selectExecution")} />
                    </SelectTrigger>
                    <SelectContent>
                      {clusterAExecutions.map((execution) => (
                        <SelectItem key={execution.id} value={execution.execution_id}>
                          {formatDateTime(execution.executed_date)} · {execution.code_filename ?? execution.code_version ?? "Code"}
                          {execution.code_version ? ` (${execution.code_version})` : ""} · {execution.summary?.total_values_computed ?? 0} values
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedExecutionA && (() => {
                    const ex = clusterAExecutions.find((e) => e.execution_id === selectedExecutionA);
                    return ex ? (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Code file:</span>{" "}
                        {ex.code_filename ?? ex.code_version ?? "—"}
                        {ex.code_version ? ` (${ex.code_version})` : ""}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>

            <div className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">{t("clusterBCompare")}</Label>
                {clusterBData?.is_reference && (
                  <Badge variant="default" className="text-xs">{t("reference")}</Badge>
                )}
              </div>
              <Select
                value={clusterBId}
                onValueChange={(value) => {
                  setComparisonClusterId(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectClusterB")} />
                </SelectTrigger>
                <SelectContent>
                  {clusters.map((cluster) => (
                    <SelectItem key={cluster.id} value={cluster.id}>
                      {cluster.name} ({formatDate(cluster.reporting_date)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {clusterBData && (
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Dataset:</span>{" "}
                    <span className="font-medium">{clusterBData.dataset_name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Version:</span>{" "}
                    <span className="font-medium">{clusterBData.dataset_version}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Code:</span>{" "}
                    <span className="font-medium">{clusterBData.code_version}</span>
                  </div>
                </div>
              )}

              {clusterBExecutions.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">{t("selectExecutionLabel")}</Label>
                  <Select value={selectedExecutionB} onValueChange={
                    (value) => {
                        setSelectedExecutionB(value);
                        localStorage.setItem("selectedB", value);
                      }}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("selectExecution")} />
                    </SelectTrigger>
                    <SelectContent>
                      {clusterBExecutions.map((execution) => (
                        <SelectItem key={execution.id} value={execution.execution_id}>
                          {formatDateTime(execution.executed_date)} · {execution.code_filename ?? execution.code_version ?? "Code"}
                          {execution.code_version ? ` (${execution.code_version})` : ""} · {execution.summary?.total_values_computed ?? 0} values
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedExecutionB && (() => {
                    const ex = clusterBExecutions.find((e) => e.execution_id === selectedExecutionB);
                    return ex ? (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Code file:</span>{" "}
                        {ex.code_filename ?? ex.code_version ?? "—"}
                        {ex.code_version ? ` (${ex.code_version})` : ""}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          </div>

          <Button
            onClick={loadClusters}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t("refreshClusters")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle>{t("comparisonResults")}</CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">{t("mode")}</Label>
              <Select
                value={mode}
                onValueChange={(value) => {
                  setMode(value);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("compareMode", value);
                  }
                }}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">{t("resultDataComparison")}</SelectItem>
                  <SelectItem value="raw">{t("inputDataComparison")}</SelectItem>
                </SelectContent>
              </Select>
              {(comparisonData || (mode === "raw" && rawA && rawB)) && (
                <Button
                  onClick={() => setIsFullscreen(true)}
                  variant="outline"
                  size="sm"
                  aria-label="View fullscreen"
                >
                  <Maximize2 className="h-4 w-4 mr-2" />
                  {t("fullScreenView")}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {mode === "standard" && comparing ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : mode === "raw" && rawLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            handleTableRender()
          )}
        </CardContent>
      </Card>

      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 overflow-y-auto">
          <div className="w-full max-w-7xl flex flex-col gap-4 my-auto">
            
            {/* Header with Close Button */}
            <div className="flex items-center justify-between gap-4 sticky top-0 bg-background/95 backdrop-blur-sm pb-4 z-10">
              <div className="flex-1 min-w-0">
                <h3 className="text-xl md:text-2xl font-semibold text-foreground truncate">
                  {t("fullComparisonView")}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {clusterAData?.name} vs {clusterBData?.name}
                </p>
              </div>
              
              {/* Exit Fullscreen Button */}
              <button
                onClick={() => setIsFullscreen(false)}
                className="p-2 md:p-3 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                aria-label="Exit fullscreen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Content */}
            <div className="space-y-6 pb-8">
              {handleTableRender()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
