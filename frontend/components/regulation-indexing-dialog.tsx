"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, CheckCircle2, Circle, Loader2, MinusCircle, RotateCcw, Sparkles, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { RegulationDocument } from "@/components/regulation-documents-section";

export type RegulationUpload = { filename: string; progress: number };

type StepState = "pending" | "active" | "done" | "skipped";

// Share of the overall bar per stage: reading the pages dominates, embedding follows.
const STAGE_RANGE: Record<string, [number, number]> = {
  queued: [0, 0],
  reading: [2, 75],
  structure: [75, 80],
  embedding: [80, 99],
};
const STAGE_ORDER = ["queued", "reading", "structure", "embedding"];
const STALE_AFTER_MS = 3 * 60 * 1000;

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Blocking progress window for a regulation that is being uploaded or indexed. It cannot be dismissed
 * while work is running (no close button, Escape and outside clicks are ignored); it becomes closable
 * once the document is ready or indexing failed.
 */
export function RegulationIndexingDialog({
  upload,
  document,
  waiting,
  pollFailed,
  onReindex,
  onClose,
}: {
  upload: RegulationUpload | null;
  document: RegulationDocument | null;
  waiting: number;
  pollFailed: boolean;
  onReindex: (document: RegulationDocument) => void;
  onClose: () => void;
}) {
  const t = useTranslations("regulations");
  const open = Boolean(upload || document);
  const indexing = !upload && document?.index_status === "indexing";
  const ready = !upload && document?.index_status === "ready";
  const failed = !upload && document?.index_status === "failed";
  const progress = document?.index_progress;
  const stage = upload ? "upload" : indexing ? progress?.stage ?? "queued" : ready ? "ready" : "failed";

  // Elapsed time since the window opened, and when progress last moved (to spot a stalled server).
  const [now, setNow] = useState(() => Date.now());
  const openedAt = useRef(Date.now());
  const lastMove = useRef({ signature: "", at: Date.now() });
  useEffect(() => {
    if (open) openedAt.current = Date.now();
  }, [open, document?.id]);
  useEffect(() => {
    if (!open || ready || failed) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, ready, failed]);
  const signature = `${document?.id}:${stage}:${progress?.done ?? 0}:${upload?.progress ?? 0}`;
  useEffect(() => {
    lastMove.current = { signature, at: Date.now() };
  }, [signature]);
  const stale = indexing && now - lastMove.current.at > STALE_AFTER_MS;

  let percent = 0;
  if (upload) percent = Math.round(upload.progress * 100);
  else if (ready) percent = 100;
  else if (indexing) {
    const [from, to] = STAGE_RANGE[stage] ?? [0, 0];
    const fraction = progress && progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
    percent = Math.round(from + (to - from) * fraction);
  }

  const position = STAGE_ORDER.indexOf(stage);
  const stepState = (step: string): StepState => {
    if (upload) return "pending";
    if (ready) return step === "embedding" && !document?.semantic ? "skipped" : "done";
    if (failed) return "pending";
    const index = STAGE_ORDER.indexOf(step);
    if (index < position) return "done";
    return index === position ? "active" : "pending";
  };
  const detail = (step: string) => {
    if (stepState(step) !== "active" || !progress?.total) return null;
    if (step === "reading") return t("progressPages", { done: Math.min(progress.done + 1, progress.total), total: progress.total });
    if (step === "embedding") return t("progressPassages", { done: progress.done, total: progress.total });
    return null;
  };

  const steps: { key: string; label: string; state: StepState; detail?: string | null }[] = [
    ...(upload ? [{ key: "upload", label: t("stepUpload"), state: "active" as StepState, detail: t("progressUpload", { percent }) }] : []),
    { key: "reading", label: t("stepRead"), state: stepState("reading"), detail: detail("reading") },
    { key: "structure", label: t("stepStructure"), state: stepState("structure") },
    {
      key: "embedding",
      label: t("stepEmbed"),
      state: stepState("embedding"),
      detail: stepState("embedding") === "skipped" ? t("skippedSemantic") : detail("embedding"),
    },
    { key: "ready", label: t("stepReady"), state: ready ? "done" : "pending" },
  ];

  const name = upload?.filename ?? document?.filename ?? "";
  const quality = document?.quality;

  return (
    <AlertDialog open={open} onOpenChange={() => undefined}>
      <AlertDialogContent className="sm:max-w-lg" onEscapeKeyDown={(event) => event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {ready ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : failed ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <Loader2 className="h-5 w-5 animate-spin text-amber-500" />}
            <span className="min-w-0 truncate">
              {ready ? t("doneTitle", { name }) : failed ? t("failedTitle") : t("indexDialogTitle", { name })}
            </span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            {ready ? t("doneDescription") : failed ? t("failedDetail", { error: document?.index_error ?? "" }) : t("indexDialogDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!failed ? (
          <div className="space-y-4">
            <div>
              <Progress value={percent} className="h-2" />
              <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                <span>{percent} %</span>
                {!ready ? <span>{t("elapsed", { time: formatElapsed(now - openedAt.current) })}</span> : null}
              </div>
            </div>

            <ol className="space-y-2.5">
              {steps.map((step) => (
                <li key={step.key} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 shrink-0">
                    {step.state === "done" ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : step.state === "active" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                    ) : step.state === "skipped" ? (
                      <MinusCircle className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className={cn(step.state === "pending" ? "text-muted-foreground" : "text-foreground", step.state === "active" && "font-medium")}>
                      {step.label}
                    </span>
                    {step.detail ? <span className="block text-xs text-muted-foreground">{step.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ol>

            {indexing && stage === "queued" ? <p className="text-xs text-muted-foreground">{t("waitingQueue")}</p> : null}
            {waiting > 0 && !ready ? <p className="text-xs text-muted-foreground">{t("queuedMore", { count: waiting })}</p> : null}
            {pollFailed && !ready ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-500"><WifiOff className="h-3.5 w-3.5" />{t("connectionLost")}</p>
            ) : null}
            {stale ? <p className="flex items-center gap-1.5 text-xs text-amber-500"><AlertTriangle className="h-3.5 w-3.5" />{t("stale")}</p> : null}

            {ready ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  {t("statusReadyDetail", { articles: document?.article_count ?? 0, annexes: document?.annex_count ?? 0 })}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3">
                  {document?.semantic ? <span className="inline-flex items-center gap-1 text-emerald-500"><Sparkles className="h-3 w-3" />{t("semanticOn")}</span> : <span>{t("semanticOff")}</span>}
                  {quality?.tables ? <span>{t("reportTables", { count: quality.tables })}</span> : null}
                  {quality?.first_article && quality?.last_article ? <span>{t("reportArticles", { first: quality.first_article, last: quality.last_article })}</span> : null}
                </p>
              </div>
            ) : null}
            {!ready ? <p className="text-xs text-muted-foreground">{t("indexDialogKeepOpen")}</p> : null}
          </div>
        ) : null}

        {ready || failed || stale ? (
          <AlertDialogFooter>
            {(failed || stale) && document ? (
              <Button variant="outline" onClick={() => onReindex(document)}>
                <RotateCcw className="mr-2 h-4 w-4" />
                {t("reindex")}
              </Button>
            ) : null}
            {ready || failed ? <Button onClick={onClose}>{ready ? t("doneButton") : t("close")}</Button> : null}
          </AlertDialogFooter>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
