"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Binary,
  Bot,
  Check,
  Eye,
  FlaskConical,
  GitBranch,
  Languages,
  MousePointerClick,
  Pause,
  Play,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  UserCheck,
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
import { PythonLine } from "../atoms";
import {
  CHALLENGE_CODE,
  DECK_SCREENS,
  LINEAGE_ONBOARDING_COPY,
  PROBE_DEMO,
  TOUR_STEPS,
  type EvidencePart,
  type LineageLocale,
  type LineageOnboardingCopy,
  type TourStage,
  type TourStepDef,
  type TourView,
} from "./lineage-onboarding-content";

export const LINEAGE_ONBOARDING_STORAGE_KEY = "dataflow_lineage_onboarding_v1";

/** What the tour needs from the lineage tab: its state and the actions it may perform for the user. */
export type LineageTourController = {
  stage: TourStage;
  /** The real analysis the tour started: none yet, running, finished with a result, or stopped without one. */
  tourRun: "idle" | "running" | "done" | "failed";
  /** Why the tour's analysis stopped (failed, cancelled or interrupted). */
  tourRunError: string | null;
  executionsAvailable: boolean;
  executionSelected: boolean;
  nodeSelected: boolean;
  cellSelected: boolean;
  showSetup: () => void;
  /** Bring the progress view of the tour's analysis on screen; it stays there (also once finished) until a results step. */
  showProgress: () => void;
  /** Bring the tour's finished analysis on screen in the given view. */
  showResults: (view: TourView) => void;
  selectFirstExecution: () => void;
  /** Start the real analysis of the selected execution. */
  startRun: () => void;
  selectNode: () => void;
  selectCell: () => void;
};

type Phase = "deck" | "tour" | "complete";

