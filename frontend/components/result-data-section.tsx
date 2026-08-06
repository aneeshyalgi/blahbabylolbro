"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Play, Loader2, Download, Maximize, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ResultDataSectionProps {
  isLoading?: boolean;
  datasetId?: string | null;
  selectedClusterId?: string | null;
  resultData?: unknown;
  onResultDataChange?: (data: unknown) => void;
  /** Called after a run completes and execution is linked to a cluster (so parent can refresh execution lists). */
  onRunComplete?: () => void;
}

const STORAGE_CODE_ID = "dataflow_results_code_id";
const STORAGE_LAST_EXECUTION = "dataflow_results_last_execution";

function getStoredCodeId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_CODE_ID) ?? "";
}

function getStoredLastExecution(): { execution_id: string; dataset_id: string; code_id: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_LAST_EXECUTION);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { execution_id?: string; dataset_id?: string; code_id?: string };
    if (parsed?.execution_id && parsed?.dataset_id && parsed?.code_id) return parsed as { execution_id: string; dataset_id: string; code_id: string };
    return null;
  } catch {
    return null;
  }
}

export function ResultDataSection({
  isLoading = false,
  datasetId,
  selectedClusterId,
  resultData: resultDataProp,
  onResultDataChange,
  onRunComplete,
}: ResultDataSectionProps) {
  // Initialize empty to avoid hydration mismatch (localStorage only on client)
  const [selectedCodeFile, setSelectedCodeFile] = useState<string>("");
  const [codeFiles, setCodeFiles] = useState<any[]>([]);
  const [executing, setExecuting] = useState(false);
  const [resultDataLocal, setResultDataLocal] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const [runConfirmModal, setRunConfirmModal] = useState<{
    mode: "repeatExecution" | "clusterNameConflict";
    displayName: string;
    isSameConfig: boolean;
    existingCluster: {
      id: string;
      name: string;
      dataset_id: string;
      code_id: string;
      dataset_name?: string;
      code_filename?: string;
    };
  } | null>(null);
  const { toast } = useToast();
  const t = useTranslations("resultData");
  const tModal = useTranslations("resultDataModal");
  const tCommon = useTranslations("common");

  const resultData = onResultDataChange != null ? resultDataProp : resultDataLocal;
  const setResultData = onResultDataChange ?? setResultDataLocal;

  useEffect(() => {
    fetchCodeFiles();
  }, []);

  // Persist selected code file when it changes
  useEffect(() => {
    if (typeof window === "undefined" || !selectedCodeFile) return;
    localStorage.setItem(STORAGE_CODE_ID, selectedCodeFile);
  }, [selectedCodeFile]);

  // Clear results when dataset changes
  useEffect(() => {
    if (onResultDataChange) onResultDataChange(null);
    else setResultDataLocal(null);
    setError(null);
  }, [datasetId]);

  // Restore last result when dataset + code match stored execution (e.g. after tab switch or refresh)
  useEffect(() => {
    if (!datasetId || !selectedCodeFile || !setResultData) return;
    const currentEmpty = resultData == null || !(resultData as { data?: unknown[] })?.data?.length;
    if (!currentEmpty) return;
    const last = getStoredLastExecution();
    if (!last || last.dataset_id !== datasetId || last.code_id !== selectedCodeFile) return;
    let cancelled = false;
    fetch(API_ENDPOINTS.resultById(last.execution_id))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.data != null) setResultData(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [datasetId, selectedCodeFile, resultData]);

  const fetchCodeFiles = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.code);
      const data = await response.json();
      if (data.code_files && data.code_files.length > 0) {
        setCodeFiles(data.code_files);
        const saved = getStoredCodeId();
        const found = data.code_files.find((f: { id: string }) => f.id === saved);
        setSelectedCodeFile(found ? found.id : data.code_files[0].id);
      }
    } catch (error) {
      console.error('Error fetching code files:', error);
    }
  };

  /** Run code (POST execute) then ensure cluster exists and link this execution to it. */
  const performRunAndLink = async (clusterIdToLink?: string) => {
    if (!datasetId || !selectedCodeFile) return;
    const response = await fetch(API_ENDPOINTS.execute, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset_id: datasetId,
        code_id: selectedCodeFile,
      }),
    });
    const result = await response.json();
    if (!response.ok || result.status === "error") {
      setError(result.error || result.detail || `Execution failed (${response.status})`);
      return;
    }
    if (!result.execution_id || !result.dataset_id || !result.code_id) {
      setError("Execution completed without the required result identifiers.");
      return;
    }
    setResultData(result);
    if (typeof window !== "undefined" && result.execution_id && result.dataset_id && result.code_id) {
      localStorage.setItem(
        STORAGE_LAST_EXECUTION,
        JSON.stringify({
          execution_id: result.execution_id,
          dataset_id: result.dataset_id,
          code_id: result.code_id,
        })
      );
    }
    try {
      if (clusterIdToLink) {
        const linkRes = await fetch(API_ENDPOINTS.clusterLinkExecution(clusterIdToLink), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ execution_id: result.execution_id }),
        });
        if (!linkRes.ok) {
          console.error("Link execution to cluster:", await linkRes.text());
        }
        onRunComplete?.();
        return;
      }

      const datasetsRes = await fetch(API_ENDPOINTS.datasets);
      const datasetsData = await datasetsRes.json();
      const datasets = datasetsData.datasets || [];
      const dataset = datasets.find((d: { id: string }) => d.id === result.dataset_id);
      const displayName = (dataset?.user_name || dataset?.filename || "").trim() || "Unnamed";

      const clustersRes = await fetch(API_ENDPOINTS.clusters);
      const clustersData = await clustersRes.json();
      const clusters = clustersData.clusters || [];
      const existingCluster = clusters.find(
        (c: { name: string }) => (c.name || "").trim().toLowerCase() === displayName.toLowerCase()
      );

      let clusterId: string;
      if (existingCluster) {
        clusterId = existingCluster.id;
      } else {
        const today = new Date().toISOString().slice(0, 10);
        const createRes = await fetch(API_ENDPOINTS.clusters, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: displayName,
            reporting_date: today,
            dataset_id: result.dataset_id,
            code_id: result.code_id,
          }),
        });
        if (!createRes.ok) return;
        const createData = await createRes.json();
        clusterId = createData.cluster_id;
        toast({
          title: t("clusterCreated"),
          description: t("clusterCreatedDesc", { name: displayName }),
        });
      }

      const linkRes = await fetch(API_ENDPOINTS.clusterLinkExecution(clusterId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execution_id: result.execution_id }),
      });
      if (!linkRes.ok) {
        console.error("Link execution to cluster:", await linkRes.text());
      }
      onRunComplete?.();
    } catch (e) {
      console.error("Cluster / link execution:", e);
      onRunComplete?.();
    }
  };

  const handleRunCode = async () => {
    if (!datasetId || !selectedCodeFile) {
      alert(t("selectDatasetAndCode"));
      return;
    }

    setExecuting(true);
    setError(null);

    try {
      if (selectedClusterId) {
        const selectedCodeMeta = codeFiles.find((f: { id: string }) => f.id === selectedCodeFile);
        if (selectedCodeMeta) {
          try {
            const clusterRes = await fetch(API_ENDPOINTS.clusterById(selectedClusterId));
            if (clusterRes.ok) {
              const clusterData = await clusterRes.json();
              const clusterExecutions = clusterData.executions || [];
              const hasSameCodeExecution = clusterExecutions.some(
                (ex: { code_filename?: string | null; code_version?: string | null }) =>
                  (ex.code_filename ?? "") === (selectedCodeMeta.filename ?? "") &&
                  (ex.code_version ?? "") === (selectedCodeMeta.version ?? "")
              );

              if (hasSameCodeExecution) {
                setExecuting(false);
                setRunConfirmModal({
                  mode: "repeatExecution",
                  displayName: clusterData.cluster?.name || "Selected cluster",
                  isSameConfig: true,
                  existingCluster: {
                    id: selectedClusterId,
                    name: clusterData.cluster?.name || "Selected cluster",
                    dataset_id: clusterData.cluster?.dataset_id || datasetId,
                    code_id: selectedCodeFile,
                    dataset_name: clusterData.cluster?.dataset_name,
                    code_filename: selectedCodeMeta.filename,
                  },
                });
                return;
              }
            }
          } catch {
            // If we cannot evaluate cluster execution history, proceed without warning.
          }
        }

        await performRunAndLink(selectedClusterId);
        return;
      }

      const datasetsRes = await fetch(API_ENDPOINTS.datasets);
      const datasetsData = await datasetsRes.json();
      const datasets = datasetsData.datasets || [];
      const dataset = datasets.find((d: { id: string }) => d.id === datasetId);
      const displayName = (dataset?.user_name || dataset?.filename || "").trim() || "Unnamed";

      const clustersRes = await fetch(API_ENDPOINTS.clusters);
      const clustersData = await clustersRes.json();
      const clusters = clustersData.clusters || [];
      const existingCluster = clusters.find(
        (c: { name: string }) => (c.name || "").trim().toLowerCase() === displayName.toLowerCase()
      );

      const sameDataAndCode =
        existingCluster &&
        existingCluster.dataset_id === datasetId &&
        existingCluster.code_id === selectedCodeFile;

      if (existingCluster) {
        setExecuting(false);
        setRunConfirmModal({
          mode: "clusterNameConflict",
          displayName,
          isSameConfig: !!sameDataAndCode,
          existingCluster: {
            id: existingCluster.id,
            name: existingCluster.name,
            dataset_id: existingCluster.dataset_id,
            code_id: existingCluster.code_id,
            dataset_name: existingCluster.dataset_name,
            code_filename: existingCluster.code_filename,
          },
        });
        return;
      }

      await performRunAndLink();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setExecuting(false);
    }
  };

  const handleConfirmRunAnyway = async () => {
    if (!runConfirmModal) return;
    const clusterIdToLink = runConfirmModal.existingCluster.id;
    setRunConfirmModal(null);
    setExecuting(true);
    setError(null);
    try {
      await performRunAndLink(clusterIdToLink);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setExecuting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!resultData || !resultData.execution_id) {
      alert(t("noResultsToExport"));
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.exportResult(resultData.execution_id), {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get filename from header or use default
      const contentDisposition = response.headers.get('content-disposition');
      let filename = 'results.xlsx';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      alert(`${t("exportFailed")}: ${error.message}`);
    }
  };

  const isComputedCell = (rowIdx: number, columnName: string) => {
    if (!resultData || !resultData.computed_cells) return false;
    return resultData.computed_cells.some(
      (cell: any) => cell.row === rowIdx && cell.column === columnName
    );
  };

  const formatValue = (value: number | null) => {
    if (value === null) return null;
    if (value < 2) return value.toFixed(2);
    return value.toLocaleString();
  };

  /** Format cell for display: show "—" for null, undefined, or numeric 0; otherwise format number or string. */
  const formatCellDisplay = (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number' && value === 0) return '—';
    if (typeof value === 'number') return Number(value).toLocaleString();
    return String(value);
  };

  return (
    <>
      <AlertDialog open={!!runConfirmModal} onOpenChange={(open) => !open && setRunConfirmModal(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {runConfirmModal?.mode === "repeatExecution"
                ? tModal("executionAlreadyExistsTitle")
                : runConfirmModal?.isSameConfig
                  ? tModal("clusterAlreadyExists")
                  : tModal("clusterAlreadyExistsWithName", { name: runConfirmModal?.displayName ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {runConfirmModal?.mode === "repeatExecution" ? (
                  <>
                    <p>
                      {tModal("executionAlreadyExistsDesc", {
                        name: runConfirmModal?.displayName ?? "",
                        code: runConfirmModal?.existingCluster.code_filename ?? "",
                      })}
                    </p>
                    <p className="text-muted-foreground">
                      {tModal("executionAlreadyExistsQuestion")}
                    </p>
                  </>
                ) : runConfirmModal?.isSameConfig ? (
                  <>
                    <p>
                      {tModal("clusterAlreadyExistsSame", { name: runConfirmModal?.displayName ?? "" })}
                    </p>
                    <p className="text-muted-foreground">
                      {tModal("runAgainQuestion")}
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      {tModal("clusterExistsDifferent")}
                    </p>
                    <p>
                      {tModal("currentClusterUses", {
                        dataset: runConfirmModal?.existingCluster.dataset_name ?? "—",
                        code: runConfirmModal?.existingCluster.code_filename ?? "—",
                      })}
                    </p>
                    <p className="text-muted-foreground">
                      {tModal("runAnywayHint")}
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRunAnyway}>
              {runConfirmModal?.mode === "repeatExecution"
                ? tModal("executionAlreadyExistsProceed")
                : runConfirmModal?.isSameConfig
                  ? tModal("yesRunAgain")
                  : tModal("runAnywayAndAdd")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold">{t("title")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          <div className="flex flex-row flex-wrap items-center gap-2">
            <Select value={selectedCodeFile} onValueChange={setSelectedCodeFile}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("selectCodeFile")} />
              </SelectTrigger>
              <SelectContent>
                {codeFiles.map((file) => (
                  <SelectItem key={file.id} value={file.id}>
                    {file.filename}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    size="sm"
                    onClick={handleRunCode}
                    disabled={executing || !datasetId || !selectedCodeFile}
                  >
                    {executing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    {executing ? t("executing") : t("runCode")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("executeTooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleExportExcel}
                    disabled={!resultData || !resultData.data}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {t("exportExcel")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("exportTooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setFullScreenOpen(true)}
                    disabled={!resultData || !resultData.data}
                  >
                    <Maximize className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("fullScreenTooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-4 bg-destructive/10 border border-destructive rounded-lg">
            <p className="text-sm font-semibold text-destructive mb-2">{t("executionError")}</p>
            <pre className="text-xs text-destructive whitespace-pre-wrap">{error}</pre>
          </div>
        )}
        {isLoading || executing ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !resultData || !resultData.data || resultData.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Play className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground">
              {t("noResultData")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("runCodeToGenerate")}
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-4 p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>{t("executionSummary")}</strong> {resultData.summary.total_values_computed} {t("valuesComputedAcross")} {Object.keys(resultData.summary.computed_by_column || {}).length} {t("columns")}
              </p>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                    {resultData.summary.columns.map((col: string) => (
                      <TableHead key={col} className="whitespace-nowrap">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultData.data.map((row: any, rowIdx: number) => (
                    <TableRow key={rowIdx}>
                      {resultData.summary.columns.map((col: string) => {
                        const value = row[col];
                        const isComputed = isComputedCell(rowIdx, col);
                        const isNumeric = typeof value === 'number';
                        
                        return (
                          <TableCell 
                            key={col} 
                            className={`whitespace-nowrap ${isNumeric ? 'text-right' : ''} ${
                              isComputed ? 'bg-success/15 text-success-foreground font-medium' : ''
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
              <span>{t("computedValues")}</span>
            </div>
          </div>
        </div>
        )}
      </CardContent>
      
      {/* Full Screen View */}
      {fullScreenOpen && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 overflow-y-auto">
          <div className="w-full max-w-7xl flex flex-col gap-4 my-auto">
            <div className="flex items-center justify-between gap-4 sticky top-0 bg-background/95 backdrop-blur-sm pb-4 z-10">
              <div className="flex-1 min-w-0">
                <h3 className="text-xl md:text-2xl font-semibold text-foreground truncate">
                  {t("fullResultData")}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {resultData && `${resultData.data?.length || 0} rows × ${resultData.summary?.columns?.length || 0} columns`}
                </p>
              </div>
              <button
                onClick={() => setFullScreenOpen(false)}
                className="p-2 md:p-3 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                aria-label="Exit fullscreen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto rounded-lg border border-border bg-card">
              {resultData && resultData.data && (
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      {resultData.summary.columns.map((col: string) => (
                        <TableHead key={col} className="whitespace-nowrap">
                          {col}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultData.data.map((row: any, rowIdx: number) => (
                      <TableRow key={rowIdx}>
                        {resultData.summary.columns.map((col: string) => {
                          const value = row[col];
                          const isComputed = isComputedCell(rowIdx, col);
                          const isNumeric = typeof value === 'number';

                          return (
                            <TableCell
                              key={col}
                              className={`whitespace-nowrap ${isNumeric ? 'text-right' : ''} ${
                                isComputed ? 'bg-success/15 text-success-foreground font-medium' : ''
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
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
    </>
  );
}
