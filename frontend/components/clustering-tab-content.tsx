"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search, Plus, Trash2, Play, RefreshCw, Pencil, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useClusterSelection } from "@/context/cluster-selection-context";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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

interface Dataset {
  id: string;
  user_name: string;
  filename: string;
  version: string;
}

interface CodeFile {
  id: string;
  filename: string;
  version: string;
  description: string;
}

interface ClusterExecution {
  id: string;
  execution_id: string;
  executed_date: string;
  dataset_name: string;
  dataset_version: string;
  code_filename: string | null;
  code_version: string | null;
  summary: any;
}

const STORAGE_CLUSTER_ID = "dataflow_clusters_selected_id";

export function ClusteringTabContent() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [codeFiles, setCodeFiles] = useState<CodeFile[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [savedClusterIdToRestore, setSavedClusterIdToRestore] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_CLUSTER_ID) : null
  );
  const [executions, setExecutions] = useState<ClusterExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [executing, setExecuting] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [viewingCluster, setViewingCluster] = useState<Cluster | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewingExecutionData, setViewingExecutionData] = useState<any>(null);
  const [loadingExecutionData, setLoadingExecutionData] = useState(false);
  const [editFormData, setEditFormData] = useState<{
    name: string;
    reporting_date: string;
    dataset_id: string;
    code_id: string;
  }>({
    name: "",
    reporting_date: "",
    dataset_id: "",
    code_id: "",
  });
  const [updatingCluster, setUpdatingCluster] = useState(false);
  const [executionToDelete, setExecutionToDelete] = useState<ClusterExecution | null>(null);
  const [deletingExecution, setDeletingExecution] = useState(false);
  const { toast } = useToast();
  const {
    baseClusterId,
    comparisonClusterId,
    setBaseClusterId,
    setComparisonClusterId,
  } = useClusterSelection();
  const t = useTranslations("clustering");
  const tCommon = useTranslations("common");

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    reporting_date: "",
    dataset_id: "",
    code_id: "",
    description: "",
    is_reference: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedCluster?.id) localStorage.setItem(STORAGE_CLUSTER_ID, selectedCluster.id);
    else localStorage.removeItem(STORAGE_CLUSTER_ID);
  }, [selectedCluster?.id]);

  useEffect(() => {
    if (selectedCluster) {
      loadExecutions(selectedCluster.id);
    }
  }, [selectedCluster]);

  // Live search effect
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      handleSearch();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [clustersRes, datasetsRes, codeFilesRes] = await Promise.all([
        fetch(API_ENDPOINTS.clusters),
        fetch(API_ENDPOINTS.datasets),
        fetch(API_ENDPOINTS.code),
      ]);

      const clustersData = await clustersRes.json();
      const datasetsData = await datasetsRes.json();
      const codeFilesData = await codeFilesRes.json();

      const clustersList = clustersData.clusters || [];
      setClusters(clustersList);
      setDatasets(datasetsData.datasets || []);
      setCodeFiles(codeFilesData.code_files || []);
      if (savedClusterIdToRestore && clustersList.length > 0) {
        const found = clustersList.find((c: Cluster) => c.id === savedClusterIdToRestore);
        if (found) setSelectedCluster(found);
        setSavedClusterIdToRestore(null);
      }

      if (baseClusterId && !clustersList.some((c: Cluster) => c.id === baseClusterId)) {
        setBaseClusterId("");
      }
      if (comparisonClusterId && !clustersList.some((c: Cluster) => c.id === comparisonClusterId)) {
        setComparisonClusterId("");
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: t("toastLoadError"),
        description: t("toastLoadErrorDesc"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadExecutions = async (clusterId: string) => {
    try {
      const response = await fetch(API_ENDPOINTS.clusterById(clusterId));
      const data = await response.json();
      setExecutions(data.executions || []);
    } catch (error) {
      console.error("Error loading executions:", error);
    }
  };

  const handleCreateCluster = async () => {
    if (!formData.name || !formData.reporting_date || !formData.dataset_id || !formData.code_id) {
      toast({
        title: t("toastMissingFields"),
        description: t("toastMissingFieldsDesc"),
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.clusters, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error("Failed to create cluster");

      toast({
        title: t("toastCreateSuccess"),
        description: t("toastCreateSuccessDesc"),
      });

      // Reset form
      setFormData({
        name: "",
        reporting_date: "",
        dataset_id: "",
        code_id: "",
        description: "",
        is_reference: false,
      });

      loadData();
    } catch (error) {
      console.error("Error creating cluster:", error);
      toast({
        title: t("toastCreateFailed"),
        description: t("toastCreateFailedDesc"),
        variant: "destructive",
      });
    }
  };

  const handleDeleteCluster = async (clusterId: string) => {
    try {
      const response = await fetch(API_ENDPOINTS.clusterById(clusterId), {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete cluster");

      toast({
        title: t("toastDeleteSuccess"),
        description: t("toastDeleteSuccessDesc"),
      });

      if (selectedCluster?.id === clusterId) {
        setSelectedCluster(null);
        setExecutions([]);
      }

      loadData();
    } catch (error) {
      console.error("Error deleting cluster:", error);
      toast({
        title: t("toastDeleteFailed"),
        description: t("toastDeleteFailedDesc"),
        variant: "destructive",
      });
    }
  };

  const handleEditCluster = (cluster: Cluster) => {
    setViewingCluster(cluster);
    const reportingDateStr = cluster.reporting_date;
    const reportingDateForInput =
      typeof reportingDateStr === "string" && /^\d{4}-\d{2}-\d{2}/.test(reportingDateStr)
        ? reportingDateStr.slice(0, 10)
        : reportingDateStr
          ? new Date(reportingDateStr).toISOString().slice(0, 10)
          : "";
    setEditFormData({
      name: cluster.name ?? "",
      reporting_date: reportingDateForInput,
      dataset_id: cluster.dataset_id,
      code_id: cluster.code_id,
    });
    setDetailsDialogOpen(true);
  };

  const handleUpdateCluster = async () => {
    if (!viewingCluster) return;
    if (!editFormData.name?.trim()) {
      toast({
        title: t("toastMissingName"),
        description: t("toastMissingNameDesc"),
        variant: "destructive",
      });
      return;
    }
    if (!editFormData.reporting_date?.trim()) {
      toast({
        title: t("toastMissingDate"),
        description: t("toastMissingDateDesc"),
        variant: "destructive",
      });
      return;
    }
    const clusterId = viewingCluster.id;
    try {
      setUpdatingCluster(true);
      const response = await fetch(API_ENDPOINTS.clusterById(clusterId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editFormData.name,
          reporting_date: editFormData.reporting_date,
          dataset_id: editFormData.dataset_id,
          code_id: editFormData.code_id,
        }),
      });
      if (!response.ok) throw new Error("Failed to update cluster");
      toast({ title: t("toastUpdateSuccess"), description: t("toastUpdateSuccessDesc") });
      setDetailsDialogOpen(false);
      setViewingCluster(null);
      loadData();
      if (selectedCluster?.id === clusterId) {
        setSelectedCluster(null);
      }
    } catch (error) {
      console.error("Error updating cluster:", error);
      toast({
        title: t("toastUpdateFailed"),
        description: t("toastUpdateFailedDesc"),
        variant: "destructive",
      });
    } finally {
      setUpdatingCluster(false);
    }
  };

  const handleDeleteExecution = (execution: ClusterExecution) => {
    setExecutionToDelete(execution);
  };

  const handleConfirmDeleteExecution = async () => {
    if (!executionToDelete || !selectedCluster) return;
    setDeletingExecution(true);
    try {
      const response = await fetch(API_ENDPOINTS.clusterExecutionDelete(executionToDelete.id), {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete execution");
      toast({
        title: t("toastExecutionRemoved"),
        description: t("toastExecutionRemovedDesc"),
      });
      setExecutionToDelete(null);
      loadExecutions(selectedCluster.id);
    } catch (error) {
      toast({
        title: t("toastRemoveFailed"),
        description: t("toastRemoveFailedDesc"),
        variant: "destructive",
      });
    } finally {
      setDeletingExecution(false);
    }
  };

  const handleViewExecutionData = async (executionId: string) => {
    try {
      setLoadingExecutionData(true);
      setIsFullscreen(true);
      
      const response = await fetch(API_ENDPOINTS.resultById(executionId));
      if (!response.ok) throw new Error("Failed to load execution data");
      
      const data = await response.json();
      setViewingExecutionData(data);
    } catch (error) {
      console.error("Error loading execution data:", error);
      toast({
        title: t("toastLoadExecutionFailed"),
        description: t("toastLoadExecutionFailedDesc"),
        variant: "destructive",
      });
      setIsFullscreen(false);
    } finally {
      setLoadingExecutionData(false);
    }
  };

  const handleExecuteCluster = async () => {
    if (!selectedCluster) {
      toast({
        title: t("toastNoClusterSelected"),
        description: t("toastNoClusterSelectedDesc"),
        variant: "destructive",
      });
      return;
    }

    try {
      setExecuting(true);
      const response = await fetch(
        API_ENDPOINTS.clusterExecute(selectedCluster.id),
        { method: "POST" }
      );

      const result = await response.json();

      if (result.status === "success") {
        toast({
          title: t("toastExecuteSuccess"),
          description: t("toastExecuteSuccessDesc", { count: result.summary?.total_values_computed || 0 }),
        });
        loadExecutions(selectedCluster.id);
      } else {
        toast({
          title: t("toastExecutionError"),
          description: result.error || tCommon("error"),
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error executing cluster:", error);
      toast({
        title: t("toastExecuteFailed"),
        description: t("toastExecuteFailedDesc"),
        variant: "destructive",
      });
    } finally {
      setExecuting(false);
    }
  };

  const handleSearch = async () => {
    try {
      const url = searchTerm
        ? `${API_ENDPOINTS.clusters}?search=${encodeURIComponent(searchTerm)}`
        : API_ENDPOINTS.clusters;
      
      const response = await fetch(url);
      const data = await response.json();
      setClusters(data.clusters || []);
    } catch (error) {
      console.error("Error searching clusters:", error);
    }
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

  const formatCellDisplay = (value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "number" && value === 0) return "—";
    if (typeof value === "number") return Number(value).toLocaleString();
    return String(value);
  };

  return (
    <>
      <AlertDialog open={!!executionToDelete} onOpenChange={(open) => !open && setExecutionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeExecutionQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("removeExecutionWarning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingExecution}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDeleteExecution();
              }}
              disabled={deletingExecution}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingExecution ? t("removing") : t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    <div className="grid grid-cols-2 gap-6">
      {/* Left Panel: Cluster Form */}
      <Card>
        <CardHeader>
          <CardTitle>{t("clusterConfiguration")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cluster-name">{t("clusterName")}</Label>
            <Input
              id="cluster-name"
              placeholder={t("clusterNamePlaceholder")}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reporting-date">{t("reportingDate")}</Label>
            <Input
              id="reporting-date"
              type="date"
              value={formData.reporting_date}
              onChange={(e) => setFormData({ ...formData, reporting_date: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataset">{t("dataset")}</Label>
            <Select
              value={formData.dataset_id}
              onValueChange={(value) => setFormData({ ...formData, dataset_id: value })}
            >
              <SelectTrigger id="dataset">
                <SelectValue placeholder={t("selectDataset")} />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((dataset) => (
                  <SelectItem key={dataset.id} value={dataset.id}>
                    {dataset.user_name} ({dataset.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="code-version">{t("softwareVersion")}</Label>
            <Select
              value={formData.code_id}
              onValueChange={(value) => setFormData({ ...formData, code_id: value })}
            >
              <SelectTrigger id="code-version">
                <SelectValue placeholder={t("selectCodeVersion")} />
              </SelectTrigger>
              <SelectContent>
                {codeFiles.map((code) => (
                  <SelectItem key={code.id} value={code.id}>
                    {code.filename} ({code.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("description")}</Label>
            <Textarea
              id="description"
              placeholder={t("optionalDescription")}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is-reference"
              checked={formData.is_reference}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_reference: checked as boolean })
              }
            />
            <Label htmlFor="is-reference" className="cursor-pointer">
              {t("markAsReference")}
            </Label>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleCreateCluster} className="flex-1">
              <Plus className="mr-2 h-4 w-4" />
              {t("createCluster")}
            </Button>
            <Button variant="outline" onClick={loadData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Right Panel: Cluster List & Execution History */}
      <div className="space-y-6">
        {/* Cluster List */}
        <Card>
          <CardHeader>
            <CardTitle>{t("clusterManagement")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-sm font-medium text-foreground">Global cluster selection</p>
              <p className="text-xs text-muted-foreground">
                Select once here. Compare and Lineage tabs will reuse these defaults.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Base cluster</Label>
                  <Select
                    value={baseClusterId || "__none__"}
                    onValueChange={(value) => setBaseClusterId(value === "__none__" ? "" : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select base cluster" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {clusters.map((cluster) => (
                        <SelectItem key={`base-${cluster.id}`} value={cluster.id}>
                          {cluster.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Comparison cluster</Label>
                  <Select
                    value={comparisonClusterId || "__none__"}
                    onValueChange={(value) => setComparisonClusterId(value === "__none__" ? "" : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select comparison cluster" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {clusters.map((cluster) => (
                        <SelectItem key={`comparison-${cluster.id}`} value={cluster.id}>
                          {cluster.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder={t("searchClusters")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {loading ? (
                <>
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </>
              ) : clusters.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("noClustersFound")}
                </p>
              ) : (
                clusters.map((cluster) => (
                  <div
                    key={cluster.id}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      selectedCluster?.id === cluster.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setSelectedCluster(cluster)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm">{cluster.name}</h4>
                          {cluster.is_reference && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                              {t("referenceBadge")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(cluster.reporting_date)} • {cluster.dataset_name} (
                          {cluster.dataset_version}) • Code: {cluster.code_version}
                        </p>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditCluster(cluster);
                              }}
                              className="h-8 w-8"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t("editTooltip")}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                ))
              )}
            </div>

          </CardContent>
        </Card>

        {/* Execution History */}
        {selectedCluster && (
          <Card>
            <CardHeader>
              <CardTitle>{t("executionHistoryTitle", { name: selectedCluster.name })}</CardTitle>
            </CardHeader>
            <CardContent>
              {executions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("noExecutionsYet")}
                </p>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("repDate")}</TableHead>
                        <TableHead>{t("dataset")}</TableHead>
                        <TableHead>{t("code")}</TableHead>
                        <TableHead>{t("timestamp")}</TableHead>
                        <TableHead>{t("values")}</TableHead>
                        <TableHead>{t("actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {executions.map((execution) => (
                        <TableRow key={execution.id}>
                          <TableCell>{formatDate(selectedCluster.reporting_date)}</TableCell>
                          <TableCell>
                            {execution.dataset_name} ({execution.dataset_version})
                          </TableCell>
                          <TableCell>
                            {execution.code_filename != null
                              ? `${execution.code_filename}${execution.code_version ? ` (${execution.code_version})` : ""}`
                              : execution.code_version ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatDateTime(execution.executed_date)}
                          </TableCell>
                          <TableCell>
                            {execution.summary?.total_values_computed || 0}
                          </TableCell>
                          <TableCell className="flex gap-1">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleViewExecutionData(execution.execution_id)}
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
                                    onClick={() => handleDeleteExecution(execution)}
                                    disabled={deletingExecution}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t("removeFromHistory")}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cluster Details / Edit Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("clusterDetails")}</DialogTitle>
            <DialogDescription>
              {t("clusterDetailsDesc")}
            </DialogDescription>
          </DialogHeader>
          {viewingCluster && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t("clusterName")}</Label>
                  <Input
                    value={editFormData.name}
                    onChange={(e) => setEditFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder={t("clusterNamePlaceholder")}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("status")}</Label>
                  <div>
                    {viewingCluster.is_reference ? (
                      <Badge>{t("referenceCluster")}</Badge>
                    ) : (
                      <Badge variant="secondary">{t("standard")}</Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t("reportingDate")}</Label>
                  <Input
                    type="date"
                    value={editFormData.reporting_date}
                    onChange={(e) => setEditFormData((prev) => ({ ...prev, reporting_date: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("created")}</Label>
                  <p className="font-medium">{formatDateTime(viewingCluster.created_date)}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t("dataset")}</Label>
                  <Select
                    value={editFormData.dataset_id}
                    onValueChange={(value) => setEditFormData((prev) => ({ ...prev, dataset_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("selectDataset")} />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets.map((dataset) => (
                        <SelectItem key={dataset.id} value={dataset.id}>
                          {dataset.user_name} ({dataset.version})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t("code")}</Label>
                  <Select
                    value={editFormData.code_id}
                    onValueChange={(value) => setEditFormData((prev) => ({ ...prev, code_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("selectCodeVersion")} />
                    </SelectTrigger>
                    <SelectContent>
                      {codeFiles.map((code) => (
                        <SelectItem key={code.id} value={code.id}>
                          {code.filename} ({code.version})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {viewingCluster.description && (
                <div>
                  <Label className="text-xs text-muted-foreground">{t("description")}</Label>
                  <p className="text-sm mt-1">{viewingCluster.description}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleDeleteCluster(viewingCluster.id);
                    setDetailsDialogOpen(false);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("deleteCluster")}
                </Button>
                <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
                  {t("close")}
                </Button>
                <Button onClick={handleUpdateCluster} disabled={updatingCluster}>
                  {updatingCluster ? t("saving") : t("saveChanges")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Execution Data Fullscreen */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 overflow-y-auto">
          <div className="w-full max-w-7xl flex flex-col gap-4 my-auto">
            
            {/* Header with Close Button */}
            <div className="flex items-center justify-between gap-4 sticky top-0 bg-background/95 backdrop-blur-sm pb-4 z-10">
              <div className="flex-1 min-w-0">
                <h3 className="text-xl md:text-2xl font-semibold text-foreground truncate">
                  {t("executionResults")}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("executionResultsDesc")}
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
                        {viewingExecutionData.summary?.rows_processed || 0}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("totalValuesComputed")}</Label>
                      <p className="text-lg font-semibold">
                        {viewingExecutionData.summary?.total_values_computed || 0}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("columns")}</Label>
                      <p className="text-lg font-semibold">
                        {viewingExecutionData.summary?.columns?.length || 0}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="mb-2 block">{t("computedByColumn")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {viewingExecutionData.summary?.computed_by_column &&
                        Object.entries(viewingExecutionData.summary.computed_by_column).map(
                          ([column, count]) => (
                            <div
                              key={column}
                              className="flex justify-between items-center p-2 bg-muted rounded"
                            >
                              <span className="text-sm font-medium">{column}</span>
                              <Badge>{count as number} {t("values")}</Badge>
                            </div>
                          )
                        )}
                    </div>
                  </div>

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
                            {viewingExecutionData.data?.map((row: any, rowIndex: number) => (
                              <TableRow key={rowIndex}>
                                {viewingExecutionData.summary?.columns?.map((col: string) => {
                                  const isComputed = viewingExecutionData.computed_cells?.some(
                                    (cell: any) =>
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
    </div>
    </>
  );
}
