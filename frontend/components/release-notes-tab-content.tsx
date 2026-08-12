"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ReleaseNotesWorkbookViewer, type ReleaseNoteSheet } from "@/components/release-notes-workbook-viewer";

type Workbook = { id: string; filename: string; size: number; upload_date: string; sheets: string[] };

const SPECIAL_RELEASE_NOTE_FILENAME = "rwa release notes_1 (1).xlsm";
const SPECIAL_RELEASE_NOTE_VISIBLE_SHEET = "rwa release notes";

const normalizeName = (value: string) => value.trim().toLowerCase();

const isSpecialReleaseNotesWorkbook = (workbook: Workbook | null) => (
  workbook ? normalizeName(workbook.filename) === SPECIAL_RELEASE_NOTE_FILENAME : false
);

const getVisibleSheets = (workbook: Workbook | null) => {
  if (!workbook) return [] as { name: string; sourceIndex: number }[];
  return workbook.sheets
    .map((name, sourceIndex) => ({ name, sourceIndex }))
    .filter((sheet) => !isSpecialReleaseNotesWorkbook(workbook) || normalizeName(sheet.name) === SPECIAL_RELEASE_NOTE_VISIBLE_SHEET);
};

export function PatchNotesTabContent() {
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [sheet, setSheet] = useState<ReleaseNoteSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Workbook | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const selected = workbooks.find((workbook) => workbook.id === selectedId) ?? null;
  const selectedVisibleSheets = useMemo(() => getVisibleSheets(selected), [selected]);
  const selectedSheetIndex = selectedVisibleSheets[activeSheet]?.sourceIndex ?? 0;

  const fetchWorkbooks = async (preferredId?: string) => {
    setLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.releaseNotes);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Could not load release notes.");
      const next: Workbook[] = payload.workbooks || [];
      setWorkbooks(next);
      const nextId = preferredId && next.some((item) => item.id === preferredId)
        ? preferredId
        : next.some((item) => item.id === selectedId) ? selectedId : next[0]?.id ?? null;
      setSelectedId(nextId);
      if (nextId !== selectedId) setActiveSheet(0);
    } catch (requestError) {
      toast({ title: "Could not load release notes", description: requestError instanceof Error ? requestError.message : "Request failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchWorkbooks();
  }, []);

  useEffect(() => {
    if (!selectedId) { setSheet(null); return; }
    if (selectedVisibleSheets.length === 0) { setSheet(null); return; }
    let cancelled = false;
    setLoadingSheet(true);
    setError(null);
    fetch(API_ENDPOINTS.releaseNoteSheet(selectedId, selectedSheetIndex))
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "Could not load worksheet.");
        if (!cancelled) setSheet(payload);
      })
      .catch((requestError) => {
        if (!cancelled) { setSheet(null); setError(requestError instanceof Error ? requestError.message : "Could not load worksheet."); }
      })
      .finally(() => { if (!cancelled) setLoadingSheet(false); });
    return () => { cancelled = true; };
  }, [selectedId, activeSheet, selectedSheetIndex, selectedVisibleSheets.length]);

  useEffect(() => {
    if (selectedVisibleSheets.length === 0) return;
    if (activeSheet >= selectedVisibleSheets.length) setActiveSheet(0);
  }, [activeSheet, selectedVisibleSheets.length]);

  const uploadWorkbook = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    try {
      const response = await fetch(API_ENDPOINTS.releaseNotes, { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Upload failed.");
      await fetchWorkbooks(payload.id);
      setActiveSheet(0);
      toast({ title: "Release notes uploaded", description: payload.filename });
    } catch (requestError) {
      toast({ title: "Upload failed", description: requestError instanceof Error ? requestError.message : "Could not upload workbook.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const deleteWorkbook = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(API_ENDPOINTS.releaseNoteDelete(deleteTarget.id), { method: "DELETE" });
      const responseText = await response.text();
      let payload: { detail?: string } = {};
      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        payload = {};
      }
      if (!response.ok) throw new Error(payload.detail || "Delete failed.");
      setDeleteTarget(null);
      await fetchWorkbooks();
      toast({ title: "Release notes deleted" });
    } catch (requestError) {
      toast({ title: "Delete failed", description: requestError instanceof Error ? requestError.message : "Could not delete workbook.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div><h2 className="text-lg font-semibold">Release notes</h2><p className="text-sm text-muted-foreground">Upload and view Excel release-note workbooks.</p></div>
        <div className="flex gap-2">
          <input ref={inputRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={(event) => event.target.files?.[0] && void uploadWorkbook(event.target.files[0])} />
          <Button variant="outline" size="icon" onClick={() => void fetchWorkbooks()} aria-label="Refresh"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Upload Excel</Button>
        </div>
      </div>

      <div className="grid min-h-[640px] grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded-md border bg-card">
        <aside className="border-r bg-muted/20 p-3">
          <h3 className="mb-3 px-2 text-xs font-semibold uppercase text-muted-foreground">Workbooks</h3>
          {loading ? <div className="px-2 py-8 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading</div> : workbooks.length === 0 ? <div className="px-2 py-8 text-center text-sm text-muted-foreground"><FileSpreadsheet className="mx-auto mb-2 h-8 w-8" />No release notes uploaded</div> : (
            <div className="space-y-1">{workbooks.map((workbook) => {
              const visibleSheetCount = getVisibleSheets(workbook).length;
              return (
                <div key={workbook.id} className={`flex items-start gap-2 rounded-md px-2 py-2 ${selectedId === workbook.id ? "bg-accent" : "hover:bg-accent/60"}`}>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setSelectedId(workbook.id); setActiveSheet(0); }}>
                    <span className="block truncate text-sm font-medium">{workbook.filename}</span>
                    <span className="block text-xs text-muted-foreground">{visibleSheetCount} sheet{visibleSheetCount === 1 ? "" : "s"} · {new Date(workbook.upload_date).toLocaleDateString()}</span>
                  </button>
                  <a href={API_ENDPOINTS.releaseNoteFile(workbook.id)} target="_blank" rel="noreferrer" className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Download"><Download className="h-3.5 w-3.5" /></a>
                  <button type="button" className="rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(workbook)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}</div>
          )}
        </aside>

        <section className="flex min-w-0 flex-col">
          {selected && <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
            <div className="min-w-0"><h3 className="truncate text-sm font-semibold">{selected.filename}</h3><p className="text-xs text-muted-foreground">{(selected.size / 1024).toFixed(1)} KB</p></div>
            <Tabs value={String(activeSheet)} onValueChange={(value) => setActiveSheet(Number(value))}><TabsList className="max-w-[640px] overflow-x-auto">{selectedVisibleSheets.map((sheet, index) => <TabsTrigger key={`${sheet.name}-${sheet.sourceIndex}`} value={String(index)}>{sheet.name}</TabsTrigger>)}</TabsList></Tabs>
          </div>}
          <ReleaseNotesWorkbookViewer sheet={sheet} loading={loadingSheet} error={error} />
        </section>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete release notes?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “{deleteTarget?.filename ?? ""}” from backend storage. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void deleteWorkbook();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
