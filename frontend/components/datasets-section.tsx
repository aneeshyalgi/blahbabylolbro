"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

interface DatasetsSectionProps {
  isLoading?: boolean;
  onDatasetSelect?: (datasetId: string) => void;
  selectedDatasetId?: string | null;
}

export function DatasetsSection({ 
  isLoading = false, 
  onDatasetSelect,
  selectedDatasetId 
}: DatasetsSectionProps) {
  const [datasets, setDatasets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [version, setVersion] = useState("v1.0.0");
  const [datasetToDelete, setDatasetToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const t = useTranslations("datasets");
  const tCommon = useTranslations("common");

  useEffect(() => {
    fetchDatasets();
  }, []);

  const fetchDatasets = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_ENDPOINTS.datasets);
      const data = await response.json();
      setDatasets(data.datasets || []);
    } catch (error) {
      console.error('Error fetching datasets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Set file and open dialog for name and version input
    setSelectedFile(file);
    setDatasetName(file.name.replace(/\.[^/.]+$/, "")); // Remove file extension
    setVersion("v1.0.0");
    setDialogOpen(true);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile || !datasetName.trim() || !version.trim()) {
      toast({
        title: t("missingInfo"),
        description: t("missingInfoDesc"),
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadStage(t("uploadStageUploading"));
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('dataset_name', datasetName.trim());
      formData.append('version', version.trim());

      setUploadProgress(20);
      setUploadStage(t("uploadStageProcessing"));

      const response = await fetch(API_ENDPOINTS.datasetsUpload, {
        method: 'POST',
        body: formData,
      });

      setUploadProgress(60);
      setUploadStage(t("uploadStageDetecting"));

      if (!response.ok) {
        let errorMessage = `${t("uploadFailedDesc")} (HTTP ${response.status})`;
        try {
          const errData = await response.json();
          if (errData?.detail && typeof errData.detail === "string") {
            errorMessage = errData.detail;
          }
        } catch {
          // Keep fallback message if response body is not JSON
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Upload successful:', data);
      
      setUploadProgress(90);
      setUploadStage(t("uploadStageSemantic"));
      
      // Give a moment for the semantic matching message to show
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setUploadProgress(100);
      setUploadStage(t("uploadStageComplete"));
      
      let description = t("uploadSuccessDesc", { count: data.tables.length });
      if (data.auto_cluster?.created) {
        description = t("autoClusterCreatedDesc", { name: data.auto_cluster.name });
      } else if (data.auto_cluster?.reason === "duplicate_name") {
        description = `${description} ${t("autoClusterSkippedDuplicate", { name: data.auto_cluster.name })}`;
      } else if (data.auto_cluster?.reason === "no_code_files") {
        description = `${description} ${t("autoClusterSkippedNoCode")}`;
      }

      toast({
        title: tCommon("success"),
        description,
      });
      
      // Close dialog and reset form
      setDialogOpen(false);
      setSelectedFile(null);
      setDatasetName("");
      setUploadProgress(0);
      setUploadStage("");
      
      // Refresh the list and auto-select the uploaded dataset
      await fetchDatasets();
      if (data.id && onDatasetSelect) {
        onDatasetSelect(data.id);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: t("uploadFailed"),
        description: error instanceof Error ? error.message : t("uploadFailedDesc"),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadStage("");
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, dataset: { id: string; user_name?: string; filename?: string }) => {
    e.stopPropagation();
    setDatasetToDelete({
      id: dataset.id,
      name: dataset.user_name || dataset.filename || dataset.id,
    });
  };

  const handleConfirmDelete = async () => {
    if (!datasetToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(API_ENDPOINTS.datasetDelete(datasetToDelete.id), { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || "Delete failed");
      }
      if (selectedDatasetId === datasetToDelete.id) {
        onDatasetSelect?.("");
      }
      setDatasetToDelete(null);
      await fetchDatasets();
      toast({ title: t("datasetDeleted"), description: t("datasetDeletedDesc", { name: datasetToDelete.name }) });
    } catch (err) {
      toast({
        title: t("deleteFailed"),
        description: err instanceof Error ? err.message : t("deleteFailedDesc"),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base font-semibold">{t("title")}</CardTitle>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleUploadClick}
                    disabled={uploading}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {uploading ? t("uploading") : t("uploadDataset")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("uploadNewExcel")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={fetchDatasets}
                    disabled={loading}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("refreshList")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading || isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : datasets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground">
              {t("noDatasets")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("noDatasetsHint")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("datasetName")}</TableHead>
                  <TableHead>{t("originalFile")}</TableHead>
                  <TableHead>{t("version")}</TableHead>
                  <TableHead>{t("uploadDate")}</TableHead>
                  <TableHead className="w-[80px]">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.map((dataset) => (
                  <TableRow 
                    key={dataset.id}
                    className={`cursor-pointer ${selectedDatasetId === dataset.id ? 'bg-accent' : ''}`}
                    onClick={() => onDatasetSelect?.(dataset.id)}
                  >
                    <TableCell className="font-medium">
                      {dataset.user_name || dataset.filename}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dataset.filename}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dataset.version || "v1.0.0"}
                    </TableCell>
                    <TableCell>{formatDate(dataset.upload_date)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => handleDeleteClick(e, dataset)}
                              disabled={deleting}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t("deleteThisDataset")}</p>
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
      
      {/* Upload Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("uploadDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("uploadDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="file-name">{t("selectedFile")}</Label>
              <Input
                id="file-name"
                value={selectedFile?.name || ""}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dataset-name">{t("datasetNameRequired")}</Label>
              <Input
                id="dataset-name"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                placeholder={t("datasetNamePlaceholder")}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dataset-version">{t("versionRequired")}</Label>
              <Input
                id="dataset-version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder={t("versionPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            {uploading && (
              <div className="w-full space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner className="h-4 w-4" />
                  <span>{uploadStage}</span>
                </div>
                <Progress value={uploadProgress} className="w-full" />
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setSelectedFile(null);
                setDatasetName("");
                setVersion("v1.0.0");
              }}
              disabled={uploading}
            >
              {tCommon("cancel")}
            </Button>
            <Button 
              onClick={handleUploadSubmit} 
              disabled={uploading || !datasetName.trim() || !version.trim()}
            >
              {uploading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  {t("uploading")}
                </>
              ) : (
                t("upload")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!datasetToDelete} onOpenChange={(open) => !open && setDatasetToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDatasetQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDatasetWarning", { name: datasetToDelete?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t("deleting") : tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
