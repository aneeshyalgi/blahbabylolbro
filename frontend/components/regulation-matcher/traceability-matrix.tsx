"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, ExternalLink, Grid3x3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LinkTypeBadge, PANEL, RegulationChip, SectionLabel, StatusDot, confidenceColor, shortHeading } from "./atoms";
import type { Link, NoteResult, ProvisionSummary, ProvisionTarget } from "./types";

type Group = { key: string; regulation: string; label: string; title: string; items: ProvisionSummary[] };

function groupProvisions(provisions: ProvisionSummary[]) {
  const groups: Group[] = [];
  for (const provision of provisions) {
    const key = `${provision.regulation_id}:${provision.label}`;
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = { key, regulation: provision.regulation, label: provision.label, title: provision.title, items: [] };
      groups.push(group);
    }
    group.items.push(provision);
  }
  return groups;
}

function subReference(provision: ProvisionSummary) {
  const rest = provision.reference.slice(provision.label.length).trim();
  return rest || "—";
}

export function TraceabilityMatrix({ notes, provisions, onJump }: { notes: NoteResult[]; provisions: ProvisionSummary[]; onJump: (noteKey: string, provisionKey: string) => void }) {
  const t = useTranslations("matcher.matrix");
  const groups = useMemo(() => groupProvisions(provisions), [provisions]);
  const ordered = groups.flatMap((group) => group.items);
  const regulations = Array.from(new Set(ordered.map((item) => item.regulation)));
  const [hoverColumn, setHoverColumn] = useState<string | null>(null);
  const [hoverRow, setHoverRow] = useState<string | null>(null);

  if (provisions.length === 0) {
    return <div className={cn(PANEL, "px-6 py-16 text-center text-sm text-[#8c96a8]")}>{t("empty")}</div>;
  }

  const linkFor = (note: NoteResult, provision: ProvisionSummary): Link | undefined => (note.links ?? []).find((link) => link.provision_key === provision.key);

  return (
    <section data-tour="matcher-matrix" className={cn(PANEL, "overflow-hidden")}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1f252e] px-5 py-3.5">
        <div>
          <SectionLabel icon={<Grid3x3 className="h-3.5 w-3.5 text-[#f5c400]" />}>{t("title")}</SectionLabel>
          <p className="mt-1 text-xs text-[#687386]">{t("hint", { notes: notes.length, provisions: provisions.length })}</p>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-[#8c96a8]">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-emerald-400" /> {t("legendDirect")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-sky-400" /> {t("legendIndirect")}
          </span>
          <span className="flex items-center gap-1.5 font-mono">
            <span className="text-emerald-300">97</span> {t("legendConfidence")}
          </span>
        </div>
      </header>
      <div className="max-h-[calc(100vh-260px)] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20">
            <tr>
              <th rowSpan={3} className="sticky left-0 z-30 w-[300px] min-w-[300px] border-b border-r border-[#1f252e] bg-[#0b0f15] px-4 py-2 text-left align-bottom text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">
                {t("releaseNote")}
              </th>
              {regulations.map((regulation) => (
                <th key={regulation} colSpan={ordered.filter((item) => item.regulation === regulation).length} className="border-b border-l border-[#1f252e] bg-[#0b0f15] px-3 py-2 text-left">
                  <RegulationChip name={regulation} />
                </th>
              ))}
              <th rowSpan={3} className="border-b border-l border-[#1f252e] bg-[#0b0f15] px-3 py-2 align-bottom text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">
                Σ
              </th>
            </tr>
            <tr>
              {groups.map((group) => (
                <th key={group.key} colSpan={group.items.length} className="border-b border-l border-[#1f252e] bg-[#0d1218] px-3 py-2 text-left">
                  <span className="block font-mono text-[12px] font-semibold text-[#f2f4f7]">{group.label.replace(/^Article /, "Art. ")}</span>
                  <span className="block max-w-[220px] truncate text-[10px] font-normal text-[#687386]" title={group.title}>
                    {group.title}
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              {ordered.map((provision) => (
                <th
                  key={provision.key}
                  className={cn("min-w-[68px] border-b border-l border-[#1f252e] bg-[#0d1218] px-2 py-1.5 text-center font-mono text-[11px] font-medium text-[#aab3c2]", hoverColumn === provision.key && "bg-[#f5c400]/10 text-[#f5c400]")}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">{subReference(provision)}</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[320px] bg-[#151b23] text-left text-[#e5e9f0]">
                      <p className="font-mono font-semibold">
                        {provision.regulation} {provision.reference}
                      </p>
                      <p className="text-[11px]">{provision.title}</p>
                      <p className="mt-1 text-[10px] text-[#8c96a8]">{provision.path.map(shortHeading).join(" › ")}</p>
                    </TooltipContent>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {notes.map((note) => {
              const count = (note.links ?? []).length;
              return (
                <tr key={note.key} onMouseEnter={() => setHoverRow(note.key)} onMouseLeave={() => setHoverRow(null)}>
                  <th
                    className={cn(
                      "sticky left-0 z-10 w-[300px] min-w-[300px] max-w-[300px] border-b border-r border-[#1a2028] bg-[#0b0f15] px-4 py-2.5 text-left font-normal",
                      hoverRow === note.key && "bg-[#11161e]",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <StatusDot status={note.status} />
                      <span className="font-mono text-[13px] font-semibold text-[#f2f4f7]">{note.jira_id || `#${note.ordinal}`}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-1 text-[11px] text-[#687386]">{note.interpretation?.summary || note.text}</span>
                  </th>
                  {ordered.map((provision) => {
                    const link = linkFor(note, provision);
                    return (
                      <td
                        key={provision.key}
                        onMouseEnter={() => setHoverColumn(provision.key)}
                        onMouseLeave={() => setHoverColumn(null)}
                        className={cn(
                          "border-b border-l border-[#1a2028] p-0 text-center",
                          (hoverRow === note.key || hoverColumn === provision.key) && "bg-[#11161e]",
                        )}
                      >
                        {link ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => onJump(note.key, provision.key)}
                                className="group flex h-12 w-full flex-col items-center justify-center gap-0.5 transition-transform hover:scale-110"
                              >
                                <span
                                  className={cn(
                                    "h-3.5 w-3.5 rounded-full shadow-[0_0_12px_rgba(52,211,153,0.35)]",
                                    link.link_type === "direct" ? "bg-emerald-400" : "border-2 border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.3)]",
                                  )}
                                />
                                <span className="font-mono text-[10px] font-semibold" style={{ color: confidenceColor(link.confidence) }}>
                                  {link.confidence}
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[340px] bg-[#151b23] text-left text-[#e5e9f0]">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold">{note.jira_id}</span>
                                <span className="text-[#687386]">→</span>
                                <span className="font-mono font-semibold">{link.reference}</span>
                                <LinkTypeBadge type={link.link_type} className="ml-1" />
                              </div>
                              {link.affected_element && <p className="mt-1.5 text-[11px] font-medium">{link.affected_element}</p>}
                              <p className="mt-1 line-clamp-4 text-[11px] text-[#aab3c2]">{link.rationale}</p>
                              <p className="mt-1.5 text-[10px] text-[#f5c400]">{t("clickToOpen")}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="block h-12" />
                        )}
                      </td>
                    );
                  })}
                  <td className="border-b border-l border-[#1a2028] px-3 text-center font-mono text-xs font-semibold text-[#c9d1dd]">{count || <span className="text-[#3a4350]">0</span>}</td>
                </tr>
              );
            })}
            <tr>
              <th className="sticky left-0 z-10 border-r border-[#1f252e] bg-[#0d1218] px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">Σ</th>
              {ordered.map((provision) => (
                <td key={provision.key} className="border-l border-[#1f252e] bg-[#0d1218] px-2 py-2 text-center font-mono text-xs font-semibold text-[#c9d1dd]">
                  {provision.notes.length}
                </td>
              ))}
              <td className="border-l border-[#1f252e] bg-[#0d1218] px-3 text-center font-mono text-xs font-semibold text-[#f5c400]">{ordered.reduce((sum, item) => sum + item.notes.length, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ProvisionsView({
  provisions,
  notes,
  onOpenProvision,
  onJump,
}: {
  provisions: ProvisionSummary[];
  notes: NoteResult[];
  onOpenProvision: (target: ProvisionTarget) => void;
  onJump: (noteKey: string, provisionKey: string) => void;
}) {
  const t = useTranslations("matcher.provisions");
  if (provisions.length === 0) return <div className={cn(PANEL, "px-6 py-16 text-center text-sm text-[#8c96a8]")}>{t("empty")}</div>;
  const maxNotes = Math.max(...provisions.map((item) => item.notes.length), 1);
  return (
    <div data-tour="matcher-provisions-view" className="grid gap-3 xl:grid-cols-2">
      {provisions.map((provision) => {
        const links = notes.flatMap((note) => (note.links ?? []).filter((link) => link.provision_key === provision.key).map((link) => ({ note, link })));
        const highlights = links.flatMap(({ link }) => link.regulation_highlights);
        return (
          <article key={provision.key} className={cn(PANEL, "flex flex-col px-5 py-4")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <RegulationChip name={provision.regulation} />
                  <h4 className="font-mono text-[15px] font-semibold text-white">{provision.reference}</h4>
                </div>
                <p className="mt-1 text-sm text-[#c9d1dd]">{provision.title}</p>
                <p className="mt-1 text-[11px] text-[#687386]">
                  {provision.path.map(shortHeading).join(" › ")} · {t("page", { page: provision.page_label })}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-2xl font-semibold text-[#f2f4f7]">{provision.notes.length}</p>
                <p className="text-[10px] uppercase tracking-[0.12em] text-[#687386]">{t("notes", { count: provision.notes.length })}</p>
              </div>
            </div>
            <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-[#1a2028]" style={{ width: `${(provision.notes.length / maxNotes) * 100}%` }}>
              <span className="h-full bg-emerald-400" style={{ width: `${(provision.direct / provision.notes.length) * 100}%` }} />
              <span className="h-full bg-sky-400" style={{ width: `${(provision.indirect / provision.notes.length) * 100}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {links.map(({ note, link }) => (
                <button
                  key={note.key}
                  type="button"
                  onClick={() => onJump(note.key, provision.key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] transition-colors hover:brightness-125",
                    link.link_type === "direct" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-sky-400/30 bg-sky-400/10 text-sky-200",
                  )}
                >
                  {note.jira_id || `#${note.ordinal}`}
                  <span style={{ color: confidenceColor(link.confidence) }}>{link.confidence}</span>
                </button>
              ))}
            </div>
            <div className="mt-auto flex items-center justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={() =>
                  onOpenProvision({
                    regulationId: provision.regulation_id,
                    unit: provision.unit,
                    reference: provision.reference,
                    paragraph: links[0]?.link.paragraph,
                    highlights,
                    page: provision.page,
                  })
                }
                className="flex items-center gap-1.5 rounded-md border border-[#2c3440] px-2.5 py-1 text-xs text-[#e5e9f0] hover:border-[#f5c400]/50 hover:text-[#f5c400]"
              >
                <BookOpen className="h-3.5 w-3.5" />
                {t("read", { label: provision.label })}
              </button>
              <a
                href={`${API_ENDPOINTS.regulationDocumentView(provision.regulation_id)}#page=${provision.page ?? 1}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-[#2c3440] px-2.5 py-1 text-xs text-[#e5e9f0] hover:border-[#f5c400]/50 hover:text-[#f5c400]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("pdf", { page: provision.page ?? 1 })}
              </a>
            </div>
          </article>
        );
      })}
    </div>
  );
}
