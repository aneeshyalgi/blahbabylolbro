"use client";

import Image from "next/image";
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

export function TabNavigation({ activeTab, onTabChange, isNavigationLocked = false, isRootCausePremium = false }: TabNavigationProps) {
  const t = useTranslations("tabs");
  const { tabOrder } = useTabOrder();
  const order = tabOrder.length > 0 ? tabOrder : [...DEFAULT_TAB_ORDER];

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

  const getNavIcon = (id: string) => {
    const iconClassName = "h-4 w-4";

    switch (id) {
      case "code":
        return <Code2 className={iconClassName} />;
      case "data-modal":
        return <Database className={iconClassName} />;
      case "data":
        return <TableProperties className={iconClassName} />;
      case "technical-lineage":
        return <GitBranch className={iconClassName} />;
      case "clustering":
        return <Rows3 className={iconClassName} />;
      case "content-lineage":
        return <Network className={iconClassName} />;
      case "compare-clusters":
        return <GitCompare className={iconClassName} />;
      case "root-cause":
        return <AlertTriangle className={iconClassName} />;
      case "rootcause-ai-agents":
        return <Bot className={iconClassName} />;
      case "semantic-lineage":
        return <Network className={iconClassName} />;
      case "regulations":
        return <Shield className={iconClassName} />;
      case "release-notes":
        return <FileText className={iconClassName} />;
      default:
        return <Code2 className={iconClassName} />;
    }
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen w-72 shrink-0 flex-col transition-all duration-200",
        isRootCausePremium
          ? "border-r border-[#f5c400]/20 bg-[radial-gradient(circle_at_top_left,_rgba(245,196,0,0.16),_transparent_30%),linear-gradient(180deg,#070b12_0%,#0b121a_100%)] shadow-[8px_0_28px_rgba(0,0,0,0.24)]"
          : "border-r border-[#252a33] bg-[#080b10]"
      )}
    >
      <div className={cn("flex items-center px-4 py-5", isRootCausePremium ? "border-b border-[#f5c400]/20" : "border-b border-[#252a33]")}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md p-0">
            <Image
              src="/EY_logo.png"
              alt="EY Logo"
              fill
              className="object-contain"
              priority
            />
          </div> */}
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f5c400]">RegData</p>
            <p className="truncate text-xs text-[#8c96a8]">Xplainer</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Primary navigation">
        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#687386]">Workspace</p>
        <div className="space-y-1">
          {order.map((id) => {
            const label = getLabel(id);
            const isActive = activeTab === id;
            const isPremiumAgentActive = isActive && id === "rootcause-ai-agents";

            const isDisabled = isNavigationLocked;

            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (!isDisabled) onTabChange(id);
                }}
                title={label}
                disabled={isDisabled}
                className={cn(
                  "relative flex w-full items-center gap-3 rounded-sm border border-transparent px-3 py-2.5 text-left text-sm font-medium transition-colors justify-start",
                  isDisabled && "cursor-not-allowed opacity-40",
                  isPremiumAgentActive && !isDisabled
                    ? "border-[#f5c400]/50 bg-[linear-gradient(135deg,rgba(245,196,0,0.25)_0%,rgba(245,196,0,0.10)_46%,rgba(245,196,0,0.04)_100%)] text-white shadow-[inset_0_0_0_1px_rgba(245,196,0,0.14),0_10px_24px_rgba(0,0,0,0.16)] before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:bg-[#f5c400]"
                    : isActive && !isDisabled
                    ? "border-[#f5c400]/15 bg-[#f5c400]/10 text-white before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:bg-[#f5c400]"
                    : !isDisabled
                      ? "bg-transparent text-[#8c96a8] hover:border-[#252a33] hover:bg-[#11161e] hover:text-[#f2f4f7]"
                      : "bg-transparent text-[#687386]"
                )}
                aria-current={isActive ? "page" : undefined}
                aria-label={label}
              >
                <span
                  className={cn(
                    "flex h-7 min-w-7 items-center justify-center rounded-sm border",
                    isPremiumAgentActive
                      ? "border-[#f5c400]/45 bg-[#f5c400]/18 text-[#f8d64a] shadow-[0_0_18px_rgba(245,196,0,0.20)]"
                      : isActive
                      ? "border-[#f5c400]/30 bg-[#f5c400]/10 text-[#f5c400]"
                      : "border-[#252a33] bg-[#11161e] text-[#768196]"
                  )}
                >
                  {getNavIcon(id)}
                </span>
                <span className="truncate">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}