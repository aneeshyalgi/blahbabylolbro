"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  Code2,
  Database,
  TableProperties,
  GitBranch,
  Rows3,
  GitCompare,
  AlertTriangle,
  Bot,
  Network,
  Shield,
  FileText,
  Sparkles,
  GitCompareArrows,
  BrainCircuit,
  Waypoints,
  ChevronRight,
  Lock,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useTabOrder } from "@/context/tab-order-context";
import { DEFAULT_TAB_ORDER, getTabLabel, TAB_ID_TO_MESSAGE_KEY } from "@/lib/tabs";

interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isNavigationLocked?: boolean;
  isRootCausePremium?: boolean;
}

const NAV_ICONS: Record<string, typeof Code2> = {
  code: Code2,
  "data-modal": Database,
  data: TableProperties,
  "technical-lineage": GitBranch,
  "technical-lineage-agent": BrainCircuit,
  clustering: Rows3,
  "content-lineage": Network,
  "content-lineage-agent": Waypoints,
  "compare-clusters": GitCompare,
  "root-cause": AlertTriangle,
  "rootcause-ai-agents": Bot,
  "create-ai-agents": Sparkles,
  "semantic-lineage": Network,
  regulations: Shield,
  "release-notes": FileText,
  "regulation-matcher": GitCompareArrows,
};

/** "Technical Lineage (Legacy)" → the name and the quieter "(Legacy)". */
function splitLabel(label: string): [string, string | null] {
  const match = /^(.*\S)\s+(\([^()]+\))$/.exec(label);
  return match ? [match[1], match[2]] : [label, null];
}

