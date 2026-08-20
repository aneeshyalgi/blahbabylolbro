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
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
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
      className="fixed left-0 top-0 flex h-screen w-72 shrink-0 flex-col border-r border-border bg-card transition-all duration-200 z-40"
    >
      <div className="flex items-center border-b border-border px-3 py-4">
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md p-0">
            <Image
              src="/EY_logo.png"
              alt="EY Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Primary navigation">
        <div className="space-y-1.5">
          {order.map((id) => {
            const label = getLabel(id);
            const isActive = activeTab === id;

            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                title={label}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border px-2.5 py-2.5 text-left text-sm font-medium transition-colors justify-start",
                  isActive
                    ? "border-[#FFD700]/50 bg-[#FFD700]/20 text-foreground shadow-md"
                    : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
                aria-label={label}
              >
                <span
                  className={cn(
                    "flex h-7 min-w-7 items-center justify-center rounded-md border",
                    isActive
                      ? "border-[#FFD700]/60 bg-[#FFD700]/30 text-[#FFD700]"
                      : "border-border bg-muted text-muted-foreground"
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