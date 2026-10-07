"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  BookOpen,
  Check,
  ChevronDown,
  CircleCheck,
  ExternalLink,
  Gavel,
  GitCompareArrows,
  Languages,
  MousePointerClick,
  Pause,
  Play,
  ScanSearch,
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
import {
  DECK_SCREENS,
  MATCHER_ONBOARDING_COPY,
  TOUR_STEPS,
  type AnatomyPart,
  type MatcherLocale,
  type MatcherOnboardingCopy,
  type ResultsTab,
  type TourStage,
  type TourStepDef,
} from "./matcher-onboarding-content";

export const MATCHER_ONBOARDING_STORAGE_KEY = "dataflow_matcher_onboarding_v1";

/** What the tour needs from the matcher tab: its state and the actions it may perform for the user. */
export type MatcherTourController = {
  stage: TourStage;
  /** The real run the tour started: none yet, running, finished with a result, or stopped without one. */
  tourRun: "idle" | "running" | "done" | "failed";
  /** Why the tour's run stopped (failed, cancelled or interrupted). */
  tourRunError: string | null;
  filesAvailable: boolean;
  regulationsAvailable: boolean;
  filesSelected: number;
  regulationsSelected: number;
  showSetup: () => void;
  /** Bring the progress view of the tour's run on screen; it stays there (also once finished) until a results step. */
  showProgress: () => void;
  /** Bring the tour's finished run on screen on the given tab. */
  showResults: (tab: ResultsTab) => void;
  /** Select the smallest release-note file (the tour's run stays short). */
  selectFirstFile: () => void;
  selectFirstRegulation: () => void;
  /** Start the real run with the selected sources. */
  startRun: () => void;
};

type Phase = "deck" | "tour" | "complete";

export function MatcherOnboarding({
  open,
  controller,
  onStartTour,
  onClose,
}: {
  open: boolean;
  controller: MatcherTourController;
  /** The hands-on tour begins: the tab switches to tour mode (Run matching replays the sample). */
  onStartTour: () => void;
  onClose: () => void;
}) {
  const { language, setLanguage } = useSectionLanguage();
  const copy = MATCHER_ONBOARDING_COPY[language];
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
      localStorage.setItem(MATCHER_ONBOARDING_STORAGE_KEY, "done");
    } catch {
      // Storage unavailable; the tour will simply show again next time.
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
      <style>{MATCHER_CSS}</style>
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
  copy: MatcherOnboardingCopy;
  language: MatcherLocale;
  setLanguage: (language: MatcherLocale) => void;
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
      <div ref={deckRef} tabIndex={-1} className="ob-deck mx-deck outline-none" role="dialog" aria-modal="true" aria-label={copy.welcome.title}>
        <aside className="relative flex flex-col border-r border-white/5 bg-[#080c12] px-4 py-6">
          <div className="flex items-center gap-2.5 px-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#f5c400]/40 bg-[#f5c400]/10 text-[#f5c400]">
              <GitCompareArrows className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{copy.ui.product}</p>
              <p className="text-[10.5px] text-[#687386]">{copy.ui.minutes}</p>
            </div>
          </div>

          <nav className="relative mt-8" aria-label="Chapters">
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
              {screen === "anatomy" ? <AnatomyScreen copy={copy} /> : null}
              {screen === "grades" ? <GradesScreen copy={copy} /> : null}
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

function LanguageScreen({ copy, language, setLanguage }: { copy: MatcherOnboardingCopy; language: MatcherLocale; setLanguage: (language: MatcherLocale) => void }) {
  const options: MatcherLocale[] = ["en", "de"];
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
      <p className="ob-rise mt-6 max-w-md text-xs leading-5 text-[#687386]" style={{ animationDelay: "380ms" }}>
        {copy.language.hint}
      </p>
    </div>
  );
}

