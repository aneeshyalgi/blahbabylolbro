"use client";

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

  return (
    <nav className="border-b border-border bg-card px-4 sm:px-6">
      <div className="flex flex-nowrap gap-1 overflow-x-auto overflow-y-hidden py-px pr-2 sm:pr-0 [-webkit-overflow-scrolling:touch]">
        {order.map((id) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={cn(
              "whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors",
              "border-b-2 -mb-px",
              activeTab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {getLabel(id)}
          </button>
        ))}
      </div>
    </nav>
  );
}