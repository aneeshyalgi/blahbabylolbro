"use client";

import { useLocale, useTranslations } from "next-intl";
import { ClipboardCheck, ScrollText, Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckIcon, EYEBROW, PANEL, SEVERITY_STYLES, SectionTitle, SeverityIcon, Stat, TermChip, formatDuration } from "./atoms";
import { AgentConsole } from "./log";
import type { Model } from "./model";
import type { Check, Finding, Navigator, Run } from "./types";

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => (typeof item === "object" && item ? Object.values(item).join(" ") : String(item))).join(", ");
  if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${item}`).join(", ");
  return String(value ?? "");
}

export function VerificationView({ model, run, nav }: { model: Model; run: Run; nav: Navigator }) {
  const t = useTranslations("contentLineageAgent.verification");
  const locale = useLocale();
  const checks = model.result.checks;
  const findings = model.result.findings;
  const passed = checks.filter((check) => check.status === "pass").length;
  const relevant = checks.filter((check) => check.status !== "skipped").length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label={t("checks")} value={`${passed}/${relevant}`} tone={passed === relevant ? "good" : "warn"} detail={t("checksHint")} />
        <Stat label={t("findings")} value={findings.length} tone={findings.some((item) => item.severity === "critical") ? "bad" : findings.length ? "warn" : "good"} detail={t("findingsHint", { critical: findings.filter((item) => item.severity === "critical").length, warning: findings.filter((item) => item.severity === "warning").length })} />
        <Stat label={t("llm")} value={run.usage.llm_calls} detail={t("tokens", { prompt: run.usage.prompt_tokens.toLocaleString(locale), completion: run.usage.completion_tokens.toLocaleString(locale) })} />
        <Stat label={t("duration")} value={formatDuration(run.duration_ms, locale)} detail={run.model ?? "–"} />
      </div>

      <section className={cn(PANEL, "p-5")} data-tour="content-checks">
        <SectionTitle icon={<ClipboardCheck className="h-4 w-4 text-emerald-300" />} title={t("checksTitle")} hint={t("checksIntro")} />
        <ul className="mt-4 divide-y divide-[#1a2029] rounded-md border border-[#1f252e]">
          {checks.map((check) => (
            <li key={check.id} className="flex items-start gap-3 px-4 py-3">
              <CheckIcon status={check.status} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold text-white">{t(`check.${check.id}.title`)}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[#aab3c2]">{checkDetail(t, check)}</p>
              </div>
              <span className={cn("shrink-0 rounded-full border px-2 py-[1px] text-[10.5px] font-semibold uppercase tracking-wide", check.status === "pass" ? "border-emerald-400/30 text-emerald-300" : check.status === "fail" ? "border-rose-400/30 text-rose-300" : check.status === "warn" ? "border-amber-400/30 text-amber-300" : "border-[#2c3440] text-[#687386]")}>{t(`status.${check.status}`)}</span>
            </li>
          ))}
        </ul>
        {model.result.ai.grounding.issues.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-400/25 bg-amber-400/[0.05] p-3">
            <p className="text-[12px] font-semibold text-amber-200">{t("groundingTitle")}</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11.5px] text-[#d9cfb5]">
              {model.result.ai.grounding.issues.map((issue, index) => <li key={index}>{issue.text}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className={cn(PANEL, "p-5")} data-tour="content-findings">
        <SectionTitle icon={<Siren className="h-4 w-4 text-amber-300" />} title={t("findingsTitle")} hint={t("findingsIntro")} />
        {findings.length === 0 ? (
          <p className="mt-4 text-[12.5px] text-[#8c96a8]">{t("noFindings")}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {findings.map((finding) => <FindingItem key={finding.id} model={model} finding={finding} nav={nav} />)}
          </ul>
        )}
      </section>

      <section className={cn(PANEL, "p-5")}>
        <SectionTitle icon={<ScrollText className="h-4 w-4 text-[#8c96a8]" />} title={t("logTitle")} hint={t("logHint")} />
        <AgentConsole log={run.log} className="mt-4 h-[380px]" />
      </section>
    </div>
  );
}

function checkDetail(t: ReturnType<typeof useTranslations>, check: Check): string {
  const p = check.params as Record<string, unknown>;
  const key = `check.${check.id}.${check.status}`;
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(p)) values[name] = typeof value === "number" ? value : text(value);
  if (check.id === "complete" && p.missing && typeof p.missing === "object") values.missing = Object.entries(p.missing as Record<string, number>).map(([name, count]) => `${name} (${count})`).join(", ");
  if (check.id === "reconciliation") values.differences = Array.isArray(p.differences) ? (p.differences as unknown[]).length : 0;
  try {
    return t.has(key) ? t(key, values) : t(`check.${check.id}.pass`, values);
  } catch {
    return text(p);
  }
}

function FindingItem({ model, finding, nav }: { model: Model; finding: Finding; nav: Navigator }) {
  const t = useTranslations("contentLineageAgent.verification");
  const p = finding.params as Record<string, unknown>;
  const column = typeof p.column === "string" ? p.column : null;
  const rule = typeof p.rule === "string" ? p.rule : null;
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(p)) values[name] = typeof value === "number" ? value : text(value);
  if (column) values.term = model.termName(column);
  if (rule) values.ruleName = model.ruleName(rule);
  if (Array.isArray(p.values)) values.values = (p.values as { value: string; rows: number }[]).map((item) => `${item.value} (${item.rows})`).join(", ");
  if (Array.isArray(p.examples)) values.examples = (p.examples as unknown[]).map((item) => `"${String(item).trim()}"`).join(", ");
  if (typeof p.verdict === "string") values.verdict = p.verdict;
  return (
    <li className={cn("rounded-md border p-3", SEVERITY_STYLES[finding.severity])}>
      <div className="flex items-start gap-2.5">
        <SeverityIcon severity={finding.severity} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-white">{t(`finding.${finding.code}.title`, values)}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[#c9d1dd]">{t(`finding.${finding.code}.body`, values)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {column && model.termBy.has(column) && <TermChip model={model} column={column} onClick={(target) => nav.openTerm(target, "graph")} />}
            {rule && finding.code.startsWith("regulatory") && <button type="button" onClick={() => nav.openRule(rule, "regulation")} className="rounded-md border border-orange-400/30 px-1.5 py-[1px] text-[11px] text-orange-200 hover:bg-orange-400/10">{t("openAssessment")}</button>}
            <span className={cn(EYEBROW, "ml-auto")}>{finding.id}</span>
          </div>
        </div>
      </div>
    </li>
  );
}
