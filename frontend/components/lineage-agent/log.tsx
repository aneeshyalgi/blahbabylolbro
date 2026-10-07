"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { LogEntry } from "./types";

/** Localised text of an agent log entry; the backend's English message is the fallback. */
export function useLogText() {
  const t = useTranslations("lineageAgent.log");
  const tLanguages = useTranslations("lineageAgent.languageNames");
  return (entry: LogEntry) => {
    if (!t.has(entry.code)) return entry.message;
    const params: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(entry.params ?? {})) {
      params[key] = Array.isArray(value) ? value.join(", ") || "–" : typeof value === "number" ? value : String(value ?? "");
    }
    for (const key of ["language", "languages"]) {
      if (typeof params[key] === "string") {
        params[key] = (params[key] as string).split(", ").map((code) => (tLanguages.has(code) ? tLanguages(code) : code)).join(", ");
      }
    }
    try {
      return t(entry.code, params);
    } catch {
      return entry.message;
    }
  };
}

const LEVEL_STYLES: Record<LogEntry["level"], string> = {
  info: "text-[#8c96a8]",
  success: "text-emerald-300",
  warn: "text-amber-300",
  error: "text-rose-300",
};

export function AgentConsole({ log, live = false, className, tourId }: { log: LogEntry[]; live?: boolean; className?: string; tourId?: string }) {
  const text = useLogText();
  const end = useRef<HTMLDivElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!live || !box.current) return;
    box.current.scrollTop = box.current.scrollHeight;
  }, [log.length, live]);
  return (
    <div ref={box} data-tour={tourId} className={cn("overflow-y-auto rounded-md border border-[#1f252e] bg-[#06080c] p-3 font-mono text-[11.5px] leading-[1.65]", className)}>
      {log.map((entry, index) => (
        <div key={index} className={cn("flex gap-3", entry.code === "tool_call" && "pl-4")}>
          <span className="w-14 shrink-0 text-right tabular-nums text-[#3f4957]">{entry.t.toFixed(2)}s</span>
          <span className={cn("w-3 shrink-0", LEVEL_STYLES[entry.level])}>{entry.level === "success" ? "✓" : entry.level === "warn" ? "!" : entry.level === "error" ? "✗" : entry.code === "tool_call" ? "↳" : "›"}</span>
          <span className={cn("min-w-0 flex-1 break-words", entry.level === "info" ? "text-[#c2cad5]" : LEVEL_STYLES[entry.level])}>{text(entry)}</span>
        </div>
      ))}
      {live && (
        <div className="flex gap-3">
          <span className="w-14 shrink-0" />
          <span className="inline-block h-3.5 w-1.5 animate-pulse bg-[#f5c400]/70" />
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
