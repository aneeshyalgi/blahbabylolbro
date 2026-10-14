"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Check,
  Code2,
  Crosshair,
  Flag,
  FlaskConical,
  Languages,
  Microscope,
  MousePointerClick,
  Pause,
  Play,
  Sparkles,
  Waypoints,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSectionLanguage } from "@/components/section-language";
import {
  Emblem,
  ONBOARDING_CSS,
  ScreenHeading,
  TipRow,
  clippingAncestors,
  format,
  placeCard,
  prefersReducedMotion,
  studioOverlayOpen,
  useFocusTrap,
  type Box,
} from "@/components/agent-studio/onboarding/studio-onboarding";
import {
  CONTENT_ONBOARDING_COPY,
  DECK_SCREENS,
  TOUR_STEPS,
  type ContentLocale,
  type ContentOnboardingCopy,
  type ReachKind,
  type TourStage,
  type TourStepDef,
} from "./content-onboarding-content";

export const CONTENT_ONBOARDING_STORAGE_KEY = "dataflow_content_lineage_onboarding_v2";

/** What the tour needs from the content lineage tab: its state and the actions it may perform for the user. */
export type ContentTourController = {
  stage: TourStage;
  /** The real analysis the tour started: none yet, running, finished with a result, or stopped without one. */
  tourRun: "idle" | "running" | "done" | "failed";
  /** Why the tour's analysis stopped (failed, cancelled or interrupted). */
  tourRunError: string | null;
  executionsAvailable: boolean;
  executionSelected: boolean;
  /** Whether a field of the selected execution flows into another field (null while its fields load). */
  fieldsAvailable: boolean | null;
  fieldSelected: boolean;
  /** A downstream field is selected in the lineage (its details are shown). */
  flowFieldSelected: boolean;
  showSetup: () => void;
  /** Bring the progress view of the tour's analysis on screen; it stays there (also once finished) until a results step. */
  showProgress: () => void;
  /** Bring the tour's finished analysis on screen. */
  showResults: () => void;
  selectFirstExecution: () => void;
  /** Select the field whose content reaches the most fields (as soon as the execution's fields are there). */
  selectSuggestedField: () => void;
  /** Start the real analysis with the selected execution and field. */
  startRun: () => void;
  /** Select the most instructive next field in the lineage. */
  selectFlowField: () => void;
};

type Phase = "deck" | "tour" | "complete";

