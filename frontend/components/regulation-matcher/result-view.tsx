"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertOctagon, ArrowRightLeft, BookOpen, ChevronDown, Download, ExternalLink, FileSpreadsheet, ListChecks, Search, SearchX, Sparkles, Trash2, TriangleAlert, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckIcon, ConfidenceDial, Highlighted, LinkTypeBadge, PANEL, RegulationChip, SUBTLE_PANEL, SectionLabel, StatusDot, formatDateTime, shortHeading } from "./atoms";
import type { CandidateRow, Check, Link, NoteResult, NoteStatus, ProvisionSummary, ProvisionTarget, Run } from "./types";

type Translate = ReturnType<typeof useTranslations>;
type Filter = "all" | NoteStatus;

/**
 * The result of a run in one view: a line of figures, the provisions the release notes affect (a filter for the list),
 * and every release note with its evidence – the list on the left, the selected note on the right.
 */
export function ResultView({
  run,
  selectedKey,
  onSelect,
  onOpenProvision,
  onDelete,
  locale,
}: {
  run: Run;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onOpenProvision: (target: ProvisionTarget) => void;
  onDelete: () => void;
  locale: string;
}) {
  const [provisionKey, setProvisionKey] = useState<string | null>(null);
  const provisions = run.provisions ?? [];
  const provision = provisions.find((item) => item.key === provisionKey) ?? null;
  const notes = provision ? run.notes.filter((note) => provision.notes.some((entry) => entry.key === note.key)) : run.notes;

  return (
    <div className="space-y-4">
      <ResultSummary run={run} provisions={provisions} active={provisionKey} onToggle={(key) => setProvisionKey((current) => (current === key ? null : key))} onDelete={onDelete} locale={locale} />
      <NotesAndEvidence
        notes={notes}
        allNotes={run.notes}
        provision={provision}
        onClearProvision={() => setProvisionKey(null)}
        selectedKey={selectedKey}
        onSelect={onSelect}
        onOpenProvision={onOpenProvision}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The figures and the impacted provisions
// ---------------------------------------------------------------------------------------------------------------------

function ResultSummary({
  run,
  provisions,
  active,
  onToggle,
  onDelete,
  locale,
}: {
  run: Run;
  provisions: ProvisionSummary[];
  active: string | null;
  onToggle: (key: string) => void;
  onDelete: () => void;
  locale: string;
}) {
  const t = useTranslations("matcher.focus");
  const tKpi = useTranslations("matcher.kpi");
  const summary = run.summary!;
  const regulations = run.regulations.map((item) => item.short).join(", ");
  const figures: { label: string; value: string; sub: string; tone?: string }[] = [
    { label: tKpi("notes"), value: String(summary.notes), sub: tKpi("coverageSub", { linked: summary.linked, review: summary.review, none: summary.no_link }) },
    { label: tKpi("provisions"), value: String(summary.provisions), sub: tKpi("provisionsSub", { articles: summary.articles }) },
    { label: tKpi("links"), value: String(summary.links), sub: tKpi("linksSub", { direct: summary.direct, indirect: summary.indirect }) },
    {
      label: tKpi("quotes"),
      value: `${summary.quotes_verified}/${summary.quotes_total}`,
      sub: t("quotesSub"),
      tone: summary.quotes_verified === summary.quotes_total ? "text-emerald-300" : "text-amber-300",
    },
  ];
  return (
    <section data-tour="matcher-summary" className={cn(PANEL, "overflow-hidden")}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[#1f252e] bg-[linear-gradient(110deg,rgba(245,196,0,0.07),transparent_55%)] px-5 py-3.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
          {figures.map((figure) => (
            <div key={figure.label} className="flex items-baseline gap-2">
              <span className={cn("font-mono text-[22px] font-semibold tabular-nums leading-none text-white", figure.tone)}>{figure.value}</span>
              <span className="leading-tight">
                <span className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#8c96a8]">{figure.label}</span>
                <span className="block text-[11px] text-[#687386]">{figure.sub}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-[11px] text-[#687386] xl:inline">
            {formatDateTime(run.created_at, locale)} · {run.release_note_files.map((file) => file.filename).join(", ")} → {regulations}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={API_ENDPOINTS.regulationMatcherExport(run.id, locale)}
                aria-label={t("export")}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[#2c3440] text-[#aab3c2] transition-colors hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200"
              >
                <Download className="h-4 w-4" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("export")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onDelete}
                aria-label={t("delete")}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[#2c3440] text-[#687386] transition-colors hover:border-rose-400/40 hover:bg-rose-400/10 hover:text-rose-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("delete")}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div data-tour="matcher-impacted" className="px-5 py-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionLabel>{t("impacted")}</SectionLabel>
          {provisions.length ? <span className="text-[11px] text-[#687386]">{t("impactedHint")}</span> : null}
        </div>
        {provisions.length ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {provisions.map((item) => {
              const selected = active === item.key;
              const tone = item.direct && item.indirect ? "mixed" : item.direct ? "direct" : "indirect";
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onToggle(item.key)}
                  title={[`${item.regulation} ${item.reference} – ${item.title}`, item.path.map(shortHeading).join(" › ")].filter(Boolean).join("\n")}
                  className={cn(
                    "group flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                    selected ? "border-[#f5c400]/60 bg-[#f5c400]/[0.1]" : "border-[#252a33] bg-[#0f141b] hover:border-[#3a4350] hover:bg-[#121821]",
                  )}
                >
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      tone === "direct" ? "bg-emerald-400" : tone === "indirect" ? "border-2 border-sky-400" : "bg-[linear-gradient(90deg,#34d399_50%,#38bdf8_50%)]",
                    )}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-[12px] font-semibold text-[#f2f4f7]">
                    {run.regulations.length > 1 ? `${item.regulation} ` : ""}
                    {item.reference.replace(/^Article /, "Art. ").replace(/^Artikel /, "Art. ")}
                  </span>
                  <span className="max-w-[180px] truncate text-[11.5px] text-[#8c96a8]">{item.title}</span>
                  <span className={cn("rounded px-1.5 font-mono text-[10.5px]", selected ? "bg-[#f5c400]/20 text-[#f5c400]" : "bg-[#1a2028] text-[#aab3c2]")}>{item.notes.length}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-[12.5px] text-[#8c96a8]">{t("noProvisions", { regulations })}</p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Release notes and their evidence
// ---------------------------------------------------------------------------------------------------------------------

function NotesAndEvidence({
  notes,
  allNotes,
  provision,
  onClearProvision,
  selectedKey,
  onSelect,
  onOpenProvision,
}: {
  notes: NoteResult[];
  allNotes: NoteResult[];
  provision: ProvisionSummary | null;
  onClearProvision: () => void;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onOpenProvision: (target: ProvisionTarget) => void;
}) {
  const t = useTranslations("matcher.evidence");
  const tFocus = useTranslations("matcher.focus");
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
    return [note.jira_id, note.text, note.interpretation?.summary ?? "", ...(note.links ?? []).map((link) => `${link.regulation} ${link.reference} ${link.title}`)]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
  // The selected note stays selected while it is listed; otherwise the first listed note is shown.
  const selected = visible.find((note) => note.key === selectedKey) ?? visible[0] ?? null;
  const filters: Filter[] = ["all", "linked", "review", "no_link", "failed"];
  const searchable = allNotes.length > 6;

  return (
    <div className="grid min-h-[560px] grid-cols-[300px_minmax(0,1fr)] gap-5">
      <aside data-tour="matcher-note-list" className={cn(PANEL, "flex max-h-[calc(100vh-140px)] min-h-[420px] flex-col self-start overflow-hidden")}>
        <div className="space-y-2.5 border-b border-[#1f252e] p-3">
          {provision ? (
            <div className="flex items-start justify-between gap-2 rounded-md border border-[#f5c400]/30 bg-[#f5c400]/[0.06] px-2.5 py-2">
              <span className="min-w-0 text-[11.5px] leading-snug text-[#e5e9f0]">
                {tFocus("filteredBy", { provision: `${provision.regulation} ${provision.reference}` })}
              </span>
              <button type="button" onClick={onClearProvision} className="shrink-0 rounded p-0.5 text-[#f5c400] hover:bg-[#f5c400]/15" aria-label={tFocus("showAll")} title={tFocus("showAll")}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <SectionLabel>{tFocus("releaseNotes", { count: allNotes.length })}</SectionLabel>
          )}
          {searchable ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#687386]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("search")}
                aria-label={t("search")}
                className="h-8 w-full rounded-md border border-[#252a33] bg-[#0f141b] pl-8 pr-3 text-xs text-[#f2f4f7] placeholder:text-[#687386] focus:border-[#f5c400]/50 focus:outline-none"
              />
            </div>
          ) : null}
          {Object.keys(counts).length > 2 ? (
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
          ) : null}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {visible.length === 0 && <p className="px-3 py-8 text-center text-xs text-[#687386]">{t("noMatches")}</p>}
          {visible.map((note) => {
            const active = selected?.key === note.key;
            return (
              <button
                key={note.key}
                type="button"
                onClick={() => onSelect(note.key)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "relative mb-1 w-full rounded-md border px-3 py-2.5 text-left transition-colors",
                  active ? "border-[#f5c400]/40 bg-[#f5c400]/[0.07]" : "border-transparent hover:border-[#252a33] hover:bg-[#11161e]",
                )}
              >
                {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[#f5c400]" />}
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusDot status={note.status} />
                    <span className="truncate font-mono text-[13px] font-semibold text-[#f2f4f7]">{note.jira_id || `#${note.ordinal}`}</span>
                  </span>
                  <span className="shrink-0 text-[10.5px] text-[#687386]">{note.status ? tStatus(note.status) : ""}</span>
                </span>
                <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#8c96a8]">{note.interpretation?.summary || note.problem || note.text}</span>
                {(note.links ?? []).length > 0 && (
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {(note.links ?? []).map((link) => (
                      <span
                        key={link.provision_key ?? `${link.regulation_id}:${link.reference}`}
                        className={cn(
                          "rounded px-1.5 py-px font-mono text-[10px]",
                          link.link_type === "direct" ? "bg-emerald-400/10 text-emerald-200" : "bg-sky-400/10 text-sky-200",
                          provision && link.provision_key === provision.key && "ring-1 ring-[#f5c400]/60",
                        )}
                      >
                        {link.reference.replace(/^Article /, "Art. ").replace(/^Artikel /, "Art. ")}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>
      <div className="min-w-0">{selected ? <NoteDetail key={selected.key} note={selected} onOpenProvision={onOpenProvision} /> : null}</div>
    </div>
  );
}

function NoteDetail({ note, onOpenProvision }: { note: NoteResult; onOpenProvision: (target: ProvisionTarget) => void }) {
  const t = useTranslations("matcher.evidence");
  const tFocus = useTranslations("matcher.focus");
  const highlights = (note.links ?? []).flatMap((link) => link.note_highlights);
  const descriptive = new Set([note.problem, note.solution].filter(Boolean));
  const fields = note.fields.filter((field) => !descriptive.has(field.value) && !/jira/i.test(field.name) && field.name !== "Text");
  const interpretation = note.interpretation;
  const links = note.links ?? [];
  const candidates = note.candidates ?? [];

  return (
    <div className="space-y-4">
      <section data-tour="matcher-note-card" className={cn(PANEL, "overflow-hidden")}>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1f252e] bg-[linear-gradient(120deg,rgba(245,196,0,0.06),transparent_55%)] px-5 py-4">
          <div className="min-w-0">
            <SectionLabel icon={<FileSpreadsheet className="h-3.5 w-3.5 text-[#f5c400]" />}>{t("releaseNote")}</SectionLabel>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <h3 className="font-mono text-xl font-semibold tracking-tight text-white">{note.jira_id || `#${note.ordinal}`}</h3>
              <StatusPill status={note.status} />
            </div>
            <p className="mt-1 truncate text-[11px] text-[#687386]">
              {note.file} › {note.sheet} › {t("record", { number: note.ordinal })}
            </p>
          </div>
          {fields.length > 0 && (
            <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
              {fields.slice(0, 5).map((field) => (
                <div key={field.name} className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-[0.12em] text-[#687386]">{field.name}</dt>
                  <dd className="max-w-[200px] truncate font-medium text-[#e5e9f0]" title={field.value}>
                    {field.value}
                  </dd>
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
        {interpretation && (
          <div data-tour="matcher-interpretation" className="border-t border-[#1f252e] px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionLabel icon={<Sparkles className="h-3.5 w-3.5 text-violet-300" />}>{t("interpretation")}</SectionLabel>
              {interpretation.change_kind && (
                <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-0.5 text-[11px] font-medium text-violet-200">
                  {t(`changeKinds.${interpretation.change_kind}`)}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[#e5e9f0]">{interpretation.summary}</p>
            {interpretation.concepts.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {interpretation.concepts.map((concept, index) => (
                  <Tooltip key={index}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex max-w-full cursor-help items-center gap-1.5 rounded-md border border-[#252a33] bg-[#0f141b] px-2 py-1 text-[11.5px]">
                        <span className="font-medium text-[#f2f4f7]">{concept.term}</span>
                        {concept.source_phrase && concept.verbatim !== false ? (
                          <span className="max-w-[220px] truncate font-mono text-[10.5px] text-[#f5c400]/85">„{concept.source_phrase}“</span>
                        ) : null}
                      </span>
                    </TooltipTrigger>
                    {concept.effect ? <TooltipContent className="max-w-[320px] bg-[#151b23] text-[#e5e9f0]">{concept.effect}</TooltipContent> : null}
                  </Tooltip>
                ))}
              </div>
            )}
            {interpretation.affected_items.length > 0 && (
              <p className="mt-2.5 text-[11.5px] text-[#8c96a8]">
                <span className="mr-1.5 text-[10px] uppercase tracking-[0.14em] text-[#687386]">{t("affected")}</span>
                {interpretation.affected_items.join(" · ")}
              </p>
            )}
          </div>
        )}
      </section>

      {note.status === "failed" && (
        <section className="flex items-start gap-3 rounded-lg border border-rose-400/30 bg-rose-400/[0.06] px-5 py-4">
          <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
          <div>
            <p className="text-sm font-medium text-rose-200">{t("failed")}</p>
            <p className="mt-1 text-xs text-rose-200/80">{note.error}</p>
          </div>
        </section>
      )}

      {links.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel className="px-1">{t("linked", { count: links.length })}</SectionLabel>
          {links.map((link, linkIndex) => (
            <LinkCard key={link.provision_key ?? link.reference} note={note} link={link} total={candidates.length} onOpenProvision={onOpenProvision} anchor={linkIndex === 0} />
          ))}
        </section>
      ) : note.status === "no_link" || note.status === "review" ? (
        // A note to review without a link: the evidence pointed somewhere, but no link held up – a person decides.
        <section
          className={cn(
            "flex items-start gap-3 rounded-lg border px-5 py-4",
            note.status === "review" ? "border-amber-400/30 bg-amber-400/[0.06]" : "border-slate-400/25 bg-slate-400/[0.05]",
          )}
        >
          {note.status === "review" ? <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /> : <SearchX className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />}
          <div>
            <p className={cn("text-sm font-medium", note.status === "review" ? "text-amber-100" : "text-slate-200")}>{note.status === "review" ? tFocus("inconclusive") : t("noLinks")}</p>
            {note.no_link_reason && <p className="mt-1 text-sm leading-relaxed text-[#aab3c2]">{note.no_link_reason}</p>}
          </div>
        </section>
      ) : null}

      {(note.rejected ?? []).length > 0 && (
        <Expandable tourId="matcher-dismissed" icon={<XCircle className="h-3.5 w-3.5 text-rose-300" />} title={tFocus("considered", { count: note.rejected!.length })} hint={tFocus("consideredHint")}>
          <div className="divide-y divide-[#1a2028]">
            {note.rejected!.map((item) => (
              <div key={item.candidate} className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-start gap-4 py-2.5">
                <div className="min-w-0">
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

      {candidates.length > 0 && (
        <Expandable tourId="matcher-retrieval" icon={<ListChecks className="h-3.5 w-3.5 text-sky-300" />} title={tFocus("howFound")} hint={tFocus("howFoundHint", { count: candidates.length, pool: note.retrieval?.pool ?? candidates.length })}>
          <RetrievalTrace note={note} />
        </Expandable>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: NoteStatus | null }) {
  const t = useTranslations("matcher.status");
  if (!status) return null;
  const styles: Record<NoteStatus, string> = {
    linked: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    review: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    no_link: "border-slate-400/30 bg-slate-400/10 text-slate-300",
    failed: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", styles[status])}>
      <StatusDot status={status} />
      {t(status)}
    </span>
  );
}

function TextBlock({ label, text, highlights }: { label: string; text: string; highlights: string[] }) {
  return (
    <div className="bg-[#0b0f15] px-5 py-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#687386]">{label}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-[#e5e9f0]">{text ? <Highlighted text={text} highlights={highlights} /> : <span className="text-[#687386]">–</span>}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// One linked provision
// ---------------------------------------------------------------------------------------------------------------------

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
      <header data-tour={tour("matcher-link-head")} className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
        <div className="min-w-0 flex-1">
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
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex flex-col items-end gap-1.5">
            <LinkTypeBadge type={link.link_type} />
            {link.approach !== "not_specific" && <span className="rounded border border-[#2c3440] px-1.5 py-px text-[10px] text-[#aab3c2]">{tApproach(link.approach)}</span>}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help">
                <ConfidenceDial value={link.confidence} size={46} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[260px] bg-[#151b23] text-[#e5e9f0]">
              <p className="font-semibold">{t("confidenceTitle", { value: link.confidence })}</p>
              <p className="mt-1 text-[11px] text-[#aab3c2]">{t("confidenceHint", { model: link.model_confidence })}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div className="space-y-3.5 px-5 pb-4">
        {link.affected_element && (
          <p className="text-sm text-[#f2f4f7]">
            <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{t("affectedElement")}</span>
            {link.affected_element}
          </p>
        )}
        <p className="text-sm leading-relaxed text-[#c9d1dd]">{link.rationale}</p>

        <div data-tour={tour("matcher-quotes")} className="grid items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)]">
          <QuoteBlock label={t("releaseNoteQuote")} sub={noteField} quote={link.note_quote} check={noteCheck} accent="yellow" />
          <div className="hidden items-center justify-center md:flex">
            <ArrowRightLeft className="h-4 w-4 text-[#3a4350]" />
          </div>
          <QuoteBlock label={`${link.regulation} ${link.reference}`} sub={t("page", { page: link.page_label })} quote={link.regulation_quote} check={quoteCheck} accent={link.link_type === "direct" ? "emerald" : "sky"} />
        </div>

        <div data-tour={tour("matcher-checks")}>
          <Checks link={link} total={total} />
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

const PILL: Record<Check["status"], string> = {
  pass: "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-200",
  corrected: "border-amber-400/30 bg-amber-400/[0.07] text-amber-200",
  fail: "border-rose-400/30 bg-rose-400/[0.07] text-rose-200",
  warn: "border-amber-400/30 bg-amber-400/[0.07] text-amber-200",
  info: "border-[#2c3440] bg-[#0f141b] text-[#aab3c2]",
};

/** The verification record as one line of pills (details on hover); the reviewer's reason and any problem are spelled out. */
function Checks({ link, total }: { link: Link; total: number }) {
  const t = useTranslations("matcher.checks");
  const tFocus = useTranslations("matcher.focus");
  const shown = link.checks.filter((check) => check.id !== "retrieval");
  const retrieval = link.checks.find((check) => check.id === "retrieval");
  const review = link.checks.find((check) => check.id === "review");
  const problems = shown.filter((check) => check.id !== "review" && (check.status === "fail" || check.status === "warn" || check.status === "corrected"));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{t("title")}</span>
        {shown.map((check) => (
          <Tooltip key={check.id}>
            <TooltipTrigger asChild>
              <span className={cn("inline-flex cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", PILL[check.status])}>
                <CheckIcon status={check.status} className="h-3 w-3" />
                {tFocus(`checkShort.${check.id}`)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[340px] bg-[#151b23] text-[#e5e9f0]">{describeCheck(t, check, link)}</TooltipContent>
          </Tooltip>
        ))}
        {retrieval ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn("inline-flex cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", PILL.info)}>
                <Search className="h-3 w-3" />
                {tFocus("foundAs", { rank: Number(retrieval.params.rank ?? 0), total })}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[340px] bg-[#151b23] text-[#e5e9f0]">{describeRetrieval(t, retrieval.params, total)}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {problems.map((check) => (
        <p key={check.id} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-amber-200/90">
          <CheckIcon status={check.status} className="mt-px h-3.5 w-3.5" />
          {describeCheck(t, check, link)}
        </p>
      ))}
      {review && String(review.params.reason ?? "").trim() ? (
        <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[#aab3c2]">
          <CheckIcon status={review.status} className="mt-px h-3.5 w-3.5" />
          {describeCheck(t, review, link)}
        </p>
      ) : null}
    </div>
  );
}

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
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-[#0f141b]">
        <span className="flex min-w-0 items-center gap-2.5">
          {icon}
          <span className="shrink-0 whitespace-nowrap text-sm font-medium text-[#e5e9f0]">{title}</span>
          {hint && <span className="hidden min-w-0 truncate text-xs text-[#687386] md:inline">· {hint}</span>}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#687386] transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-[#1a2028] px-5 py-3">{children}</div>}
    </section>
  );
}

/** How the evidence was gathered: the search queries, every candidate with its ranking signals, and the self-corrections. */
function RetrievalTrace({ note }: { note: NoteResult }) {
  const t = useTranslations("matcher.evidence");
  const candidates = note.candidates ?? [];
  const maxScore = Math.max(...candidates.map((candidate) => candidate.score), 0.0001);
  const corrections = note.corrections ?? [];
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
                <span className="block h-1.5 w-16 overflow-hidden rounded-full bg-[#1a2028]">
                  <span className="block h-full rounded-full bg-[#f5c400]/70" style={{ width: `${(candidate.score / maxScore) * 100}%` }} />
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
      {corrections.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{t("corrections", { count: corrections.length })}</p>
          <ul className="space-y-1.5">
            {corrections.map((item, index) => (
              <li key={index} className="flex gap-2 text-xs leading-relaxed text-[#c9d1dd]">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-300" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
