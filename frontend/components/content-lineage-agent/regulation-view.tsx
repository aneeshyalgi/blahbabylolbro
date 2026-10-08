"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, ChevronDown, FileText, Network, Scale, SearchCheck, UserCheck, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { RegulationChip } from "@/components/regulation-matcher/atoms";
import { CaseText, EYEBROW, PANEL, Stat, TermChip, VERDICT_COLORS, VerdictBadge } from "./atoms";
import { provisionKey, type Model } from "./model";
import type { Navigator, Verdict } from "./types";

const ORDER: Verdict[] = ["deviation", "simplified", "unverified", "consistent", "not_covered"];

export function RegulationView({ model, focus, nav }: { model: Model; focus: string | null; nav: Navigator }) {
  const t = useTranslations("contentLineageAgent.regulation");
  const tFrameworks = useTranslations("contentLineageAgent.frameworks");
  const regulation = model.result.regulation;

  useEffect(() => {
    if (!focus) return;
    document.getElementById(`content-assessment-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  if (!regulation.enabled) {
    return (
      <section className={cn(PANEL, "flex flex-col items-center px-6 py-14 text-center")}>
        <Scale className="h-10 w-10 text-[#3f4957]" />
        <p className="mt-3 text-[14px] font-semibold text-white">{t("skippedTitle")}</p>
        <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-[#8c96a8]">{regulation.skipped === "none_selected" || !regulation.skipped ? t("skippedNone") : t("skippedUnavailable", { reason: regulation.skipped })}</p>
      </section>
    );
  }

  const rules = [...model.result.rules].sort((a, b) => {
    const left = model.assessment(a.id)?.verdict ?? "not_covered";
    const right = model.assessment(b.id)?.verdict ?? "not_covered";
    return ORDER.indexOf(left) - ORDER.indexOf(right) || a.id.localeCompare(b.id, undefined, { numeric: true });
  });
  const verdicts = model.result.rules.map((rule) => model.assessment(rule.id)?.verdict ?? "not_covered");
  const links = model.result.rules.flatMap((rule) => model.assessment(rule.id)?.links ?? []);
  const framework = Object.values(regulation.rules).find((item) => item.retrieval?.framework)?.retrieval.framework;

  return (
    <div className="space-y-4">
      <section className={cn(PANEL, "p-5")} data-tour="content-regulation-head">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <p className={EYEBROW}>{t("eyebrow")}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[#c9d1dd]">{t("intro")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {regulation.documents.map((document) => <span key={document.id} className="flex items-center gap-1.5 rounded-md border border-[#2c3440] px-2 py-1 text-[11.5px] text-[#c9d1dd]"><RegulationChip name={document.short} />{document.filename}</span>)}
            {framework && <span className="rounded-md border border-[#2c3440] px-2 py-1 text-[11.5px] text-[#aab3c2]">{t("framework", { framework: tFrameworks.has(framework) ? tFrameworks(framework) : framework })}</span>}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Stat label={t("stats.rules")} value={model.result.rules.length} />
          <Stat label={t("stats.consistent")} value={verdicts.filter((verdict) => verdict === "consistent").length} tone="good" />
          <Stat label={t("stats.simplified")} value={verdicts.filter((verdict) => verdict === "simplified").length} tone="warn" />
          <Stat label={t("stats.deviation")} value={verdicts.filter((verdict) => verdict === "deviation").length} tone="bad" />
          <Stat label={t("stats.notCovered")} value={verdicts.filter((verdict) => verdict === "not_covered" || verdict === "unverified").length} />
          <Stat label={t("stats.quotes")} value={`${links.filter((link) => link.quote_status === "verified").length}/${links.length}`} detail={t("stats.quotesHint")} />
        </div>
      </section>

      {rules.map((rule) => {
        const assessment = model.assessment(rule.id);
        const text = model.regulationText(rule.id);
        const verdict = assessment?.verdict ?? "not_covered";
        return (
          <article key={rule.id} id={`content-assessment-${rule.id}`} data-tour={rule.id === rules[0].id ? "content-assessment" : undefined} className={cn(PANEL, "overflow-hidden", focus === rule.id && "border-[#f5c400]/50")}>
            <span className="block h-[3px]" style={{ background: VERDICT_COLORS[verdict] }} />
            <div className="p-5">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-4xl">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-[1px] font-mono text-[10.5px] font-semibold text-violet-200">{rule.id}</span>
                    <span className="text-[14.5px] font-semibold text-white">{model.ruleName(rule.id)}</span>
                    <VerdictBadge verdict={verdict} />
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#8c96a8]">{t("derives")} <TermChip model={model} column={rule.column} onClick={(column) => nav.openTerm(column, "graph")} /></p>
                  <p className="mt-2 text-[12px] leading-relaxed text-[#aab3c2]">{model.ruleStatement(rule.id)}</p>
                </div>
                <button type="button" onClick={() => nav.openRule(rule.id, "graph")} className="flex items-center gap-1 rounded-md border border-[#2c3440] px-2 py-1 text-[11.5px] text-[#c9d1dd] hover:border-[#f5c400]/40 hover:text-[#f5c400]"><Network className="h-3.5 w-3.5" />{t("graph")}</button>
              </header>

              {text.explanation && (
                <div className="mt-3 rounded-md border border-[#1f252e] bg-[#0d1218] p-3">
                  <p className={EYEBROW}>{t("assessment")}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[#dbe2ec]">{text.explanation}</p>
                </div>
              )}

              {assessment && assessment.links.length > 0 ? (
                <div className="mt-3 space-y-2.5">
                  {assessment.links.map((link, index) => (
                    <div key={`${link.regulation_id}:${link.unit}:${index}`} className="rounded-md border border-orange-400/20 bg-orange-400/[0.03] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <RegulationChip name={link.regulation} />
                        <span className="font-mono text-[13px] font-semibold text-orange-50">{link.reference}</span>
                        <span className="text-[12px] text-[#c9b8a6]">{link.title}</span>
                        <span className="rounded border border-orange-400/30 px-1.5 text-[10px] uppercase tracking-wide text-orange-200">{t(`relation.${link.relation}`)}</span>
                        <span className="text-[11px] text-[#687386]">{t("page", { page: link.page_label })}</span>
                        <button type="button" onClick={() => nav.openProvision(provisionKey(link))} className="ml-auto flex items-center gap-1 rounded-md border border-[#2c3440] px-2 py-0.5 text-[11px] text-[#c9d1dd] hover:border-orange-300/60 hover:text-orange-200"><FileText className="h-3 w-3" />{t("read")}</button>
                      </div>
                      <blockquote className="mt-2 border-l-2 border-orange-400/60 pl-3 text-[12.5px] italic leading-relaxed text-[#f1e3d3]">“{link.quote}”</blockquote>
                      <p className="mt-1 flex items-center gap-1 text-[10.5px] text-emerald-300"><BadgeCheck className="h-3 w-3" />{link.quote_status === "verified" ? t("quoteVerified") : t("quoteRepaired", { similarity: Math.round(link.similarity * 100) })}</p>
                      {text.links[index] && <p className="mt-1.5 text-[12px] leading-relaxed text-[#c9d1dd]">{text.links[index]}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-md border border-[#1f252e] bg-[#0d1218] px-3 py-2 text-[12px] text-[#8c96a8]">{verdict === "unverified" ? t("unverified") : t("noBasis")}</p>
              )}

              {assessment && assessment.findings.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-md border border-[#1f252e]">
                  <table className="w-full text-[12px]">
                    <thead className="bg-[#0f141b] text-left text-[10.5px] uppercase tracking-wide text-[#687386]">
                      <tr><th className="w-[26%] px-3 py-2 font-semibold">{t("case")}</th><th className="w-[13%] px-3 py-2 font-semibold">{t("verdict")}</th><th className="w-[13%] px-3 py-2 font-semibold">{t("provision")}</th><th className="px-3 py-2 font-semibold">{t("finding")}</th></tr>
                    </thead>
                    <tbody>
                      {assessment.findings.map((finding, index) => (
                        <tr key={index} className="border-t border-[#1a2029] align-top">
                          <td className="px-3 py-2">{finding.case ? <CaseText model={model} caseId={finding.case} keyValue={finding.key} /> : finding.key ? <span className="font-mono text-[#dbe2ec]">{finding.key}</span> : <span className="text-[#8c96a8]">{t("wholeRule")}</span>}</td>
                          <td className="px-3 py-2"><VerdictBadge verdict={finding.verdict} compact /></td>
                          <td className="px-3 py-2 font-mono text-[11px] text-orange-200">{assessment.links[finding.link]?.reference}</td>
                          <td className="px-3 py-2 leading-relaxed text-[#c9d1dd]">{text.findings[index]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {assessment && <Review model={model} rule={rule.id} />}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Review({ model, rule }: { model: Model; rule: string }) {
  const t = useTranslations("contentLineageAgent.regulation");
  const [open, setOpen] = useState(false);
  const assessment = model.assessment(rule)!;
  const review = assessment.review;
  const issues = model.regulationText(rule).issues;
  return (
    <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2 border-t border-[#1a2029] pt-3 text-[11.5px]">
      {review ? (
        <span className={cn("flex items-center gap-1.5", review.decision === "confirmed" ? "text-emerald-300" : "text-amber-300")}>
          {review.decision === "confirmed" ? <UserCheck className="h-3.5 w-3.5" /> : <UserCog className="h-3.5 w-3.5" />}
          {review.decision === "confirmed" ? t("reviewConfirmed") : t("reviewCorrected")}
        </span>
      ) : (
        <span className="text-[#687386]">{assessment.links.length ? t("reviewMissing") : t("reviewNotNeeded")}</span>
      )}
      <span className="flex items-center gap-1.5 text-[#687386]"><SearchCheck className="h-3.5 w-3.5" />{t("retrieval", { candidates: assessment.retrieval.candidates })}</span>
      {(review?.decision === "corrected" || assessment.retrieval.queries.length > 0) && (
        <button type="button" onClick={() => setOpen((value) => !value)} className="ml-auto flex items-center gap-1 text-[#8c96a8] hover:text-white">
          {t("details")} <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      )}
      {open && (
        <div className="w-full space-y-2 rounded-md border border-[#1f252e] bg-[#0b0f15] p-3 text-[11.5px] text-[#aab3c2]">
          {review?.decision === "corrected" && (
            <>
              {review.removed.length > 0 && <p>{t("removed", { references: review.removed.map((item) => item.reference).join(", ") })}</p>}
              {review.original && review.applied && <p>{t("originalVerdict")} <VerdictBadge verdict={review.original.verdict} compact /></p>}
              {issues.length > 0 && <ul className="list-disc space-y-1 pl-4">{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
            </>
          )}
          {assessment.retrieval.queries.length > 0 && (
            <p><span className="text-[#687386]">{t("queries")}</span> {assessment.retrieval.queries.slice(0, 4).map((query) => `“${query.length > 80 ? `${query.slice(0, 80)}…` : query}”`).join(" · ")}</p>
          )}
          {assessment.dropped.length > 0 && <p className="text-amber-200/90">{t("dropped", { count: assessment.dropped.length })}</p>}
        </div>
      )}
    </div>
  );
}
