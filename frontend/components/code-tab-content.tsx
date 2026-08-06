"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle, Play, Upload, FileCode, Loader2, Trash2, Sparkles, Copy } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";

interface CodeTabContentProps {
  isLoading?: boolean;
}

export function CodeTabContent({ isLoading = false }: CodeTabContentProps) {
  const t = useTranslations("code");
  const tCommon = useTranslations("common");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [codeFiles, setCodeFiles] = useState<any[]>([]);
  const [codeContent, setCodeContent] = useState<string>("");
  const [editedContent, setEditedContent] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFileForUpload, setSelectedFileForUpload] = useState<File | null>(null);
  const [version, setVersion] = useState("v1.0.0");
  const [description, setDescription] = useState("");
  const [codeToDelete, setCodeToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [datasets, setDatasets] = useState<{ id: string; user_name?: string; filename?: string }[]>([]);
  const [generateDatasetId, setGenerateDatasetId] = useState<string>("");
  const [generatePrompt, setGeneratePrompt] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [generatedCodeDialog, setGeneratedCodeDialog] = useState<string | null>(null);
  const [generatedFileBaseName, setGeneratedFileBaseName] = useState("");
  const [savingGenerated, setSavingGenerated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchCodeFiles();
  }, []);

  useEffect(() => {
    fetch(API_ENDPOINTS.datasets)
      .then((res) => res.json())
      .then((data) => setDatasets(data.datasets || []))
      .catch(() => setDatasets([]));
  }, []);

  const fetchCodeFiles = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.code);
      const data = await response.json();
      if (data.code_files) {
        setCodeFiles(data.code_files);
        if (data.code_files.length > 0 && !selectedFile) {
          const firstFileId = data.code_files[0].id;
          setSelectedFile(firstFileId);
          fetchCodeContent(firstFileId);
        }
      }
    } catch (error) {
      console.error('Error fetching code files:', error);
    }
  };

  const fetchCodeContent = async (codeId: string) => {
    try {
      setLoadingContent(true);
      const response = await fetch(API_ENDPOINTS.codeById(codeId));
      const data = await response.json();
      setCodeContent(data.content || '');
      setEditedContent(data.content || '');
      setIsEditing(false);
    } catch (error) {
      console.error('Error fetching code content:', error);
      setCodeContent('// Error loading code content');
      setEditedContent('// Error loading code content');
    } finally {
      setLoadingContent(false);
    }
  };

  const handleFileSelect = (codeId: string) => {
    setSelectedFile(codeId);
    fetchCodeContent(codeId);
  };

  const handleSaveCode = async () => {
    if (!selectedFile) return;
    
    try {
      setSaving(true);
      const response = await fetch(API_ENDPOINTS.codeById(selectedFile), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: editedContent }),
      });
      
      if (response.ok) {
        setCodeContent(editedContent);
        setIsEditing(false);
        toast({
          title: "Success",
          description: "Code saved successfully",
        });
      } else {
        throw new Error('Failed to save code');
      }
    } catch (error) {
      console.error('Error saving code:', error);
      toast({
        title: "Error",
        description: "Failed to save code",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedContent(codeContent);
    setIsEditing(false);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.py')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a Python (.py) file",
        variant: "destructive",
      });
      return;
    }

    // Open dialog for version and description input
    setSelectedFileForUpload(file);
    setVersion("v1.0.0");
    setDescription("");
    setDialogOpen(true);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFileForUpload || !version.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide a version",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFileForUpload);
      formData.append('version', version.trim());
      formData.append('description', description.trim());

      const response = await fetch(API_ENDPOINTS.codeUpload, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      
      if (result.status === 'error') {
        toast({
          title: "Upload failed",
          description: result.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: `Code file uploaded (${version})`,
        });
        setDialogOpen(false);
        setSelectedFileForUpload(null);
        fetchCodeFiles(); // Refresh the list
      }
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDeleteClick = (e: React.MouseEvent, file: { id: string; filename?: string }) => {
    e.stopPropagation();
    setCodeToDelete({ id: file.id, name: file.filename || file.id });
  };

  const handleConfirmDelete = async () => {
    if (!codeToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(API_ENDPOINTS.codeDelete(codeToDelete.id), { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || "Delete failed");
      }
      const wasSelected = selectedFile === codeToDelete.id;
      const remaining = codeFiles.filter((f) => f.id !== codeToDelete.id);
      setCodeToDelete(null);
      await fetchCodeFiles();
      if (wasSelected) {
        if (remaining.length > 0) {
          setSelectedFile(remaining[0].id);
          fetchCodeContent(remaining[0].id);
        } else {
          setSelectedFile(null);
          setCodeContent("");
          setEditedContent("");
        }
      }
      toast({ title: "Code file deleted", description: `"${codeToDelete.name}" has been removed.` });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Could not delete code file",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerateCode = async () => {
    if (!generateDatasetId.trim()) {
      toast({
        title: "Select a dataset",
        description: "Choose an Excel dataset to generate code for",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch(API_ENDPOINTS.generateCode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id: generateDatasetId,
          prompt: generatePrompt.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const code = (data.code ?? "").trim();
      if (!code) {
        toast({ title: "No code returned", variant: "destructive" });
        return;
      }
      setGeneratedCodeDialog(code);
      setGeneratedFileBaseName("");
      toast({ title: "Code generated", description: "Name the file and save as new." });
    } catch (e) {
      toast({
        title: "Generate failed",
        description: e instanceof Error ? e.message : "Could not generate code",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const copyGeneratedCode = () => {
    if (generatedCodeDialog) {
      navigator.clipboard.writeText(generatedCodeDialog);
      toast({ title: "Copied to clipboard" });
    }
  };

  const handleSaveGeneratedAsNew = async () => {
    const base = generatedFileBaseName.trim();
    if (!generatedCodeDialog || !base) {
      toast({
        title: "File name required",
        description: "Enter a name for the new code file",
        variant: "destructive",
      });
      return;
    }
    const name = base.endsWith(".py") ? base : base + ".py";
    const existingNames = (codeFiles || []).map((f: { filename?: string }) => (f.filename || "").toLowerCase());
    if (existingNames.includes(name.toLowerCase())) {
      toast({
        title: "File name already used",
        description: `A code file named "${name}" already exists. Choose a different name.`,
        variant: "destructive",
      });
      return;
    }
    setSavingGenerated(true);
    try {
      const blob = new Blob([generatedCodeDialog], { type: "text/plain" });
      const file = new File([blob], name, { type: "text/plain" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("version", "v1.0.0");
      formData.append("description", "AI generated");
      const res = await fetch(API_ENDPOINTS.codeUpload, { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }
      const result = await res.json();
      const newId = result.id ?? result.code_id;
      setGeneratedCodeDialog(null);
      setGeneratedFileBaseName("");
      await fetchCodeFiles();
      if (newId) {
        setSelectedFile(newId);
        fetchCodeContent(newId);
      }
      toast({ title: "Saved", description: `"${name}" created.` });
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Could not save file",
        variant: "destructive",
      });
    } finally {
      setSavingGenerated(false);
    }
  };

  return (
    <>
      <AlertDialog open={!!codeToDelete} onOpenChange={(open) => !open && setCodeToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteCodeFileQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteCodeFileWarning", { name: codeToDelete?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? t("deleting") : tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("uploadDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("uploadDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="version">{t("version")} *</Label>
              <Input
                id="version"
                placeholder={t("versionPlaceholder")}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t("description")}</Label>
              <Textarea
                id="description"
                placeholder={t("optionalDescription")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleUploadSubmit} disabled={uploading}>
              {uploading ? t("uploading") : tCommon("upload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={generatedCodeDialog !== null} onOpenChange={(open) => { if (!open) { setGeneratedCodeDialog(null); setGeneratedFileBaseName(""); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("saveGeneratedTitle")}</DialogTitle>
            <DialogDescription>
              {t("saveGeneratedDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            <div className="space-y-2">
              <Label htmlFor="generated-filename">{t("fileName")}</Label>
              <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <Input
                  id="generated-filename"
                  value={generatedFileBaseName}
                  onChange={(e) => setGeneratedFileBaseName((e.target.value || "").replace(/\.py$/i, ""))}
                  placeholder={t("fileNamePlaceholder")}
                  className="border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0 min-w-0 flex-1"
                />
                <span className="text-muted-foreground shrink-0">.py</span>
              </div>
            </div>
            <div className="flex-1 min-h-0 rounded-lg border bg-muted/30 p-3 overflow-auto">
              <pre className="text-sm whitespace-pre-wrap font-mono">{generatedCodeDialog ?? ""}</pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={copyGeneratedCode}>
              <Copy className="mr-2 h-4 w-4" /> {t("copy")}
            </Button>
            <Button variant="outline" onClick={() => setGeneratedCodeDialog(null)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleSaveGeneratedAsNew} disabled={savingGenerated || !generatedFileBaseName.trim()}>
              {savingGenerated ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              {savingGenerated ? t("savingGenerated") : t("saveAsNew")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 gap-6">
      {/* Left Column - File Upload and List */}
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-4">
<div className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base font-semibold">{t("generateTitle")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("excelDataset")}</Label>
              <Select value={generateDatasetId || "__none__"} onValueChange={(v) => setGenerateDatasetId(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectDataset")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("selectDataset")}</SelectItem>
                  {datasets.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.user_name || d.filename || d.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("formulasOptional")}</Label>
              <Textarea
                placeholder={t("formulasPlaceholder")}
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            <Button onClick={handleGenerateCode} disabled={generating}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {generating ? t("generating") : t("generateCode")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
<div className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base font-semibold">{t("codeFilesTitle")}</CardTitle>
              <input
                ref={fileInputRef}
                type="file"
                accept=".py"
                className="hidden"
                onChange={handleFileChange}
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
                      {uploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      {uploading ? t("uploading") : t("uploadCodeFile")}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("uploadPythonFile")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : codeFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileCode className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-medium text-foreground">
                  {t("noCodeFiles")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("noCodeFilesHint")}
                </p>
              </div>
            ) : (
              <Table>
<TableHeader>
                <TableRow>
                  <TableHead>{t("fileName")}</TableHead>
                  <TableHead>{t("uploadDate")}</TableHead>
                  <TableHead className="w-[80px]">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
                <TableBody>
                  {codeFiles.map((file) => (
                    <TableRow
                      key={file.id}
                      className={`cursor-pointer ${
                        selectedFile === file.id ? "bg-accent" : ""
                      }`}
                      onClick={() => handleFileSelect(file.id)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileCode className="h-4 w-4 text-muted-foreground" />
                          {file.filename}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">{file.version}</span>
                          <span className="text-xs">{new Date(file.upload_date).toLocaleString()}</span>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={(e) => handleDeleteClick(e, file)}
                                disabled={deleting}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t("deleteCodeFileTooltip")}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right Column - Code Editor */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">{t("codeEditorTitle")}</CardTitle>
            {selectedFile && !loadingContent && (
              <div className="flex gap-2">
                {isEditing ? (
                  <>
<Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelEdit}
                    disabled={saving}
                  >
                    {tCommon("cancel")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveCode}
                    disabled={saving}
                  >
                    {saving ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("saving")}</>
                      ) : (
                        <><CheckCircle className="mr-2 h-4 w-4" />{tCommon("save")}</>
                      )}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  {t("editCode")}
                </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading || loadingContent ? (
            <Skeleton className="h-[400px] w-full" />
          ) : !selectedFile ? (
            <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-border bg-muted/30 min-h-[400px]">
              <FileCode className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium text-foreground">
                {t("noCodeFileSelected")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("noCodeFileSelectedHint")}
              </p>
            </div>
          ) : isEditing ? (
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="min-h-[500px] font-mono text-sm bg-muted/30"
              placeholder="Enter your Python code here..."
            />
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 p-4 overflow-auto max-h-[500px]">
              <pre className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
                {codeContent || '// No content available'}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  );
}