export function TabNavigation({ activeTab, onTabChange, isNavigationLocked = false, isRootCausePremium = false }: TabNavigationProps) {
  const t = useTranslations("tabs");
  const { tabOrder } = useTabOrder();
  const order = tabOrder.length > 0 ? tabOrder : [...DEFAULT_TAB_ORDER];
  const orderKey = order.join("|");
  const isCreateAIAgentsActive = activeTab === "create-ai-agents";

  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<string, HTMLButtonElement>());
  // The highlight behind the active tab: it slides from tab to tab (not on the first placement).
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  const [sliding, setSliding] = useState(false);
  // Soft edges where the list continues beyond the visible area.
  const [edges, setEdges] = useState({ top: false, bottom: false });

  const getLabel = (id: string) => {
    const key = TAB_ID_TO_MESSAGE_KEY[id];
    if (key) {
      try {
        return t(key);
      } catch {
        return getTabLabel(id);
      }
    }
    return getTabLabel(id);
  };

  const measure = useCallback(() => {
    const item = items.current.get(activeTab);
    setIndicator(item ? { top: item.offsetTop, height: item.offsetHeight } : null);
  }, [activeTab]);

  useLayoutEffect(() => {
    measure();
    const list = listRef.current;
    if (!list) return;
    // Labels change height with the language or a reorder; the highlight follows.
    const observer = new ResizeObserver(() => measure());
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure, orderKey]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setSliding(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // The active tab stays in view when the list scrolls (short windows).
  useEffect(() => {
    items.current.get(activeTab)?.scrollIntoView({ block: "nearest" });
  }, [activeTab]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => setEdges({ top: nav.scrollTop > 2, bottom: nav.scrollTop + nav.clientHeight < nav.scrollHeight - 2 });
    update();
    nav.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    if (listRef.current) observer.observe(listRef.current);
    return () => {
      nav.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const fadeMask = `linear-gradient(to bottom, ${edges.top ? "transparent 0, #000 28px" : "#000 0"}, ${edges.bottom ? "#000 calc(100% - 28px), transparent 100%" : "#000 100%"})`;
  const premiumActive = activeTab === "rootcause-ai-agents";

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen w-72 shrink-0 flex-col overflow-hidden transition-[background-color,box-shadow] duration-300",
        isCreateAIAgentsActive
          ? "studio-chrome-sidebar"
          : isRootCausePremium
            ? "bg-[radial-gradient(circle_at_top_left,_rgba(245,196,0,0.16),_transparent_30%),linear-gradient(180deg,#070b12_0%,#0b121a_100%)] shadow-[8px_0_28px_rgba(0,0,0,0.24)]"
            : "bg-[#080b10]",
      )}
    >
      {/* Ambient light and the right edge, gold at the top fading into the border. */}
      {!isCreateAIAgentsActive && !isRootCausePremium ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_38%_at_0%_0%,rgba(245,196,0,0.07),transparent_62%),radial-gradient(90%_30%_at_100%_100%,rgba(56,189,248,0.035),transparent_70%)]" />
      ) : null}
      <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 w-px", isRootCausePremium ? "bg-[#f5c400]/20" : "bg-[linear-gradient(180deg,rgba(245,196,0,0.38)_0%,rgba(245,196,0,0.10)_22%,#252a33_55%,#252a33_100%)]")} />

      {/* Brand: as tall as the header next to it, so both lines meet. */}
      <div className={cn("relative flex h-[69px] shrink-0 items-center gap-3 border-b px-5", isRootCausePremium ? "border-[#f5c400]/20" : "border-[#1c222b]")}>
        <span className="group/brand relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#f5c400]/40 bg-[linear-gradient(140deg,rgba(245,196,0,0.26),rgba(245,196,0,0.04)_70%)] shadow-[0_0_22px_rgba(245,196,0,0.16),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <span className="font-mono text-[10.5px] font-bold tracking-[-0.02em] text-[#f5c400]">RDX</span>
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-semibold uppercase leading-4 tracking-[0.22em] text-[#f5c400]">RegData</p>
          <p className="truncate text-[13px] font-medium leading-5 text-[#c9d1dc]">Xplainer</p>
        </div>
      </div>

      <nav
        ref={navRef}
        className="relative flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-5 [scrollbar-color:transparent_transparent] [scrollbar-width:thin] hover:[scrollbar-color:#2a313c_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-[#2a313c] [&::-webkit-scrollbar-track]:bg-transparent"
        style={{ maskImage: fadeMask, WebkitMaskImage: fadeMask }}
        aria-label="Primary navigation"
      >
        <p className="mb-2.5 flex items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#5d6878]">
          Workspace
          {isNavigationLocked ? <Lock className="h-3 w-3 text-[#f5c400]/70" aria-hidden /> : null}
          <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-[#252a33] to-transparent" />
        </p>
        <div ref={listRef} className="relative space-y-0.5">
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 rounded-lg border",
              premiumActive
                ? "border-[#f5c400]/45 bg-[linear-gradient(100deg,rgba(245,196,0,0.26)_0%,rgba(245,196,0,0.10)_50%,rgba(245,196,0,0.03)_100%)] shadow-[inset_0_0_0_1px_rgba(245,196,0,0.10),0_10px_24px_rgba(0,0,0,0.18)]"
                : "border-[#f5c400]/20 bg-[linear-gradient(100deg,rgba(245,196,0,0.15)_0%,rgba(245,196,0,0.06)_55%,rgba(245,196,0,0.015)_100%)] shadow-[0_6px_18px_rgba(0,0,0,0.25)]",
              sliding
                ? "transition-[transform,height,opacity] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                : "transition-opacity duration-300",
              indicator ? "opacity-100" : "opacity-0",
            )}
            style={{ transform: `translateY(${indicator?.top ?? 0}px)`, height: indicator?.height ?? 0 }}
          >
            <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-[#f5c400] shadow-[0_0_12px_rgba(245,196,0,0.75)]" />
          </span>

          {order.map((id, index) => {
            const label = getLabel(id);
            const [name, note] = splitLabel(label);
            const isActive = activeTab === id;
            const Icon = NAV_ICONS[id] ?? Code2;
            return (
              <button
                key={id}
                ref={(element) => {
                  if (element) items.current.set(id, element);
                  else items.current.delete(id);
                }}
                type="button"
                onClick={() => {
                  if (!isNavigationLocked) onTabChange(id);
                }}
                title={label}
                disabled={isNavigationLocked}
                aria-current={isActive ? "page" : undefined}
                aria-label={label}
                className={cn(
                  "nav-item-in group relative z-[1] flex w-full items-center gap-3 rounded-lg px-2.5 py-[7px] text-left text-[13.5px] font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[#f5c400]/45",
                  isNavigationLocked
                    ? "cursor-not-allowed opacity-40"
                    : isActive
                      ? "text-white"
                      : "text-[#8c96a8] hover:bg-white/[0.035] hover:text-[#f2f4f7]",
                )}
                style={{ "--nav-delay": `${80 + index * 28}ms` } as CSSProperties}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-[translate,scale,rotate,background-color,border-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    isActive && premiumActive
                      ? "border-[#f5c400]/50 bg-[#f5c400]/20 text-[#f8d64a] shadow-[0_0_20px_rgba(245,196,0,0.28)]"
                      : isActive
                        ? "border-[#f5c400]/40 bg-[#f5c400]/[0.13] text-[#f5c400] shadow-[0_0_16px_rgba(245,196,0,0.2)]"
                        : "border-[#222934] bg-[#0e131a] text-[#768196] group-hover:border-[#f5c400]/30 group-hover:bg-[#f5c400]/[0.06] group-hover:text-[#f5c400]",
                    !isNavigationLocked && "group-hover:-translate-y-px group-hover:scale-[1.06] group-active:scale-95 motion-reduce:transition-none",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className={cn("line-clamp-2 min-w-0 flex-1 leading-snug transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", !isActive && !isNavigationLocked && "group-hover:translate-x-0.5 motion-reduce:transition-none")}>
                  {name}
                  {note ? <span className={cn("ml-1 text-[11.5px] font-normal", isActive ? "text-[#c9b25a]" : "text-[#5d6878]")}>{note}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className={cn("relative shrink-0 border-t px-3 py-3", isRootCausePremium ? "border-[#f5c400]/20" : "border-[#1c222b]")}>
        <button
          type="button"
          onClick={() => {
            if (!isNavigationLocked) onTabChange("create-ai-agents");
          }}
          title="Create AI Agents"
          disabled={isNavigationLocked}
          aria-current={isCreateAIAgentsActive ? "page" : undefined}
          aria-label="Create AI Agents"
          className={cn(
            "group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-2.5 py-2.5 text-left outline-none transition-[border-color,background-color,box-shadow] duration-300 focus-visible:ring-2 focus-visible:ring-[#f5c400]/45",
            isCreateAIAgentsActive
              ? "border-[#f5c400]/45 bg-[linear-gradient(100deg,rgba(245,196,0,0.16),rgba(245,196,0,0.04))] shadow-[0_0_26px_rgba(245,196,0,0.12)]"
              : "border-[#252a33] bg-[linear-gradient(100deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] hover:border-[#f5c400]/40 hover:bg-[#f5c400]/[0.05] hover:shadow-[0_0_24px_rgba(245,196,0,0.10)]",
            isNavigationLocked && "cursor-not-allowed opacity-40",
          )}
        >
          {/* A sheen that sweeps across on hover. */}
          <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-2/3 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent opacity-0 transition-[left,opacity] duration-700 ease-out group-hover:left-[130%] group-hover:opacity-100 motion-reduce:hidden" />
          <span
            className={cn(
              "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-rotate-6 group-hover:scale-105 motion-reduce:transition-none",
              isCreateAIAgentsActive
                ? "bg-[linear-gradient(135deg,#ffd84d,#e0aa00)] text-[#0b0f15] shadow-[0_0_20px_rgba(245,196,0,0.4)]"
                : "border border-[#f5c400]/35 bg-[#f5c400]/[0.10] text-[#f5c400] shadow-[0_0_14px_rgba(245,196,0,0.14)]",
            )}
          >
            <Sparkles className="h-4 w-4" />
          </span>
          <span className={cn("relative min-w-0 flex-1 truncate text-[13.5px] font-semibold", isCreateAIAgentsActive ? "text-white" : "text-[#dbe2ec] group-hover:text-white")}>Create AI Agents</span>
          <ChevronRight className={cn("relative h-4 w-4 shrink-0 transition-[translate,color] duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none", isCreateAIAgentsActive ? "text-[#f5c400]" : "text-[#5d6878] group-hover:text-[#f5c400]")} aria-hidden />
        </button>
      </div>
    </aside>
  );
}
