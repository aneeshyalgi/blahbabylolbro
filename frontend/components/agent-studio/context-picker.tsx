"use client";

import { useMemo, useState } from "react";
import { Database, Layers, Loader2, Paperclip, PlayCircle, Wand2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useClusterSelection } from "@/context/cluster-selection-context";
import { cn } from "@/lib/utils";
import { useStudioText } from "./i18n";
import type { ContextChip, ContextOptions } from "./types";

type Tab = "executions" | "clusters" | "datasets";

export function ContextPicker({
  options,
  loading,
  selected,
  onOpen,
  onChange,
  disabled,
}: {
  options: ContextOptions | null;
  loading: boolean;
  selected: ContextChip[];
  onOpen: () => void;
  onChange: (chips: ContextChip[]) => void;
  disabled?: boolean;
}) {
  const { t, formatDateTime } = useStudioText();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("executions");
  const { baseClusterId, comparisonClusterId } = useClusterSelection();
  const selectedKeys = useMemo(() => new Set(selected.map((chip) => `${chip.type}:${chip.id}`)), [selected]);

  const toggle = (chip: ContextChip) => {
    const key = `${chip.type}:${chip.id}`;
    onChange(selectedKeys.has(key) ? selected.filter((item) => `${item.type}:${item.id}` !== key) : [...selected, chip]);
  };

  const globalPair = useMemo(() => {
    if (!options || !baseClusterId || !comparisonClusterId) return null;
    const base = options.clusters.find((cluster) => cluster.id === baseClusterId);
    const compare = options.clusters.find((cluster) => cluster.id === comparisonClusterId);
    const runA = base?.executions[0];
    const runB = compare?.executions[0];
    if (!base || !compare || !runA || !runB) return null;
    return [
      { type: "execution" as const, id: runA.execution_id, label: `${base.name} · ${formatDateTime(runA.executed_date)}` },
      { type: "execution" as const, id: runB.execution_id, label: `${compare.name} · ${formatDateTime(runB.executed_date)}` },
    ];
  }, [options, baseClusterId, comparisonClusterId, formatDateTime]);

  const executionCount = selected.filter((chip) => chip.type === "execution").length;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onOpen();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#303845] px-2.5 py-1.5 text-xs text-[#aeb8c7] transition-colors hover:border-[#f5c400]/50 hover:text-white disabled:opacity-50"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {t("context.pin")}
          {selected.length ? <span className="rounded-full bg-[#f5c400] px-1.5 text-[10px] font-bold text-black">{selected.length}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[420px] border-[#303845] bg-[#0d131b] p-0 text-[#e5e9ef]">
        <div className="border-b border-[#252a33] p-3">
          <p className="text-sm font-semibold">{t("context.title")}</p>
          <p className="mt-0.5 text-xs text-[#8c96a8]">{t("context.desc")}</p>
          {globalPair ? (
            <button
              type="button"
              onClick={() => onChange([...selected.filter((chip) => chip.type !== "execution"), ...globalPair])}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-[#f5c400]/40 bg-[#f5c400]/10 px-2.5 py-1.5 text-xs font-medium text-[#f5d766] hover:bg-[#f5c400]/20"
            >
              <Wand2 className="h-3.5 w-3.5" />
              {t("context.useGlobal")}
            </button>
          ) : null}
        </div>
        <div className="flex gap-1 border-b border-[#252a33] px-2 pt-2">
          {([
            ["executions", t("context.executions"), PlayCircle],
            ["clusters", t("context.clusters"), Layers],
            ["datasets", t("context.datasets"), Database],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium",
                tab === value ? "border-[#f5c400] text-white" : "border-transparent text-[#8c96a8] hover:text-white",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {loading && !options ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-[#8c96a8]">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("context.loading")}
            </div>
          ) : !options ? (
            <p className="py-8 text-center text-xs text-[#8c96a8]">{t("context.loadFailed")}</p>
          ) : tab === "executions" ? (
            options.clusters.some((cluster) => cluster.executions.length) ? (
              options.clusters.filter((cluster) => cluster.executions.length).map((cluster) => (
                <div key={cluster.id} className="mb-2">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{cluster.name}</p>
                  {cluster.executions.map((execution) => {
                    const chip: ContextChip = { type: "execution", id: execution.execution_id, label: `${cluster.name} · ${formatDateTime(execution.executed_date)}` };
                    const checked = selectedKeys.has(`execution:${execution.execution_id}`);
                    const order = selected.filter((item) => item.type === "execution").findIndex((item) => item.id === execution.execution_id);
                    return (
                      <button
                        key={execution.execution_id}
                        type="button"
                        onClick={() => toggle(chip)}
                        className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/5", checked && "bg-[#f5c400]/10")}
                      >
                        <span className={cn("flex h-4 w-4 items-center justify-center rounded border text-[9px] font-bold", checked ? "border-[#f5c400] bg-[#f5c400] text-black" : "border-[#3a4553]")}>
                          {checked && executionCount === 2 ? (order === 0 ? "A" : "B") : checked ? "✓" : ""}
                        </span>
                        <span className="flex-1">{formatDateTime(execution.executed_date)}</span>
                        <span className="text-[#687386]">{t("context.values", { count: execution.values_computed ?? 0 })}</span>
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-xs text-[#8c96a8]">{t("context.noExecutions")}</p>
            )
          ) : tab === "clusters" ? (
            options.clusters.length ? (
              options.clusters.map((cluster) => {
                const checked = selectedKeys.has(`cluster:${cluster.id}`);
                return (
                  <button
                    key={cluster.id}
                    type="button"
                    onClick={() => toggle({ type: "cluster", id: cluster.id, label: cluster.name })}
                    className={cn("flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/5", checked && "bg-sky-400/10")}
                  >
                    <span className={cn("mt-0.5 flex h-4 w-4 items-center justify-center rounded border text-[9px]", checked ? "border-sky-400 bg-sky-400 text-black" : "border-[#3a4553]")}>{checked ? "✓" : ""}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-[#e5e9ef]">
                        {cluster.name}
                        {cluster.is_reference ? <span className="ml-1.5 text-[10px] text-sky-300">{t("context.reference")}</span> : null}
                      </span>
                      <span className="block truncate text-[#687386]">{[cluster.dataset_name, cluster.code_filename].filter(Boolean).join(" · ")}</span>
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="py-8 text-center text-xs text-[#8c96a8]">{t("context.noClusters")}</p>
            )
          ) : options.datasets.length ? (
            options.datasets.map((dataset) => {
              const checked = selectedKeys.has(`dataset:${dataset.id}`);
              return (
                <button
                  key={dataset.id}
                  type="button"
                  onClick={() => toggle({ type: "dataset", id: dataset.id, label: dataset.name })}
                  className={cn("flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/5", checked && "bg-emerald-400/10")}
                >
                  <span className={cn("mt-0.5 flex h-4 w-4 items-center justify-center rounded border text-[9px]", checked ? "border-emerald-400 bg-emerald-400 text-black" : "border-[#3a4553]")}>{checked ? "✓" : ""}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-[#e5e9ef]">{dataset.name}</span>
                    <span className="block truncate text-[#687386]">{[dataset.filename, dataset.version].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="py-8 text-center text-xs text-[#8c96a8]">{t("context.noDatasets")}</p>
          )}
        </div>
        {selected.length ? (
          <div className="flex items-center justify-between border-t border-[#252a33] px-3 py-2 text-xs">
            <span className="text-[#8c96a8]">{t("context.pinned", { count: selected.length })}</span>
            <button type="button" onClick={() => onChange([])} className="text-[#8c96a8] hover:text-white">{t("context.clearAll")}</button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
