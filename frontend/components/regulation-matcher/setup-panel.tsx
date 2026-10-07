"use client";

import { useTranslations } from "next-intl";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  FileSpreadsheet,
  FileText,
  Gavel,
  Loader2,
  Play,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PANEL, RegulationChip, SectionLabel, formatNumber } from "./atoms";
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
  const { sources, loading, selectedFiles, selectedRegulations, locale } = props;
  const files = sources?.release_note_files ?? [];
  const regulations = sources?.regulations ?? [];
  const readyRegulations = regulations.filter((item) => item.status === "ready");
  const noteCount = files.filter((file) => selectedFiles.includes(file.id)).reduce((sum, file) => sum + file.notes, 0);
  const articleCount = regulations.filter((item) => selectedRegulations.includes(item.id)).reduce((sum, item) => sum + (item.articles ?? 0), 0);
  const canStart = selectedFiles.length > 0 && selectedRegulations.length > 0 && noteCount > 0 && !props.starting;

  const steps = [
    { key: "interpret", icon: Sparkles },
    { key: "retrieve", icon: ScanSearch },
    { key: "adjudicate", icon: Gavel },
    { key: "verify", icon: ShieldCheck },
    { key: "review", icon: UserCheck },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <section data-tour="matcher-release-notes" className={cn(PANEL, "flex flex-col")}>
          <header className="flex items-center justify-between gap-3 border-b border-[#1f252e] px-5 py-4">
            <div>
              <SectionLabel icon={<FileSpreadsheet className="h-3.5 w-3.5 text-[#f5c400]" />}>{t("releaseNotes")}</SectionLabel>
              <p className="mt-1 text-xs text-[#8c96a8]">{t("releaseNotesHint")}</p>
            </div>
            {files.length > 1 && (
              <button type="button" className="text-xs font-medium text-[#f5c400] hover:underline" onClick={() => props.onSelectAllFiles(selectedFiles.length === files.length ? [] : files.map((file) => file.id))}>
                {selectedFiles.length === files.length ? t("clear") : t("selectAll")}
              </button>
            )}
          </header>
          <div className="flex-1 space-y-2 p-4">
            {loading && !sources ? (
              <SkeletonRows />
            ) : files.length === 0 ? (
              <EmptyHint text={t("noReleaseNotes")} />
            ) : (
              files.map((file) => {
                const checked = selectedFiles.includes(file.id);
                const Icon = file.kind === "pdf" ? FileText : FileSpreadsheet;
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => props.onToggleFile(file.id)}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-md border px-3.5 py-3 text-left transition-all",
                      checked ? "border-[#f5c400]/40 bg-[#f5c400]/[0.06] shadow-[inset_0_0_0_1px_rgba(245,196,0,0.08)]" : "border-[#1f252e] bg-[#0f141b] hover:border-[#2c3440]",
                    )}
                  >
                    <SelectBox checked={checked} />
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#8c96a8]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[#f2f4f7]">{file.filename}</span>
                      <span className="mt-0.5 block text-xs text-[#8c96a8]">
                        {t("notesCount", { count: file.notes })} · {file.kind === "pdf" ? "PDF" : "Excel"}
                      </span>
                      {file.jira_ids.length > 0 && (
                        <span className="mt-2 flex flex-wrap gap-1">
                          {file.jira_ids.slice(0, 8).map((jira) => (
                            <span key={jira} className="rounded border border-[#252a33] bg-[#0b0f15] px-1.5 py-px font-mono text-[10px] text-[#aab3c2]">
                              {jira}
                            </span>
                          ))}
                          {file.notes > 8 && <span className="px-1 text-[10px] text-[#687386]">+{file.notes - 8}</span>}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section data-tour="matcher-regulations" className={cn(PANEL, "flex flex-col")}>
          <header className="flex items-center justify-between gap-3 border-b border-[#1f252e] px-5 py-4">
            <div>
              <SectionLabel icon={<BookOpenCheck className="h-3.5 w-3.5 text-[#f5c400]" />}>{t("regulations")}</SectionLabel>
              <p className="mt-1 text-xs text-[#8c96a8]">{t("regulationsHint")}</p>
            </div>
            {readyRegulations.length > 1 && (
              <button
                type="button"
                className="text-xs font-medium text-[#f5c400] hover:underline"
                onClick={() => props.onSelectAllRegulations(selectedRegulations.length === readyRegulations.length ? [] : readyRegulations.map((item) => item.id))}
              >
                {selectedRegulations.length === readyRegulations.length ? t("clear") : t("selectAll")}
              </button>
            )}
          </header>
          <div className="flex-1 space-y-2 p-4">
            {loading && !sources ? (
              <SkeletonRows />
            ) : regulations.length === 0 ? (
              <EmptyHint text={t("noRegulations")} />
            ) : (
              regulations.map((regulation) => {
                const ready = regulation.status === "ready";
                const checked = selectedRegulations.includes(regulation.id);
                return (
                  <button
                    key={regulation.id}
                    type="button"
                    disabled={!ready}
                    onClick={() => props.onToggleRegulation(regulation.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-md border px-3.5 py-3 text-left transition-all",
                      checked ? "border-[#f5c400]/40 bg-[#f5c400]/[0.06]" : "border-[#1f252e] bg-[#0f141b] hover:border-[#2c3440]",
                      !ready && "cursor-not-allowed opacity-60 hover:border-[#1f252e]",
                    )}
                  >
                    <SelectBox checked={checked} disabled={!ready} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <RegulationChip name={regulation.short} />
                        <span className="truncate text-sm font-medium text-[#f2f4f7]">{regulation.filename}</span>
                      </span>
                      {regulation.title && <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#8c96a8]">{regulation.title}</span>}
                      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#aab3c2]">
                        {regulation.articles != null && <span>{t("articles", { count: regulation.articles })}</span>}
                        {regulation.pages != null && <span>{t("pages", { count: regulation.pages })}</span>}
                        {regulation.passages != null && <span>{t("passages", { count: formatNumber(regulation.passages, locale) })}</span>}
                        <span className={cn("rounded-full border px-1.5 py-px text-[10px] font-medium", regulation.semantic ? "border-violet-400/30 bg-violet-400/10 text-violet-300" : "border-[#2c3440] text-[#8c96a8]")}>
                          {regulation.semantic ? t("semantic") : t("keywordOnly")}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-px text-[10px] font-medium",
                            ready ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : regulation.status === "failed" ? "border-rose-400/30 bg-rose-400/10 text-rose-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300",
                          )}
                        >
                          {ready ? t("statusReady") : regulation.status === "failed" ? t("statusFailed") : t("statusIndexing")}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section className={cn(PANEL, "overflow-hidden")}>
        <div data-tour="matcher-method" className="grid gap-px bg-[#1a2028] md:grid-cols-5">
          {steps.map(({ key, icon: Icon }, index) => (
            <div key={key} className="relative bg-[#0b0f15] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#f5c400]/25 bg-[#f5c400]/10 text-[#f5c400]">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="font-mono text-[10px] text-[#687386]">0{index + 1}</span>
                <span className="text-sm font-semibold text-[#f2f4f7]">{t(`steps.${key}.title`)}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#8c96a8]">{t(`steps.${key}.body`)}</p>
              {index < steps.length - 1 && <ArrowRight className="absolute right-[-9px] top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-[#3a4350] md:block" />}
            </div>
          ))}
        </div>
        <div data-tour="matcher-run-bar" className="flex flex-wrap items-center justify-between gap-4 border-t border-[#1f252e] bg-[linear-gradient(90deg,rgba(245,196,0,0.06),transparent_60%)] px-5 py-4">
          <div className="space-y-1">
            <p className="text-sm text-[#f2f4f7]">
              {noteCount > 0 && selectedRegulations.length > 0
                ? t("scope", { notes: noteCount, regulations: selectedRegulations.length, articles: formatNumber(articleCount, locale) })
                : t("selectBoth")}
            </p>
            {sources?.model && (
              <p className="flex items-center gap-1.5 text-[11px] text-[#687386]">
                <span className="rounded border border-[#252a33] bg-[#11161e] px-1.5 py-px font-mono text-[10px] text-[#aab3c2]">{sources.model}</span>
                {t("modelHint")}
              </p>
            )}
          </div>
          <Button
            size="lg"
            onClick={props.onStart}
            disabled={!canStart}
            className="h-11 gap-2 bg-[#f5c400] px-6 text-sm font-semibold text-[#0b0f15] shadow-[0_8px_24px_rgba(245,196,0,0.18)] hover:bg-[#ffd21f] disabled:bg-[#2c3440] disabled:text-[#687386] disabled:shadow-none"
          >
            {props.starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
            {t("run")}
          </Button>
        </div>
      </section>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1].map((item) => (
        <div key={item} className="h-[68px] animate-pulse rounded-md border border-[#1f252e] bg-[#0f141b]" />
      ))}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-[#2c3440] px-4 py-8 text-center text-sm text-[#8c96a8]">{text}</div>;
}
