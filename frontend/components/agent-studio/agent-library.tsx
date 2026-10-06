"use client";

import { useMemo, useState } from "react";
import { ArrowRight, GraduationCap, Languages, LayoutGrid, Loader2, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudioText, type StudioLocale } from "./i18n";
import type { SavedAgent } from "./types";
import { AgentAvatar, agentAccent } from "./visuals";

const LANGUAGE_OPTIONS: { value: StudioLocale; label: string; title: string }[] = [
  { value: "en", label: "EN", title: "English" },
  { value: "de", label: "DE", title: "Deutsch" },
];

export function AgentLibrary({
  agents,
  loading,
  selectedId,
  homeActive,
  draftActive,
  onSelect,
  onHome,
  onStartTour,
}: {
  agents: SavedAgent[];
  loading: boolean;
  selectedId: string | null;
  homeActive: boolean;
  draftActive: boolean;
  onSelect: (agent: SavedAgent) => void;
  onHome: () => void;
  onStartTour: () => void;
}) {
  const { t, plural, relativeTime, locale, setLocale } = useStudioText();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return agents;
    return agents.filter((agent) => `${agent.name} ${agent.description}`.toLowerCase().includes(text));
  }, [agents, query]);

  return (
    <aside data-tour="library" className="flex w-[272px] shrink-0 flex-col border-r border-[#1c222b] bg-[#070a0f]">
      <div className="px-3 pt-4">
        <button
          type="button"
          onClick={onStartTour}
          className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-[#f5c400]/35 bg-gradient-to-br from-[#f5c400]/[0.13] via-[#f5c400]/[0.05] to-transparent px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 hover:border-[#f5c400]/70 hover:shadow-[0_10px_30px_rgba(245,196,0,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5c400]/60"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f5c400] text-black shadow-[0_6px_18px_rgba(245,196,0,0.28)] transition-transform duration-300 group-hover:scale-105">
            <GraduationCap className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold leading-5 text-white">{t("library.tour")}</span>
            <span className="block text-[11px] leading-4 text-[#c8b46b]">{t("library.tourHint")}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-[#f5c400] transition-transform duration-300 group-hover:translate-x-0.5" />
        </button>
      </div>

      <div className="px-3 pb-3 pt-3">
        <div className="flex items-center gap-2 rounded-md border border-[#252a33] bg-[#0b1017] px-2.5 focus-within:border-[#f5c400]/40">
          <Search className="h-3.5 w-3.5 text-[#687386]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("library.search")}
            className="h-8 min-w-0 flex-1 bg-transparent text-xs text-[#e5e9ef] outline-none placeholder:text-[#687386]"
          />
        </div>
      </div>

      <div className="flex h-6 items-center justify-between pb-1.5 pl-4 pr-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">
          {t("library.yourAgents")} <span className="ml-1 tabular-nums tracking-normal">{agents.length}</span>
        </span>
        {!homeActive ? (
          <button
            type="button"
            onClick={onHome}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#8c96a8] transition-colors hover:bg-white/5 hover:text-white"
            title={draftActive ? t("library.backHome") : t("library.newAgent")}
            aria-label={draftActive ? t("library.backHome") : t("library.newAgent")}
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {loading && !agents.length ? (
          <div className="flex items-center gap-2 px-2 py-6 text-xs text-[#687386]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("common.loading")}
          </div>
        ) : !agents.length ? (
          <div className="mx-1 mt-2 rounded-lg border border-dashed border-[#252a33] p-4 text-center">
            <LayoutGrid className="mx-auto h-5 w-5 text-[#3a4553]" />
            <p className="mt-2 text-xs leading-5 text-[#8c96a8]">{t("library.empty")}</p>
          </div>
        ) : !filtered.length ? (
          <p className="px-3 py-4 text-xs text-[#687386]">{t("library.noMatch", { query })}</p>
        ) : (
          filtered.map((agent) => {
            const selected = agent.id === selectedId;
            const accent = agentAccent(agent.definition.color);
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => onSelect(agent)}
                className={cn(
                  "relative flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                  selected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
                )}
              >
                {selected ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full" style={{ backgroundColor: accent }} /> : null}
                <AgentAvatar icon={agent.definition.icon} color={agent.definition.color} size="sm" className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm font-medium", selected ? "text-white" : "text-[#d6dbe3]")}>{agent.name}</span>
                  <span className="block truncate text-[11px] text-[#8c96a8]">{agent.description || t("library.noDescription")}</span>
                  <span className="mt-0.5 block text-[10.5px] text-[#687386]">
                    {agent.conversation_count
                      ? plural("library.conversations", agent.conversation_count, { time: relativeTime(agent.last_run_date) })
                      : t("library.neverRun", { count: agent.definition.tools.length })}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>

      <div data-tour="language" className="flex shrink-0 items-center justify-between gap-2 border-t border-[#1c222b] px-3 py-3">
        <span className="inline-flex items-center gap-1.5 px-1 text-[11px] font-medium text-[#8c96a8]">
          <Languages className="h-3.5 w-3.5 text-[#687386]" aria-hidden="true" /> {t("common.language")}
        </span>
        <div className="flex items-center rounded-md border border-[#252a33] bg-[#0b1017] p-0.5" role="radiogroup" aria-label={t("common.language")}>
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={locale === option.value}
              title={option.title}
              onClick={() => setLocale(option.value)}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors",
                locale === option.value ? "bg-[#f5c400] text-black" : "text-[#8c96a8] hover:text-white",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
