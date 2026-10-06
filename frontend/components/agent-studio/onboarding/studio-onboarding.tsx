"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCheck,
  FileText,
  LayoutList,
  ListOrdered,
  MessageSquareText,
  MousePointerClick,
  Pause,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Target,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudioText, type StudioLocale } from "../i18n";
import type { ToolInfo } from "../types";
import { ToolIcon } from "../visuals";
import {
  DECK_SCREENS,
  ONBOARDING_COPY,
  TOUR_STEPS,
  TOUR_TEMPLATE_ID,
  type OnboardingCopy,
  type TourStepDef,
} from "./onboarding-content";

export const ONBOARDING_STORAGE_KEY = "dataflow_agent_studio_onboarding_v1";

/** What the tour needs from the studio: its current state and the actions it may perform for the user. */
export type OnboardingController = {
  view: "home" | "draft" | "agent";
  /** True while the editor and test bench are on screen (a draft, or a saved agent's Configure tab). */
  workbenchVisible: boolean;
  selectedTemplateId: string | null;
  /** Back to the studio home with no foundation selected. */
  reset: () => void;
  goHome: () => void;
  selectTemplate: (id: string) => void;
  /** Bring the editor on screen: opens the tour template from home, or a saved agent's Configure tab. */
  showWorkbench: () => void;
};

type Phase = "deck" | "tour" | "complete";

function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (vars[key] !== undefined ? String(vars[key]) : match));
}

