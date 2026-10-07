"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  AlertOctagon,
  ArrowRightLeft,
  BookOpen,
  ChevronDown,
  ExternalLink,
  FileSpreadsheet,
  Layers,
  ListChecks,
  RefreshCcw,
  Search,
  SearchX,
  Sparkles,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CheckIcon,
  ConfidenceDial,
  Highlighted,
  LinkTypeBadge,
  PANEL,
  RegulationChip,
  SUBTLE_PANEL,
  SectionLabel,
  StatusBadge,
  StatusDot,
  shortHeading,
} from "./atoms";
import type { CandidateRow, Check, Link, NoteResult, NoteStatus, ProvisionTarget } from "./types";

type Filter = "all" | NoteStatus;

export function EvidenceView({
  notes,
  selectedKey,
  onSelect,
  focusLink,
  onOpenProvision,
}: {
  notes: NoteResult[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  focusLink: string | null;
  onOpenProvision: (target: ProvisionTarget) => void;
}) {
  const t = useTranslations("matcher.evidence");
  const tStatus = useTranslations("matcher.status");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: notes.length };
    for (const note of notes) if (note.status) result[note.status] = (result[note.status] ?? 0) + 1;
    return result;
  }, [notes]);
  const visible = notes.filter((note) => {
    if (filter !== "all" && note.status !== filter) return false;
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return [note.jira_id, note.text, ...(note.links ?? []).map((link) => `${link.regulation} ${link.reference} ${link.title}`)]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
  const selected = notes.find((note) => note.key === selectedKey) ?? visible[0] ?? null;
  const filters: Filter[] = ["all", "linked", "review", "no_link", "failed"];

  return (
    <div className="grid min-h-[640px] grid-cols-[320px_minmax(0,1fr)] gap-5">
      <aside data-tour="matcher-note-list" className={cn(PANEL, "sticky top-4 flex max-h-[calc(100vh-120px)] min-h-[520px] flex-col self-start overflow-hidden")}>
        <div className="space-y-3 border-b border-[#1f252e] p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#687386]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search")}
              className="h-8 w-full rounded-md border border-[#252a33] bg-[#0f141b] pl-8 pr-3 text-xs text-[#f2f4f7] placeholder:text-[#687386] focus:border-[#f5c400]/50 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {filters
              .filter((item) => item === "all" || counts[item])
              .map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                    filter === item ? "border-[#f5c400]/50 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#252a33] text-[#8c96a8] hover:text-[#f2f4f7]",
                  )}
                >
                  {item === "all" ? t("filterAll") : tStatus(item)} <span className="font-mono">{counts[item] ?? 0}</span>
                </button>
              ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {visible.length === 0 && <p className="px-3 py-8 text-center text-xs text-[#687386]">{t("noMatches")}</p>}
          {visible.map((note) => {
            const active = selected?.key === note.key;
            const direct = (note.links ?? []).filter((link) => link.link_type === "direct").length;
            const indirect = (note.links ?? []).length - direct;
            return (
              <button
                key={note.key}
                type="button"
                onClick={() => onSelect(note.key)}
                className={cn(
                  "relative mb-1 w-full rounded-md border px-3 py-2.5 text-left transition-colors",
                  active ? "border-[#f5c400]/40 bg-[#f5c400]/[0.07]" : "border-transparent hover:border-[#252a33] hover:bg-[#11161e]",
                )}
              >
                {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[#f5c400]" />}
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <StatusDot status={note.status} />
                    <span className="font-mono text-[13px] font-semibold text-[#f2f4f7]">{note.jira_id || `#${note.ordinal}`}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    {direct > 0 && <span className="rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 font-mono text-[10px] text-emerald-300">D{direct}</span>}
                    {indirect > 0 && <span className="rounded border border-sky-400/30 bg-sky-400/10 px-1.5 font-mono text-[10px] text-sky-300">I{indirect}</span>}
                  </span>
                </span>
                <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#8c96a8]">{note.interpretation?.summary || note.problem || note.text}</span>
                {(note.links ?? []).length > 0 && (
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {(note.links ?? []).slice(0, 4).map((link) => (
                      <span key={link.reference + link.regulation_id} className="rounded bg-[#151b23] px-1.5 py-px font-mono text-[10px] text-[#aab3c2]">
                        {link.reference.replace(/^Article /, "Art. ")}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>
      <div className="min-w-0">{selected ? <NoteDetail note={selected} focusLink={focusLink} onOpenProvision={onOpenProvision} /> : null}</div>
    </div>
  );
}

function NoteDetail({ note, focusLink, onOpenProvision }: { note: NoteResult; focusLink: string | null; onOpenProvision: (target: ProvisionTarget) => void }) {
  const t = useTranslations("matcher.evidence");
  const highlights = (note.links ?? []).flatMap((link) => link.note_highlights);
  const descriptive = new Set([note.problem, note.solution].filter(Boolean));
  const fields = note.fields.filter((field) => !descriptive.has(field.value) && !/jira/i.test(field.name) && field.name !== "Text");
  const interpretation = note.interpretation;

  useEffect(() => {
    if (!focusLink) return;
    const element = document.getElementById(`link-${note.key}-${focusLink}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("ring-2", "ring-[#f5c400]/60");
      const timer = window.setTimeout(() => element.classList.remove("ring-2", "ring-[#f5c400]/60"), 1800);
      return () => window.clearTimeout(timer);
    }
  }, [focusLink, note.key]);

  return (
    <div className="space-y-4">
      <section data-tour="matcher-note-card" className={cn(PANEL, "overflow-hidden")}>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1f252e] bg-[linear-gradient(120deg,rgba(245,196,0,0.07),transparent_55%)] px-6 py-5">
          <div className="min-w-0">
            <SectionLabel icon={<FileSpreadsheet className="h-3.5 w-3.5 text-[#f5c400]" />}>{t("releaseNote")}</SectionLabel>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h3 className="font-mono text-2xl font-semibold tracking-tight text-white">{note.jira_id || `#${note.ordinal}`}</h3>
              <StatusBadge status={note.status} />
            </div>
            <p className="mt-1 truncate text-xs text-[#687386]">
              {note.file} › {note.sheet} › {t("record", { number: note.ordinal })}
            </p>
          </div>
          {fields.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
              {fields.slice(0, 6).map((field) => (
                <div key={field.name} className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-[0.12em] text-[#687386]">{field.name}</dt>
                  <dd className="truncate font-medium text-[#e5e9f0]">{field.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="grid gap-px bg-[#1a2028] md:grid-cols-2">
          {note.problem || note.solution ? (
            <>
              <TextBlock label={t("problem")} text={note.problem} highlights={highlights} />
              <TextBlock label={t("solution")} text={note.solution} highlights={highlights} />
            </>
          ) : (
            <div className="bg-[#0b0f15] md:col-span-2">
              <TextBlock label={t("text")} text={note.text} highlights={highlights} />
            </div>
          )}
        </div>
      </section>

      {interpretation && (
        <section data-tour="matcher-interpretation" className={cn(PANEL, "px-6 py-5")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionLabel icon={<Sparkles className="h-3.5 w-3.5 text-violet-300" />}>{t("interpretation")}</SectionLabel>
            {interpretation.change_kind && (
              <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-0.5 text-[11px] font-medium text-violet-200">
                {t(`changeKinds.${interpretation.change_kind}`)}
              </span>
            )}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#e5e9f0]">{interpretation.summary}</p>
          {note.assessment && note.assessment !== interpretation.summary && <p className="mt-2 text-xs leading-relaxed text-[#8c96a8]">{note.assessment}</p>}
          {interpretation.concepts.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {interpretation.concepts.map((concept, index) => (
                <div key={index} className={cn(SUBTLE_PANEL, "px-3 py-2.5")}>
                  <p className="text-sm font-medium text-[#f2f4f7]">{concept.term}</p>
                  {concept.source_phrase && concept.verbatim !== false && (
                    <p className="mt-0.5 font-mono text-[11px] text-[#f5c400]/90">„{concept.source_phrase}“</p>
                  )}
                  {concept.effect && <p className="mt-1 text-xs leading-relaxed text-[#8c96a8]">{concept.effect}</p>}
                </div>
              ))}
            </div>
          )}
          {interpretation.affected_items.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[#687386]">{t("affected")}</span>
              {interpretation.affected_items.map((item) => (
                <span key={item} className="rounded-full border border-[#252a33] bg-[#11161e] px-2 py-0.5 text-[11px] text-[#c9d1dd]">
                  {item}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {note.status === "failed" && (
        <section className="flex items-start gap-3 rounded-lg border border-rose-400/30 bg-rose-400/[0.06] px-5 py-4">
          <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
          <div>
            <p className="text-sm font-medium text-rose-200">{t("failed")}</p>
            <p className="mt-1 text-xs text-rose-200/80">{note.error}</p>
          </div>
        </section>
      )}

      {(note.links ?? []).length > 0 ? (
        <section className="space-y-3">
          <SectionLabel icon={<Layers className="h-3.5 w-3.5 text-[#f5c400]" />}>{t("linked", { count: note.links!.length })}</SectionLabel>
          {note.links!.map((link, linkIndex) => (
            <LinkCard
              key={link.provision_key ?? link.reference}
              note={note}
              link={link}
              total={note.candidates?.length ?? 0}
              onOpenProvision={onOpenProvision}
              anchor={linkIndex === 0}
            />
          ))}
        </section>
      ) : note.status === "no_link" ? (
        <section className="flex items-start gap-3 rounded-lg border border-slate-400/25 bg-slate-400/[0.05] px-5 py-4">
          <SearchX className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
          <div>
            <p className="text-sm font-medium text-slate-200">{t("noLinks")}</p>
            {note.no_link_reason && <p className="mt-1 text-sm leading-relaxed text-[#aab3c2]">{note.no_link_reason}</p>}
          </div>
        </section>
      ) : null}

      {(note.corrections ?? []).length > 0 && (
        <Expandable icon={<RefreshCcw className="h-3.5 w-3.5 text-amber-300" />} title={t("corrections", { count: note.corrections!.length })} hint={t("correctionsHint")}>
          <ul className="space-y-2">
            {note.corrections!.map((item, index) => (
              <li key={index} className="flex gap-2 text-xs leading-relaxed text-[#c9d1dd]">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-300" />
                {item}
              </li>
            ))}
          </ul>
        </Expandable>
      )}

      {(note.rejected ?? []).length > 0 && (
        <Expandable tourId="matcher-dismissed" icon={<XCircle className="h-3.5 w-3.5 text-rose-300" />} title={t("rejected", { count: note.rejected!.length })} hint={t("rejectedHint")}>
          <div className="divide-y divide-[#1a2028]">
            {note.rejected!.map((item) => (
              <div key={item.candidate} className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-start gap-4 py-2.5">
                <div>
                  <p className="font-mono text-xs font-semibold text-[#f2f4f7]">{item.reference}</p>
                  <p className="truncate text-[11px] text-[#687386]" title={item.title}>
                    {item.title}
                  </p>
                </div>
                <p className="text-xs leading-relaxed text-[#aab3c2]">{item.reason}</p>
                <span
                  className={cn(
                    "whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px]",
                    item.source === "verification" ? "border-rose-400/30 bg-rose-400/10 text-rose-300" : item.source === "review" ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-[#2c3440] text-[#8c96a8]",
                  )}
                >
                  {t(`decidedBy.${item.source}`)}
                </span>
              </div>
            ))}
          </div>
        </Expandable>
      )}

      {(note.candidates ?? []).length > 0 && (
        <Expandable tourId="matcher-retrieval" icon={<ListChecks className="h-3.5 w-3.5 text-sky-300" />} title={t("retrieval", { count: note.candidates!.length, pool: note.retrieval?.pool ?? 0 })} hint={t("retrievalHint")}>
          <RetrievalTrace note={note} />
        </Expandable>
      )}
    </div>
  );
}

function TextBlock({ label, text, highlights }: { label: string; text: string; highlights: string[] }) {
  return (
    <div className="bg-[#0b0f15] px-6 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#687386]">{label}</p>
      <p className="mt-2 text-sm leading-relaxed text-[#e5e9f0]">{text ? <Highlighted text={text} highlights={highlights} /> : <span className="text-[#687386]">–</span>}</p>
    </div>
  );
}

function LinkCard({
  note,
  link,
  total,
  onOpenProvision,
  anchor,
}: {
  note: NoteResult;
  link: Link;
  total: number;
  onOpenProvision: (target: ProvisionTarget) => void;
  /** The first card of a note carries the guided tour's anchors. */
  anchor: boolean;
}) {
  const tour = (id: string) => (anchor ? id : undefined);
  const t = useTranslations("matcher.evidence");
  const tApproach = useTranslations("matcher.approach");
  const [showText, setShowText] = useState(false);
  const pdfUrl = `${API_ENDPOINTS.regulationDocumentView(link.regulation_id)}#page=${link.page ?? 1}`;
  const quoteCheck = link.checks.find((check) => check.id === "regulation_quote");
  const noteCheck = link.checks.find((check) => check.id === "note_quote");
  const noteField = note.fields.find((field) => link.note_highlights.some((highlight) => field.value.includes(highlight)))?.name;

  return (
    <article
      id={`link-${note.key}-${link.provision_key ?? link.reference}`}
      className={cn(PANEL, "overflow-hidden transition-shadow", link.link_type === "direct" ? "border-l-2 border-l-emerald-400/70" : "border-l-2 border-l-sky-400/70")}
    >
      <header data-tour={tour("matcher-link-head")} className="flex flex-wrap items-start justify-between gap-4 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <RegulationChip name={link.regulation} />
            <h4 className="font-mono text-base font-semibold text-white">{link.reference}</h4>
            <span className="text-sm text-[#c9d1dd]">{link.title}</span>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-[#687386]">
            {link.path.map((heading, index) => (
              <span key={index} className="flex items-center gap-1">
                {index > 0 && <span className="text-[#3a4350]">›</span>}
                {shortHeading(heading)}
              </span>
            ))}
            <span className="text-[#3a4350]">·</span>
            <span>{t("page", { page: link.page_label })}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1.5">
            <LinkTypeBadge type={link.link_type} />
            {link.approach !== "not_specific" && <span className="rounded border border-[#2c3440] px-1.5 py-px text-[10px] text-[#aab3c2]">{tApproach(link.approach)}</span>}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help">
                <ConfidenceDial value={link.confidence} size={48} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[260px] bg-[#151b23] text-[#e5e9f0]">
              <p className="font-semibold">{t("confidenceTitle", { value: link.confidence })}</p>
              <p className="mt-1 text-[11px] text-[#aab3c2]">{t("confidenceHint", { model: link.model_confidence })}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div className="space-y-4 px-5 pb-4">
        {link.affected_element && (
          <p className="text-sm text-[#f2f4f7]">
            <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{t("affectedElement")}</span>
            {link.affected_element}
          </p>
        )}
        <p className="text-sm leading-relaxed text-[#c9d1dd]">{link.rationale}</p>

        <div data-tour={tour("matcher-quotes")} className="grid items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)]">
          <QuoteBlock
            label={t("releaseNoteQuote")}
            sub={noteField}
            quote={link.note_quote}
            check={noteCheck}
            accent="yellow"
          />
          <div className="hidden items-center justify-center md:flex">
            <ArrowRightLeft className="h-4 w-4 text-[#3a4350]" />
          </div>
          <QuoteBlock label={`${link.regulation} ${link.reference}`} sub={t("page", { page: link.page_label })} quote={link.regulation_quote} check={quoteCheck} accent={link.link_type === "direct" ? "emerald" : "sky"} />
        </div>

        <div data-tour={tour("matcher-checks")}>
          <ChecksGrid link={link} total={total} />
        </div>

        {showText && (
          <div className={cn(SUBTLE_PANEL, "px-4 py-3 text-[13px] leading-relaxed text-[#c9d1dd]")}>
            {link.formula && <p className="mb-2 text-[11px] text-amber-300">{t("formulaWarning")}</p>}
            <Highlighted text={link.provision_text} highlights={link.regulation_highlights} />
          </div>
        )}

        <div data-tour={tour("matcher-link-actions")} className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1a2028] pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {link.references.length > 0 && <span className="text-[10px] uppercase tracking-[0.14em] text-[#687386]">{t("crossReferences")}</span>}
            {link.references.slice(0, 6).map((reference) => (
              <span key={reference} className="rounded border border-[#252a33] bg-[#0f141b] px-1.5 py-px font-mono text-[10px] text-[#aab3c2]">
                {reference}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowText((value) => !value)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#aab3c2] hover:bg-[#151b23] hover:text-white">
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showText && "rotate-180")} />
              {showText ? t("hideProvision") : t("showProvision")}
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenProvision({
                  regulationId: link.regulation_id,
                  unit: link.unit,
                  reference: link.reference,
                  paragraph: link.paragraph,
                  highlights: link.regulation_highlights,
                  page: link.page,
                })
              }
              className="flex items-center gap-1.5 rounded-md border border-[#2c3440] px-2.5 py-1 text-xs text-[#e5e9f0] hover:border-[#f5c400]/50 hover:text-[#f5c400]"
            >
              <BookOpen className="h-3.5 w-3.5" />
              {t("readArticle", { label: link.label })}
            </button>
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-md border border-[#2c3440] px-2.5 py-1 text-xs text-[#e5e9f0] hover:border-[#f5c400]/50 hover:text-[#f5c400]">
              <ExternalLink className="h-3.5 w-3.5" />
              {t("openPdf", { page: link.page ?? 1 })}
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

const ACCENTS = {
  yellow: "border-[#f5c400]/25 before:bg-[#f5c400]",
  emerald: "border-emerald-400/25 before:bg-emerald-400",
  sky: "border-sky-400/25 before:bg-sky-400",
};

function QuoteBlock({ label, sub, quote, check, accent }: { label: string; sub?: string; quote: string; check?: Check; accent: keyof typeof ACCENTS }) {
  const t = useTranslations("matcher.evidence");
  return (
    <figure className={cn("relative flex flex-col justify-between overflow-hidden rounded-md border bg-[#0f141b] py-3 pl-4 pr-3 before:absolute before:inset-y-0 before:left-0 before:w-[3px]", ACCENTS[accent])}>
      <div>
        <figcaption className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8c96a8]">
          <span className="truncate">{label}</span>
          {sub && <span className="shrink-0 font-normal normal-case tracking-normal text-[#687386]">{sub}</span>}
        </figcaption>
        <blockquote className="mt-2 text-[13px] italic leading-relaxed text-[#f2f4f7]">“{quote}”</blockquote>
      </div>
      {check && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[#8c96a8]">
          <CheckIcon status={check.status} className="h-3.5 w-3.5" />
          {t(`quoteStatus.${check.status}`)}
        </p>
      )}
    </figure>
  );
}

function ChecksGrid({ link, total }: { link: Link; total: number }) {
  const t = useTranslations("matcher.checks");
  const shown = link.checks.filter((check) => check.id !== "retrieval");
  const retrieval = link.checks.find((check) => check.id === "retrieval");
  return (
    <div className={cn(SUBTLE_PANEL, "px-4 py-3")}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{t("title")}</p>
      <ul className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
        {shown.map((check) => (
          <li key={check.id} className="flex items-start gap-2 text-xs leading-relaxed text-[#c9d1dd]">
            <CheckIcon status={check.status} className="mt-px h-3.5 w-3.5" />
            <span>{describeCheck(t, check, link)}</span>
          </li>
        ))}
      </ul>
      {retrieval && (
        <p className="mt-2 flex items-start gap-2 border-t border-[#1a2028] pt-2 text-[11px] leading-relaxed text-[#8c96a8]">
          <CheckIcon status="info" className="mt-px h-3.5 w-3.5" />
          {describeRetrieval(t, retrieval.params, total)}
        </p>
      )}
    </div>
  );
}

type Translate = ReturnType<typeof useTranslations>;

function describeCheck(t: Translate, check: Check, link: Link) {
  const params = check.params as Record<string, string | number | string[] | null>;
  switch (check.id) {
    case "regulation_quote":
      return t(`regulationQuote.${check.status}`, { reference: link.reference, page: String(params.page ?? link.page_label), similarity: Math.round(Number(params.similarity ?? 0) * 100) });
    case "note_quote":
      return t(`noteQuote.${check.status}`, { similarity: Math.round(Number(params.similarity ?? 0) * 100) });
    case "scope": {
      // Class ids are shown in the page language; runs stored before ids existed fall back to the English labels.
      const classes = (ids: unknown, fallback: unknown) =>
        Array.isArray(ids) && ids.length ? (ids as string[]).map((id) => (t.has(`scopes.${id}`) ? t(`scopes.${id}`) : id)).join(", ") : String(fallback ?? "");
      if (check.status === "pass") return t("scope.pass", { scope: classes(params.note_classes, params.note) });
      if (check.status === "fail") return t("scope.fail", { note: classes(params.note_classes, params.note), provision: classes(params.provision_classes, params.provision) });
      return t("scope.info");
    }
    case "substantive":
      return t(`substantive.${check.status === "fail" ? "fail" : "pass"}`);
    case "concept":
      return check.status === "pass"
        ? t("concept.pass", { concepts: ((params.concepts as string[]) ?? []).join(", ") })
        : check.status === "fail"
          ? t("concept.fail", { concepts: ((params.note as string[]) ?? []).join(", ") })
          : t("concept.info");
    case "citation_retargeted":
      return t("retargeted", { from: String(params.from ?? ""), to: String(params.to ?? "") });
    case "review":
      return t(`review.${check.status === "corrected" ? "corrected" : check.status === "warn" ? "warn" : "pass"}`, { reason: String(params.reason ?? "") });
    default:
      return check.id;
  }
}

function describeRetrieval(t: Translate, params: Record<string, unknown>, total: number) {
  const parts = [t("retrieval.rank", { rank: Number(params.rank ?? 0), total })];
  if (params.keyword_rank) parts.push(t("retrieval.keyword", { rank: Number(params.keyword_rank) }));
  if (params.similarity != null) parts.push(t("retrieval.semantic", { value: Number(params.similarity).toFixed(2) }));
  if (params.queries) parts.push(t("retrieval.queries", { count: Number(params.queries) }));
  if (params.via_concept) parts.push(t("retrieval.concept"));
  if (params.via_reference) parts.push(t("retrieval.reference", { from: String(params.via_reference) }));
  return parts.join(" · ");
}

function Expandable({ icon, title, hint, children, tourId }: { icon: ReactNode; title: string; hint?: string; children: ReactNode; tourId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section data-tour={tourId} className={cn(PANEL, "overflow-hidden")}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-[#0f141b]">
        <span className="flex items-center gap-2.5">
          {icon}
          <span className="text-sm font-medium text-[#e5e9f0]">{title}</span>
          {hint && <span className="hidden text-xs text-[#687386] md:inline">· {hint}</span>}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-[#687386] transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-[#1a2028] px-5 py-3">{children}</div>}
    </section>
  );
}

function RetrievalTrace({ note }: { note: NoteResult }) {
  const t = useTranslations("matcher.evidence");
  const candidates = note.candidates ?? [];
  const maxScore = Math.max(...candidates.map((candidate) => candidate.score), 0.0001);
  return (
    <div className="space-y-4">
      {note.retrieval && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">
            {t("queries")} · {note.retrieval.semantic ? t("hybrid") : t("keywordOnly")}
          </p>
          <ol className="space-y-1">
            {note.retrieval.queries.map((query, index) => (
              <li key={index} className="flex gap-2 font-mono text-[11px] leading-relaxed text-[#aab3c2]">
                <span className="w-5 shrink-0 text-right text-[#4b5563]">{index + 1}</span>
                <span className="min-w-0 break-words">{query}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#1a2028] text-left text-[10px] uppercase tracking-[0.12em] text-[#687386]">
            <th className="py-2 pr-3 font-medium">#</th>
            <th className="py-2 pr-3 font-medium">{t("table.provision")}</th>
            <th className="py-2 pr-3 font-medium">{t("table.score")}</th>
            <th className="py-2 pr-3 font-medium">{t("table.keyword")}</th>
            <th className="py-2 pr-3 font-medium">{t("table.semantic")}</th>
            <th className="py-2 pr-3 font-medium">{t("table.via")}</th>
            <th className="py-2 font-medium">{t("table.decision")}</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate: CandidateRow) => (
            <tr key={candidate.id} className="border-b border-[#151a21] last:border-0">
              <td className="py-2 pr-3 font-mono text-[#4b5563]">{candidate.id}</td>
              <td className="max-w-[280px] py-2 pr-3">
                <span className="font-mono font-semibold text-[#e5e9f0]">{candidate.reference}</span>
                <span className="ml-2 text-[#687386]">{candidate.title}</span>
              </td>
              <td className="py-2 pr-3">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[#1a2028]">
                    <span className="block h-full rounded-full bg-[#f5c400]/70" style={{ width: `${(candidate.score / maxScore) * 100}%` }} />
                  </span>
                </span>
              </td>
              <td className="py-2 pr-3 font-mono text-[#aab3c2]">{candidate.retrieval.keyword_rank ? `#${candidate.retrieval.keyword_rank}` : "–"}</td>
              <td className="py-2 pr-3 font-mono text-[#aab3c2]">{candidate.retrieval.similarity != null ? candidate.retrieval.similarity.toFixed(2) : "–"}</td>
              <td className="py-2 pr-3 text-[#8c96a8]">
                {[candidate.retrieval.via_concept && t("via.concept"), candidate.retrieval.via_reference && t("via.reference", { from: candidate.retrieval.via_reference })].filter(Boolean).join(" · ") || t("via.search")}
              </td>
              <td className="py-2">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px]",
                    candidate.decision === "linked" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : candidate.decision === "rejected" ? "border-rose-400/25 text-rose-300" : "border-[#252a33] text-[#687386]",
                  )}
                >
                  {t(`decision.${candidate.decision}`)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
