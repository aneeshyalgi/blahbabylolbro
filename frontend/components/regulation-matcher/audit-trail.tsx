"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ClipboardCopy, FileSpreadsheet, Fingerprint, ScrollText, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PANEL, RegulationChip, SectionLabel, formatDateTime, formatDuration, formatNumber } from "./atoms";
import { textLanguages } from "./localize";
import { LogConsole } from "./run-progress";
import type { LogEntry, Run } from "./types";

const CONTROLS = ["closedSet", "verbatim", "scope", "substantive", "concept", "references", "selfCorrection", "fourEyes", "noForcing"] as const;

export function AuditTrail({ run, locale }: { run: Run; locale: string }) {
  const t = useTranslations("matcher.audit");
  const [level, setLevel] = useState<LogEntry["level"] | "all">("all");
  const [copied, setCopied] = useState(false);
  const entries = level === "all" ? run.log : run.log.filter((entry) => entry.level === level);
  const levels: (LogEntry["level"] | "all")[] = ["all", "info", "success", "warn", "error"];

  const rows: [string, string][] = [
    [t("status"), t(`statuses.${run.status}`)],
    [t("started"), formatDateTime(run.created_at, locale)],
    [t("finished"), formatDateTime(run.finished_at, locale)],
    [t("duration"), formatDuration(run.duration_ms)],
    [t("model"), run.model ?? "–"],
    [t("language"), textLanguages(run).map((language) => language.toUpperCase()).join(" · ")],
    [t("llmCalls"), formatNumber(run.usage.llm_calls, locale)],
    [t("tokens"), `${formatNumber(run.usage.prompt_tokens, locale)} / ${formatNumber(run.usage.completion_tokens, locale)}`],
  ];

  return (
    <div data-tour="matcher-audit-view" className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-5">
        <section className={cn(PANEL, "px-5 py-4")}>
          <SectionLabel icon={<Fingerprint className="h-3.5 w-3.5 text-[#f5c400]" />}>{t("run")}</SectionLabel>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-[#1f252e] bg-[#0f141b] px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-[#c9d1dd]">{run.id}</span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(run.id);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 text-[11px] text-[#8c96a8] hover:text-[#f5c400]"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
              {copied ? t("copied") : t("copy")}
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-[#687386]">{label}</dt>
                <dd className="font-mono text-xs text-[#e5e9f0]">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={cn(PANEL, "px-5 py-4")}>
          <SectionLabel icon={<FileSpreadsheet className="h-3.5 w-3.5 text-[#f5c400]" />}>{t("sources")}</SectionLabel>
          <ul className="mt-3 space-y-2">
            {run.release_note_files.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-[#e5e9f0]">{file.filename}</span>
                <span className="shrink-0 text-[#687386]">{t("notes", { count: file.notes })}</span>
              </li>
            ))}
            {run.regulations.map((regulation) => (
              <li key={regulation.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <RegulationChip name={regulation.short} />
                  <span className="truncate text-[#e5e9f0]">{regulation.filename}</span>
                </span>
                {regulation.articles != null && <span className="shrink-0 text-[#687386]">{t("articles", { count: regulation.articles })}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className={cn(PANEL, "px-5 py-4")}>
          <SectionLabel icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />}>{t("controls")}</SectionLabel>
          <ol className="mt-3 space-y-3">
            {CONTROLS.map((control, index) => (
              <li key={control} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-emerald-400/30 bg-emerald-400/10 font-mono text-[10px] text-emerald-300">{index + 1}</span>
                <div>
                  <p className="text-xs font-medium text-[#f2f4f7]">{t(`control.${control}.title`)}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[#8c96a8]">{t(`control.${control}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <LogConsole
        entries={entries}
        title={t("log")}
        className="max-h-[calc(100vh-220px)] min-h-[520px]"
        filter={
          <span className="flex items-center gap-1">
            <ScrollText className="mr-1 h-3.5 w-3.5 text-[#687386]" />
            {levels.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setLevel(item)}
                className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] uppercase", level === item ? "bg-[#f5c400]/15 text-[#f5c400]" : "text-[#687386] hover:text-[#c9d1dd]")}
              >
                {item === "all" ? t("allLevels") : item}
              </button>
            ))}
          </span>
        }
      />
    </div>
  );
}
