"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, GitCommitHorizontal, Languages, Network, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EYEBROW, Formula, KindBadge, LineChip, ORIGIN_COLORS, PANEL, ProvisionChip, SectionTitle, ShareBar, TermChip, VerdictBadge, useNumbers,
} from "./atoms";
import { provisionKey, type Model } from "./model";
import type { Navigator, TermKind } from "./types";

const GROUPS: TermKind[] = ["figure", "concept", "source"];

export function GlossaryView({ model, focus, nav }: { model: Model; focus: { kind: "term" | "rule"; id: string } | null; nav: Navigator }) {
  const t = useTranslations("contentLineageAgent.glossary");
  const tLanguages = useTranslations("contentLineageAgent.languageNames");
  const numbers = useNumbers();

  useEffect(() => {
    if (!focus) return;
    const element = document.getElementById(`content-${focus.kind}-${focus.id}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus]);

  return (
    <div className="space-y-4">
      <section className={cn(PANEL, "p-5")} data-tour="content-summary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-4xl">
            <p className={EYEBROW}>{t("summaryTitle")}</p>
            {model.texts.domain && <p className="mt-1 text-[15px] font-semibold text-white">{model.texts.domain}</p>}
            {model.texts.summary && <p className="mt-2 text-[13px] leading-relaxed text-[#c9d1dd]">{model.texts.summary}</p>}
          </div>
          {model.translatedFrom && (
            <span className="flex items-center gap-1.5 rounded-full border border-[#2c3440] px-2.5 py-1 text-[11px] text-[#8c96a8]">
              <Languages className="h-3.5 w-3.5" />
              {t("translatedFrom", { language: tLanguages(model.translatedFrom.toUpperCase()) })}
            </span>
          )}
        </div>
      </section>

      <section className={cn(PANEL, "p-5")} data-tour="content-glossary">
        <SectionTitle icon={<BookOpen className="h-4 w-4 text-[#f5c400]" />} title={t("termsTitle")} hint={t("termsHint")} />
        <div className="mt-4 space-y-5">
          {GROUPS.map((kind) => {
            const terms = model.result.terms.filter((term) => term.kind === kind);
            if (!terms.length) return null;
            return (
              <div key={kind}>
                <p className={cn(EYEBROW, "mb-2")}>{t(`groups.${kind}`, { count: terms.length })}</p>
                <div className="overflow-hidden rounded-md border border-[#1f252e]">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-[#0f141b] text-left text-[10.5px] uppercase tracking-wide text-[#687386]">
                      <tr>
                        <th className="w-[22%] px-3 py-2 font-semibold">{t("term")}</th>
                        <th className="px-3 py-2 font-semibold">{t("definition")}</th>
                        <th className="w-[18%] px-3 py-2 font-semibold">{t("content")}</th>
                        <th className="w-[16%] px-3 py-2 font-semibold">{t("basis")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {terms.map((term) => {
                        const rule = model.ruleOfColumn.get(term.column);
                        const assessment = rule ? model.assessment(rule.id) : undefined;
                        const active = focus?.kind === "term" && focus.id === term.column;
                        const composition = term.composition;
                        return (
                          <tr key={term.column} id={`content-term-${term.column}`} className={cn("border-t border-[#1a2029] align-top", active && "bg-[#f5c400]/[0.06]")}>
                            <td className="px-3 py-2.5">
                              <button type="button" onClick={() => nav.openTerm(term.column, "graph")} className="text-left font-semibold text-white hover:text-[#f5c400]">{model.termName(term.column)}</button>
                              <p className="mt-0.5 font-mono text-[10.5px] text-[#687386]">{term.column}</p>
                              <div className="mt-1.5"><KindBadge kind={term.kind} classifier={term.classifier} /></div>
                            </td>
                            <td className="px-3 py-2.5 leading-relaxed text-[#c9d1dd]">
                              {model.definition(term.column) || <span className="text-[#5d6878]">–</span>}
                              {rule && <p className="mt-1.5 text-[11.5px] text-violet-200/90">{t("derivedBy", { rule: `${rule.id} · ${model.ruleName(rule.id)}` })}</p>}
                            </td>
                            <td className="px-3 py-2.5">
                              {composition ? (
                                <>
                                  <ShareBar height={6} parts={[
                                    { value: composition.delivered.records, color: ORIGIN_COLORS.delivered },
                                    { value: composition.derived, color: ORIGIN_COLORS.derived[0] },
                                    { value: composition.missing, color: ORIGIN_COLORS.missing },
                                  ]} />
                                  <p className="mt-1.5 text-[11px] leading-snug text-[#8c96a8]">{t("contentLine", { delivered: composition.delivered.records, derived: composition.derived, missing: composition.missing })}</p>
                                </>
                              ) : term.profile ? (
                                <p className="text-[11.5px] text-[#8c96a8]">{t("filled", { filled: term.profile.non_null, total: term.profile.total })}{term.profile.values.length > 0 && <span className="mt-1 block font-mono text-[10.5px] text-[#aab3c2]">{term.profile.values.slice(0, 6).join(" · ")}</span>}</p>
                              ) : null}
                              {term.profile?.sum !== null && term.profile?.sum !== undefined && term.kind !== "source" && <p className="mt-1 font-mono text-[11px] text-[#dbe2ec]">Σ {numbers.amount(term.profile.sum)}</p>}
                            </td>
                            <td className="px-3 py-2.5">
                              {assessment ? (
                                <div className="space-y-1.5">
                                  <VerdictBadge verdict={assessment.verdict} />
                                  <div className="flex flex-wrap gap-1">{assessment.links.map((link, index) => <ProvisionChip key={`${link.reference}-${index}`} reference={link.reference} onClick={() => nav.openProvision(provisionKey(link))} />)}</div>
                                </div>
                              ) : <span className="text-[11px] text-[#5d6878]">{t("noRule")}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={cn(PANEL, "p-5")} data-tour="content-rules">
        <SectionTitle icon={<GitCommitHorizontal className="h-4 w-4 text-violet-300" />} title={t("rulesTitle")} hint={t("rulesHint")} />
        <div className="mt-4 space-y-3">
          {model.result.rules.map((rule) => {
            const assessment = model.assessment(rule.id);
            const active = focus?.kind === "rule" && focus.id === rule.id;
            const total = model.termBy.get(rule.column)?.composition?.total_records ?? 0;
            return (
              <article key={rule.id} id={`content-rule-${rule.id}`} className={cn("rounded-lg border bg-[#0d1218] p-4", active ? "border-[#f5c400]/50" : "border-[#1f252e]")}>
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 max-w-4xl">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-[1px] font-mono text-[10.5px] font-semibold text-violet-200">{rule.id}</span>
                      <span className="text-[14px] font-semibold text-white">{model.ruleName(rule.id)}</span>
                      {assessment && <VerdictBadge verdict={assessment.verdict} />}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#8c96a8]">
                      {t("derives")} <TermChip model={model} column={rule.column} onClick={(column) => nav.openTerm(column, "graph")} />
                      {(rule.inputs.length > 0 || rule.selectors.length > 0) && <span className="ml-2">{t("from")}</span>}
                      {rule.inputs.map((name) => <TermChip key={name} model={model} column={name} onClick={(column) => nav.openTerm(column, "graph")} />)}
                      {rule.selectors.map((name) => <TermChip key={name} model={model} column={name} onClick={(column) => nav.openTerm(column, "graph")} className="border-dashed border-[#d9a441]/40" />)}
                    </p>
                    {model.ruleStatement(rule.id) && <p className="mt-2 text-[12.5px] leading-relaxed text-[#c9d1dd]">{model.ruleStatement(rule.id)}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => nav.openRule(rule.id, "graph")} className="flex items-center gap-1 rounded-md border border-[#2c3440] px-2 py-1 text-[11.5px] text-[#c9d1dd] hover:border-[#f5c400]/40 hover:text-[#f5c400]"><Network className="h-3.5 w-3.5" />{t("graph")}</button>
                    {assessment && <button type="button" onClick={() => nav.openRule(rule.id, "regulation")} className="flex items-center gap-1 rounded-md border border-orange-400/30 px-2 py-1 text-[11.5px] text-orange-200 hover:bg-orange-400/10"><ShieldCheck className="h-3.5 w-3.5" />{t("assessment")}</button>}
                  </div>
                </header>
                <div className="mt-3 overflow-hidden rounded-md border border-[#1f252e]">
                  <table className="w-full text-[12px]">
                    <thead className="bg-[#0f141b] text-left text-[10.5px] uppercase tracking-wide text-[#687386]">
                      <tr>
                        <th className="w-[22%] px-3 py-2 font-semibold">{t("case")}</th>
                        <th className="px-3 py-2 font-semibold">{t("whenWhat")}</th>
                        <th className="w-[26%] px-3 py-2 font-semibold">{t("code")}</th>
                        <th className="w-[9%] px-3 py-2 text-right font-semibold">{t("records")}</th>
                        <th className="w-[12%] px-3 py-2 text-right font-semibold">{t("amount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rule.cases.map((item, index) => (
                        <tr key={item.id} className="border-t border-[#1a2029] align-top">
                          <td className="px-3 py-2.5">
                            <span className="flex items-start gap-2">
                              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: ORIGIN_COLORS.derived[index % ORIGIN_COLORS.derived.length] }} />
                              <span>
                                <span className="block font-semibold text-white">{model.caseLabel(item.id)}</span>
                                <span className="font-mono text-[10.5px] text-[#687386]">{item.id}{item.fills_missing && ` · ${t("fillsMissing")}`}</span>
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 leading-relaxed text-[#c9d1dd]">
                            {model.caseDescription(item.id)}
                            {item.lookup && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {item.keys.map((key) => (
                                  <span key={key.key} className={cn("rounded border px-1.5 py-[1px] font-mono text-[10.5px]", key.mapped ? "border-[#2c3440] bg-[#121821] text-[#dbe2ec]" : "border-rose-400/40 bg-rose-400/[0.07] text-rose-200")} title={key.categories ? Object.entries(key.categories).map(([name, values]) => `${model.termName(name)}: ${values.join(", ")}`).join("\n") : undefined}>
                                    {key.key} → {key.mapped ? <span className="text-[#f5c400]">{numbers.parameter(key.value, model.percentTable(item.id))}</span> : t("noParameter")}
                                    <span className="ml-1 text-[#687386]">({key.records || key.unmapped_rows || 0})</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="mb-1"><LineChip line={item.line} end={item.end_line} /></div>
                            {item.condition && <Formula text={item.condition} className="block text-[10.5px] leading-[1.7]" />}
                            {item.formula && <Formula text={item.formula} className="block text-[10.5px] leading-[1.7] text-[#aab3c2]" />}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[#c9d1dd]">{item.records}<span className="block text-[10.5px] text-[#687386]">{numbers.share(item.records, total)}</span></td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[#dbe2ec]">{item.amount !== null ? numbers.amount(item.amount) : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