function WelcomeScreen({ copy }: { copy: MatcherOnboardingCopy }) {
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
        <Emblem icon={GitCompareArrows} large />
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

/** Text with one phrase marked; the mark fades in when it becomes active. */
function Marked({ text, phrase, tone }: { text: string; phrase: string; tone: "note" | "rule" }) {
  const at = phrase ? text.indexOf(phrase) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark key={phrase} className={cn("mx-cm-mark rounded px-0.5", tone === "note" ? "bg-[#f5c400]/25 text-[#fde68a] ring-1 ring-[#f5c400]/40" : "bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-400/40")}>
        {phrase}
      </mark>
      {text.slice(at + phrase.length)}
    </>
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

function ChallengeScreen({ copy }: { copy: MatcherOnboardingCopy }) {
  const { challenge } = copy;
  const { active, setActive, playing, setPlaying } = usePlayer(challenge.mappings.length, 3400);
  const mapping = challenge.mappings[active];
  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <ScreenHeading eyebrow={challenge.eyebrow} title={challenge.title} intro={challenge.intro} />
        <PlayToggle playing={playing} onToggle={() => setPlaying((current) => !current)} play={challenge.play} pause={challenge.pause} />
      </div>

      <div className="mt-7 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)]">
        <div className="ob-rise rounded-2xl border border-[#f5c400]/25 bg-[#0b1017] p-5" style={{ animationDelay: "160ms" }}>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#f5c400]">{challenge.noteLabel}</p>
          <p className="mt-3 text-[15px] leading-7 text-[#e5e9ef]">
            <Marked text={challenge.note} phrase={mapping.from} tone="note" />
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-2">
          <span className="mx-cm-flow relative h-[2px] w-full overflow-hidden rounded-full bg-[#1f2630]">
            <span className="mx-cm-pulse absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#f5c400] to-transparent" />
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#f5c400]/40 bg-[#141b24] text-[#f5c400]">
            <ArrowRightLeft className="h-4 w-4" />
          </span>
          <div className="flex gap-1.5" aria-hidden="true">
            {challenge.mappings.map((item, itemIndex) => (
              <button
                key={item.from}
                type="button"
                onClick={() => {
                  setActive(itemIndex);
                  setPlaying(false);
                }}
                className={cn("h-1.5 rounded-full transition-all duration-500", itemIndex === active ? "w-5 bg-[#f5c400]" : "w-1.5 bg-[#303845]")}
              />
            ))}
          </div>
        </div>
        <div className="ob-rise rounded-2xl border border-emerald-400/25 bg-[#0b1017] p-5" style={{ animationDelay: "240ms" }}>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-emerald-300">{challenge.provisionLabel}</p>
          <p className="mt-3 text-[15px] leading-7 text-[#e5e9ef]">
            <Marked text={challenge.provision} phrase={mapping.to} tone="rule" />
          </p>
        </div>
      </div>

      <div key={active} className="ob-rise mt-4 flex items-center gap-3 rounded-xl border border-[#252a33] bg-[#06090d] px-4 py-3">
        <span className="rounded-md bg-[#f5c400]/15 px-2 py-0.5 font-mono text-[11.5px] text-[#fde68a]">{mapping.from}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#687386]" />
        <span className="rounded-md bg-emerald-400/15 px-2 py-0.5 font-mono text-[11.5px] text-emerald-100">{mapping.to}</span>
        <span className="ml-2 text-[13px] leading-5 text-[#aeb8c7]">{mapping.label}</span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {challenge.hurdles.map((hurdle, hurdleIndex) => (
          <div key={hurdle.title} className="ob-rise rounded-2xl border border-[#1f2630] bg-[#0b1017] p-4" style={{ animationDelay: `${360 + hurdleIndex * 90}ms` }}>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#f5c400]">0{hurdleIndex + 1}</p>
            <h3 className="mt-1 text-sm font-semibold text-white">{hurdle.title}</h3>
            <p className="mt-1.5 text-[12.5px] leading-5 text-[#aeb8c7]">{hurdle.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
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

const PIPELINE_ICONS: LucideIcon[] = [Sparkles, ScanSearch, Gavel, ShieldCheck, UserCheck];

function PipelineScreen({ copy }: { copy: MatcherOnboardingCopy }) {
  const nodes = copy.pipeline.nodes;
  const { active, setActive, playing, setPlaying } = usePlayer(nodes.length, 4200);
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

      <div key={node.key} className="ob-rise mt-8 grid gap-5 rounded-2xl border border-[#1f2630] bg-[#0b1017] p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
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

function AnatomyScreen({ copy }: { copy: MatcherOnboardingCopy }) {
  const { anatomy } = copy;
  const [active, setActive] = useState<AnatomyPart>("provision");
  const part = anatomy.parts.find((item) => item.key === active) ?? anatomy.parts[0];
  const mock = anatomy.mock;
  const region = (key: AnatomyPart, children: ReactNode, className?: string) => (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setActive(key)}
      onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && setActive(key)}
      className={cn("mx-region cursor-pointer rounded-lg", active === key ? "mx-region-active" : "mx-region-dim", className)}
    >
      {children}
    </div>
  );

  return (
    <div>
      <ScreenHeading eyebrow={anatomy.eyebrow} title={anatomy.title} intro={anatomy.intro} />
      <div className="mt-6 grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <div>
          <ul className="space-y-1">
            {anatomy.parts.map((item, itemIndex) => {
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

        <div>
          <div className="ob-pop overflow-hidden rounded-xl border border-[#252a33] border-l-2 border-l-emerald-400/70 bg-[#0b0f15] p-4" style={{ animationDelay: "160ms" }}>
            <div className="flex items-start justify-between gap-3">
              {region(
                "provision",
                <div className="p-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-[#f5c400]/30 bg-[#f5c400]/10 px-1.5 py-px font-mono text-[10px] font-semibold text-[#f5c400]">CRR</span>
                    <span className="font-mono text-sm font-semibold text-white">Article 111(1)</span>
                    <span className="text-[13px] text-[#c9d1dd]">{mock.title}</span>
                  </div>
                  <p className="mt-1 text-[10.5px] text-[#687386]">{mock.breadcrumb}</p>
                </div>,
                "min-w-0 flex-1",
              )}
              <div className="flex items-center gap-2">
                {region(
                  "grade",
                  <div className="flex flex-col items-end gap-1 p-1.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                      {mock.direct}
                    </span>
                    <span className="rounded border border-[#2c3440] px-1.5 py-px text-[9.5px] text-[#aab3c2]">{mock.approach}</span>
                  </div>,
                )}
                {region(
                  "confidence",
                  <div className="p-1.5">
                    <MiniDial value={98} />
                  </div>,
                )}
              </div>
            </div>

            {region(
              "rationale",
              <div className="mt-2 p-1.5">
                <p className="text-[12.5px] text-[#f2f4f7]">
                  <span className="mr-2 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{mock.elementLabel}</span>
                  {mock.element}
                </p>
                <p className="mt-1.5 text-[12px] leading-5 text-[#c9d1dd]">{mock.rationale}</p>
              </div>,
            )}

            {region(
              "quotes",
              <div className="mt-2 grid gap-2 p-1.5 md:grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)]">
                <MockQuote label={mock.noteLabel} text={mock.note} verified={mock.verified} tone="yellow" />
                <div className="hidden items-center justify-center md:flex">
                  <ArrowRightLeft className="h-3.5 w-3.5 text-[#3a4350]" />
                </div>
                <MockQuote label={mock.regulationLabel} text={mock.regulation} verified={mock.verified} tone="emerald" />
              </div>,
            )}

            {region(
              "checks",
              <div className="mt-2 grid gap-x-4 gap-y-1 p-1.5 sm:grid-cols-2">
                {mock.checks.map((check) => (
                  <p key={check} className="flex items-center gap-1.5 text-[11px] text-[#c9d1dd]">
                    <CircleCheck className="h-3 w-3 shrink-0 text-emerald-400" />
                    {check}
                  </p>
                ))}
              </div>,
            )}

            {region(
              "actions",
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2 p-1.5">
                <span className="flex items-center gap-1 text-[11px] text-[#aab3c2]">
                  <ChevronDown className="h-3 w-3" />
                  {mock.showText}
                </span>
                <span className="flex items-center gap-1 rounded-md border border-[#2c3440] px-2 py-0.5 text-[11px] text-[#e5e9f0]">
                  <BookOpen className="h-3 w-3" />
                  {mock.read}
                </span>
                <span className="flex items-center gap-1 rounded-md border border-[#2c3440] px-2 py-0.5 text-[11px] text-[#e5e9f0]">
                  <ExternalLink className="h-3 w-3" />
                  {mock.pdf}
                </span>
              </div>,
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniDial({ value }: { value: number }) {
  const size = 40;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={20} cy={20} r={radius} stroke="#1f2630" strokeWidth={4} fill="none" />
        <circle cx={20} cy={20} r={radius} stroke="#34d399" strokeWidth={4} fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} className="mx-dial" />
      </svg>
      <span className="absolute font-mono text-[10px] font-semibold text-emerald-300">{value}</span>
    </span>
  );
}

function MockQuote({ label, text, verified, tone }: { label: string; text: string; verified: string; tone: "yellow" | "emerald" }) {
  return (
    <div className={cn("relative rounded-md border bg-[#0f141b] py-2 pl-3 pr-2 before:absolute before:inset-y-0 before:left-0 before:w-[3px]", tone === "yellow" ? "border-[#f5c400]/25 before:bg-[#f5c400]" : "border-emerald-400/25 before:bg-emerald-400")}>
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#8c96a8]">{label}</p>
      <p className="mt-1 text-[11.5px] italic leading-5 text-[#f2f4f7]">{text}</p>
      <p className="mt-1 flex items-center gap-1 text-[10px] text-[#8c96a8]">
        <CircleCheck className="h-3 w-3 text-emerald-400" />
        {verified}
      </p>
    </div>
  );
}

const STATUS_DOTS: Record<string, string> = { linked: "bg-emerald-400", review: "bg-amber-400", no_link: "bg-slate-400", failed: "bg-rose-400" };

function GradesScreen({ copy }: { copy: MatcherOnboardingCopy }) {
  const { grades } = copy;
  return (
    <div>
      <ScreenHeading eyebrow={grades.eyebrow} title={grades.title} intro={grades.intro} />
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {grades.linkTypes.map((item, itemIndex) => (
          <div
            key={item.key}
            className={cn("ob-rise rounded-2xl border bg-[#0b1017] p-4", item.key === "direct" ? "border-emerald-400/30" : "border-sky-400/30")}
            style={{ animationDelay: `${140 + itemIndex * 100}ms` }}
          >
            <div className="flex items-center gap-2.5">
              <span className={cn("h-3.5 w-3.5 rounded-full", item.key === "direct" ? "bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.5)]" : "border-2 border-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.4)]")} />
              <h3 className="text-[15px] font-semibold text-white">{item.title}</h3>
            </div>
            <p className="mt-1.5 text-[13px] leading-[1.55] text-[#c2cad5]">{item.text}</p>
            <p className={cn("mt-2.5 rounded-lg border-l-2 bg-[#06090d] px-3 py-2 text-[12px] leading-5 text-[#e5e9ef]", item.key === "direct" ? "border-emerald-400/70" : "border-sky-400/70")}>{item.example}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#687386]">{grades.statusesTitle}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {grades.statuses.map((status, statusIndex) => (
              <div key={status.key} className="ob-rise rounded-xl border border-[#1f2630] bg-[#0b1017] px-3.5 py-3" style={{ animationDelay: `${360 + statusIndex * 70}ms` }}>
                <p className="flex items-center gap-2 text-[13px] font-semibold text-white">
                  <span className={cn("h-2 w-2 rounded-full", STATUS_DOTS[status.key])} />
                  {status.title}
                </p>
                <p className="mt-1 text-[11.5px] leading-5 text-[#aeb8c7]">{status.text}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#687386]">{grades.bandsTitle}</p>
          <div className="ob-rise mt-2 grid items-center gap-4 rounded-xl border border-[#1f2630] bg-[#0b1017] px-4 py-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]" style={{ animationDelay: "520ms" }}>
            <div>
              <div className="relative h-2 overflow-hidden rounded-full">
                <div className="mx-band absolute inset-0 rounded-full bg-[linear-gradient(90deg,#fb7185_0%,#fb7185_59%,#fbbf24_60%,#fbbf24_79%,#34d399_80%,#34d399_100%)]" />
              </div>
              <div className="relative mt-1.5 h-3 font-mono text-[10px] text-[#4f5968]">
                {[0, 60, 80, 100].map((value) => (
                  <span key={value} className="absolute top-0" style={{ left: `${value}%`, transform: `translateX(-${value}%)` }}>
                    {value}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[...grades.bands].reverse().map((band, bandIndex) => (
                <p key={band.range} className="flex items-start gap-2 text-[11.5px] leading-[1.45] text-[#c2cad5]">
                  <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", bandIndex === 0 ? "bg-rose-400" : bandIndex === 1 ? "bg-amber-400" : "bg-emerald-400")} />
                  <span>
                    <span className="font-mono text-[11px] text-white">{band.range}</span> · <span className="font-semibold text-white">{band.title}</span> – {band.text}
                  </span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlsScreen({ copy }: { copy: MatcherOnboardingCopy }) {
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

function ReadyScreen({ copy, onStart }: { copy: MatcherOnboardingCopy; onStart: () => void }) {
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
  copy: MatcherOnboardingCopy;
  controller: MatcherTourController;
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

  const unavailable = (step.action === "selectFile" && !controller.filesAvailable) || (step.action === "selectRegulation" && !controller.regulationsAvailable);

  const isDone = useCallback(() => {
    const current = controllerRef.current;
    switch (step.action) {
      case "selectFile":
        return current.filesSelected > 0;
      case "selectRegulation":
        return current.regulationsSelected > 0;
      case "startRun":
        return current.tourRun === "running" || current.tourRun === "done";
      case "awaitResults":
        return current.tourRun === "done";
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

  // Bring the screen this step lives on, open its section, and scroll it into view.
  useEffect(() => {
    armedRef.current = false;
    setSatisfied(false);
    const current = controllerRef.current;
    if (step.stage === "setup" && current.stage !== "setup") current.showSetup();
    if (step.stage === "progress") current.showProgress();
    if (step.stage === "results") current.showResults(step.tab ?? "evidence");
    const timers: number[] = [];
    if (step.expand) {
      timers.push(
        window.setTimeout(() => {
          const button = document.querySelector<HTMLButtonElement>(`[data-tour="${step.target}"] button[aria-expanded="false"]`);
          button?.click();
        }, 260),
      );
    }
    timers.push(
      window.setTimeout(() => {
        const element = findTarget(step);
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const tall = rect.height > window.innerHeight * 0.7;
        element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: tall ? "start" : "center", inline: "nearest" });
      }, step.stage === "setup" ? 160 : 420),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
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
    if (step.action === "selectFile") current.selectFirstFile();
    if (step.action === "selectRegulation") current.selectFirstRegulation();
    if (step.action === "startRun") current.startRun();
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
  // The run stopped without a result: the progress steps offer to start it again.
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

function CompletionCard({ copy, onFinish }: { copy: MatcherOnboardingCopy; onFinish: () => void }) {
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

const MATCHER_CSS = `
.mx-deck { width: min(1120px, 100%); height: min(780px, 100%); }
.mx-cm-mark { animation: mx-mark 700ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.mx-cm-pulse { animation: mx-flow 1600ms cubic-bezier(0.4, 0, 0.2, 1) infinite; }
.mx-region { transition: opacity 350ms ease, box-shadow 350ms ease, background-color 350ms ease; }
.mx-region-dim { opacity: 0.45; }
.mx-region-dim:hover { opacity: 0.8; }
.mx-region-active { opacity: 1; background: rgba(245,196,0,0.05); box-shadow: 0 0 0 1.5px rgba(245,196,0,0.8), 0 0 24px rgba(245,196,0,0.12); }
.mx-dial { animation: mx-dial 1200ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.mx-band { transform-origin: left center; animation: ob-scale-x 1200ms cubic-bezier(0.22, 1, 0.36, 1) 500ms both; }
@keyframes mx-mark { from { background-color: transparent; box-shadow: none; } }
@keyframes mx-flow { from { left: -35%; } to { left: 100%; } }
@keyframes mx-dial { from { stroke-dashoffset: 100.5; } }
`;
