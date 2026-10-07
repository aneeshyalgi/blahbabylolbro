"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, RefreshCw, RotateCcw, Sparkles, Trash2, Upload } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS } from "@/lib/api-config";
import { readJsonResponse, uploadInChunks } from "@/lib/chunked-upload";
import { cn } from "@/lib/utils";
import { RegulationIndexingDialog, type RegulationUpload } from "@/components/regulation-indexing-dialog";

export type RegulationDocument = {
  id: string;
  filename: string;
  size: number;
  upload_date: string;
  page_count: number;
  index_status?: "indexing" | "ready" | "failed";
  index_error?: string;
  document_title?: string;
  article_count?: number;
  annex_count?: number;
  table_count?: number;
  passage_count?: number;
  has_text?: boolean;
  semantic?: { model: string; dimensions: number } | null;
  quality?: RegulationIndexQuality;
  index_progress?: { stage: "queued" | "reading" | "structure" | "embedding"; done: number; total: number };
};

type RegulationIndexQuality = {
  first_article?: string | null;
  last_article?: string | null;
  article_number_gap_count?: number;
  pages_without_text?: number;
  pages_read_in_plain_mode?: number[];
  footnotes?: number;
  tables?: number;
  formula_passages?: number;
  warnings?: string[];
};

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Uploaded regulation PDFs: upload, view, download and delete. Agents search them by article and page. */
export function RegulationDocumentsSection() {
  const t = useTranslations("regulations");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [documents, setDocuments] = useState<RegulationDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadName, setUploadName] = useState<string | null>(null);
  // The document the blocking progress window follows until it is ready (or failed) and acknowledged.
  const [trackedId, setTrackedId] = useState<string | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RegulationDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = documents.find((document) => document.id === selectedId) ?? null;
  const indexing = documents.some((document) => document.index_status === "indexing");
  const tracked = documents.find((document) => document.id === trackedId) ?? null;
  const waiting = documents.filter((document) => document.index_status === "indexing" && document.id !== trackedId).length;

  const fetchDocuments = useCallback(async (preferredId?: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const payload = await readJsonResponse<{ documents: RegulationDocument[] }>(
        await fetch(API_ENDPOINTS.regulationDocuments),
        t("loadFailed"),
      );
      setDocuments(payload.documents);
      setPollFailed(false);
      setSelectedId((current) => {
        const wanted = preferredId ?? current;
        return wanted && payload.documents.some((document) => document.id === wanted) ? wanted : payload.documents[0]?.id ?? null;
      });
    } catch (error) {
      setPollFailed(true);
      if (!quiet) toast({ title: t("loadFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  // Indexing runs in the background after an upload; refresh until every document is ready.
  useEffect(() => {
    if (!indexing) return;
    const timer = window.setInterval(() => void fetchDocuments(undefined, true), 1500);
    return () => window.clearInterval(timer);
  }, [indexing, fetchDocuments]);

  // Any document still being indexed (e.g. after a reload or a server restart) opens the progress window.
  useEffect(() => {
    if (trackedId && !documents.some((document) => document.id === trackedId)) setTrackedId(null);
    if (!trackedId && !uploading) {
      const next = documents.find((document) => document.index_status === "indexing");
      if (next) setTrackedId(next.id);
    }
  }, [documents, trackedId, uploading]);

  // Closing the tab during an upload would abort it.
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const upload = async (file: File) => {
    const reset = () => {
      if (inputRef.current) inputRef.current.value = "";
    };
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: t("uploadFailed"), description: t("onlyPdf"), variant: "destructive" });
      reset();
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({ title: t("uploadFailed"), description: t("tooLarge"), variant: "destructive" });
      reset();
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setUploadName(file.name);
    try {
      const created = await uploadInChunks<RegulationDocument>(file, API_ENDPOINTS.regulationDocumentsFromUpload, {
        onProgress: setUploadProgress,
        fallbackError: t("uploadFailed"),
      });
      setTrackedId(created.id);
      setDocuments((current) => [created, ...current.filter((document) => document.id !== created.id)]);
      setSelectedId(created.id);
      void fetchDocuments(created.id, true);
    } catch (error) {
      toast({ title: t("uploadFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadName(null);
      reset();
    }
  };

  const reindex = async (document: RegulationDocument) => {
    try {
      await readJsonResponse(await fetch(API_ENDPOINTS.regulationReindex(document.id), { method: "POST" }), t("reindexFailed"));
      setTrackedId(document.id);
      await fetchDocuments(document.id, true);
    } catch (error) {
      toast({ title: t("reindexFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await readJsonResponse(await fetch(API_ENDPOINTS.regulationDocument(deleteTarget.id), { method: "DELETE" }), t("deleteFailed"));
      setDeleteTarget(null);
      await fetchDocuments(undefined, true);
      toast({ title: t("deleteSuccess") });
    } catch (error) {
      toast({ title: t("deleteFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const status = (document: RegulationDocument) => {
    if (document.index_status === "indexing") {
      return <span className="inline-flex items-center gap-1 text-amber-400"><Loader2 className="h-3 w-3 animate-spin" />{t("statusIndexing")}</span>;
    }
    if (document.index_status === "failed") {
      return <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" />{t("statusFailed")}</span>;
    }
    if (document.has_text === false) {
      return <span className="inline-flex items-center gap-1 text-amber-400"><AlertTriangle className="h-3 w-3" />{t("statusNoText")}</span>;
    }
    if (!document.article_count && !document.annex_count) return <span>{t("statusNoArticles")}</span>;
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        {t("statusReadyDetail", { articles: document.article_count ?? 0, annexes: document.annex_count ?? 0 })}
      </span>
    );
  };

  // What the index captured, so users can judge how well agents will be able to read the PDF.
  const report = (document: RegulationDocument) => {
    if (document.index_status === "indexing") return null;
    if (document.index_status === "failed") {
      return (
        <p className="flex items-center gap-1.5 text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {t("failedDetail", { error: document.index_error ?? "" })}
        </p>
      );
    }
    const quality = document.quality ?? {};
    const facts = [
      quality.first_article && quality.last_article ? t("reportArticles", { first: quality.first_article, last: quality.last_article }) : null,
      quality.tables ? t("reportTables", { count: quality.tables }) : null,
      quality.footnotes ? t("reportFootnotes", { count: quality.footnotes }) : null,
      quality.article_number_gap_count ? t("reportAbsent", { count: quality.article_number_gap_count }) : null,
      quality.pages_read_in_plain_mode?.length ? t("reportPlainPages", { count: quality.pages_read_in_plain_mode.length }) : null,
      quality.formula_passages ? t("reportFormulas", { count: quality.formula_passages }) : null,
    ].filter(Boolean);
    const warnings = (quality.warnings ?? []).map((warning) =>
      warning === "scanned_pages" ? t("warningScanned", { count: quality.pages_without_text ?? 0 })
        : warning === "no_structure" ? t("warningNoStructure")
          : warning === "truncated" ? t("warningTruncated") : null,
    ).filter(Boolean);
    return (
      <>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {document.semantic ? (
            <span className="inline-flex items-center gap-1 text-emerald-500"><Sparkles className="h-3.5 w-3.5" />{t("semanticOn")}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-500" title={t("semanticOffHint")}><AlertTriangle className="h-3.5 w-3.5" />{t("semanticOff")}</span>
          )}
          {facts.map((fact) => <span key={fact}>{fact}</span>)}
        </div>
        {warnings.map((warning) => (
          <p key={warning} className="mt-1 flex items-center gap-1.5 text-amber-500"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{warning}</p>
        ))}
      </>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t("uploadedTitle")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("uploadedDescription")}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])}
            />
            <Button variant="outline" size="icon" onClick={() => void fetchDocuments()} aria-label={t("refresh")} title={t("refresh")}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {uploading ? t("uploadingPercent", { percent: Math.round(uploadProgress * 100) }) : t("uploadPdf")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid min-h-[560px] grid-cols-[300px_minmax(0,1fr)] overflow-hidden rounded-md border">
          <aside className="border-r bg-muted/20 p-3">
            {loading && !documents.length ? (
              <div className="px-2 py-8 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{tCommon("loading")}</div>
            ) : !documents.length ? (
              <div className="px-2 py-10 text-center text-sm text-muted-foreground">
                <FileText className="mx-auto mb-2 h-8 w-8" />
                <p className="font-medium text-foreground">{t("noUploaded")}</p>
                <p className="mt-1 text-xs">{t("noUploadedHint")}</p>
              </div>
            ) : (
              <div className="space-y-1">
                {documents.map((document) => (
                  <div
                    key={document.id}
                    className={cn("flex items-start gap-2 rounded-md px-2 py-2", selectedId === document.id ? "bg-accent" : "hover:bg-accent/60")}
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(document.id)}>
                      <span className="block truncate text-sm font-medium">{document.filename}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t("pages", { count: document.page_count })} · {new Date(document.upload_date).toLocaleDateString()}
                      </span>
                      <span className="mt-0.5 block text-[11px]">{status(document)}</span>
                    </button>
                    <a
                      href={API_ENDPOINTS.regulationDocumentFile(document.id)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={t("downloadPdf")}
                      title={t("downloadPdf")}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(document)}
                      aria-label={t("deletePdf")}
                      title={t("deletePdf")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </aside>
          <section className="flex min-w-0 flex-col">
            {selected ? (
              <div className="flex items-start justify-between gap-3 border-b bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
                <div className="min-w-0">
                  {selected.document_title ? <p className="mb-1 truncate font-medium text-foreground" title={selected.document_title}>{selected.document_title}</p> : null}
                  {report(selected)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 text-xs"
                  disabled={selected.index_status === "indexing"}
                  onClick={() => void reindex(selected)}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  {t("reindex")}
                </Button>
              </div>
            ) : null}
            {selected ? (
              <iframe
                key={selected.id}
                src={API_ENDPOINTS.regulationDocumentView(selected.id)}
                title={selected.filename}
                className="min-h-[560px] w-full flex-1 border-0 bg-white"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
                <FileText className="mb-3 h-10 w-10" />
                <p className="text-sm">{t("selectDocument")}</p>
              </div>
            )}
          </section>
        </div>
      </CardContent>

      <RegulationIndexingDialog
        upload={uploading && uploadName ? ({ filename: uploadName, progress: uploadProgress } satisfies RegulationUpload) : null}
        document={uploading ? null : tracked}
        waiting={waiting}
        pollFailed={pollFailed}
        onReindex={(document) => void reindex(document)}
        onClose={() => setTrackedId(null)}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteWarning", { name: deleteTarget?.filename ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t("deleting") : t("deletePdf")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
