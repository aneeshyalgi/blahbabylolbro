"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bot, ChevronDown, ChevronRight, FlaskConical, Grid3x3, ListChecks, ScrollText, Search, ShieldCheck, UserCheck, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckIcon, ColumnChip, EYEBROW, LineChip, PANEL, SectionTitle, SeverityIcon, formatDateTime, formatDuration } from "./atoms";
import { FindingCard } from "./findings";
import { AgentConsole } from "./log";
import type { Model } from "./model";
import type { Navigator, Run } from "./types";

export function VerificationView({ model, run, nav }: { model: Model; run: Run; nav: Navigator }) {
  const t = useTranslations("lineageAgent.verification");
  const result = model.result;
  return (
    <div className="space-y-4">
      <section data-tour="lineage-checks" className={cn(PANEL, "p-4")}>
        <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-[#f5c400]" />} title={t("checksTitle")} hint={t("checksHint")} />
        <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {result.checks.map((check) => (
            <div key={check.id} className={cn("rounded-md border px-3.5 py-3", check.status === "pass" ? "border-emerald-400/20 bg-emerald-400/[0.03]" : check.status === "fail" ? "border-rose-400/30 bg-rose-400/[0.05]" : check.status === "warn" ? "border-amber-400/25 bg-amber-400/[0.04]" : "border-[#1f252e] bg-[#0d1218]")}>
              <div className="flex items-start gap-2.5">
                <CheckIcon status={check.status} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-white">{t(`checks.${check.id}.title`)}</p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#9aa4b4]">{t(`checks.${check.id}.body`)}</p>
                  <p className="mt-1.5 font-mono text-[11px] text-[#c2cad5]">{t(`checks.${check.id}.value`, sanitize(check.params))}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <DependencyMatrix model={model} nav={nav} />

      <div className="grid gap-4 xl:grid-cols-2">
        <ReviewTable model={model} nav={nav} />
        <section className={cn(PANEL, "space-y-2.5 p-4")}>
          <SectionTitle icon={<ListChecks className="h-4 w-4 text-[#f5c400]" />} title={t("findingsTitle", { count: result.findings.length })} hint={t("findingsHint")} />
          {result.findings.map((finding) => <FindingCard key={finding.id} finding={finding} nav={nav} />)}
          {!result.findings.length && <p className="rounded-md border border-emerald-400/20 bg-emerald-400/[0.04] px-3 py-3 text-[12px] text-emerald-200">{t("noFindings")}</p>}
        </section>
      </div>

      {result.ai.investigation && <InvestigationPanel model={model} nav={nav} />}
      <ProbesPanel model={model} />
      <RunDetails run={run} />
      <Collapsible icon={<ScrollText className="h-4 w-4 text-[#f5c400]" />} title={t("logTitle", { count: run.log.length })} hint={t("logHint")}>
        <AgentConsole log={run.log} className="max-h-[420px]" />
      </Collapsible>
    </div>
  );
}

function sanitize(params: Record<string, unknown>): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) result[key] = typeof value === "number" ? value : typeof value === "boolean" ? (value ? "yes" : "no") : String(value ?? "");
  return result;
}

function DependencyMatrix({ model, nav }: { model: Model; nav: Navigator }) {
  const t = useTranslations("lineageAgent.verification.matrix");
  const dependencies = model.result.runtime.dependencies;
  const outputs = model.analysis.columns.filter((column) => column.in_output && column.role !== "passthrough");
  const inputs = useMemo(() => {
    const used = new Set<string>();
    for (const column of outputs) {
      for (const source of column.sources) used.add(source.column);
      for (const name of dependencies[column.name]?.runtime_only ?? []) used.add(name);
    }
    return model.analysis.inputs.filter((name) => used.has(name));
  }, [model, outputs, dependencies]);
  if (!model.result.runtime.probes.enabled) {
    return (
      <section className={cn(PANEL, "p-4")}>
        <SectionTitle icon={<Grid3x3 className="h-4 w-4 text-[#f5c400]" />} title={t("title")} />
        <p className="mt-2 text-[12px] text-[#8c96a8]">{t("disabled")}</p>
      </section>
    );
  }
  return (
    <section data-tour="lineage-matrix" className={cn(PANEL, "overflow-hidden")}>
      <div className="p-4 pb-3">
        <SectionTitle
          icon={<Grid3x3 className="h-4 w-4 text-[#f5c400]" />}
          title={t("title")}
          hint={t("hint")}
          actions={
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#9aa4b4]">
              <span className="flex items-center gap-1.5"><Cell kind="confirmed" />{t("confirmed")}</span>
              <span className="flex items-center gap-1.5"><Cell kind="indirect" />{t("indirectConfirmed")}</span>
              <span className="flex items-center gap-1.5"><Cell kind="static" />{t("staticOnly")}</span>
              <span className="flex items-center gap-1.5"><Cell kind="runtime" />{t("runtimeOnly")}</span>
            </div>
          }
        />
      </div>
      <div className="overflow-auto px-4 pb-4">
        <table className="border-separate border-spacing-0 text-[11.5px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[#0b0f15] px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-[#687386]">{t("outputInput")}</th>
              {inputs.map((name) => (
                <th key={name} className="h-28 min-w-[34px] px-1 align-bottom">
                  <button type="button" onClick={() => nav.openColumn(name)} className="origin-bottom-left translate-x-3 -rotate-45 whitespace-nowrap font-mono text-[10.5px] font-normal text-[#aab3c2] hover:text-[#f5c400]">{name}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outputs.map((column) => {
              const dependency = dependencies[column.name] ?? { confirmed: [], static_only: [], runtime_only: [] };
              const modes = new Map(column.sources.map((source) => [source.column, source.mode]));
              return (
                <tr key={column.name}>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-[#0b0f15] py-1 pr-3">
                    <ColumnChip name={column.name} onClick={(name) => nav.openColumn(name, "columns")} />
                  </td>
                  {inputs.map((name) => {
                    const kind = dependency.runtime_only.includes(name)
                      ? "runtime"
                      : dependency.confirmed.includes(name)
                        ? modes.get(name) === "indirect" ? "indirect" : "confirmed"
                        : dependency.static_only.includes(name) ? "static" : null;
                    return (
                      <td key={name} className="border border-[#141a22] p-0 text-center">
                        <span title={kind ? `${column.name} ← ${name}: ${t(kind === "runtime" ? "runtimeOnly" : kind === "static" ? "staticOnly" : kind === "indirect" ? "indirectConfirmed" : "confirmed")}` : undefined} className="flex h-7 w-full items-center justify-center">
                          {kind && <Cell kind={kind} />}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cell({ kind }: { kind: "confirmed" | "indirect" | "static" | "runtime" }) {
  if (kind === "confirmed") return <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.45)]" />;
  if (kind === "indirect") return <span className="h-3 w-3 rounded-full border-2 border-emerald-400 bg-emerald-400/20" />;
  if (kind === "static") return <span className="h-3 w-3 rounded-full border-2 border-dashed border-amber-400" />;
  return <span className="h-3 w-3 rotate-45 bg-rose-400" />;
}

function ReviewTable({ model, nav }: { model: Model; nav: Navigator }) {
  const t = useTranslations("lineageAgent.verification.review");
  const order = new Map(model.analysis.outputs.map((name, index) => [name, index]));
  const docs = Object.entries(model.result.ai.columns)
    .filter(([, doc]) => doc.status !== "passthrough")
    .sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return (
    <section data-tour="lineage-review" className={cn(PANEL, "p-4")}>
      <SectionTitle icon={<UserCheck className="h-4 w-4 text-[#f5c400]" />} title={t("title")} hint={t("hint")} />
      <table className="mt-3 w-full text-[12px]">
        <thead className="text-left text-[10px] uppercase tracking-wide text-[#687386]">
          <tr>
            <th className="py-1.5 font-semibold">{t("column")}</th>
            <th className="py-1.5 font-semibold">{t("grounding")}</th>
            <th className="py-1.5 font-semibold">{t("review")}</th>
          </tr>
        </thead>
        <tbody>
          {docs.map(([column, doc]) => (
            <tr key={column} className="border-t border-[#1a2029] align-top">
              <td className="py-2 pr-2"><ColumnChip name={column} onClick={(name) => nav.openColumn(name, "columns")} /></td>
              <td className="py-2 pr-2">
                {doc.status === "failed" ? (
                  <span className="text-rose-300">{t("failed")}</span>
                ) : (
                  <span className={doc.grounding?.status === "verified" ? "text-emerald-300" : "text-amber-300"}>
                    {doc.grounding?.status === "verified" ? t("verified") : t("partial")}
                    {doc.grounding?.corrected && <span className="ml-1 text-[10.5px] text-[#8c96a8]">({t("afterCorrection")})</span>}
                  </span>
                )}
              </td>
              <td className="py-2">
                {doc.review?.verdict === "confirmed" && <span className="text-sky-300">{t("confirmed")}</span>}
                {doc.review?.verdict === "corrected" && (
                  <span className="text-violet-300">
                    {doc.review.applied ? t("correctedApplied") : t("correctedRejected")}
                    <span className="mt-0.5 block text-[11px] text-[#8c96a8]">{doc.review.issues[0]}</span>
                  </span>
                )}
                {(!doc.review || doc.review.verdict === "unavailable") && <span className="text-[#5d6878]">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function InvestigationPanel({ model, nav }: { model: Model; nav: Navigator }) {
  const t = useTranslations("lineageAgent.verification.investigation");
  const investigation = model.result.ai.investigation!;
  return (
    <section className={cn(PANEL, "space-y-3 p-4")}>
      <SectionTitle icon={<Bot className="h-4 w-4 text-[#f5c400]" />} title={t("title")} hint={t("hint", { issues: investigation.issues.length, steps: investigation.steps.length })} />
      {investigation.steps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {investigation.steps.map((step, index) => (
            <span key={index} className="inline-flex items-center gap-1 rounded-md border border-[#2c3440] bg-[#0d1218] px-2 py-[2px] font-mono text-[10.5px] text-[#aab3c2]">
              <Wrench className="h-3 w-3 text-[#f5c400]" /> {step.tool}({Object.values(step.arguments).map(String).join(", ")})
            </span>
          ))}
        </div>
      )}
      {investigation.findings.map((finding, index) => (
        <div key={index} className="rounded-md border border-[#1f252e] bg-[#0d1218] px-3.5 py-3">
          <div className="flex items-start gap-2.5">
            <SeverityIcon severity={finding.severity} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-white">{finding.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#c2cad5]">{finding.detail}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded border border-[#2c3440] px-1.5 text-[10.5px] text-[#9aa4b4]">{t(`resolution.${finding.resolution}`)}</span>
                {finding.lines.map((line) => <LineChip key={line} line={line} onClick={nav.openLine} />)}
                {finding.columns.map((column) => <ColumnChip key={column} name={column} onClick={(name) => nav.openColumn(name)} />)}
              </div>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

function ProbesPanel({ model }: { model: Model }) {
  const t = useTranslations("lineageAgent.verification.probes");
  const probes = model.result.runtime.probes;
  const [query, setQuery] = useState("");
  const rows = probes.probes.filter((probe) => !query.trim() || probe.column.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Collapsible
      icon={<FlaskConical className="h-4 w-4 text-[#f5c400]" />}
      title={t("title", { count: probes.probes.length })}
      hint={probes.enabled ? t("hint", { rows: probes.rows ?? 0 }) : t("disabled")}
    >
      {probes.enabled && (
        <>
          <div className="relative mb-2 w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5d6878]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} className="h-8 w-full rounded-md border border-[#252a33] bg-[#0f141b] pl-8 pr-2 text-[12px] text-white outline-none placeholder:text-[#5d6878] focus:border-[#f5c400]/50" />
          </div>
          <div className="max-h-[420px] overflow-auto rounded-md border border-[#1f252e]">
            <table className="w-full text-[11.5px]">
              <thead className="sticky top-0 bg-[#0f141b] text-left text-[10px] uppercase tracking-wide text-[#687386]">
                <tr>
                  <th className="px-3 py-1.5">{t("column")}</th>
                  <th className="px-3 py-1.5">{t("mode")}</th>
                  <th className="px-3 py-1.5">{t("changed")}</th>
                  <th className="px-3 py-1.5 text-right">ms</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((probe, index) => (
                  <tr key={index} className="border-t border-[#1a2029] align-top">
                    <td className="px-3 py-1.5 font-mono text-[#dbe2ec]">{probe.column}</td>
                    <td className="px-3 py-1.5 text-[#aab3c2]">{t(`modes.${probe.mode}`)}</td>
                    <td className="px-3 py-1.5">
                      {probe.error ? (
                        <span className="text-amber-300">{probe.error}</span>
                      ) : probe.skipped ? (
                        <span className="text-[#5d6878]">{t("skipped")}</span>
                      ) : Object.keys(probe.changed).length ? (
                        <span className="font-mono text-[#c2cad5]">{Object.entries(probe.changed).map(([column, count]) => `${column} (${count})`).join(", ")}</span>
                      ) : (
                        <span className="text-[#5d6878]">{t("none")}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[#687386]">{probe.ms ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Collapsible>
  );
}

function RunDetails({ run }: { run: Run }) {
  const t = useTranslations("lineageAgent.verification.run");
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  const items: [string, string][] = [
    [t("runId"), run.id],
    [t("execution"), run.source.execution_id],
    [t("cluster"), run.source.cluster_name ?? "–"],
    [t("dataset"), run.source.dataset_name ?? "–"],
    [t("code"), `${run.source.code_filename} (${run.source.code_lines})`],
    [t("started"), formatDateTime(run.created_at, locale)],
    [t("duration"), formatDuration(run.duration_ms, locale)],
    [t("model"), run.model ?? "–"],
    [t("calls"), `${run.usage.llm_calls} · ${t("tools", { count: run.usage.tool_calls })}`],
    [t("tokens"), `${number.format(run.usage.prompt_tokens)} / ${number.format(run.usage.completion_tokens)}`],
    [t("probes"), run.settings.probes ? t("on") : t("off")],
    [t("language"), run.language.toUpperCase()],
  ];
  return (
    <section className={cn(PANEL, "p-4")}>
      <p className={EYEBROW}>{t("title")}</p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10.5px] uppercase tracking-wide text-[#5d6878]">{label}</dt>
            <dd className="truncate font-mono text-[12px] text-[#c2cad5]" title={value}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Collapsible({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={PANEL}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-[#687386]" /> : <ChevronRight className="h-4 w-4 text-[#687386]" />}
        {icon}
        <span className="text-[13px] font-semibold text-white">{title}</span>
        {hint && <span className="truncate text-[11.5px] text-[#687386]">· {hint}</span>}
      </button>
      {open && <div className="border-t border-[#1f252e] p-4">{children}</div>}
    </section>
  );
}
