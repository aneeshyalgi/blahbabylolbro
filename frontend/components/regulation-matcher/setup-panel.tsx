"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check, FileSpreadsheet, FileText, Loader2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { PANEL, RegulationChip } from "./atoms";
import type { Sources } from "./types";

type SetupPanelProps = {
  sources: Sources | null;
  loading: boolean;
  selectedFiles: string[];
  selectedRegulations: string[];
  onToggleFile: (id: string) => void;
  onToggleRegulation: (id: string) => void;
  onSelectAllFiles: (ids: string[]) => void;
  onSelectAllRegulations: (ids: string[]) => void;
  onStart: () => void;
  starting: boolean;
  locale: string;
};

type StepState = "done" | "current" | "waiting";

function StepNumber({ value, state }: { value: number; state: StepState }) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold transition-colors",
        state === "done" ? "border-[#f5c400] bg-[#f5c400] text-[#0b0f15]" : state === "current" ? "border-[#f5c400]/50 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#2c3440] text-[#5d6878]",
      )}
    >
      {state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : value}
    </span>
  );
}

/** One setup step: number, title, hint, an optional action and its list. Both steps have the same height, so the start bar never moves. */
function StepPanel({ tourId, step, state, title, hint, action, children }: { tourId: string; step: number; state: StepState; title: string; hint: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section data-tour={tourId} className={cn(PANEL, "flex h-[340px] flex-col overflow-hidden transition-colors", state === "current" && "border-[#f5c400]/35 shadow-[0_0_0_1px_rgba(245,196,0,0.08)]")}>
      <header className="flex items-start gap-3 border-b border-[#1f252e] px-4 py-3">
        <StepNumber value={step} state={state} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-[13.5px] font-semibold", state === "waiting" ? "text-[#aab3c2]" : "text-white")}>{title}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-[#8c96a8]" title={hint}>
            {hint}
          </p>
        </div>
        {action}
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{children}</div>
    </section>
  );
}

function SelectBox({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
        checked ? "border-[#f5c400] bg-[#f5c400] text-[#0b0f15]" : "border-[#3a4350] bg-[#0b0f15]",
        disabled && "opacity-40",
      )}
    >
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  );
}