export function ContentOnboarding({
  open,
  controller,
  onStartTour,
  onClose,
}: {
  open: boolean;
  controller: ContentTourController;
  /** The hands-on tour begins: the analysis started from now on is the one the tour follows. */
  onStartTour: () => void;
  onClose: () => void;
}) {
  const { language, setLanguage } = useSectionLanguage();
  const copy = CONTENT_ONBOARDING_COPY[language];
  const [phase, setPhase] = useState<Phase>("deck");
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) setPhase("deck");
  }, [open]);

  // While a modal screen is up, the page behind it must not be reachable by Tab or screen readers.
  const modal = open && mounted && phase !== "tour";
  useEffect(() => {
    if (!modal) return;
    const silenced: Element[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child === rootRef.current || child.hasAttribute("inert") || child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
      child.setAttribute("inert", "");
      silenced.push(child);
    }
    return () => silenced.forEach((child) => child.removeAttribute("inert"));
  }, [modal]);

  if (!open || !mounted) return null;

  const finish = () => {
    try {
      localStorage.setItem(CONTENT_ONBOARDING_STORAGE_KEY, "done");
    } catch {
      // Storage unavailable; the tour simply shows again next time.
    }
    onClose();
  };

  return createPortal(
    <div ref={rootRef} className="ob-root" lang={language}>
      {phase === "deck" ? (
        <WelcomeDeck
          copy={copy}
          language={language}
          setLanguage={setLanguage}
          onSkip={finish}
          onStartTour={() => {
            onStartTour();
            setPhase("tour");
          }}
        />
      ) : phase === "tour" ? (
        <SpotlightTour copy={copy} controller={controller} onDone={() => setPhase("complete")} onSkip={finish} />
      ) : (
        <CompletionCard copy={copy} onFinish={finish} />
      )}
      <style>{ONBOARDING_CSS}</style>
      <style>{CONTENT_CSS}</style>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Act 1 · Introduction deck                                                  */
/* -------------------------------------------------------------------------- */

function WelcomeDeck({
  copy,
  language,
  setLanguage,
  onSkip,
  onStartTour,
}: {
  copy: ContentOnboardingCopy;
  language: ContentLocale;
  setLanguage: (language: ContentLocale) => void;
  onSkip: () => void;
  onStartTour: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [leaving, setLeaving] = useState(false);
  const screen = DECK_SCREENS[index];
  const last = index === DECK_SCREENS.length - 1;

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= DECK_SCREENS.length || next === index) return;
      setDirection(next > index ? 1 : -1);
      setIndex(next);
    },
    [index],
  );

  const deckRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(deckRef);
  const leaveTimer = useRef<number | null>(null);
  const startTour = useCallback(() => {
    if (leaveTimer.current !== null) return;
    setLeaving(true);
    leaveTimer.current = window.setTimeout(onStartTour, 420);
  }, [onStartTour]);

  useEffect(() => {
    deckRef.current?.focus({ preventScroll: true });
    return () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || leaveTimer.current !== null) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (last) startTour();
        else go(index + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === "Escape") {
        onSkip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, last, onSkip, startTour]);

  return (
    <div className={cn("ob-backdrop", leaving && "ob-leaving")}>
      <div ref={deckRef} tabIndex={-1} className="ob-deck cx-deck outline-none" role="dialog" aria-modal="true" aria-label={copy.welcome.title}>
        <aside className="relative flex flex-col border-r border-white/5 bg-[#080c12] px-4 py-6">
          <div className="flex items-center gap-2.5 px-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#f5c400]/40 bg-[#f5c400]/10 text-[#f5c400]">
              <Waypoints className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{copy.ui.product}</p>
              <p className="text-[10.5px] text-[#687386]">{copy.ui.minutes}</p>
            </div>
          </div>

          <nav className="relative mt-7" aria-label="Chapters">
            <span
              className="ob-rail-indicator absolute left-0 right-0 top-0 h-10 rounded-lg border border-[#f5c400]/25 bg-[#f5c400]/[0.08]"
              style={{ transform: `translateY(${index * 44}px)` }}
              aria-hidden="true"
            />
            {copy.ui.chapters.map((chapter, chapterIndex) => {
              const done = chapterIndex < index;
              const active = chapterIndex === index;
              return (
                <button
                  key={chapter}
                  type="button"
                  onClick={() => go(chapterIndex)}
                  className="relative mb-1 flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left"
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10.5px] font-bold transition-colors duration-500",
                      done ? "border-[#f5c400] bg-[#f5c400] text-black" : active ? "border-[#f5c400] text-[#f5c400]" : "border-[#303845] text-[#687386]",
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : chapterIndex + 1}
                  </span>
                  <span className={cn("truncate text-[13px] transition-colors duration-500", active ? "font-semibold text-white" : done ? "text-[#c2cad5]" : "text-[#687386]")}>
                    {chapter}
                  </span>
                </button>
              );
            })}
          </nav>

          <p className="mt-auto px-2 text-[10.5px] leading-4 text-[#4f5968]">{copy.ui.keyboard}</p>
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-10 pb-6 pt-9">
            <div key={`${screen}-${language}`} className={direction > 0 ? "ob-enter-fwd" : "ob-enter-back"}>
              {screen === "language" ? <LanguageScreen copy={copy} language={language} setLanguage={setLanguage} /> : null}
              {screen === "welcome" ? <WelcomeScreen copy={copy} /> : null}
              {screen === "difference" ? <DifferenceScreen copy={copy} /> : null}
              {screen === "pipeline" ? <PipelineScreen copy={copy} /> : null}
              {screen === "forward" ? <ForwardScreen copy={copy} language={language} /> : null}
              {screen === "view" ? <ViewScreen copy={copy} /> : null}
              {screen === "controls" ? <ControlsScreen copy={copy} /> : null}
              {screen === "ready" ? <ReadyScreen copy={copy} onStart={startTour} /> : null}
            </div>
          </div>

          <footer className="flex items-center justify-between gap-4 border-t border-white/5 px-10 py-4">
            <button type="button" onClick={onSkip} className="text-xs text-[#687386] transition-colors hover:text-white">
              {copy.ui.skipIntro}
            </button>
            <div className="flex flex-1 justify-center gap-1.5" aria-hidden="true">
              {DECK_SCREENS.map((item, itemIndex) => (
                <span key={item} className="h-1 w-6 overflow-hidden rounded-full bg-[#1c222b]">
                  <span className="ob-progress block h-full rounded-full bg-[#f5c400]" style={{ width: itemIndex <= index ? "100%" : "0%" }} />
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => go(index - 1)}
                disabled={index === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#303845] px-3.5 py-2 text-sm text-[#c2cad5] transition-colors hover:border-[#f5c400]/50 hover:text-white disabled:pointer-events-none disabled:opacity-30"
              >
                <ArrowLeft className="h-4 w-4" /> {copy.ui.back}
              </button>
              <button
                type="button"
                onClick={() => (last ? startTour() : go(index + 1))}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg bg-[#f5c400] px-4 py-2 text-sm font-semibold text-black shadow-[0_10px_28px_rgba(245,196,0,0.25)] transition-colors hover:bg-[#ffd84a]",
                  last && "ob-shine",
                )}
              >
                {last ? copy.ui.startTour : index === 0 ? copy.ui.continue : index === 1 ? copy.ui.begin : copy.ui.next}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}

function LanguageScreen({ copy, language, setLanguage }: { copy: ContentOnboardingCopy; language: ContentLocale; setLanguage: (language: ContentLocale) => void }) {
  const options: ContentLocale[] = ["en", "de"];
  return (
    <div className="flex min-h-[460px] flex-col items-center justify-center text-center">
      <Emblem icon={Languages} />
      <h2 className="ob-rise mt-7 text-[28px] font-semibold tracking-tight text-white">{copy.language.title}</h2>
      <p className="ob-rise mt-1 text-base text-[#687386]" style={{ animationDelay: "80ms" }}>
        {copy.language.subtitle}
      </p>
      <div className="mt-8 grid w-full max-w-xl grid-cols-2 gap-4">
        {options.map((option, optionIndex) => {
          const selected = option === language;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setLanguage(option)}
              aria-pressed={selected}
              className={cn(
                "ob-pop group relative overflow-hidden rounded-2xl border p-6 text-left transition-all duration-500",
                selected
                  ? "border-[#f5c400]/70 bg-[#f5c400]/[0.07] shadow-[0_0_0_1px_rgba(245,196,0,0.25),0_20px_50px_rgba(0,0,0,0.35)]"
                  : "border-[#252a33] bg-[#0b1017] hover:-translate-y-0.5 hover:border-[#3a4553]",
              )}
              style={{ animationDelay: `${160 + optionIndex * 90}ms` }}
            >
              <span className="flex items-start justify-between">
                <span className={cn("text-4xl font-semibold tracking-tight transition-colors duration-500", selected ? "text-[#f5c400]" : "text-[#3a4553]")}>{option.toUpperCase()}</span>
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-500",
                    selected ? "scale-100 border-[#f5c400] bg-[#f5c400] text-black" : "scale-90 border-[#303845] text-transparent",
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
              </span>
              <span className="mt-5 block text-lg font-semibold text-white">{copy.language.options[option].name}</span>
              <span className="mt-0.5 block text-xs text-[#8c96a8]">{copy.language.options[option].native}</span>
              {option === "en" ? (
                <span className="absolute bottom-5 right-5 rounded-full border border-[#303845] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8c96a8]">
                  {copy.language.defaultBadge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="ob-rise mt-6 max-w-lg text-xs leading-5 text-[#687386]" style={{ animationDelay: "380ms" }}>
        {copy.language.hint}
      </p>
    </div>
  );
}

function WelcomeScreen({ copy }: { copy: ContentOnboardingCopy }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div>
        <ScreenHeading eyebrow={copy.welcome.eyebrow} title={copy.welcome.title} />
        {copy.welcome.body.map((paragraph, paragraphIndex) => (
          <p key={paragraphIndex} className="ob-rise mt-4 text-sm leading-7 text-[#c2cad5]" style={{ animationDelay: `${160 + paragraphIndex * 90}ms` }}>
            {paragraph}
          </p>
        ))}
      </div>
      <div className="flex flex-col items-center">
        <Emblem icon={Waypoints} large />
        <div className="mt-8 w-full rounded-2xl border border-[#1f2630] bg-[#0b1017] p-5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#687386]">{copy.welcome.learnTitle}</p>
          <ol className="mt-4 space-y-3">
            {copy.welcome.learn.map((item, itemIndex) => (
              <li key={item} className="ob-rise flex items-start gap-3" style={{ animationDelay: `${300 + itemIndex * 80}ms` }}>
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#f5c400]/40 text-[10px] font-bold text-[#f5c400]">{itemIndex + 1}</span>
                <span className="text-[13px] leading-5 text-[#c2cad5]">{item}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function usePlayer(count: number, interval: number) {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % count), interval);
    return () => window.clearInterval(timer);
  }, [playing, count, interval]);
  return { active, setActive, playing, setPlaying };
}

function PlayToggle({ playing, onToggle, copy }: { playing: boolean; onToggle: () => void; copy: ContentOnboardingCopy }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="ob-rise inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#303845] px-3 py-1.5 text-xs text-[#aeb8c7] transition-colors hover:border-[#f5c400]/50 hover:text-white"
      style={{ animationDelay: "200ms" }}
    >
      {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      {playing ? copy.ui.pause : copy.ui.play}
    </button>
  );
}

function Pills({ items, active, onSelect }: { items: string[]; active: number; onSelect: (index: number) => void }) {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {items.map((item, itemIndex) => (
        <button
          key={item}
          type="button"
          onClick={() => onSelect(itemIndex)}
          className={cn(
            "ob-rise flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] transition-all duration-300",
            itemIndex === active ? "border-[#f5c400]/60 bg-[#f5c400]/10 text-white" : "border-[#252a33] text-[#8c96a8] hover:text-white",
          )}
          style={{ animationDelay: `${120 + itemIndex * 60}ms` }}
        >
          <span className={cn("text-[10px] font-bold tabular-nums", itemIndex === active ? "text-[#f5c400]" : "text-[#4f5968]")}>0{itemIndex + 1}</span>
          {item}
        </button>
      ))}
    </div>
  );
}

function DifferenceScreen({ copy }: { copy: ContentOnboardingCopy }) {
  const { difference } = copy;
  const { active, setActive, playing, setPlaying } = usePlayer(difference.questions.length, 6200);
  const question = difference.questions[active];
  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <ScreenHeading eyebrow={difference.eyebrow} title={difference.title} intro={difference.intro} />
        <PlayToggle playing={playing} onToggle={() => setPlaying((current) => !current)} copy={copy} />
      </div>
      <Pills
        items={difference.questions.map((item) => item.question)}
        active={active}
        onSelect={(next) => {
          setActive(next);
          setPlaying(false);
        }}
      />
      <div key={question.key} className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="ob-rise overflow-hidden rounded-2xl border border-[#1f2630] bg-[#05080c]" style={{ animationDelay: "60ms" }}>
          <div className="flex items-center gap-2 border-b border-[#1f2630] px-4 py-2.5">
            <Code2 className="h-3.5 w-3.5 text-sky-300" />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-sky-300">{difference.technicalLabel}</span>
          </div>
          <div className="space-y-1 px-4 py-3.5">
            {question.technical.map((line, lineIndex) => (
              <p key={lineIndex} className="ob-rise whitespace-pre-wrap font-mono text-[12px] leading-6 text-[#aeb8c7]" style={{ animationDelay: `${160 + lineIndex * 180}ms` }}>
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="ob-rise overflow-hidden rounded-2xl border border-[#f5c400]/30 bg-[linear-gradient(140deg,rgba(245,196,0,0.07),rgba(11,16,23,1)_55%)]" style={{ animationDelay: "320ms" }}>
          <div className="flex items-center gap-2 border-b border-[#f5c400]/15 px-4 py-2.5">
            <Waypoints className="h-3.5 w-3.5 text-[#f5c400]" />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#f5c400]">{difference.contentLabel}</span>
          </div>
          <div className="px-4 py-3.5">
            <p className="text-[13.5px] leading-6 text-[#eef1f5]">{question.content}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {question.chips.map((chip, chipIndex) => (
                <span key={chip} className="ob-pop rounded-md border border-[#f5c400]/30 bg-[#0b1017] px-2 py-0.5 text-[11.5px] text-[#ffe9a1]" style={{ animationDelay: `${620 + chipIndex * 110}ms` }}>
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="ob-rise mt-4 text-xs text-[#687386]" style={{ animationDelay: "500ms" }}>
        {difference.footnote}
      </p>
    </div>
  );
}

const PIPELINE_ICONS: LucideIcon[] = [Microscope, Workflow, BookOpenCheck, Languages];

function PipelineScreen({ copy }: { copy: ContentOnboardingCopy }) {
  const nodes = copy.pipeline.nodes;
  const { active, setActive, playing, setPlaying } = usePlayer(nodes.length, 4800);
  const progress = active / (nodes.length - 1);
  const node = nodes[active];
  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <ScreenHeading eyebrow={copy.pipeline.eyebrow} title={copy.pipeline.title} intro={copy.pipeline.intro} />
        <PlayToggle playing={playing} onToggle={() => setPlaying((current) => !current)} copy={copy} />
      </div>

      <div className="relative mt-10 px-2">
        <div className="absolute left-[46px] right-[46px] top-7 h-[2px] rounded-full bg-[#1f2630]">
          <div className="ob-line-draw absolute inset-0 rounded-full bg-[#2a323d]" />
          <div className="ob-track-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#f5c400]/40 to-[#f5c400]" style={{ width: `${progress * 100}%` }} />
          <span className="ob-comet absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f5c400] shadow-[0_0_18px_6px_rgba(245,196,0,0.45)]" style={{ left: `${progress * 100}%` }} />
        </div>
        <div className="relative flex justify-between">
          {nodes.map((item, itemIndex) => {
            const Icon = PIPELINE_ICONS[itemIndex] ?? Sparkles;
            const isActive = itemIndex === active;
            const isDone = itemIndex < active;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setActive(itemIndex);
                  setPlaying(false);
                }}
                className="ob-pop flex w-[96px] flex-col items-center gap-3"
                style={{ animationDelay: `${200 + itemIndex * 100}ms` }}
              >
                <span
                  className={cn(
                    "ob-node relative flex h-14 w-14 items-center justify-center rounded-2xl border",
                    isActive
                      ? "ob-ping scale-110 border-[#f5c400] bg-[#f5c400] text-black shadow-[0_12px_30px_rgba(245,196,0,0.35)]"
                      : isDone
                        ? "border-[#f5c400]/60 bg-[#141b24] text-[#f5c400]"
                        : "border-[#303845] bg-[#0d131b] text-[#687386]",
                  )}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <span className={cn("text-center text-xs font-semibold leading-4 transition-colors duration-500", isActive ? "text-white" : isDone ? "text-[#c2cad5]" : "text-[#687386]")}>
                  {item.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div key={node.key} className="ob-rise mt-5 grid gap-5 rounded-2xl border border-[#1f2630] bg-[#0b1017] p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#f5c400]">
            {active + 1} / {nodes.length}
          </p>
          <h3 className="mt-1.5 text-lg font-semibold text-white">{node.title}</h3>
          <p className="mt-2 text-sm leading-7 text-[#c2cad5]">{node.text}</p>
        </div>
        <div className="rounded-xl border border-[#252a33] bg-[#05080c] p-4">
          <div className="mb-3 flex gap-1.5" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-[#3a4553]" />
            <span className="h-2 w-2 rounded-full bg-[#3a4553]" />
            <span className="h-2 w-2 rounded-full bg-[#3a4553]" />
          </div>
          {node.example.map((line, lineIndex) => (
            <p key={lineIndex} className="ob-rise font-mono text-[12px] leading-6 text-[#e5e9ef]" style={{ animationDelay: `${180 + lineIndex * 260}ms` }}>
              <span className="mr-1.5 text-[#f5c400]">›</span>
              {line}
            </p>
          ))}
        </div>
      </div>
      <p className="ob-rise mt-4 text-xs text-[#687386]" style={{ animationDelay: "500ms" }}>
        {copy.pipeline.footnote}
      </p>
    </div>
  );
}

const REACH_TONES: Record<ReachKind, string> = { value: "#34d399", decides: "#fbbf24", tested: "#f472b6" };
const RECORD_COLORS = ["#f5c400", "#34d399", "#38bdf8", "#a78bfa", "#fb923c"];

function ForwardScreen({ copy, language }: { copy: ContentOnboardingCopy; language: ContentLocale }) {
  const { forward } = copy;
  const { active, setActive, playing, setPlaying } = usePlayer(forward.items.length, 5200);
  const item = forward.items[active];
  const number = new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US");
  const total = forward.items.reduce((sum, entry) => sum + entry.end, 0);
  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <ScreenHeading eyebrow={forward.eyebrow} title={forward.title} intro={forward.intro} />
        <PlayToggle playing={playing} onToggle={() => setPlaying((current) => !current)} copy={copy} />
      </div>
      <div className="ob-rise mt-5 grid gap-4 rounded-2xl border border-[#1f2630] bg-[#0b1017] p-5 lg:grid-cols-[230px_minmax(0,1fr)]" style={{ animationDelay: "120ms" }}>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#687386]">{forward.recordLabel}</p>
          <ul className="mt-2 space-y-1.5">
            {forward.items.map((entry, entryIndex) => (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => {
                    setActive(entryIndex);
                    setPlaying(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all duration-300",
                    entryIndex === active ? "border-[#f5c400]/50 bg-[#f5c400]/[0.07]" : "border-[#1f2630] hover:border-[#303845]",
                  )}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RECORD_COLORS[entryIndex % RECORD_COLORS.length] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12px] text-white">{entry.record}</span>
                    <span className="block truncate font-mono text-[10.5px] text-[#8c96a8]">{forward.field} = '{entry.value}'</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-[#c2cad5]">{number.format(entry.end)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-baseline justify-between rounded-lg border border-[#1f2630] bg-[#0d131b] px-3 py-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#687386]">{forward.endLabel}</span>
            <span className="font-mono text-[15px] font-semibold tabular-nums text-[#f5c400]">{number.format(total)}</span>
          </div>
        </div>
        <div key={item.key} className="rounded-xl border border-[#1f2630] bg-[#06090d] p-4">
          <div className="ob-rise flex flex-wrap items-center gap-2 rounded-lg border border-[#f5c400]/35 bg-[#f5c400]/[0.07] px-3 py-2">
            <Crosshair className="h-4 w-4 text-[#f5c400]" />
            <span className="text-[12.5px] font-semibold text-[#f5c400]">{forward.field}</span>
            <span className="font-mono text-[12.5px] text-white">= '{item.value}'</span>
            <span className="ml-auto font-mono text-[11px] text-[#8c96a8]">{item.record}</span>
          </div>
          <ol className="relative mt-2 space-y-1.5">
            <span className="absolute bottom-4 left-[7px] top-2 w-px bg-[#252a33]" aria-hidden="true" />
            {item.steps.map((step, stepIndex) => (
              <li key={`${step.term}-${stepIndex}`} className="ob-rise relative flex items-start gap-3" style={{ animationDelay: `${140 + stepIndex * 150}ms` }}>
                <span className="relative z-10 mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 bg-[#06090d]" style={{ borderColor: REACH_TONES[step.reach] }} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[12.5px] font-medium text-white">{step.term}</span>
                    <span className="font-mono text-[12.5px] text-[#f5c400]">= {step.value}</span>
                    {stepIndex === item.steps.length - 1 && <Flag className="h-3 w-3 self-center text-[#f5c400]" />}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-[#aeb8c7]">
                    {step.how}
                    <span className="rounded-full border px-1.5 text-[10px] font-semibold" style={{ borderColor: `${REACH_TONES[step.reach]}66`, color: REACH_TONES[step.reach] }}>{forward.reach[step.reach]}</span>
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="ob-rise mt-3 flex items-start gap-2 rounded-lg border border-pink-400/25 bg-pink-400/[0.05] px-3 py-2 text-[12px] leading-5 text-[#f3d9e8]" style={{ animationDelay: `${140 + item.steps.length * 150}ms` }}>
            <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-300" />
            <span><span className="mr-1 font-semibold text-pink-200">{forward.whatIfLabel}:</span>{item.whatIf}</span>
          </p>
        </div>
      </div>
      <p className="ob-rise mt-3 flex items-center gap-2 text-[12px] text-emerald-200" style={{ animationDelay: "380ms" }}>
        <BadgeCheck className="h-4 w-4 text-emerald-300" />
        {forward.confirmed}
      </p>
      <p className="ob-rise mt-1.5 text-xs text-[#687386]" style={{ animationDelay: "460ms" }}>
        {forward.footnote}
      </p>
    </div>
  );
}

/* The miniature result: the selected field and the five fields it reaches, in the columns of the real view. */
const VIEW_STEP = 138;
const VIEW_CARD = { w: 128, h: 64 };
const VIEW_TOP = 24;
const VIEW_Y: Record<string, number> = { productType: 68, bst: 0, ab: 136, ccf: 0, ead: 68, rwa: 68 };
const VIEW_COLORS = { value: "#34d399", decides: "#fbbf24" } as const;

function viewClosure(links: { from: string; to: string }[], start: string, forward: boolean): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const current = stack.pop()!;
    for (const link of links) {
      const next = forward ? (link.from === current ? link.to : null) : link.to === current ? link.from : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

function ViewScreen({ copy }: { copy: ContentOnboardingCopy }) {
  const { view } = copy;
  const [selected, setSelected] = useState("bst");
  const byKey = new Map(view.fields.map((field) => [field.key, field]));
  const up = useMemo(() => viewClosure(view.links, selected, false), [view.links, selected]);
  const down = useMemo(() => viewClosure(view.links, selected, true), [view.links, selected]);
  const levels = [...new Set(view.fields.map((field) => field.level))].sort((a, b) => a - b);
  const width = levels.length * VIEW_STEP - (VIEW_STEP - VIEW_CARD.w) + 8;
  const height = VIEW_TOP + Math.max(...Object.values(VIEW_Y)) + VIEW_CARD.h + 4;
  const field = byKey.get(selected)!;
  const start = field.level === 0;
  const position = (key: string) => ({ x: 4 + byKey.get(key)!.level * VIEW_STEP, y: VIEW_TOP + VIEW_Y[key] });
  return (
    <div>
      <ScreenHeading eyebrow={view.eyebrow} title={view.title} intro={view.intro} />
      <div className="ob-rise mt-5 rounded-2xl border border-[#1f2630] bg-[#06090d] p-4" style={{ animationDelay: "120ms" }}>
        <div className="overflow-x-auto">
          <div className="relative mx-auto" style={{ width, height }}>
            {levels.map((level) => (
              <p key={level} className="absolute top-0 truncate text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ left: 4 + level * VIEW_STEP, width: VIEW_CARD.w, color: level === 0 ? "#f5c400" : level === 1 ? "#34d399" : "#38bdf8" }}>
                {level === 0 ? view.columns.start : level === 1 ? view.columns.next : format(view.columns.step, { level })}
              </p>
            ))}
            <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden="true">
              {view.links.map((link) => {
                const from = position(link.from);
                const to = position(link.to);
                const sx = from.x + VIEW_CARD.w;
                const sy = from.y + VIEW_CARD.h / 2;
                const tx = to.x;
                const ty = to.y + VIEW_CARD.h / 2;
                const bend = Math.max(14, (tx - sx) / 2);
                const onPath = up.has(link.from) && (link.to === selected || up.has(link.to));
                const onward = (link.from === selected || down.has(link.from)) && down.has(link.to);
                return (
                  <path
                    key={`${link.from}-${link.to}`}
                    d={`M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx - 2} ${ty}`}
                    fill="none"
                    stroke={VIEW_COLORS[link.kind]}
                    strokeWidth={onPath ? 2.6 : onward ? 1.8 : 1.3}
                    strokeOpacity={onPath || onward ? 1 : 0.25}
                    strokeDasharray={link.kind === "decides" ? "7 5" : undefined}
                    strokeLinecap="round"
                    className="transition-[stroke-opacity,stroke-width] duration-300"
                  />
                );
              })}
            </svg>
            {view.fields.map((item) => {
              const { x, y } = position(item.key);
              const state = item.key === selected ? "self" : up.has(item.key) ? "up" : down.has(item.key) ? "down" : "dim";
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelected(item.key)}
                  aria-pressed={item.key === selected}
                  className={cn(
                    "absolute flex flex-col rounded-lg border bg-[#0f141b] px-2.5 py-1.5 text-left transition-all duration-300",
                    state === "self" ? "border-[#f5c400] shadow-[0_0_0_1px_rgba(245,196,0,0.35)]" : state === "up" ? "border-[#f5c400]/45" : "border-[#2a323d] hover:border-[#4a5464]",
                    state === "dim" && "opacity-45",
                  )}
                  style={{ left: x, top: y, width: VIEW_CARD.w, height: VIEW_CARD.h }}
                >
                  <span className={cn("absolute bottom-2 left-0 top-2 w-[3px] rounded-r", item.level === 0 ? "bg-[#f5c400]" : item.level === 1 ? "bg-emerald-400" : "bg-sky-400")} />
                  <span className="flex items-start gap-1">
                    <span className="line-clamp-3 min-w-0 flex-1 text-[10.5px] font-semibold leading-[1.25] text-white">{item.name}</span>
                    {item.end ? <Flag className="mt-px h-3 w-3 shrink-0 text-[#f5c400]" /> : null}
                  </span>
                  <span className="mt-auto flex items-center gap-1.5">
                    {item.level > 0 ? <span className="h-1 flex-1 rounded-full bg-[#fbbf24]" /> : <span className="flex-1" />}
                    <span className="text-[9.5px] tabular-nums text-[#8c96a8]">{item.records}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#161c24] px-1 pt-2.5 text-[11px]">
          <span className="flex items-center gap-1.5 text-[#8c96a8]"><MousePointerClick className="h-3.5 w-3.5 text-[#f5c400]" />{view.hint}</span>
          <span className="flex flex-wrap items-center gap-3 text-[#9aa4b4]">
            {(["value", "decides"] as const).map((kind) => (
              <span key={kind} className="flex items-center gap-1.5">
                <svg width="22" height="6" aria-hidden="true"><line x1="1" y1="3" x2="21" y2="3" stroke={VIEW_COLORS[kind]} strokeWidth="2" strokeDasharray={kind === "decides" ? "7 5" : undefined} strokeLinecap="round" /></svg>
                {view.legend[kind]}
              </span>
            ))}
            <span className="flex items-center gap-1.5"><Flag className="h-3 w-3 text-[#f5c400]" />{view.legend.end}</span>
          </span>
        </div>
      </div>
      <div key={selected} className="ob-rise mt-3 grid gap-4 rounded-2xl border border-[#1f2630] bg-[#0b1017] p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-[14px] font-semibold text-white">{field.name}</span>
            <span className="font-mono text-[10.5px] text-[#687386]">{field.column}</span>
          </p>
          {start ? (
            <p className="mt-1.5 text-[12.5px] leading-5 text-[#c2cad5]">{view.selectedLabel} <span className="font-mono text-[12px] text-[#e5e9ef]">{field.how}</span></p>
          ) : (
            <>
              <p className="mt-1 text-[11.5px] text-[#8c96a8]">{field.via ? `${view.viaLabel}: ${field.via}` : view.directLabel}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f5c400]">{view.howLabel}</p>
              <p className="mt-1 text-[12.5px] leading-5 text-[#e5e9ef]">{field.how}</p>
            </>
          )}
        </div>
        {!start && field.values ? (
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between rounded-lg border border-[#1f2630] bg-[#0d131b] px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#687386]">{view.recordsLabel}</span>
              <span className="font-mono text-[14px] font-semibold tabular-nums text-emerald-300">{field.records}</span>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#687386]">{view.valuesLabel}</p>
              <ul className="mt-1 space-y-1">
                {field.values.map((item) => (
                  <li key={item.from} className="flex items-center gap-2 font-mono text-[11.5px] text-[#dbe2ec]">
                    <span>{item.from}</span>
                    <ArrowRight className="h-3 w-3 text-[#4a5464]" />
                    <span className="text-[#f5c400]">{item.to}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {view.parts.map((part, partIndex) => (
          <div key={part.title} className="ob-rise rounded-xl border border-[#1f2630] bg-[#0b1017] px-3 py-2.5" style={{ animationDelay: `${300 + partIndex * 80}ms` }}>
            <p className="flex items-center gap-2 text-[12.5px] font-semibold text-white"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#f5c400]/40 text-[10px] font-bold text-[#f5c400]">{partIndex + 1}</span>{part.title}</p>
            <p className="mt-1 text-[11px] leading-[1.5] text-[#aeb8c7]">{part.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ControlsScreen({ copy }: { copy: ContentOnboardingCopy }) {
  return (
    <div>
      <ScreenHeading eyebrow={copy.controls.eyebrow} title={copy.controls.title} intro={copy.controls.intro} />
      <div className="mt-5 grid gap-2 lg:grid-cols-3">
        {copy.controls.rules.map((rule, ruleIndex) => (
          <div key={rule.title} className="ob-rise flex gap-3 rounded-xl border border-[#1f2630] bg-[#0b1017] px-3.5 py-2.5" style={{ animationDelay: `${120 + ruleIndex * 60}ms` }}>
            <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r="10.5" fill="rgba(52,211,153,0.08)" stroke="#34d399" strokeWidth="1.3" className="ob-draw" style={{ "--len": 66, animationDelay: `${240 + ruleIndex * 60}ms` } as CSSProperties} />
              <path d="M7.2 12.4l3.2 3.2 6.4-6.6" fill="none" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="ob-draw" style={{ "--len": 16, animationDelay: `${640 + ruleIndex * 60}ms` } as CSSProperties} />
            </svg>
            <div>
              <h3 className="text-[13px] font-semibold text-white">{rule.title}</h3>
              <p className="mt-0.5 text-[11.5px] leading-[1.5] text-[#aeb8c7]">{rule.text}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="ob-rise mt-4 rounded-xl border border-[#f5c400]/25 bg-[#f5c400]/[0.05] px-4 py-3 text-xs leading-5 text-[#d6dbe3]" style={{ animationDelay: "860ms" }}>
        {copy.controls.note}
      </p>
    </div>
  );
}

function ReadyScreen({ copy, onStart }: { copy: ContentOnboardingCopy; onStart: () => void }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div>
        <ScreenHeading eyebrow={copy.ready.eyebrow} title={copy.ready.title} />
        {copy.ready.body.map((paragraph, paragraphIndex) => (
          <p key={paragraphIndex} className="ob-rise mt-4 text-sm leading-7 text-[#c2cad5]" style={{ animationDelay: `${160 + paragraphIndex * 90}ms` }}>
            {paragraph}
          </p>
        ))}
        <button
          type="button"
          onClick={onStart}
          className="ob-rise ob-shine mt-8 inline-flex items-center gap-2 rounded-xl bg-[#f5c400] px-6 py-3 text-sm font-semibold text-black shadow-[0_16px_40px_rgba(245,196,0,0.3)] transition-colors hover:bg-[#ffd84a]"
          style={{ animationDelay: "380ms" }}
        >
          <MousePointerClick className="h-4 w-4" /> {copy.ui.startTour}
        </button>
      </div>
      <div className="rounded-2xl border border-[#1f2630] bg-[#0b1017] p-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#687386]">{copy.ready.checklistTitle}</p>
        <ol className="relative mt-5 space-y-4">
          <span className="ob-line-draw-v absolute bottom-3 left-[11px] top-3 w-px bg-[#252a33]" aria-hidden="true" />
          {copy.ready.checklist.map((item, itemIndex) => (
            <li key={item} className="ob-rise relative flex items-center gap-3" style={{ animationDelay: `${220 + itemIndex * 90}ms` }}>
              <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#f5c400]/50 bg-[#0b1017] text-[10.5px] font-bold text-[#f5c400]">
                {itemIndex + 1}
              </span>
              <span className="text-[13px] text-[#c2cad5]">{item}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Act 2 · Hands-on spotlight tour                                            */
/* -------------------------------------------------------------------------- */

const CARD_WIDTH = 400;
const SPOT_PAD = 8;

function findTarget(step: TourStepDef): Element | null {
  return document.querySelector(`[data-tour="${step.target}"]`);
}

function SpotlightTour({
  copy,
  controller,
  onDone,
  onSkip,
}: {
  copy: ContentOnboardingCopy;
  controller: ContentTourController;
  onDone: () => void;
  onSkip: () => void;
}) {
  const steps = TOUR_STEPS;
  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)];
  const text = copy.tour[step.id];
  const isLast = index >= steps.length - 1;
  const [hole, setHole] = useState<Box | null>(null);
  const [cardSize, setCardSize] = useState({ w: CARD_WIDTH, h: 320 });
  const [viewport, setViewport] = useState({ w: typeof window === "undefined" ? 1440 : window.innerWidth, h: typeof window === "undefined" ? 900 : window.innerHeight });
  const [satisfied, setSatisfied] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [shaking, setShaking] = useState(false);
  const shakeTimer = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  const armedRef = useRef(false);
  const advanceTimer = useRef<number | null>(null);
  const stepCount = useRef(steps.length);
  stepCount.current = steps.length;

  const unavailable =
    (step.action === "selectExecution" && !controller.executionsAvailable) ||
    (step.action === "selectField" && controller.fieldsAvailable === false);

  const isDone = useCallback(() => {
    const current = controllerRef.current;
    switch (step.action) {
      case "selectExecution":
        return current.executionSelected;
      case "selectField":
        return current.fieldSelected;
      case "startRun":
        return current.tourRun === "running" || current.tourRun === "done";
      case "awaitResults":
        return current.tourRun === "done";
      case "selectFlowField":
        return current.flowFieldSelected;
      default:
        return true;
    }
  }, [step]);

  const goTo = useCallback((next: number) => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
    setCelebrating(false);
    setIndex(Math.max(0, Math.min(stepCount.current - 1, next)));
  }, []);

  const next = useCallback(() => {
    if (isLast) onDone();
    else goTo(index + 1);
  }, [goTo, index, isLast, onDone]);

  // Bring the screen this step lives on and scroll its element into view.
  useEffect(() => {
    armedRef.current = false;
    setSatisfied(false);
    const current = controllerRef.current;
    if (step.stage === "setup" && current.stage !== "setup") current.showSetup();
    if (step.stage === "progress") current.showProgress();
    if (step.stage === "results") current.showResults();
    // The preview of what comes next exists only for a chosen field; the details of a reached field only once one is chosen.
    if (step.id === "forwardPreview" && !current.fieldSelected) current.selectSuggestedField();
    if (step.id === "details" && !current.flowFieldSelected) current.selectFlowField();
    const timer = window.setTimeout(() => {
      const element = findTarget(step);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const tall = rect.height > window.innerHeight * 0.7;
      element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: tall ? "start" : "center", inline: "nearest" });
    }, step.stage === "setup" ? 160 : 420);
    return () => window.clearTimeout(timer);
  }, [step]);

  // Track the target, the card size and the user's action every frame for smooth, layout-proof positioning.
  useEffect(() => {
    let frame = 0;
    let lastKey = "";
    let measured: Element | null = null;
    let clips: Element[] = [];
    let lastRescue = performance.now();
    const tick = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const element = findTarget(step);
      let box: Box | null = null;
      if (element) {
        if (element !== measured) {
          measured = element;
          clips = clippingAncestors(element);
        }
        const rect = element.getBoundingClientRect();
        let { left, top, right, bottom } = rect;
        for (const clip of clips) {
          const bounds = clip.getBoundingClientRect();
          left = Math.max(left, bounds.left);
          top = Math.max(top, bounds.top);
          right = Math.min(right, bounds.right);
          bottom = Math.min(bottom, bounds.bottom);
        }
        const x = Math.max(left - SPOT_PAD, 6);
        const y = Math.max(top - SPOT_PAD, 6);
        const holeRight = Math.min(right + SPOT_PAD, width - 6);
        const holeBottom = Math.min(bottom + SPOT_PAD, height - 6);
        if (right > left && bottom > top && holeRight > x && holeBottom > y) box = { x, y, w: holeRight - x, h: holeBottom - y };
        else if (performance.now() - lastRescue > 1000) {
          lastRescue = performance.now();
          const tall = rect.height > height * 0.7;
          element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: tall ? "start" : "center", inline: "nearest" });
        }
      }
      const card = cardRef.current;
      const key = `${box ? `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.w)},${Math.round(box.h)}` : "none"}|${width}x${height}|${card?.offsetHeight ?? 0}`;
      if (key !== lastKey) {
        lastKey = key;
        setHole(box);
        setViewport({ w: width, h: height });
        if (card) setCardSize({ w: card.offsetWidth, h: card.offsetHeight });
      }
      if (step.action) {
        const done = isDone();
        setSatisfied(done);
        if (!done) armedRef.current = true;
        else if (armedRef.current && !advanceTimer.current) {
          armedRef.current = false;
          setCelebrating(true);
          advanceTimer.current = window.setTimeout(() => {
            advanceTimer.current = null;
            setCelebrating(false);
            setIndex((current) => Math.min(current + 1, stepCount.current - 1));
          }, step.action === "awaitResults" ? 900 : 1100);
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [step, isDone]);

  useEffect(
    () => () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
      if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
    },
    [],
  );

  const canNext = !step.action || satisfied || Boolean(step.optional);

  const doItForMe = () => {
    const current = controllerRef.current;
    if (step.action === "selectExecution") current.selectFirstExecution();
    if (step.action === "selectField") current.selectSuggestedField();
    if (step.action === "startRun") current.startRun();
    if (step.action === "selectFlowField") current.selectFlowField();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || studioOverlayOpen()) return;
      const target = event.target as HTMLElement | null;
      const field = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (field && findTarget(step)?.contains(target)) return;
      if (event.key === "Escape") {
        onSkip();
      } else if (event.key === "ArrowRight" && canNext) {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(index - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canNext, goTo, index, next, onSkip, step]);

  const position = placeCard(hole, cardSize, viewport);
  const blocked = () => {
    if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
    setShaking(false);
    window.requestAnimationFrame(() => setShaking(true));
    shakeTimer.current = window.setTimeout(() => setShaking(false), 500);
  };
  const holeStyle = hole ? { top: hole.y, left: hole.x, width: hole.w, height: hole.h } : undefined;
  const watching = step.action === "awaitResults";
  // The analysis stopped without a result: the progress steps offer to start it again.
  const failed = step.stage === "progress" && controller.tourRun === "failed";
  const restart = () => goTo(steps.findIndex((item) => item.action === "startRun"));
  // Without executions the tour cannot go on; an execution without a followable field sends the user back one step.
  const blocking = unavailable;

  return (
    <div>
      {hole ? (
        <>
          <div className="ob-blocker" style={{ top: 0, left: 0, width: "100%", height: hole.y }} onClick={blocked} />
          <div className="ob-blocker" style={{ top: hole.y + hole.h, left: 0, width: "100%", bottom: 0 }} onClick={blocked} />
          <div className="ob-blocker" style={{ top: hole.y, left: 0, width: hole.x, height: hole.h }} onClick={blocked} />
          <div className="ob-blocker" style={{ top: hole.y, left: hole.x + hole.w, right: 0, height: hole.h }} onClick={blocked} />
          <div className="ob-hole" style={holeStyle} />
          {step.action && !satisfied && !unavailable ? <div className="ob-hole-pulse" style={holeStyle} /> : null}
        </>
      ) : (
        <div className="ob-blocker ob-dim" style={{ inset: 0 }} onClick={blocked} />
      )}

      <div
        ref={cardRef}
        className="ob-card"
        style={{ left: position.x, top: position.y, width: Math.min(CARD_WIDTH, viewport.w - 32) }}
        role="dialog"
        aria-live="polite"
        aria-label={text.title}
      >
        <div className={cn(shaking && "ob-shake")}>
          <div className="flex items-center justify-between gap-3 px-5 pt-4">
            <span className="flex items-center gap-1.5">
              <span className="rounded-full border border-[#f5c400]/35 bg-[#f5c400]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f5d766]">{text.chapter}</span>
              {step.optional ? <span className="rounded-full border border-[#303845] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#8c96a8]">{copy.ui.optional}</span> : null}
            </span>
            <span className="flex items-center gap-3">
              <span className="text-[10.5px] tabular-nums text-[#687386]">{format(copy.ui.stepOf, { n: index + 1, total: steps.length })}</span>
              <button type="button" onClick={onSkip} className="text-[#687386] transition-colors hover:text-white" aria-label={copy.ui.skipTour}>
                <X className="h-4 w-4" />
              </button>
            </span>
          </div>
          <div className="mx-5 mt-3 h-0.5 overflow-hidden rounded-full bg-[#1c222b]">
            <div className="ob-progress h-full rounded-full bg-[#f5c400]" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
          </div>

          <div key={step.id} className="px-5 pb-1 pt-4">
            <h3 className="ob-rise text-[17px] font-semibold leading-snug text-white">{text.title}</h3>
            {text.body.map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex} className="ob-rise mt-2.5 text-[13px] leading-6 text-[#c2cad5]" style={{ animationDelay: `${70 + paragraphIndex * 70}ms` }}>
                {paragraph}
              </p>
            ))}
            {failed ? (
              <div className="ob-rise mt-4 rounded-xl border border-rose-400/35 bg-rose-400/[0.08] px-3.5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-300">{copy.ui.runFailed}</p>
                <p className="mt-0.5 break-words text-[13px] leading-5 text-rose-100">{controller.tourRunError}</p>
              </div>
            ) : unavailable && text.empty ? (
              <p className="ob-rise mt-4 rounded-xl border border-sky-400/30 bg-sky-400/[0.07] px-3.5 py-3 text-[12.5px] leading-5 text-sky-100">{text.empty}</p>
            ) : text.action ? (
              celebrating || (step.action && satisfied) ? (
                <div className="ob-pop mt-4 flex items-center gap-2.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-3 text-[13px] font-medium text-emerald-200">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400 text-black">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {copy.ui.wellDone}
                </div>
              ) : (
                <div className="ob-rise mt-4 flex items-start gap-3 rounded-xl border border-[#f5c400]/35 bg-[#f5c400]/[0.07] px-3.5 py-3" style={{ animationDelay: `${90 + text.body.length * 70}ms` }}>
                  {watching ? <span className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[#f5c400]" /> : <MousePointerClick className="ob-nudge mt-0.5 h-4 w-4 shrink-0 text-[#f5c400]" />}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f5c400]">{watching ? copy.ui.watch : copy.ui.yourTurn}</p>
                    <p className="mt-0.5 text-[13px] leading-5 text-[#e5e9ef]">{text.action}</p>
                  </div>
                </div>
              )
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 px-5 pb-4 pt-4">
            <button type="button" onClick={onSkip} className="text-xs text-[#687386] transition-colors hover:text-white">
              {copy.ui.skipTour}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                className="rounded-lg border border-[#303845] px-3 py-1.5 text-xs text-[#c2cad5] transition-colors hover:border-[#f5c400]/50 hover:text-white disabled:pointer-events-none disabled:opacity-30"
              >
                {copy.ui.back}
              </button>
              {failed || blocking ? (
                <button
                  type="button"
                  onClick={failed ? restart : step.action === "selectField" ? () => goTo(index - 1) : onSkip}
                  className="rounded-lg border border-[#f5c400]/50 bg-[#f5c400]/10 px-3 py-1.5 text-xs font-semibold text-[#f5d766] transition-colors hover:bg-[#f5c400]/20"
                >
                  {failed ? copy.ui.startAgain : step.action === "selectField" ? copy.ui.back : copy.ui.endTour}
                </button>
              ) : (
                <>
                  {step.optional && !satisfied ? (
                    <button
                      type="button"
                      onClick={next}
                      className="rounded-lg border border-[#303845] px-3 py-1.5 text-xs text-[#c2cad5] transition-colors hover:border-[#f5c400]/50 hover:text-white"
                    >
                      {copy.ui.next}
                    </button>
                  ) : null}
                  {step.action && !satisfied && !watching && !unavailable ? (
                    <button
                      type="button"
                      onClick={doItForMe}
                      className="rounded-lg border border-[#f5c400]/50 bg-[#f5c400]/10 px-3 py-1.5 text-xs font-semibold text-[#f5d766] transition-colors hover:bg-[#f5c400]/20"
                    >
                      {copy.ui.doItForMe}
                    </button>
                  ) : !(step.optional && !satisfied) ? (
                    <button
                      type="button"
                      onClick={next}
                      disabled={!canNext}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#f5c400] px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-[#ffd84a] disabled:opacity-40"
                    >
                      {isLast ? copy.ui.finish : copy.ui.next}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Act 3 · Completion                                                         */
/* -------------------------------------------------------------------------- */

function CompletionCard({ copy, onFinish }: { copy: ContentOnboardingCopy; onFinish: () => void }) {
  const finishRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(cardRef);
  useEffect(() => {
    finishRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onFinish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFinish]);

  return (
    <div className="ob-backdrop">
      <div ref={cardRef} className="ob-complete" role="dialog" aria-modal="true" aria-label={copy.complete.title}>
        <svg viewBox="0 0 120 120" className="mx-auto h-24 w-24" aria-hidden="true">
          <circle cx="60" cy="60" r="54" fill="rgba(245,196,0,0.06)" stroke="rgba(245,196,0,0.18)" strokeWidth="1" />
          <circle cx="60" cy="60" r="46" fill="none" stroke="#f5c400" strokeWidth="2.5" strokeLinecap="round" className="ob-draw" style={{ "--len": 290 } as CSSProperties} transform="rotate(-90 60 60)" />
          <path d="M40 61l13 13 27-28" fill="none" stroke="#f5c400" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="ob-draw" style={{ "--len": 62, animationDelay: "650ms" } as CSSProperties} />
        </svg>
        <h2 className="ob-rise mt-5 text-center text-2xl font-semibold tracking-tight text-white" style={{ animationDelay: "500ms" }}>
          {copy.complete.title}
        </h2>
        <p className="ob-rise mx-auto mt-2 max-w-md text-center text-sm leading-6 text-[#aeb8c7]" style={{ animationDelay: "600ms" }}>
          {copy.complete.body}
        </p>
        <div className="mt-6 rounded-2xl border border-[#1f2630] bg-[#0b1017] p-5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#687386]">{copy.complete.tipsTitle}</p>
          <ul className="mt-3 space-y-2.5">
            {copy.complete.tips.map((tip, tipIndex) => (
              <TipRow key={tip} delay={760 + tipIndex * 90}>
                {tip}
              </TipRow>
            ))}
          </ul>
        </div>
        <button
          ref={finishRef}
          type="button"
          onClick={onFinish}
          className="ob-rise ob-shine mt-6 w-full rounded-xl bg-[#f5c400] py-3 text-sm font-semibold text-black shadow-[0_16px_40px_rgba(245,196,0,0.28)] transition-colors hover:bg-[#ffd84a]"
          style={{ animationDelay: "1100ms" }}
        >
          {copy.ui.finish}
        </button>
      </div>
    </div>
  );
}

const CONTENT_CSS = `
.cx-deck { width: min(1160px, 100%); height: min(820px, 100%); }
`;
