"use client";

import type { CSSProperties } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  Calculator,
  ClipboardCheck,
  Code2,
  Database,
  FileSearch,
  FileText,
  GitCompare,
  LayoutDashboard,
  ListOrdered,
  Network,
  Scale,
  Search,
  ShieldCheck,
  Sigma,
  Sparkles,
  Table2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const AGENT_ICONS: Record<string, LucideIcon> = {
  bot: Bot,
  search: Search,
  shield: ShieldCheck,
  scale: Scale,
  "git-compare": GitCompare,
  "file-text": FileText,
  sparkles: Sparkles,
  activity: Activity,
  database: Database,
  calculator: Calculator,
  network: Network,
  "clipboard-check": ClipboardCheck,
};

export const AGENT_COLORS: Record<string, string> = {
  amber: "#f5c400",
  emerald: "#34d399",
  sky: "#38bdf8",
  violet: "#a78bfa",
  rose: "#fb7185",
  orange: "#fb923c",
  teal: "#2dd4bf",
  slate: "#94a3b8",
};

const TOOL_ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  list: ListOrdered,
  table: Table2,
  "bar-chart": BarChart3,
  sigma: Sigma,
  "git-compare": GitCompare,
  code: Code2,
  network: Network,
  "file-search": FileSearch,
  calculator: Calculator,
};

export function agentAccent(color?: string): string {
  return AGENT_COLORS[color || ""] ?? AGENT_COLORS.amber;
}

/** Inline styles for an accent-tinted surface (Tailwind cannot build these colors at runtime). */
export function accentStyles(color?: string, strength: "soft" | "strong" = "soft"): CSSProperties {
  const hex = agentAccent(color);
  return strength === "soft"
    ? { color: hex, backgroundColor: `${hex}14`, borderColor: `${hex}40` }
    : { color: "#0b0f15", backgroundColor: hex, borderColor: hex };
}

export function AgentAvatar({
  icon,
  color,
  size = "md",
  className,
}: {
  icon?: string;
  color?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const Icon = AGENT_ICONS[icon || ""] ?? Bot;
  const hex = agentAccent(color);
  const dimensions = {
    sm: "h-7 w-7 rounded-md [&_svg]:h-3.5 [&_svg]:w-3.5",
    md: "h-9 w-9 rounded-lg [&_svg]:h-4 [&_svg]:w-4",
    lg: "h-12 w-12 rounded-xl [&_svg]:h-6 [&_svg]:w-6",
    xl: "h-16 w-16 rounded-2xl [&_svg]:h-8 [&_svg]:w-8",
  }[size];
  return (
    <span
      className={cn("relative flex shrink-0 items-center justify-center border", dimensions, className)}
      style={{
        color: hex,
        borderColor: `${hex}55`,
        background: `radial-gradient(circle at 30% 20%, ${hex}38, ${hex}10 70%)`,
        boxShadow: `0 0 0 1px ${hex}10, 0 8px 24px ${hex}18`,
      }}
    >
      <Icon />
    </span>
  );
}

export function ToolIcon({ icon, className }: { icon?: string; className?: string }) {
  const Icon = TOOL_ICONS[icon || ""] ?? Wrench;
  return <Icon className={cn("h-4 w-4", className)} />;
}
