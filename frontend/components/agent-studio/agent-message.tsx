"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  OctagonX,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "./api";
import { useStudioText } from "./i18n";
import type { ChatMessage, ContextChip, TimelineItem, ToolInfo, ToolStep } from "./types";
import { AgentAvatar, ToolIcon, agentAccent } from "./visuals";

function argumentSummary(step: ToolStep): string {
  const args = step.arguments || {};
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined || value === "") continue;
    if (key === "id" || key.endsWith("_id")) {
      parts.push(`${key}=${String(value).slice(0, 8)}`);
    } else {
      const text = typeof value === "object" ? JSON.stringify(value) : String(value);
      parts.push(`${key}=${text.length > 48 ? `${text.slice(0, 48)}…` : text}`);
    }
  }
  return parts.join(" · ");
}

function StepRow({ step, tool }: { step: ToolStep; tool?: ToolInfo }) {
  const { t, toolLabel } = useStudioText();
  const [open, setOpen] = useState(false);
  const running = step.status === "running";
  const failed = step.status === "error";
  return (
    <div className={cn("rounded-md border transition-colors", failed ? "border-red-500/30 bg-red-500/5" : "border-[#252a33] bg-[#0b1017]")}>
      <button
        type="button"
        onClick={() => !running && setOpen((current) => !current)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded border", failed ? "border-red-500/40 text-red-300" : "border-[#303845] text-[#aeb8c7]")}>
          <ToolIcon icon={tool?.icon} className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-[#e5e9ef]">{tool ? toolLabel(tool) : step.label}</span>
            {step.summary ? <span className={cn("truncate", failed ? "text-red-300" : "text-[#8c96a8]")}>{step.summary}</span> : null}
          </span>
          {argumentSummary(step) ? <span className="mt-0.5 block truncate font-mono text-[10.5px] text-[#687386]">{argumentSummary(step)}</span> : null}
        </span>
        {step.duration_ms !== undefined ? <span className="shrink-0 text-[10.5px] tabular-nums text-[#687386]">{formatDuration(step.duration_ms)}</span> : null}
        {running ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#f5c400]" />
        ) : failed ? (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        )}
        {!running ? (open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#687386]" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#687386]" />) : null}
      </button>
      {open && step.preview ? (
        <div className="border-t border-[#252a33] px-3 py-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#687386]">{failed ? t("message.error") : t("message.result")}</p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-[#06090d] p-2.5 font-mono text-[11px] leading-5 text-[#c2cad5]">{step.preview}</pre>
        </div>
      ) : null}
    </div>
  );
}

function Timeline({ items, running, toolsByName, durationMs }: { items: TimelineItem[]; running: boolean; toolsByName: Map<string, ToolInfo>; durationMs?: number }) {
  const { t, plural } = useStudioText();
  const [expanded, setExpanded] = useState(running);
  useEffect(() => {
    if (running) setExpanded(true);
  }, [running]);
  const toolSteps = items.filter((item): item is ToolStep => item.kind === "tool");
  const failures = toolSteps.filter((step) => step.status === "error").length;
  if (!items.length) return null;
  const status = running ? t("message.working") : durationMs ? t("message.workedFor", { duration: formatDuration(durationMs) }) : t("message.worked");
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="group flex items-center gap-2 text-xs text-[#8c96a8] hover:text-[#e5e9ef]"
      >
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#f5c400]" /> : expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-medium">
          {status} · {plural("message.toolCalls", toolSteps.length)}
          {failures ? ` · ${t("message.failed", { count: failures })}` : ""}
        </span>
      </button>
      {expanded ? (
        <div className="relative mt-2 space-y-1.5 border-l border-[#252a33] pl-4">
          {items.map((item, index) =>
            item.kind === "note" ? (
              <p key={`note-${index}`} className="text-xs italic leading-5 text-[#8c96a8]">{item.text}</p>
            ) : (
              <StepRow key={item.id || index} step={item} tool={toolsByName.get(item.tool)} />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

const CHIP_KEYS = { cluster: "chip.cluster", execution: "chip.execution", dataset: "chip.dataset" } as const;

export function ContextChipView({ chip, onRemove }: { chip: ContextChip; onRemove?: () => void }) {
  const { t } = useStudioText();
  const tone = chip.type === "cluster" ? "text-sky-300 border-sky-400/30 bg-sky-400/10" : chip.type === "execution" ? "text-[#f5d766] border-[#f5c400]/30 bg-[#f5c400]/10" : "text-emerald-300 border-emerald-400/30 bg-emerald-400/10";
  return (
    <span className={cn("inline-flex max-w-[260px] items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]", tone)}>
      <span className="font-semibold uppercase tracking-wide opacity-70">{t(CHIP_KEYS[chip.type])}</span>
      <span className="truncate">{chip.label}</span>
      {onRemove ? (
        <button type="button" onClick={onRemove} className="ml-0.5 opacity-70 hover:opacity-100" aria-label={t("chip.remove", { label: chip.label })}>
          ×
        </button>
      ) : null}
    </span>
  );
}

export function AgentMarkdown({ content }: { content: string }) {
  return (
    <div className="agent-markdown text-sm leading-7 text-[#e5e9ef]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node: _node, ...props }) => <h1 className="mb-3 mt-5 text-lg font-semibold text-white first:mt-0" {...props} />,
          h2: ({ node: _node, ...props }) => <h2 className="mb-2 mt-5 text-base font-semibold text-white first:mt-0" {...props} />,
          h3: ({ node: _node, ...props }) => <h3 className="mb-2 mt-4 text-sm font-semibold text-white first:mt-0" {...props} />,
          p: ({ node: _node, ...props }) => <p className="mb-3 last:mb-0" {...props} />,
          strong: ({ node: _node, ...props }) => <strong className="font-semibold text-white" {...props} />,
          ul: ({ node: _node, ...props }) => <ul className="mb-3 list-disc space-y-1 pl-5 marker:text-[#687386]" {...props} />,
          ol: ({ node: _node, ...props }) => <ol className="mb-3 list-decimal space-y-1 pl-5 marker:text-[#687386]" {...props} />,
          blockquote: ({ node: _node, ...props }) => <blockquote className="mb-3 border-l-2 border-[#f5c400]/60 pl-3 text-[#c2cad5]" {...props} />,
          pre: ({ node: _node, ...props }) => <pre className="mb-3 overflow-x-auto rounded-md border border-[#252a33] bg-[#06090d] p-3 text-xs" {...props} />,
          code: ({ node: _node, ...props }) => <code className="rounded bg-[#151c26] px-1 py-0.5 font-mono text-[12px] text-[#f5d766]" {...props} />,
          table: ({ node: _node, ...props }) => (
            <div className="mb-3 overflow-x-auto rounded-md border border-[#252a33]">
              <table className="w-full border-collapse text-xs" {...props} />
            </div>
          ),
          thead: ({ node: _node, ...props }) => <thead className="bg-[#111820] text-[#aeb8c7]" {...props} />,
          th: ({ node: _node, ...props }) => <th className="border-b border-[#252a33] px-3 py-2 text-left font-semibold" {...props} />,
          td: ({ node: _node, ...props }) => <td className="border-b border-[#1c222b] px-3 py-2 align-top" {...props} />,
          a: ({ node: _node, ...props }) => <a className="text-[#f5c400] underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />,
          hr: () => <hr className="my-4 border-[#252a33]" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function downloadMarkdown(content: string, name: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "agent"}-answer.md`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function AgentMessage({
  message,
  agentName,
  agentIcon,
  agentColor,
  toolsByName,
}: {
  message: ChatMessage;
  agentName: string;
  agentIcon?: string;
  agentColor?: string;
  toolsByName: Map<string, ToolInfo>;
}) {
  const { t } = useStudioText();
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] space-y-2">
          {message.context?.length ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              {message.context.map((chip) => <ContextChipView key={`${chip.type}-${chip.id}`} chip={chip} />)}
            </div>
          ) : null}
          <div className="whitespace-pre-wrap rounded-2xl rounded-tr-sm border border-[#303845] bg-[#151c26] px-4 py-2.5 text-sm leading-6 text-[#f2f4f7]">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  const running = message.status === "running";
  const accent = agentAccent(agentColor);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; nothing to do.
    }
  };

  return (
    <div className="flex gap-3">
      <AgentAvatar icon={agentIcon} color={agentColor} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-xs font-semibold" style={{ color: accent }}>{agentName}</p>
        <Timeline items={message.timeline || []} running={running} toolsByName={toolsByName} durationMs={message.duration_ms} />
        {message.content ? (
          <div className="relative">
            <AgentMarkdown content={message.content} />
            {running ? <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm align-middle" style={{ backgroundColor: accent }} /> : null}
          </div>
        ) : running && !(message.timeline || []).length ? (
          <div className="flex items-center gap-2 text-sm text-[#8c96a8]">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: accent }} />
            {t("message.planning")}
          </div>
        ) : null}
        {message.status === "error" ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {message.error || t("chat.runFailed")}
          </div>
        ) : null}
        {message.status === "stopped" ? (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#303845] px-2 py-1 text-[11px] text-[#8c96a8]">
            <OctagonX className="h-3 w-3" /> {t("message.stopped")}
          </div>
        ) : null}
        {message.status === "complete" && message.content ? (
          <div className="mt-2 flex items-center gap-1">
            <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[#687386] hover:bg-white/5 hover:text-[#e5e9ef]">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? t("message.copied") : t("message.copy")}
            </button>
            <button type="button" onClick={() => downloadMarkdown(message.content, agentName)} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[#687386] hover:bg-white/5 hover:text-[#e5e9ef]">
              <Download className="h-3 w-3" /> {t("message.markdown")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