export function StudioOnboarding({
  open,
  controller,
  tools,
  onClose,
}: {
  open: boolean;
  controller: OnboardingController;
  tools: ToolInfo[];
  onClose: () => void;
}) {
  const { locale, setLocale } = useStudioText();
  const copy = ONBOARDING_COPY[locale];
  const [phase, setPhase] = useState<Phase>("deck");
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) setPhase("deck");
  }, [open]);

  // While a modal screen is up, the studio behind it must not be reachable by Tab or screen readers.
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
      localStorage.setItem(ONBOARDING_STORAGE_KEY, "done");
    } catch {
      // Storage unavailable; the tour will simply show again next time.
    }
    onClose();
  };

  return createPortal(
    <div ref={rootRef} className="ob-root" lang={locale}>
      {phase === "deck" ? (
        <WelcomeDeck
          copy={copy}
          locale={locale}
          setLocale={setLocale}
          tools={tools}
          onSkip={finish}
          onStartTour={() => {
            controllerRef.current.reset();
            setPhase("tour");
          }}
        />
      ) : phase === "tour" ? (
        <SpotlightTour copy={copy} controller={controller} onDone={() => setPhase("complete")} onSkip={finish} />
      ) : (
        <CompletionCard copy={copy} onFinish={finish} />
      )}
      <style>{ONBOARDING_CSS}</style>
    </div>,
    document.body,
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab cycling inside a modal screen, whatever else the page adds later. */
function useFocusTrap(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const container = ref.current;
      if (event.key !== "Tab" || !container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && container.contains(active);
      if (!inside || (event.shiftKey && (active === first || active === container)) || (!event.shiftKey && active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ref]);
}

/* -------------------------------------------------------------------------- */
/* Act 1 · Introduction deck                                                  */
/* -------------------------------------------------------------------------- */

function WelcomeDeck({
  copy,
  locale,
  setLocale,
  tools,
  onSkip,
  onStartTour,
}: {
  copy: OnboardingCopy;
  locale: StudioLocale;
  setLocale: (locale: StudioLocale) => void;
  tools: ToolInfo[];
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
      <div ref={deckRef} tabIndex={-1} className="ob-deck outline-none" role="dialog" aria-modal="true" aria-label={copy.welcome.title}>
        <aside className="relative flex flex-col border-r border-white/5 bg-[#080c12] px-4 py-6">
          <div className="flex items-center gap-2.5 px-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#f5c400]/40 bg-[#f5c400]/10 text-[#f5c400]">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Agent Studio</p>
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
            <div key={`${screen}-${locale}`} className={direction > 0 ? "ob-enter-fwd" : "ob-enter-back"}>
              {screen === "language" ? <LanguageScreen copy={copy} locale={locale} setLocale={setLocale} /> : null}
              {screen === "welcome" ? <WelcomeScreen copy={copy} /> : null}
              {screen === "how" ? <HowScreen copy={copy} /> : null}
              {screen === "anatomy" ? <AnatomyScreen copy={copy} /> : null}
              {screen === "tools" ? <ToolsScreen copy={copy} tools={tools} /> : null}
              {screen === "trust" ? <TrustScreen copy={copy} /> : null}
              {screen === "ready" ? <ReadyScreen copy={copy} onStart={startTour} /> : null}
            </div>
          </div>

          <footer className="flex items-center justify-between gap-4 border-t border-white/5 px-10 py-4">
            <button type="button" onClick={onSkip} className="text-xs text-[#687386] transition-colors hover:text-white">
              {copy.ui.skipIntro}
            </button>
            <div className="flex flex-1 justify-center gap-1.5" aria-hidden="true">
              {DECK_SCREENS.map((item, itemIndex) => (
                <span key={item} className="h-1 w-8 overflow-hidden rounded-full bg-[#1c222b]">
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

function ScreenHeading({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="ob-rise text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[#f5c400]">{eyebrow}</p>
      <h2 className="ob-rise mt-2 text-[26px] font-semibold leading-tight tracking-tight text-white" style={{ animationDelay: "60ms" }}>
        {title}
      </h2>
      {intro ? (
        <p className="ob-rise mt-2.5 text-sm leading-6 text-[#8c96a8]" style={{ animationDelay: "120ms" }}>
          {intro}
        </p>
      ) : null}
    </div>
  );
}

function LanguageScreen({ copy, locale, setLocale }: { copy: OnboardingCopy; locale: StudioLocale; setLocale: (locale: StudioLocale) => void }) {
  const options: StudioLocale[] = ["en", "de"];
  return (
    <div className="flex min-h-[460px] flex-col items-center justify-center text-center">
      <Emblem icon={Sparkles} />
      <h2 className="ob-rise mt-7 text-[28px] font-semibold tracking-tight text-white">{copy.language.title}</h2>
      <p className="ob-rise mt-1 text-base text-[#687386]" style={{ animationDelay: "80ms" }}>
        {copy.language.subtitle}
      </p>
      <div className="mt-8 grid w-full max-w-xl grid-cols-2 gap-4">
        {options.map((option, optionIndex) => {
          const selected = option === locale;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setLocale(option)}
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
                <span className={cn("text-4xl font-semibold tracking-tight transition-colors duration-500", selected ? "text-[#f5c400]" : "text-[#3a4553]")}>
                  {option.toUpperCase()}
                </span>
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

function WelcomeScreen({ copy }: { copy: OnboardingCopy }) {
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
        <Emblem icon={Bot} large />
        <div className="mt-8 w-full rounded-2xl border border-[#1f2630] bg-[#0b1017] p-5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#687386]">{copy.welcome.learnTitle}</p>
          <ol className="mt-4 space-y-3">
            {copy.welcome.learn.map((item, itemIndex) => (
              <li key={item} className="ob-rise flex items-start gap-3" style={{ animationDelay: `${300 + itemIndex * 80}ms` }}>
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#f5c400]/40 text-[10px] font-bold text-[#f5c400]">
                  {itemIndex + 1}
                </span>
                <span className="text-[13px] leading-5 text-[#c2cad5]">{item}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

const HOW_ICONS: LucideIcon[] = [MessageSquareText, ListOrdered, Wrench, CheckCheck, FileText];

function HowScreen({ copy }: { copy: OnboardingCopy }) {
  const nodes = copy.how.nodes;
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % nodes.length), 3800);
    return () => window.clearInterval(timer);
  }, [playing, nodes.length]);

  const progress = active / (nodes.length - 1);
  const node = nodes[active];

  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <ScreenHeading eyebrow={copy.how.eyebrow} title={copy.how.title} intro={copy.how.intro} />
        <button
          type="button"
          onClick={() => setPlaying((current) => !current)}
          className="ob-rise inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#303845] px-3 py-1.5 text-xs text-[#aeb8c7] transition-colors hover:border-[#f5c400]/50 hover:text-white"
          style={{ animationDelay: "200ms" }}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? copy.how.pause : copy.how.play}
        </button>
      </div>

      <div className="relative mt-10 px-2">
        <div className="absolute left-[38px] right-[38px] top-7 h-[2px] rounded-full bg-[#1f2630]">
          <div className="ob-line-draw absolute inset-0 rounded-full bg-[#2a323d]" />
          <div className="ob-track-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#f5c400]/40 to-[#f5c400]" style={{ width: `${progress * 100}%` }} />
          <span
            className="ob-comet absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f5c400] shadow-[0_0_18px_6px_rgba(245,196,0,0.45)]"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
        <div className="relative flex justify-between">
          {nodes.map((item, itemIndex) => {
            const Icon = HOW_ICONS[itemIndex] ?? Bot;
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
                className="ob-pop flex w-[92px] flex-col items-center gap-3"
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
                <span className={cn("text-center text-xs font-semibold transition-colors duration-500", isActive ? "text-white" : isDone ? "text-[#c2cad5]" : "text-[#687386]")}>
                  {item.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div key={node.key} className="ob-rise mt-9 grid gap-5 rounded-2xl border border-[#1f2630] bg-[#0b1017] p-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#f5c400]">
            {active + 1} / {nodes.length}
          </p>
          <h3 className="mt-1.5 text-lg font-semibold text-white">{node.title}</h3>
          <p className="mt-2 text-sm leading-7 text-[#c2cad5]">{node.text}</p>
        </div>
        <div className="flex items-center rounded-xl border border-[#252a33] bg-[#06090d] p-4">
          <p className="border-l-2 border-[#f5c400]/70 pl-3 text-[13px] leading-6 text-[#e5e9ef]">{node.example}</p>
        </div>
      </div>
      <p className="ob-rise mt-4 text-xs text-[#687386]" style={{ animationDelay: "500ms" }}>
        {copy.how.footnote}
      </p>
    </div>
  );
}

const ANATOMY_ICONS: Record<string, LucideIcon> = {
  identity: Tag,
  purpose: Target,
  procedure: ListOrdered,
  tools: Wrench,
  guardrails: ShieldCheck,
  starters: MessageSquareText,
  format: LayoutList,
  advanced: SlidersHorizontal,
};

function AnatomyScreen({ copy }: { copy: OnboardingCopy }) {
  const [active, setActive] = useState(0);
  const part = copy.anatomy.parts[active];
  const ActiveIcon = ANATOMY_ICONS[part.key] ?? Bot;
  return (
    <div>
      <ScreenHeading eyebrow={copy.anatomy.eyebrow} title={copy.anatomy.title} intro={copy.anatomy.intro} />
      <div className="mt-7 grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
        <ul className="space-y-1">
          {copy.anatomy.parts.map((item, itemIndex) => {
            const Icon = ANATOMY_ICONS[item.key] ?? Bot;
            const selected = itemIndex === active;
            return (
              <li key={item.key} className="ob-rise" style={{ animationDelay: `${140 + itemIndex * 55}ms` }}>
                <button
                  type="button"
                  onClick={() => setActive(itemIndex)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-[13px] transition-all duration-300",
                    selected ? "border-[#f5c400]/40 bg-[#f5c400]/[0.08] text-white" : "border-transparent text-[#8c96a8] hover:bg-white/[0.03] hover:text-white",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0 transition-colors duration-300", selected ? "text-[#f5c400]" : "text-[#4f5968]")} />
                  <span className="truncate">{item.title}</span>
                  <span className={cn("ml-auto text-[10px] tabular-nums", selected ? "text-[#f5c400]" : "text-[#3a4553]")}>{String(itemIndex + 1).padStart(2, "0")}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div key={part.key} className="ob-enter-fwd flex flex-col rounded-2xl border border-[#1f2630] bg-[#0b1017] p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#f5c400]/40 bg-[#f5c400]/10 text-[#f5c400]">
              <ActiveIcon className="h-5 w-5" />
            </span>
            <h3 className="text-lg font-semibold text-white">{part.title}</h3>
          </div>
          <p className="mt-4 text-sm leading-7 text-[#c2cad5]">{part.text}</p>
          <div className="mt-auto pt-5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#687386]">{copy.anatomy.exampleLabel}</p>
            <p className="ob-rise mt-2 whitespace-pre-line rounded-xl border border-[#252a33] bg-[#06090d] p-4 text-[13px] leading-6 text-[#e5e9ef]" style={{ animationDelay: "160ms" }}>
              {part.example}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function useTypewriter(text: string, speed = 20) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0);
    const timer = window.setInterval(() => {
      setCount((current) => {
        if (current >= text.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, speed);
    return () => window.clearInterval(timer);
  }, [text, speed]);
  return { shown: text.slice(0, count), done: count >= text.length };
}

function ToolConsole({ call, result, label }: { call: string; result: string; label: string }) {
  const { shown, done } = useTypewriter(call);
  return (
    <div className="rounded-xl border border-[#252a33] bg-[#05080c] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-[#3a4553]" />
          <span className="h-2 w-2 rounded-full bg-[#3a4553]" />
          <span className="h-2 w-2 rounded-full bg-[#3a4553]" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4f5968]">{label}</span>
      </div>
      <p className="font-mono text-[12.5px] leading-6 text-[#e5e9ef]">
        <span className="text-[#f5c400]">›</span> {shown}
        {!done ? <span className="ob-caret" /> : null}
      </p>
      <p className={cn("mt-1.5 font-mono text-[12.5px] leading-6 text-emerald-300 transition-all duration-500", done ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0")}>
        ← {result}
      </p>
    </div>
  );
}

function ToolsScreen({ copy, tools }: { copy: OnboardingCopy; tools: ToolInfo[] }) {
  const { toolLabel } = useStudioText();
  const names = Object.keys(copy.tools.items);
  const catalog = useMemo(() => new Map(tools.map((tool) => [tool.name, tool])), [tools]);
  const [active, setActive] = useState(names[0]);
  const item = copy.tools.items[active];
  const activeTool = catalog.get(active);

  return (
    <div>
      <ScreenHeading eyebrow={copy.tools.eyebrow} title={copy.tools.title} intro={copy.tools.intro} />
      <div className="mt-7 grid grid-cols-5 gap-2">
        {names.map((name, nameIndex) => {
          const tool = catalog.get(name);
          const selected = name === active;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setActive(name)}
              className={cn(
                "ob-pop flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all duration-300",
                selected ? "border-[#f5c400]/60 bg-[#f5c400]/[0.08] shadow-[0_12px_30px_rgba(0,0,0,0.3)]" : "border-[#1f2630] bg-[#0b1017] hover:-translate-y-0.5 hover:border-[#303845]",
              )}
              style={{ animationDelay: `${140 + nameIndex * 45}ms` }}
            >
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg border transition-colors duration-300", selected ? "border-[#f5c400]/50 text-[#f5c400]" : "border-[#303845] text-[#8c96a8]")}>
                <ToolIcon icon={tool?.icon} className="h-4 w-4" />
              </span>
              <span className={cn("text-[11.5px] font-semibold leading-4", selected ? "text-white" : "text-[#aeb8c7]")}>{tool ? toolLabel(tool) : name}</span>
            </button>
          );
        })}
      </div>
      <div key={active} className="ob-rise mt-5 grid gap-5 rounded-2xl border border-[#1f2630] bg-[#0b1017] p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <p className="font-mono text-[11px] text-[#f5c400]">{active}</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{activeTool ? toolLabel(activeTool) : active}</h3>
          <p className="mt-2 text-sm leading-7 text-[#c2cad5]">{item.text}</p>
        </div>
        <ToolConsole call={item.call} result={item.result} label={copy.tools.exampleLabel} />
      </div>
    </div>
  );
}

function TrustScreen({ copy }: { copy: OnboardingCopy }) {
  return (
    <div>
      <ScreenHeading eyebrow={copy.trust.eyebrow} title={copy.trust.title} intro={copy.trust.intro} />
      <div className="mt-7 grid gap-3 lg:grid-cols-2">
        {copy.trust.rules.map((rule, ruleIndex) => (
          <div key={rule.title} className="ob-rise flex gap-4 rounded-2xl border border-[#1f2630] bg-[#0b1017] p-5" style={{ animationDelay: `${140 + ruleIndex * 90}ms` }}>
            <svg viewBox="0 0 24 24" className="mt-0.5 h-7 w-7 shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r="10.5" fill="rgba(245,196,0,0.08)" stroke="#f5c400" strokeWidth="1.3" className="ob-draw" style={{ "--len": 66, animationDelay: `${260 + ruleIndex * 90}ms` } as CSSProperties} />
              <path d="M7.2 12.4l3.2 3.2 6.4-6.6" fill="none" stroke="#f5c400" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="ob-draw" style={{ "--len": 16, animationDelay: `${700 + ruleIndex * 90}ms` } as CSSProperties} />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-white">{rule.title}</h3>
              <p className="mt-1.5 text-[13px] leading-6 text-[#aeb8c7]">{rule.text}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="ob-rise mt-5 rounded-xl border border-[#252a33] bg-[#06090d] px-4 py-3 text-xs leading-5 text-[#8c96a8]" style={{ animationDelay: "720ms" }}>
        {copy.trust.note}
      </p>
    </div>
  );
}

function ReadyScreen({ copy, onStart }: { copy: OnboardingCopy; onStart: () => void }) {
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

function Emblem({ icon: Icon, large = false }: { icon: LucideIcon; large?: boolean }) {
  const size = large ? "h-44 w-44" : "h-32 w-32";
  return (
    <div className={cn("ob-pop relative flex items-center justify-center", size)}>
      <svg viewBox="0 0 160 160" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="ob-emblem-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f5c400" />
            <stop offset="100%" stopColor="#f5c400" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <g className="ob-orbit">
          <circle cx="80" cy="80" r="74" fill="none" stroke="rgba(245,196,0,0.22)" strokeDasharray="1.5 7" />
          <circle cx="80" cy="6" r="2.6" fill="#f5c400" />
          <circle cx="154" cy="80" r="1.8" fill="rgba(245,196,0,0.6)" />
        </g>
        <circle cx="80" cy="80" r="58" fill="none" stroke="url(#ob-emblem-gold)" strokeWidth="1.5" className="ob-draw" style={{ "--len": 365 } as CSSProperties} />
        <circle cx="80" cy="80" r="42" fill="rgba(245,196,0,0.06)" stroke="rgba(245,196,0,0.45)" strokeWidth="1" className="ob-draw" style={{ "--len": 264, animationDelay: "250ms" } as CSSProperties} />
      </svg>
      <span className="ob-pop relative flex items-center justify-center rounded-2xl border border-[#f5c400]/50 bg-[#141b24] text-[#f5c400] shadow-[0_0_40px_rgba(245,196,0,0.25)]" style={{ width: large ? 64 : 48, height: large ? 64 : 48, animationDelay: "420ms" }}>
        <Icon className={large ? "h-8 w-8" : "h-6 w-6"} />
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Act 2 · Hands-on spotlight tour                                            */
/* -------------------------------------------------------------------------- */

type Box = { x: number; y: number; w: number; h: number };

const CARD_WIDTH = 400;
const SPOT_PAD = 8;
const EDGE = 16;
const GAP = 18;

function findTarget(step: TourStepDef): Element | null {
  return (
    document.querySelector(`[data-tour="${step.target}"]`) ??
    (step.fallbackTarget ? document.querySelector(`[data-tour="${step.fallbackTarget}"]`) : null)
  );
}

/** Ancestors that clip their content, so the spotlight only covers the part of a target that is actually visible. */
function clippingAncestors(element: Element): Element[] {
  const clips: Element[] = [];
  for (let node = element.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.overflowX !== "visible" || style.overflowY !== "visible") clips.push(node);
  }
  return clips;
}

/** A popover or confirmation dialog from the studio is open on top of the tour; it owns the keyboard. */
function studioOverlayOpen(): boolean {
  return Boolean(document.querySelector('[data-radix-popper-content-wrapper], [data-slot="alert-dialog-content"]'));
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

const USE_TEMPLATE_INDEX = TOUR_STEPS.findIndex((item) => item.action === "useTemplate");

function placeCard(hole: Box | null, card: { w: number; h: number }, viewport: { w: number; h: number }) {
  const clampY = (y: number) => Math.min(Math.max(y, EDGE), viewport.h - card.h - EDGE);
  const clampX = (x: number) => Math.min(Math.max(x, EDGE), viewport.w - card.w - EDGE);
  if (!hole) return { x: (viewport.w - card.w) / 2, y: (viewport.h - card.h) / 2 };
  const right = hole.x + hole.w + GAP;
  if (right + card.w <= viewport.w - EDGE) return { x: right, y: clampY(hole.y) };
  const left = hole.x - GAP - card.w;
  if (left >= EDGE) return { x: left, y: clampY(hole.y) };
  const below = hole.y + hole.h + GAP;
  if (below + card.h <= viewport.h - EDGE) return { x: clampX(hole.x), y: below };
  const above = hole.y - GAP - card.h;
  if (above >= EDGE) return { x: clampX(hole.x), y: above };
  return { x: viewport.w - card.w - EDGE * 2, y: viewport.h - card.h - EDGE * 2 };
}

function SpotlightTour({
  copy,
  controller,
  onDone,
  onSkip,
}: {
  copy: OnboardingCopy;
  controller: OnboardingController;
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
  // Set once the studio home has been on screen during a home step, so a draft appearing afterwards is the user's doing.
  const homeSeenRef = useRef(false);
  const advanceTimer = useRef<number | null>(null);

  const isDone = useCallback(() => {
    const current = controllerRef.current;
    switch (step.action) {
      case "selectTemplate":
        return current.view === "home" && current.selectedTemplateId === TOUR_TEMPLATE_ID;
      case "useTemplate":
        return current.workbenchVisible;
      case "askQuestion":
        return Boolean(document.querySelector('[data-tour="messages"]'));
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

  // Make sure the studio shows the screen this step lives on.
  useEffect(() => {
    armedRef.current = false;
    homeSeenRef.current = false;
    setSatisfied(false);
    const current = controllerRef.current;
    // "Use as-is" is already done when the editor is open; going back to it must not throw the draft away.
    const keepEditor = step.action === "useTemplate" && current.workbenchVisible;
    if (step.view === "home" && current.view !== "home" && !keepEditor) current.goHome();
    if (step.view === "workbench" && !current.workbenchVisible) current.showWorkbench();
    const scrollTimer = window.setTimeout(() => {
      const element = findTarget(step);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const tall = rect.height > window.innerHeight * 0.7;
      element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: tall ? "start" : "center", inline: "nearest" });
    }, step.view === "workbench" ? 380 : 160);
    return () => window.clearTimeout(scrollTimer);
  }, [step]);

  // Track the target, the card size and the user's action every frame for smooth, layout-proof positioning.
  useEffect(() => {
    let frame = 0;
    let lastKey = "";
    let measured: Element | null = null;
    let clips: Element[] = [];
    // Give the initial scroll a moment, then bring the target back whenever it ends up fully out of view.
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
      const current = controllerRef.current;
      if (step.view === "home" && step.action !== "useTemplate") {
        if (current.view === "home") homeSeenRef.current = true;
        else if (homeSeenRef.current && current.workbenchVisible) {
          // The user opened a draft on their own (tailored with AI, Ctrl+Enter, blank canvas): continue from there.
          homeSeenRef.current = false;
          goTo(USE_TEMPLATE_INDEX);
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
          }, step.action === "askQuestion" ? 1600 : 1100);
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [step, isDone, goTo]);

  useEffect(() => () => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
  }, []);

  const required = step.action && step.action !== "askQuestion";
  const canNext = !required || satisfied;

  const doItForMe = () => {
    const current = controllerRef.current;
    if (step.action === "selectTemplate") current.selectTemplate(TOUR_TEMPLATE_ID);
    if (step.action === "useTemplate") current.showWorkbench();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A studio popover or dialog handles its own keys (Esc closes it, not the tour).
      if (event.defaultPrevented || studioOverlayOpen()) return;
      const target = event.target as HTMLElement | null;
      const field = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      // Keys belong to a field only when the user is typing inside the spotlight; stray focus elsewhere must not trap the tour.
      const typing = Boolean(field && findTarget(step)?.contains(target));
      if (typing) return;
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
  // A click outside the spotlight gently shakes the card to point the user back to it.
  const blocked = () => {
    if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
    setShaking(false);
    window.requestAnimationFrame(() => setShaking(true));
    shakeTimer.current = window.setTimeout(() => setShaking(false), 500);
  };
  const holeStyle = hole ? { top: hole.y, left: hole.x, width: hole.w, height: hole.h } : undefined;

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
        style={{ left: position.x, top: position.y, width: Math.min(CARD_WIDTH, viewport.w - EDGE * 2) }}
        role="dialog"
        aria-live="polite"
        aria-label={text.title}
      >
        <div className={cn(shaking && "ob-shake")}>
          <div className="flex items-center justify-between gap-3 px-5 pt-4">
            <span className="rounded-full border border-[#f5c400]/35 bg-[#f5c400]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f5d766]">
              {text.chapter}
            </span>
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
            {text.action ? (
              celebrating || (required && satisfied) ? (
                <div className="ob-pop mt-4 flex items-center gap-2.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-3 text-[13px] font-medium text-emerald-200">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400 text-black">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {copy.ui.wellDone}
                </div>
              ) : (
                <div className="ob-rise mt-4 flex items-start gap-3 rounded-xl border border-[#f5c400]/35 bg-[#f5c400]/[0.07] px-3.5 py-3" style={{ animationDelay: `${90 + text.body.length * 70}ms` }}>
                  <MousePointerClick className="ob-nudge mt-0.5 h-4 w-4 shrink-0 text-[#f5c400]" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f5c400]">
                      {step.action === "askQuestion" ? copy.ui.optional : copy.ui.yourTurn}
                    </p>
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
              {required && !satisfied ? (
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

function CompletionCard({ copy, onFinish }: { copy: OnboardingCopy; onFinish: () => void }) {
  const finishRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(cardRef);
  useEffect(() => {
    // Focus the button so Enter finishes exactly once; Esc also closes.
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

function TipRow({ children, delay }: { children: ReactNode; delay: number }) {
  return (
    <li className="ob-rise flex items-start gap-2.5 text-[13px] leading-5 text-[#c2cad5]" style={{ animationDelay: `${delay}ms` }}>
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f5c400]" />
      <span>{children}</span>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

const ONBOARDING_CSS = `
/*
  The root is deliberately not a stacking context: every layer is fixed with its own z-index so studio UI can sit between them.
  Bottom to top: dimming and blockers (200) · studio popovers (240) · toasts (260) · tour card (280) · confirmation dialogs (300).
  Only the backdrop, blockers and card catch clicks, so the spotlight hole stays interactive.
*/
.ob-root { pointer-events: none; }
.ob-backdrop, .ob-blocker, .ob-card { pointer-events: auto; }
[data-radix-popper-content-wrapper] { z-index: 240 !important; }
[aria-label^="Notifications"] > ol { z-index: 260 !important; }
[data-slot="alert-dialog-overlay"], [data-slot="alert-dialog-content"] { z-index: 300 !important; }
.ob-backdrop {
  position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; padding: 24px;
  background: radial-gradient(1100px 620px at 15% -10%, rgba(245,196,0,0.08), transparent 60%), rgba(3,5,9,0.8);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  animation: ob-fade 460ms ease both;
}
.ob-backdrop.ob-leaving { animation: ob-fade-out 420ms ease both; }
.ob-deck {
  width: min(1060px, 100%); height: min(700px, 100%);
  display: grid; grid-template-columns: 250px minmax(0, 1fr);
  overflow: hidden; border-radius: 22px;
  border: 1px solid rgba(245,196,0,0.18);
  background: linear-gradient(180deg, #0d131b 0%, #090d13 100%);
  box-shadow: 0 50px 140px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04);
  animation: ob-deck-in 720ms ${EASE_OUT} both;
}
.ob-leaving .ob-deck { animation: ob-deck-out 420ms cubic-bezier(0.4,0,1,1) both; }
.ob-complete {
  width: min(520px, 100%); padding: 34px 32px 28px; border-radius: 22px;
  border: 1px solid rgba(245,196,0,0.2);
  background: linear-gradient(180deg, #0f161f 0%, #0a0e14 100%);
  box-shadow: 0 50px 140px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04);
  animation: ob-deck-in 720ms ${EASE_OUT} both;
}
.ob-enter-fwd { animation: ob-in-fwd 600ms ${EASE_OUT} both; }
.ob-enter-back { animation: ob-in-back 600ms ${EASE_OUT} both; }
.ob-rise { animation: ob-rise 640ms ${EASE_OUT} both; }
.ob-pop { animation: ob-pop 560ms ${EASE_OUT} both; }
.ob-draw { stroke-dasharray: var(--len, 300); stroke-dashoffset: var(--len, 300); animation: ob-draw 1300ms cubic-bezier(0.65,0,0.35,1) forwards; }
.ob-orbit { transform-box: fill-box; transform-origin: center; animation: ob-spin 28s linear infinite; }
.ob-line-draw { transform-origin: left center; animation: ob-scale-x 1100ms ${EASE_OUT} both; }
.ob-line-draw-v { transform-origin: top center; animation: ob-scale-y 1100ms ${EASE_OUT} 200ms both; }
.ob-track-fill { transition: width 760ms ${EASE_OUT}; }
.ob-comet { transition: left 760ms ${EASE_OUT}; }
.ob-node { transition: transform 450ms ${EASE_OUT}, background-color 450ms ease, border-color 450ms ease, box-shadow 450ms ease, color 450ms ease; }
.ob-ping::after {
  content: ""; position: absolute; inset: -7px; border-radius: 20px;
  border: 1px solid rgba(245,196,0,0.55);
  animation: ob-ping 1900ms cubic-bezier(0,0,0.2,1) infinite;
}
.ob-progress { transition: width 650ms ${EASE_OUT}; }
.ob-rail-indicator { transition: transform 560ms ${EASE_OUT}; }
.ob-caret { display: inline-block; width: 7px; height: 14px; margin-left: 2px; vertical-align: -2px; background: #f5c400; animation: ob-blink 1s steps(1) infinite; }
.ob-shine { position: relative; overflow: hidden; }
.ob-shine::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.5) 50%, transparent 65%);
  transform: translateX(-130%); animation: ob-shine 3.2s cubic-bezier(0.4,0,0.2,1) 1.2s infinite;
}
.ob-blocker { position: fixed; z-index: 200; background: transparent; }
.ob-dim { background: rgba(3,6,10,0.76); animation: ob-fade 420ms ease both; }
.ob-hole {
  position: fixed; z-index: 201; border-radius: 14px; pointer-events: none;
  animation: ob-fade 420ms ease both;
  box-shadow: 0 0 0 1.5px rgba(245,196,0,0.85), 0 0 30px 4px rgba(245,196,0,0.16), 0 0 0 200vmax rgba(3,6,10,0.76);
  transition: top 580ms ${EASE_OUT}, left 580ms ${EASE_OUT}, width 580ms ${EASE_OUT}, height 580ms ${EASE_OUT};
}
.ob-hole-pulse {
  position: fixed; z-index: 201; border-radius: 16px; pointer-events: none;
  border: 1.5px solid rgba(245,196,0,0.75);
  animation: ob-hole-pulse 1800ms cubic-bezier(0,0,0.2,1) infinite;
  transition: top 580ms ${EASE_OUT}, left 580ms ${EASE_OUT}, width 580ms ${EASE_OUT}, height 580ms ${EASE_OUT};
}
.ob-card {
  position: fixed; z-index: 280; border-radius: 18px;
  border: 1px solid rgba(245,196,0,0.25);
  background: linear-gradient(180deg, rgba(18,25,34,0.98) 0%, rgba(11,16,23,0.98) 100%);
  box-shadow: 0 34px 90px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
  max-height: calc(100vh - 32px); overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
  transition: top 580ms ${EASE_OUT}, left 580ms ${EASE_OUT};
  animation: ob-pop 560ms ${EASE_OUT} both;
}
@media (max-width: 860px) {
  .ob-deck { grid-template-columns: minmax(0, 1fr); }
  .ob-deck > aside { display: none; }
}
.ob-shake { animation: ob-shake 460ms cubic-bezier(0.36,0.07,0.19,0.97) both; }
.ob-nudge { animation: ob-nudge 1500ms ease-in-out infinite; }
@keyframes ob-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ob-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes ob-deck-in { from { opacity: 0; transform: translateY(22px) scale(0.965); } to { opacity: 1; transform: none; } }
@keyframes ob-deck-out { to { opacity: 0; transform: translateY(-12px) scale(0.98); } }
@keyframes ob-in-fwd { from { opacity: 0; transform: translateX(32px); } to { opacity: 1; transform: none; } }
@keyframes ob-in-back { from { opacity: 0; transform: translateX(-32px); } to { opacity: 1; transform: none; } }
@keyframes ob-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes ob-pop { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: none; } }
@keyframes ob-draw { to { stroke-dashoffset: 0; } }
@keyframes ob-spin { to { transform: rotate(360deg); } }
@keyframes ob-scale-x { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes ob-scale-y { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes ob-ping { 0% { transform: scale(0.92); opacity: 0.9; } 100% { transform: scale(1.32); opacity: 0; } }
@keyframes ob-blink { 50% { opacity: 0; } }
@keyframes ob-shine { 0% { transform: translateX(-130%); } 45%, 100% { transform: translateX(130%); } }
@keyframes ob-hole-pulse { 0% { transform: scale(1); opacity: 0.85; } 100% { transform: scale(1.045); opacity: 0; } }
@keyframes ob-shake { 10%, 90% { translate: -1px 0; } 20%, 80% { translate: 2px 0; } 30%, 50%, 70% { translate: -4px 0; } 40%, 60% { translate: 4px 0; } }
@keyframes ob-nudge { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(3px, -3px); } }
@media (prefers-reduced-motion: reduce) {
  .ob-root *, .ob-root *::before, .ob-root *::after {
    animation-duration: 1ms !important; animation-delay: 0ms !important; animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
`;
