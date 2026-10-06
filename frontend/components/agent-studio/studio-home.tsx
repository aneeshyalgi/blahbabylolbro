"use client";

import { KeyboardEvent, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, PenLine, Sparkles, Wand2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useStudioText, type StudioTextKey } from "./i18n";
import { parseProcedure } from "./procedure-editor";
import type { AgentTemplate, ToolInfo } from "./types";
import { AgentAvatar, ToolIcon, agentAccent } from "./visuals";

const SCRATCH_IDEAS: StudioTextKey[] = ["home.idea1", "home.idea2", "home.idea3", "home.idea4"];
const TAILOR_IDEAS: StudioTextKey[] = ["home.tailorIdea1", "home.tailorIdea2", "home.tailorIdea3", "home.tailorIdea4"];
const BLUEPRINT_STEP_LIMIT = 6;
const BRAND = "#f5c400";

function StageHeading({ number, title, hint, done }: { number: number; title: string; hint: string; done?: boolean }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums",
          done ? "border-[#f5c400] bg-[#f5c400] text-black" : "border-[#f5c400]/50 text-[#f5c400]",
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : number}
      </span>
      <div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mt-0.5 text-sm text-[#8c96a8]">{hint}</p>
      </div>
    </div>
  );
}

/** Three-stage progress: foundation chosen, brief written, then test & refine in the workbench. */
function Stepper({ stage, foundationLabel }: { stage: 1 | 2; foundationLabel: string }) {
  const { t } = useStudioText();
  const items = [
    { label: t("home.stageFoundation"), detail: foundationLabel },
    { label: t("home.stageBrief"), detail: "" },
    { label: t("home.stageTest"), detail: "" },
  ];
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {items.map((item, index) => {
        const number = index + 1;
        const complete = number < stage || (number === 1 && stage >= 1 && Boolean(item.detail));
        const active = number === stage;
        return (
          <li key={item.label} className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums transition-colors",
                complete ? "border-[#f5c400] bg-[#f5c400] text-black" : active ? "border-[#f5c400] text-[#f5c400]" : "border-[#303845] text-[#687386]",
              )}
            >
              {complete ? <Check className="h-3 w-3" /> : number}
            </span>
            <span className="min-w-0">
              <span className={cn("block truncate text-xs font-semibold", active || complete ? "text-white" : "text-[#687386]")}>{item.label}</span>
              {item.detail ? <span className="block max-w-[180px] truncate text-[10.5px] text-[#8c96a8]">{item.detail}</span> : null}
            </span>
            {index < items.length - 1 ? (
              <span className={cn("mx-1 h-px w-10 shrink-0", number < stage ? "bg-[#f5c400]/70" : "bg-[#303845]")} aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function StudioHome({
  templates,
  tools,
  generating,
  onGenerate,
  onUseTemplate,
  onStartBlank,
  selectedTemplateId: selectedId,
  onSelectTemplate,
}: {
  templates: AgentTemplate[];
  tools: ToolInfo[];
  generating: boolean;
  /** Selected foundation; null means Blank canvas. Owned by the shell so the guided tour can follow it. */
  selectedTemplateId: string | null;
  onSelectTemplate: (id: string | null) => void;
  /** Design from scratch, or tailor the given template with the brief. */
  onGenerate: (prompt: string, template: AgentTemplate | null) => void;
  onUseTemplate: (template: AgentTemplate) => void;
  onStartBlank: () => void;
}) {
  const { t, toolLabel, toolDescription } = useStudioText();
  const [prompt, setPrompt] = useState("");
  const briefRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const toolsByName = useMemo(() => new Map(tools.map((tool) => [tool.name, tool])), [tools]);
  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const accent = selected ? agentAccent(selected.definition.color) : BRAND;
  const steps = selected ? parseProcedure(selected.definition.instructions).steps : [];
  const ideas = selected ? TAILOR_IDEAS : SCRATCH_IDEAS;
  const stage: 1 | 2 = selectedId !== null || prompt.trim() ? 2 : 1;

  const choose = (id: string | null) => {
    onSelectTemplate(id);
    window.requestAnimationFrame(() => {
      briefRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      inputRef.current?.focus({ preventScroll: true });
    });
  };

  const submit = () => {
    if (!prompt.trim() || generating) return;
    onGenerate(prompt.trim(), selected);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (prompt.trim()) submit();
      else if (selected) onUseTemplate(selected);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 pb-16 pt-9">
        <header className="flex flex-wrap items-end justify-between gap-6 border-b border-[#1c222b] pb-7">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#f5c400]">
              <Sparkles className="h-3 w-3" /> {t("home.badge")}
            </p>
            <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight text-white">{t("home.title")}</h2>
            <p className="mt-2 text-sm leading-6 text-[#8c96a8]">{t("home.subtitle")}</p>
          </div>
          <div data-tour="stepper">
            <Stepper stage={stage} foundationLabel={selected ? selected.definition.name : selectedId === null && prompt.trim() ? t("home.scratchTitle") : ""} />
          </div>
        </header>

        {/* Stage 1: foundation */}
        <section className="pt-8">
          <StageHeading number={1} title={t("home.stageFoundation")} hint={t("home.stageFoundationHint")} done={selectedId !== null} />
          <div data-tour="foundation" className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => choose(null)}
              aria-pressed={selectedId === null}
              className={cn(
                "group relative row-span-3 flex flex-col justify-between overflow-hidden rounded-xl border p-5 text-left transition-all",
                selectedId === null ? "border-[#f5c400]/60 bg-[#111820]" : "border-dashed border-[#303845] bg-[#0b1017] hover:border-[#f5c400]/40",
              )}
            >
              <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_70%_at_0%_0%,rgba(245,196,0,0.10),transparent_60%)]" />
              <span className="relative">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#f5c400]/40 bg-[#f5c400]/10 text-[#f5c400]">
                  <PenLine className="h-6 w-6" />
                </span>
                <span className="mt-5 block text-lg font-semibold text-white">{t("home.scratchTitle")}</span>
                <span className="mt-2 block text-sm leading-6 text-[#8c96a8]">{t("home.scratchText")}</span>
              </span>
              <span className="relative mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-[#f5c400]">
                {selectedId === null ? <Check className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />}
                {selectedId === null ? t("home.selected") : t("home.scratchCta")}
              </span>
            </button>

            {templates.map((template) => {
              const isSelected = template.id === selectedId;
              const templateAccent = agentAccent(template.definition.color);
              const stepCount = parseProcedure(template.definition.instructions).steps.length;
              return (
                <button
                  key={template.id}
                  type="button"
                  data-tour={`template-${template.id}`}
                  onClick={() => choose(template.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    "group relative flex flex-col overflow-hidden rounded-xl border p-4 text-left transition-all",
                    isSelected ? "bg-[#111820]" : "border-[#1f2630] bg-[#0b1017] hover:-translate-y-0.5 hover:bg-[#0e141c]",
                  )}
                  style={isSelected ? { borderColor: `${templateAccent}99`, boxShadow: `0 0 0 1px ${templateAccent}33, 0 16px 36px rgba(0,0,0,0.35)` } : undefined}
                >
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${templateAccent}${isSelected ? "" : "80"}, transparent)` }} />
                  <span className="flex items-start justify-between gap-3">
                    <AgentAvatar icon={template.definition.icon} color={template.definition.color} size="sm" />
                    {isSelected ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: templateAccent }}>
                        <Check className="h-3 w-3 text-black" />
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-3 text-sm font-semibold text-white">{template.definition.name}</span>
                  <span className="mt-1 line-clamp-2 text-xs leading-5 text-[#8c96a8]">{template.tagline}</span>
                  <span className="mt-3 flex items-center gap-2 text-[10.5px] text-[#687386]">
                    <span>{t("home.stepCount", { count: stepCount })}</span>
                    <span aria-hidden="true">·</span>
                    <span>{t("home.toolCount", { count: template.definition.tools.length })}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Visual hand-off from the chosen foundation to the brief */}
        <div className="flex justify-center py-3" aria-hidden="true">
          <span className="h-10 w-px" style={{ background: `linear-gradient(180deg, transparent, ${accent})` }} />
        </div>

        {/* Stage 2: brief + live blueprint */}
        <section ref={briefRef} className="scroll-mt-6">
          <StageHeading
            number={2}
            title={t("home.stageBrief")}
            hint={selected ? t("home.stageBriefTemplate", { name: selected.definition.name }) : t("home.stageBriefScratch")}
          />
          <div className="grid overflow-hidden rounded-2xl border border-[#252a33] bg-[#0b1017] shadow-[0_24px_60px_rgba(0,0,0,0.35)] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div data-tour="brief" className="flex flex-col p-5">
              <div className="flex-1 rounded-xl border border-[#303845] bg-[#080c12] p-2 transition-colors focus-within:border-[#f5c400]/60">
                <Textarea
                  ref={inputRef}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={selected ? t("home.placeholderTemplate", { name: selected.definition.name }) : t("home.placeholder")}
                  className="min-h-40 resize-none border-0 bg-transparent px-3 py-2 text-[15px] leading-7 shadow-none focus-visible:ring-0 dark:bg-transparent"
                  maxLength={8000}
                  disabled={generating}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ideas.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => {
                      setPrompt(t(idea));
                      inputRef.current?.focus();
                    }}
                    disabled={generating}
                    className="rounded-full border border-[#303845] bg-[#0d131b] px-3 py-1 text-left text-xs text-[#aeb8c7] transition-colors hover:border-[#f5c400]/50 hover:text-white"
                  >
                    {t(idea)}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#1c222b] pt-4">
                <span className="text-[11px] text-[#687386]">
                  {selected ? t("home.shortcut2") : t("home.shortcut")}
                  {!selected ? (
                    <>
                      {" · "}
                      <button type="button" onClick={onStartBlank} disabled={generating} className="underline-offset-2 hover:text-white hover:underline">
                        {t("home.emptyEditor")}
                      </button>
                    </>
                  ) : null}
                </span>
                <div className="flex items-center gap-2">
                  {selected ? (
                    <button
                      type="button"
                      data-tour="use-as-is"
                      onClick={() => onUseTemplate(selected)}
                      disabled={generating}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all disabled:opacity-40",
                        prompt.trim()
                          ? "border border-[#303845] text-[#e5e9ef] hover:border-[#f5c400]/50"
                          : "bg-[#f5c400] text-black shadow-[0_8px_24px_rgba(245,196,0,0.25)] hover:bg-[#ffd84a]",
                      )}
                    >
                      {t("home.useAsIs")} <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!prompt.trim() || generating}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#f5c400] px-4 py-2 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(245,196,0,0.25)] transition-all hover:bg-[#ffd84a] disabled:bg-[#f5c400]/25 disabled:text-black/60 disabled:shadow-none"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    {selected
                      ? generating ? t("home.tailoring") : t("home.tailor")
                      : generating ? t("home.designing") : t("home.design")}
                  </button>
                </div>
              </div>
            </div>

            <aside data-tour="blueprint" className="relative border-t border-[#1c222b] bg-[#080c12] p-5 lg:border-l lg:border-t-0">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, ${accent}, transparent 70%)` }} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#687386]">{t("home.blueprint")}</p>

              <div key={selectedId ?? "scratch"} className="blueprint">
                {selected ? (
                  <>
                    <div className="blueprint-in mt-4 flex items-center gap-3">
                      <AgentAvatar icon={selected.definition.icon} color={selected.definition.color} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{selected.definition.name}</p>
                        <p className="line-clamp-2 text-xs leading-5 text-[#8c96a8]">{selected.definition.purpose}</p>
                      </div>
                    </div>
                    <ol className="relative mt-5 space-y-3">
                      <span className="absolute bottom-2 left-[11px] top-2 w-px bg-[#252a33]" aria-hidden="true" />
                      {steps.slice(0, BLUEPRINT_STEP_LIMIT).map((step, index) => (
                        <li key={index} className="blueprint-in relative flex gap-3" style={{ animationDelay: `${60 + index * 45}ms` }}>
                          <span
                            className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#080c12] text-[10.5px] font-bold tabular-nums"
                            style={{ color: accent, boxShadow: `inset 0 0 0 1px ${accent}66` }}
                          >
                            {index + 1}
                          </span>
                          <span className="line-clamp-2 pt-0.5 text-xs leading-5 text-[#c2cad5]">{step}</span>
                        </li>
                      ))}
                    </ol>
                    {steps.length > BLUEPRINT_STEP_LIMIT ? (
                      <p className="mt-2 pl-9 text-[11px] text-[#687386]">{t("home.moreSteps", { count: steps.length - BLUEPRINT_STEP_LIMIT })}</p>
                    ) : null}
                    <div className="blueprint-in mt-5 flex flex-wrap gap-1.5" style={{ animationDelay: `${80 + Math.min(steps.length, BLUEPRINT_STEP_LIMIT) * 45}ms` }}>
                      {selected.definition.tools.map((name) => {
                        const tool = toolsByName.get(name);
                        return (
                          <span key={name} className="inline-flex items-center gap-1 rounded-full border border-[#252a33] bg-[#0d131b] px-2 py-0.5 text-[10.5px] text-[#8c96a8]">
                            <ToolIcon icon={tool?.icon} className="h-3 w-3" /> {tool ? toolLabel(tool) : name}
                          </span>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="blueprint-in mt-4">
                    <p className="text-sm font-semibold text-white">{t("home.blueprintScratchTitle")}</p>
                    <ol className="relative mt-5 space-y-4">
                      <span className="absolute bottom-2 left-[11px] top-2 w-px border-l border-dashed border-[#303845]" aria-hidden="true" />
                      {(["home.blueprintScratch1", "home.blueprintScratch2", "home.blueprintScratch3"] as const).map((key, index) => (
                        <li key={key} className="blueprint-in relative flex items-center gap-3" style={{ animationDelay: `${60 + index * 60}ms` }}>
                          <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-[#f5c400]/50 bg-[#080c12] text-[10.5px] font-bold text-[#f5c400]">
                            {index + 1}
                          </span>
                          <span className="text-xs text-[#aeb8c7]">{t(key)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </section>

        {tools.length ? (
          <section className="mt-12 rounded-xl border border-[#1f2630] bg-[#0b1017] p-5">
            <h3 className="text-sm font-semibold text-white">{t("home.toolsTitle")}</h3>
            <p className="mt-0.5 text-xs text-[#8c96a8]">{t("home.toolsSubtitle")}</p>
            <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {tools.map((tool) => (
                <div key={tool.name} className="flex gap-2.5">
                  <ToolIcon icon={tool.icon} className="mt-0.5 h-4 w-4 shrink-0 text-[#f5c400]" />
                  <div>
                    <p className="text-xs font-semibold text-[#e5e9ef]">{toolLabel(tool)}</p>
                    <p className="text-[11px] leading-4 text-[#8c96a8]">{toolDescription(tool)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      <style jsx>{`
        .blueprint :global(.blueprint-in) {
          animation: blueprint-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes blueprint-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .blueprint :global(.blueprint-in) { animation: none; }
        }
      `}</style>
    </div>
  );
}