export function SetupPanel(props: SetupPanelProps) {
  const t = useTranslations("matcher.setup");
  const tFocus = useTranslations("matcher.focus");
  const { sources, loading, selectedFiles, selectedRegulations } = props;
  const files = sources?.release_note_files ?? [];
  const regulations = sources?.regulations ?? [];
  const readyRegulations = regulations.filter((item) => item.status === "ready");
  const noteCount = files.filter((file) => selectedFiles.includes(file.id)).reduce((sum, file) => sum + file.notes, 0);
  const chosenRegulations = regulations.filter((item) => selectedRegulations.includes(item.id));
  const articleCount = chosenRegulations.reduce((sum, item) => sum + (item.articles ?? 0), 0);
  const filesDone = selectedFiles.length > 0 && noteCount > 0;
  const regulationsDone = selectedRegulations.length > 0;
  const ready = filesDone && regulationsDone;
  const canStart = ready && !props.starting;
  const missing = [!filesDone && tFocus("chooseNotes"), !regulationsDone && tFocus("chooseRegulations")].filter(Boolean) as string[];
  const selectAll = (allSelected: boolean, onClick: () => void) => (
    <button type="button" className="shrink-0 pt-0.5 text-xs font-medium text-[#f5c400] hover:underline" onClick={onClick}>
      {allSelected ? t("clear") : t("selectAll")}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <StepPanel
          tourId="matcher-release-notes"
          step={1}
          state={filesDone ? "done" : "current"}
          title={t("releaseNotes")}
          hint={t("releaseNotesHint")}
          action={files.length > 1 ? selectAll(selectedFiles.length === files.length, () => props.onSelectAllFiles(selectedFiles.length === files.length ? [] : files.map((file) => file.id))) : undefined}
        >
          {loading && !sources ? (
            <SkeletonRows />
          ) : files.length === 0 ? (
            <EmptyHint text={t("noReleaseNotes")} />
          ) : (
            files.map((file) => {
              const checked = selectedFiles.includes(file.id);
              const Icon = file.kind === "pdf" ? FileText : FileSpreadsheet;
              const ids = Array.from(new Set(file.jira_ids));
              return (
                <button
                  key={file.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => props.onToggleFile(file.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-all",
                    checked ? "border-[#f5c400]/40 bg-[#f5c400]/[0.06]" : "border-[#1f252e] bg-[#0f141b] hover:border-[#2c3440]",
                  )}
                >
                  <SelectBox checked={checked} />
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#8c96a8]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#f2f4f7]">{file.filename}</span>
                    <span className="mt-0.5 block text-xs text-[#8c96a8]">
                      {t("notesCount", { count: file.notes })} · {file.kind === "pdf" ? "PDF" : "Excel"}
                    </span>
                    {ids.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {ids.slice(0, 6).map((jira) => (
                          <span key={jira} className="rounded border border-[#252a33] bg-[#0b0f15] px-1.5 py-px font-mono text-[10px] text-[#aab3c2]">
                            {jira}
                          </span>
                        ))}
                        {ids.length > 6 && <span className="px-1 text-[10px] text-[#687386]">+{ids.length - 6}</span>}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </StepPanel>

        <StepPanel
          tourId="matcher-regulations"
          step={2}
          state={regulationsDone ? "done" : filesDone ? "current" : "waiting"}
          title={t("regulations")}
          hint={t("regulationsHint")}
          action={
            readyRegulations.length > 1
              ? selectAll(selectedRegulations.length === readyRegulations.length, () =>
                  props.onSelectAllRegulations(selectedRegulations.length === readyRegulations.length ? [] : readyRegulations.map((item) => item.id)),
                )
              : undefined
          }
        >
          {loading && !sources ? (
            <SkeletonRows />
          ) : regulations.length === 0 ? (
            <EmptyHint text={t("noRegulations")} />
          ) : (
            regulations.map((regulation) => {
              const usable = regulation.status === "ready";
              const checked = selectedRegulations.includes(regulation.id);
              return (
                <button
                  key={regulation.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={!usable}
                  onClick={() => props.onToggleRegulation(regulation.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-all",
                    checked ? "border-[#f5c400]/40 bg-[#f5c400]/[0.06]" : "border-[#1f252e] bg-[#0f141b] hover:border-[#2c3440]",
                    !usable && "cursor-not-allowed opacity-60 hover:border-[#1f252e]",
                  )}
                >
                  <SelectBox checked={checked} disabled={!usable} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <RegulationChip name={regulation.short} />
                      <span className="truncate text-sm font-medium text-[#f2f4f7]">{regulation.filename}</span>
                    </span>
                    {regulation.title && <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#8c96a8]">{regulation.title}</span>}
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#aab3c2]">
                      {regulation.articles != null && <span>{t("articles", { count: regulation.articles })}</span>}
                      {regulation.pages != null && <span>{t("pages", { count: regulation.pages })}</span>}
                      {!usable && (
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-px text-[10px] font-medium",
                            regulation.status === "failed" ? "border-rose-400/30 bg-rose-400/10 text-rose-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300",
                          )}
                        >
                          {regulation.status === "failed" ? t("statusFailed") : t("statusIndexing")}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </StepPanel>
      </div>

      <section
        data-tour="matcher-run-bar"
        className="flex flex-wrap items-center gap-4 rounded-xl border border-[#f5c400]/25 bg-[linear-gradient(110deg,rgba(245,196,0,0.09),rgba(11,15,21,1)_45%)] px-5 py-4"
      >
        <Play className="h-5 w-5 shrink-0 text-[#f5c400]" />
        <div className="min-w-0 flex-1">
          {ready ? (
            <>
              <p className="truncate text-[13.5px] font-semibold text-white">
                {tFocus("readyLine", { notes: noteCount, regulations: chosenRegulations.map((item) => item.short).join(", ") })}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-[#aab3c2]">
                {t("articles", { count: articleCount })} · {tFocus("readyHint")}
              </p>
            </>
          ) : (
            <>
              <p className="text-[13.5px] font-semibold text-white">{tFocus("setUp")}</p>
              <p className="mt-0.5 text-[12px] text-[#8c96a8]">{tFocus("stillToChoose", { items: missing.join(", ") })}</p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={props.onStart}
          disabled={!canStart}
          className="flex items-center gap-2 rounded-md bg-[#f5c400] px-5 py-2.5 text-[13px] font-semibold text-[#0b0f15] shadow-[0_0_24px_rgba(245,196,0,0.25)] transition-colors hover:bg-[#ffd633] disabled:cursor-not-allowed disabled:bg-[#3a3a2a] disabled:text-[#8c8a70] disabled:shadow-none"
        >
          {props.starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
          {t("run")}
        </button>
      </section>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1].map((item) => (
        <div key={item} className="h-[64px] animate-pulse rounded-md border border-[#1f252e] bg-[#0f141b]" />
      ))}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center rounded-md border border-dashed border-[#2c3440] px-4 py-8 text-center text-sm text-[#8c96a8]">{text}</div>;
}