export function LineageOnboarding({
  open,
  controller,
  onStartTour,
  onClose,
}: {
  open: boolean;
  controller: LineageTourController;
  /** The hands-on tour begins: the analysis started from now on is the one the tour follows. */
  onStartTour: () => void;
  onClose: () => void;
}) {
  const { language, setLanguage } = useSectionLanguage();
  const copy = LINEAGE_ONBOARDING_COPY[language];
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
      localStorage.setItem(LINEAGE_ONBOARDING_STORAGE_KEY, "done");
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
      <style>{LINEAGE_CSS}</style>
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
  copy: LineageOnboardingCopy;
  language: LineageLocale;
  setLanguage: (language: LineageLocale) => void;
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
      <div ref={deckRef} tabIndex={-1} className="ob-deck lx-deck outline-none" role="dialog" aria-modal="true" aria-label={copy.welcome.title}>
        <aside className="relative flex flex-col border-r border-white/5 bg-[#080c12] px-4 py-6">
          <div className="flex items-center gap-2.5 px-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#f5c400]/40 bg-[#f5c400]/10 text-[#f5c400]">
              <GitBranch className="h-4 w-4" />
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
              {screen === "challenge" ? <ChallengeScreen copy={copy} /> : null}
              {screen === "pipeline" ? <PipelineScreen copy={copy} /> : null}
              {screen === "proof" ? <ProofScreen copy={copy} /> : null}
              {screen === "graph" ? <GraphScreen copy={copy} /> : null}
              {screen === "evidence" ? <EvidenceScreen copy={copy} language={language} /> : null}
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
                <span key={item} className="h-1 w-7 overflow-hidden rounded-full bg-[#1c222b]">
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

function LanguageScreen({ copy, language, setLanguage }: { copy: LineageOnboardingCopy; language: LineageLocale; setLanguage: (language: LineageLocale) => void }) {
  const options: LineageLocale[] = ["en", "de"];
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

function WelcomeScreen({ copy }: { copy: LineageOnboardingCopy }) {
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
        <Emblem icon={GitBranch} large />
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

function PlayToggle({ playing, onToggle, play, pause }: { playing: boolean; onToggle: () => void; play: string; pause: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="ob-rise inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#303845] px-3 py-1.5 text-xs text-[#aeb8c7] transition-colors hover:border-[#f5c400]/50 hover:text-white"
      style={{ animationDelay: "200ms" }}
    >
      {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      {playing ? pause : play}
    </button>
  );
}

const CODE_COLUMNS = new Set(["Nominal", "Accrued Interests", "Assessment Base", "CCF", "EAD", "BalanceSheetType", "ProductType", "Book Value"]);

function ChallengeScreen({ copy }: { copy: LineageOnboardingCopy }) {
  const { challenge } = copy;
  const { active, setActive, playing, setPlaying } = usePlayer(challenge.traps.length, 5600);
  const trap = challenge.traps[active];
  const focus = useMemo(() => new Set(trap.chips), [trap]);
  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <ScreenHeading eyebrow={challenge.eyebrow} title={challenge.title} intro={challenge.intro} />
        <PlayToggle playing={playing} onToggle={() => setPlaying((current) => !current)} play={challenge.play} pause={challenge.pause} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {challenge.traps.map((item, itemIndex) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setActive(itemIndex);
              setPlaying(false);
            }}
            className={cn(
              "ob-rise flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] transition-all duration-300",
              itemIndex === active ? "border-[#f5c400]/60 bg-[#f5c400]/10 text-white" : "border-[#252a33] text-[#8c96a8] hover:text-white",
            )}
            style={{ animationDelay: `${120 + itemIndex * 60}ms` }}
          >
            <span className={cn("text-[10px] font-bold tabular-nums", itemIndex === active ? "text-[#f5c400]" : "text-[#4f5968]")}>0{itemIndex + 1}</span>
            {item.title}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="ob-rise overflow-hidden rounded-2xl border border-[#1f2630] bg-[#05080c]" style={{ animationDelay: "180ms" }}>
          <div className="flex items-center gap-1.5 border-b border-[#1f2630] px-4 py-2.5">
            <span className="h-2 w-2 rounded-full bg-[#3a4553]" />
            <span className="h-2 w-2 rounded-full bg-[#3a4553]" />
            <span className="h-2 w-2 rounded-full bg-[#3a4553]" />
            <span className="ml-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#687386]">{challenge.codeLabel}</span>
          </div>
          <div className="overflow-x-auto py-2 font-mono text-[11.5px] leading-[1.75]">
            {CHALLENGE_CODE.map((line, lineIndex) => {
              const number = lineIndex + 1;
              const lit = trap.lines.includes(number);
              return (
                <div key={number} className={cn("lx-code-line flex min-w-max pr-4", lit ? "lx-code-lit" : "opacity-40")}>
                  <span className="w-9 shrink-0 select-none pr-3 text-right text-[#3f4957]">{number}</span>
                  <span className="whitespace-pre text-[#d6deeb]">
                    <PythonLine code={line} columns={CODE_COLUMNS} focus={lit ? focus : undefined} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div key={trap.key} className="space-y-3">
          <div className="ob-rise rounded-2xl border border-rose-400/25 bg-rose-400/[0.04] p-4" style={{ animationDelay: "80ms" }}>
            <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-rose-300">
              <Eye className="h-3.5 w-3.5" /> {challenge.naiveLabel}
            </p>
            <p className="mt-2 text-[13px] leading-6 text-[#d6dbe3]">{trap.naive}</p>
          </div>
          <div className="ob-rise rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.05] p-4" style={{ animationDelay: "260ms" }}>
            <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" /> {challenge.agentLabel}
            </p>
            <p className="mt-2 text-[13px] leading-6 text-[#e5e9ef]">{trap.agent}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {trap.chips.map((chip, chipIndex) => (
                <span key={chip} className="ob-pop rounded-md border border-emerald-400/30 bg-[#0b1017] px-1.5 py-[1px] font-mono text-[11px] text-emerald-100" style={{ animationDelay: `${420 + chipIndex * 90}ms` }}>
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PIPELINE_ICONS: LucideIcon[] = [Binary, PlayCircle, FlaskConical, Bot, UserCheck];

function PipelineScreen({ copy }: { copy: LineageOnboardingCopy }) {
  const nodes = copy.pipeline.nodes;
  const { active, setActive, playing, setPlaying } = usePlayer(nodes.length, 4400);
  const progress = active / (nodes.length - 1);
  const node = nodes[active];
  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <ScreenHeading eyebrow={copy.pipeline.eyebrow} title={copy.pipeline.title} intro={copy.pipeline.intro} />
        <PlayToggle playing={playing} onToggle={() => setPlaying((current) => !current)} play={copy.pipeline.play} pause={copy.pipeline.pause} />
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
                className="ob-pop flex w-[108px] flex-col items-center gap-3"
                style={{ animationDelay: `${200 + itemIndex * 110}ms` }}
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

function ProofScreen({ copy }: { copy: LineageOnboardingCopy }) {
  const { proof } = copy;
  const { active, setActive, playing, setPlaying } = usePlayer(PROBE_DEMO.inputs.length, 3800);
  const input = PROBE_DEMO.inputs[active];
  const reacting = new Set(PROBE_DEMO.reacts[input]);
  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <ScreenHeading eyebrow={proof.eyebrow} title={proof.title} intro={proof.intro} />
        <PlayToggle playing={playing} onToggle={() => setPlaying((current) => !current)} play={copy.challenge.play} pause={copy.challenge.pause} />
      </div>
      <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-[230px_120px_minmax(0,1fr)]">
        <div className="ob-rise rounded-2xl border border-[#1f2630] bg-[#0b1017] p-4" style={{ animationDelay: "140ms" }}>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#687386]">{proof.inputsLabel}</p>
          <div className="mt-3 space-y-1.5">
            {PROBE_DEMO.inputs.map((name, nameIndex) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setActive(nameIndex);
                  setPlaying(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left font-mono text-[12px] transition-all duration-300",
                  nameIndex === active ? "border-[#f5c400]/60 bg-[#f5c400]/10 text-white shadow-[0_0_20px_rgba(245,196,0,0.12)]" : "border-[#1f2630] text-[#8c96a8] hover:text-white",
                )}
              >
                <FlaskConical className={cn("h-3.5 w-3.5 shrink-0", nameIndex === active ? "text-[#f5c400]" : "text-[#3f4957]")} />
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-2">
          <span className="relative h-[2px] w-full overflow-hidden rounded-full bg-[#1f2630]">
            <span key={input} className="lx-pulse absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#f5c400] to-transparent" />
          </span>
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#f5c400]/40 bg-[#141b24] text-[#f5c400]">
            <PlayCircle className="h-5 w-5" />
          </span>
          <span className="text-center font-mono text-[10px] leading-4 text-[#687386]">{proof.rerun}</span>
        </div>
        <div className="ob-rise rounded-2xl border border-[#1f2630] bg-[#0b1017] p-4" style={{ animationDelay: "220ms" }}>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#687386]">{proof.outputsLabel}</p>
          <div key={input} className="mt-3 grid gap-1.5">
            {PROBE_DEMO.outputs.map((name, nameIndex) => {
              const hit = reacting.has(name);
              return (
                <div
                  key={name}
                  className={cn("lx-out flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 font-mono text-[12px]", hit ? "lx-out-hit" : "border-[#1f2630] text-[#4f5968]")}
                  style={{ animationDelay: `${hit ? 200 + nameIndex * 120 : 0}ms` }}
                >
                  <span className="truncate">{name}</span>
                  <span className={cn("shrink-0 rounded-full px-1.5 text-[9.5px] font-semibold uppercase tracking-wide", hit ? "bg-emerald-400/15 text-emerald-200" : "text-[#3f4957]")}>
                    {hit ? proof.changed : proof.unchanged}
                  </span>
                </div>
              );
            })}
          </div>
          <p key={`r-${input}`} className="ob-rise mt-3 flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.06] px-3 py-2 text-[12px] text-emerald-100" style={{ animationDelay: "900ms" }}>
            <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-300" />
            {format(proof.result, { count: reacting.size })}
          </p>
        </div>
      </div>
      <p className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#687386]">{proof.modesTitle}</p>
      <div className="mt-2 grid gap-2.5 md:grid-cols-3">
        {proof.modes.map((mode, modeIndex) => (
          <div key={mode.title} className="ob-rise rounded-xl border border-[#1f2630] bg-[#0b1017] px-4 py-3" style={{ animationDelay: `${360 + modeIndex * 90}ms` }}>
            <p className="text-[13px] font-semibold text-white">{mode.title}</p>
            <p className="mt-0.5 text-[12px] leading-5 text-[#aeb8c7]">{mode.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

type MiniRole = "passthrough" | "cast" | "enriched" | "lookup";
const MINI_NODES: { id: string; x: number; y: number; role: MiniRole }[] = [
  { id: "ProductType", x: 10, y: 14, role: "passthrough" },
  { id: "balance_sheet_by_product", x: 10, y: 78, role: "lookup" },
  { id: "Nominal", x: 10, y: 142, role: "cast" },
  { id: "Book Value", x: 10, y: 206, role: "cast" },
  { id: "Asset Class", x: 10, y: 270, role: "passthrough" },
  { id: "BalanceSheetType", x: 215, y: 46, role: "enriched" },
  { id: "Assessment Base", x: 215, y: 174, role: "enriched" },
  { id: "Risk Weight", x: 215, y: 270, role: "enriched" },
  { id: "CCF", x: 420, y: 78, role: "enriched" },
  { id: "EAD", x: 420, y: 174, role: "enriched" },
  { id: "RWA", x: 620, y: 222, role: "enriched" },
];
const MINI_EDGES: { from: string; to: string; kind: "direct" | "indirect" | "lookup" }[] = [
  { from: "ProductType", to: "BalanceSheetType", kind: "direct" },
  { from: "balance_sheet_by_product", to: "BalanceSheetType", kind: "lookup" },
  { from: "ProductType", to: "Assessment Base", kind: "indirect" },
  { from: "Nominal", to: "Assessment Base", kind: "direct" },
  { from: "Book Value", to: "Assessment Base", kind: "direct" },
  { from: "Asset Class", to: "Risk Weight", kind: "direct" },
  { from: "BalanceSheetType", to: "CCF", kind: "direct" },
  { from: "Assessment Base", to: "EAD", kind: "direct" },
  { from: "CCF", to: "EAD", kind: "direct" },
  { from: "EAD", to: "RWA", kind: "direct" },
  { from: "Risk Weight", to: "RWA", kind: "direct" },
];
const MINI_W = 172;
const MINI_H = 40;
const MINI_COLORS: Record<MiniRole, string> = { passthrough: "#64748b", cast: "#22d3ee", enriched: "#34d399", lookup: "#a78bfa" };

function closure(start: string, forward: boolean): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const current = stack.pop()!;
    for (const edge of MINI_EDGES) {
      const next = forward ? (edge.from === current ? edge.to : null) : edge.to === current ? edge.from : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

function GraphScreen({ copy }: { copy: LineageOnboardingCopy }) {
  const { graph } = copy;
  const [selected, setSelected] = useState("EAD");
  const up = useMemo(() => closure(selected, false), [selected]);
  const down = useMemo(() => closure(selected, true), [selected]);
  const byId = new Map(MINI_NODES.map((node) => [node.id, node]));
  return (
    <div>
      <ScreenHeading eyebrow={graph.eyebrow} title={graph.title} intro={graph.intro} />
      <div className="ob-rise mt-5 rounded-2xl border border-[#1f2630] bg-[#06090d] p-3" style={{ animationDelay: "140ms" }}>
        <svg viewBox="0 0 800 320" className="h-auto w-full" role="img" aria-label={graph.title}>
          {MINI_EDGES.map((edge) => {
            const from = byId.get(edge.from)!;
            const to = byId.get(edge.to)!;
            const sx = from.x + MINI_W;
            const sy = from.y + MINI_H / 2;
            const tx = to.x;
            const ty = to.y + MINI_H / 2;
            const bend = (tx - sx) / 2;
            const isUp = (edge.to === selected || up.has(edge.to)) && up.has(edge.from);
            const isDown = (edge.from === selected || down.has(edge.from)) && down.has(edge.to);
            const color = isUp ? "#f5c400" : isDown ? "#38bdf8" : edge.kind === "lookup" ? "#5b4a8f" : edge.kind === "indirect" ? "#7a6326" : "#2f3742";
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={`M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx - 2} ${ty}`}
                fill="none"
                stroke={color}
                strokeWidth={isUp || isDown ? 2.4 : 1.6}
                strokeDasharray={edge.kind === "lookup" ? "2 4" : edge.kind === "indirect" ? "6 4" : undefined}
                className="transition-[stroke] duration-300"
              />
            );
          })}
          {MINI_NODES.map((node) => {
            const state = node.id === selected ? "self" : up.has(node.id) ? "up" : down.has(node.id) ? "down" : "dim";
            const stroke = state === "self" ? "#f5c400" : state === "up" ? "rgba(245,196,0,0.55)" : state === "down" ? "rgba(56,189,248,0.6)" : "#252a33";
            return (
              <g key={node.id} onClick={() => setSelected(node.id)} className="cursor-pointer" opacity={state === "dim" ? 0.4 : 1} style={{ transition: "opacity 300ms" }}>
                <rect x={node.x} y={node.y} width={MINI_W} height={MINI_H} rx={8} fill={node.role === "lookup" ? "#130f1d" : "#0f141b"} stroke={stroke} strokeWidth={state === "self" ? 2 : 1.2} strokeDasharray={node.role === "lookup" ? "4 3" : undefined} />
                <rect x={node.x} y={node.y + 6} width={3} height={MINI_H - 12} rx={1.5} fill={MINI_COLORS[node.role]} />
                <text x={node.x + 12} y={node.y + 25} fontSize={node.id.length > 18 ? 10 : 12.5} fontFamily="ui-monospace, monospace" fill="#ffffff">
                  {node.id}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-1 text-[11.5px]">
          <span className="flex items-center gap-1.5 text-[#8c96a8]"><MousePointerClick className="h-3.5 w-3.5 text-[#f5c400]" />{graph.hint}</span>
          <span className="flex flex-wrap items-center gap-3 font-mono">
            <span className="text-white">{selected}</span>
            <span className="text-[#f5c400]">{graph.upstream}: {up.size}</span>
            <span className="text-sky-300">{graph.downstream}: {down.size}</span>
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#687386]">{graph.rolesTitle}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {graph.roles.map((role, roleIndex) => (
              <div key={role.key} className="ob-rise flex gap-2.5 rounded-xl border border-[#1f2630] bg-[#0b1017] px-3 py-2.5" style={{ animationDelay: `${300 + roleIndex * 70}ms` }}>
                <span className="mt-1 h-3 w-[3px] shrink-0 rounded" style={{ background: MINI_COLORS[role.key] }} />
                <div>
                  <p className="text-[12.5px] font-semibold text-white">{role.title}</p>
                  <p className="text-[11.5px] leading-5 text-[#aeb8c7]">{role.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#687386]">{graph.edgesTitle}</p>
          <div className="mt-2 space-y-2">
            {graph.edges.map((edge, edgeIndex) => (
              <div key={edge.key} className="ob-rise flex items-center gap-3 rounded-xl border border-[#1f2630] bg-[#0b1017] px-3 py-2.5" style={{ animationDelay: `${360 + edgeIndex * 70}ms` }}>
                <svg width="34" height="8" className="shrink-0">
                  <line x1="0" y1="4" x2="34" y2="4" stroke={edge.key === "direct" ? "#9aa4b4" : edge.key === "indirect" ? "#d9a441" : "#a78bfa"} strokeWidth="2" strokeDasharray={edge.key === "lookup" ? "2 4" : edge.key === "indirect" ? "6 4" : undefined} />
                </svg>
                <p className="text-[12px] leading-5 text-[#aeb8c7]"><span className="font-semibold text-white">{edge.title}</span> – {edge.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EvidenceScreen({ copy, language }: { copy: LineageOnboardingCopy; language: LineageLocale }) {
  const { evidence } = copy;
  const mock = evidence.mock;
  const [active, setActive] = useState<EvidencePart>("explanation");
  const part = evidence.parts.find((item) => item.key === active) ?? evidence.parts[0];
  const number = new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US");
  const region = (key: EvidencePart, children: ReactNode, className?: string) => (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setActive(key)}
      onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && setActive(key)}
      className={cn("lx-region cursor-pointer rounded-lg p-2", active === key ? "lx-region-active" : "lx-region-dim", className)}
    >
      {children}
    </div>
  );
  const chip = (name: string, value?: string) => (
    <span className="mx-[2px] inline-flex flex-col items-center align-middle leading-none">
      <span className="rounded-md border border-[#2c3440] bg-[#141a23] px-1.5 py-[1px] font-mono text-[10.5px] text-[#dbe2ec]">{name}</span>
      {value && <span className="mt-0.5 font-mono text-[9.5px] text-[#f5c400]">{value}</span>}
    </span>
  );
  return (
    <div>
      <ScreenHeading eyebrow={evidence.eyebrow} title={evidence.title} intro={evidence.intro} />
      <div className="mt-5 grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <div>
          <ul className="space-y-1">
            {evidence.parts.map((item, itemIndex) => {
              const selected = item.key === active;
              return (
                <li key={item.key} className="ob-rise" style={{ animationDelay: `${120 + itemIndex * 50}ms` }}>
                  <button
                    type="button"
                    onClick={() => setActive(item.key)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-[13px] transition-all duration-300",
                      selected ? "border-[#f5c400]/40 bg-[#f5c400]/[0.08] text-white" : "border-transparent text-[#8c96a8] hover:bg-white/[0.03] hover:text-white",
                    )}
                  >
                    <span className={cn("text-[10px] tabular-nums", selected ? "text-[#f5c400]" : "text-[#3a4553]")}>{String(itemIndex + 1).padStart(2, "0")}</span>
                    <span className="leading-snug">{item.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div key={part.key} className="ob-rise mt-3 rounded-xl border border-[#f5c400]/25 bg-[#f5c400]/[0.04] px-4 py-3.5">
            <h3 className="text-[14px] font-semibold text-white">{part.title}</h3>
            <p className="mt-1.5 text-[12.5px] leading-[1.6] text-[#c2cad5]">{part.text}</p>
          </div>
        </div>

        <div className="ob-pop overflow-hidden rounded-xl border border-[#252a33] border-l-[3px] border-l-emerald-400/70 bg-[#0b0f15] p-3" style={{ animationDelay: "160ms" }}>
          {region(
            "explanation",
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[16px] font-semibold text-white">{mock.column}</span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-emerald-300">{mock.role}</span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] px-2 py-[1px] text-[10px] font-semibold text-emerald-300">{mock.verified}</span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-5 text-[#e5e9ef]">{mock.summary}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 px-2 py-[1px] text-[10px] font-semibold text-emerald-300"><BadgeCheck className="h-3 w-3" />{mock.grounded}</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 px-2 py-[1px] text-[10px] font-semibold text-sky-300"><UserCheck className="h-3 w-3" />{mock.reviewed}</span>
              </div>
            </div>,
          )}
          {region(
            "formula",
            <div className="rounded-md border border-[#f5c400]/20 bg-[linear-gradient(120deg,rgba(245,196,0,0.06),transparent_70%)] px-3 py-2 font-mono text-[11.5px] text-[#dbe2ec]">
              {chip("EAD")} = {chip("EAD")} {mock.formula} {chip("Assessment Base")} × {chip("CCF")}
            </div>,
            "mt-1",
          )}
          <div className="mt-1 grid gap-1 md:grid-cols-2">
            {region(
              "derivation",
              <div className="rounded-md border border-[#1f252e] bg-[#0d1218] px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded border border-[#f5c400]/25 bg-[#f5c400]/[0.06] px-1.5 font-mono text-[10px] text-[#f5c400]">L37</span>
                  <span className="text-[12px] font-semibold text-white">{mock.stepTitle}</span>
                  <span className="rounded border border-emerald-400/25 px-1.5 text-[9.5px] text-emerald-300">{mock.keepsOthers}</span>
                </div>
                <p className="mt-1.5 rounded border border-dashed border-amber-400/30 bg-amber-400/[0.04] px-2 py-1 text-[11px] text-amber-200">{mock.condition}</p>
                <p className="mt-1.5 text-right"><span className="rounded-full bg-emerald-400/10 px-2 py-[1px] text-[10px] text-emerald-300">{mock.changed}</span></p>
              </div>,
            )}
            {region(
              "cell",
              <div className="rounded-md border border-[#1f252e] bg-[#0d1218] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{mock.cellTitle} · EAD</p>
                <p className="mt-1.5 font-mono text-[11.5px] text-[#dbe2ec]">
                  {chip("Assessment Base", number.format(90000))} × {chip("CCF", number.format(0.2))} <span className="text-white">{mock.cellRow}</span>
                </p>
              </div>,
            )}
          </div>
          {region(
            "runtime",
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" />{mock.runtimeTitle}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {["Assessment Base", "CCF", "Nominal", "Book Value", "Market Value", "ProductType", "BalanceSheetType"].map((name) => (
                  <span key={name} className="rounded-md border border-[#2c3440] bg-[#141a23] px-1.5 py-[1px] font-mono text-[10.5px] text-[#dbe2ec]">{name}</span>
                ))}
              </div>
            </div>,
            "mt-1",
          )}
          {region(
            "finding",
            <div className="flex items-start gap-2 rounded-md border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <div>
                <p className="text-[12px] font-semibold text-white">{mock.findingTitle}</p>
                <p className="text-[11.5px] text-[#c2cad5]">{mock.findingText}</p>
              </div>
            </div>,
            "mt-1",
          )}
        </div>
      </div>
    </div>
  );
}

function ControlsScreen({ copy }: { copy: LineageOnboardingCopy }) {
  return (
    <div>
      <ScreenHeading eyebrow={copy.controls.eyebrow} title={copy.controls.title} intro={copy.controls.intro} />
      <div className="mt-5 grid gap-2 lg:grid-cols-3">
        {copy.controls.rules.map((rule, ruleIndex) => (
          <div key={rule.title} className="ob-rise flex gap-3 rounded-xl border border-[#1f2630] bg-[#0b1017] px-3.5 py-3" style={{ animationDelay: `${120 + ruleIndex * 70}ms` }}>
            <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r="10.5" fill="rgba(52,211,153,0.08)" stroke="#34d399" strokeWidth="1.3" className="ob-draw" style={{ "--len": 66, animationDelay: `${240 + ruleIndex * 70}ms` } as CSSProperties} />
              <path d="M7.2 12.4l3.2 3.2 6.4-6.6" fill="none" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="ob-draw" style={{ "--len": 16, animationDelay: `${640 + ruleIndex * 70}ms` } as CSSProperties} />
            </svg>
            <div>
              <h3 className="text-[13px] font-semibold text-white">{rule.title}</h3>
              <p className="mt-0.5 text-[11.5px] leading-[1.5] text-[#aeb8c7]">{rule.text}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="ob-rise mt-4 rounded-xl border border-[#f5c400]/25 bg-[#f5c400]/[0.05] px-4 py-3 text-xs leading-5 text-[#d6dbe3]" style={{ animationDelay: "820ms" }}>
        {copy.controls.note}
      </p>
    </div>
  );
}

function ReadyScreen({ copy, onStart }: { copy: LineageOnboardingCopy; onStart: () => void }) {
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
  copy: LineageOnboardingCopy;
  controller: LineageTourController;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [index, setIndex] = useState(0);
  const step = TOUR_STEPS[index];
  const text = copy.tour[step.id];
  const isLast = index === TOUR_STEPS.length - 1;
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

  const unavailable = step.action === "selectExecution" && !controller.executionsAvailable;

  const isDone = useCallback(() => {
    const current = controllerRef.current;
    switch (step.action) {
      case "selectExecution":
        return current.executionSelected;
      case "startRun":
        return current.tourRun === "running" || current.tourRun === "done";
      case "awaitResults":
        return current.tourRun === "done";
      case "selectNode":
        return current.nodeSelected;
      case "selectCell":
        return current.cellSelected;
      default:
        return true;
    }
  }, [step]);

  const goTo = useCallback((next: number) => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
    setCelebrating(false);
    setIndex(Math.max(0, Math.min(TOUR_STEPS.length - 1, next)));
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
    if (step.stage === "results") current.showResults(step.view ?? "graph");
    // The provenance panel exists only for a selected cell.
    if (step.id === "provenance" && !current.cellSelected) current.selectCell();
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
            setIndex((current) => Math.min(current + 1, TOUR_STEPS.length - 1));
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

  const required = Boolean(step.action);
  const canNext = !required || satisfied;

  const doItForMe = () => {
    const current = controllerRef.current;
    if (step.action === "selectExecution") current.selectFirstExecution();
    if (step.action === "startRun") current.startRun();
    if (step.action === "selectNode") current.selectNode();
    if (step.action === "selectCell") current.selectCell();
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
  const restart = () => goTo(TOUR_STEPS.findIndex((item) => item.action === "startRun"));

  return (
    <div>
      {hole ? (
        <>
          <div className="ob-blocker" style={{ top: 0, left: 0, width: "100%", height: hole.y }} onClick={blocked} />
          <div className="ob-blocker" style={{ top: hole.y + hole.h, left: 0, width: "100%", bottom: 0 }} onClick={blocked} />
          <div className="ob-blocker" style={{ top: hole.y, left: 0, width: hole.x, height: hole.h }} onClick={blocked} />
          <div className="ob-blocker" style={{ top: hole.y, left: hole.x + hole.w, right: 0, height: hole.h }} onClick={blocked} />
          <div className="ob-hole" style={holeStyle} />
          {required && !satisfied ? <div className="ob-hole-pulse" style={holeStyle} /> : null}
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
            <span className="rounded-full border border-[#f5c400]/35 bg-[#f5c400]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f5d766]">{text.chapter}</span>
            <span className="flex items-center gap-3">
              <span className="text-[10.5px] tabular-nums text-[#687386]">{format(copy.ui.stepOf, { n: index + 1, total: TOUR_STEPS.length })}</span>
              <button type="button" onClick={onSkip} className="text-[#687386] transition-colors hover:text-white" aria-label={copy.ui.skipTour}>
                <X className="h-4 w-4" />
              </button>
            </span>
          </div>
          <div className="mx-5 mt-3 h-0.5 overflow-hidden rounded-full bg-[#1c222b]">
            <div className="ob-progress h-full rounded-full bg-[#f5c400]" style={{ width: `${((index + 1) / TOUR_STEPS.length) * 100}%` }} />
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
              celebrating || (required && satisfied) ? (
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
              {failed || unavailable ? (
                <button
                  type="button"
                  onClick={failed ? restart : onSkip}
                  className="rounded-lg border border-[#f5c400]/50 bg-[#f5c400]/10 px-3 py-1.5 text-xs font-semibold text-[#f5d766] transition-colors hover:bg-[#f5c400]/20"
                >
                  {failed ? copy.ui.startAgain : copy.ui.endTour}
                </button>
              ) : required && !satisfied && !watching ? (
                <button
                  type="button"
                  onClick={doItForMe}
                  className="rounded-lg border border-[#f5c400]/50 bg-[#f5c400]/10 px-3 py-1.5 text-xs font-semibold text-[#f5d766] transition-colors hover:bg-[#f5c400]/20"
                >
                  {copy.ui.doItForMe}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={next}
                  disabled={!canNext}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#f5c400] px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-[#ffd84a] disabled:opacity-40"
                >
                  {isLast ? copy.ui.finish : copy.ui.next}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
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

function CompletionCard({ copy, onFinish }: { copy: LineageOnboardingCopy; onFinish: () => void }) {
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

const LINEAGE_CSS = `
.lx-deck { width: min(1140px, 100%); height: min(800px, 100%); }
.lx-code-line { transition: opacity 400ms ease, background-color 400ms ease, box-shadow 400ms ease; }
.lx-code-lit { opacity: 1; background: rgba(245,196,0,0.07); box-shadow: inset 2px 0 0 #f5c400; }
.lx-pulse { animation: lx-flow 1400ms cubic-bezier(0.4, 0, 0.2, 1) infinite; }
.lx-out { transition: border-color 300ms ease, background-color 300ms ease, color 300ms ease; }
.lx-out-hit { animation: lx-hit 600ms cubic-bezier(0.22, 1, 0.36, 1) both; border-color: rgba(52,211,153,0.45); background: rgba(52,211,153,0.08); color: #ecfdf5; }
.lx-region { transition: opacity 350ms ease, box-shadow 350ms ease, background-color 350ms ease; }
.lx-region-dim { opacity: 0.45; }
.lx-region-dim:hover { opacity: 0.8; }
.lx-region-active { opacity: 1; background: rgba(245,196,0,0.05); box-shadow: 0 0 0 1.5px rgba(245,196,0,0.8), 0 0 24px rgba(245,196,0,0.12); }
@keyframes lx-flow { from { left: -35%; } to { left: 100%; } }
@keyframes lx-hit { 0% { transform: scale(0.96); border-color: #252a33; background: transparent; color: #4f5968; } 60% { transform: scale(1.03); } 100% { transform: scale(1); } }
`;
