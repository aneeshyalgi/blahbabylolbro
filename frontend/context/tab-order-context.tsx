"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_TAB_ORDER } from "@/lib/tabs";

const STORAGE_KEY = "dataflow_tab_order";

// Previous default orders, kept so an untouched (non-customized) stored order can be
// migrated forward when DEFAULT_TAB_ORDER changes, without discarding real user customization.
const PREVIOUS_DEFAULT_TAB_ORDERS = [
  [
    "code",
    "data-modal",
    "technical-lineage",
    "data",
    "clustering",
    "content-lineage",
    "compare-clusters",
    "semantic-lineage",
    "regulations",
    "release-notes",
  ],
  [
    "data-modal",
    "code",
    "clustering",
    "data",
    "compare-clusters",
    "technical-lineage",
    "content-lineage",
    "release-notes",
    "regulations",
    "root-cause",
    "rootcause-ai-agents",
  ],
];

type TabOrderContextValue = {
  tabOrder: string[];
  setTabOrder: (order: string[]) => void;
};

const TabOrderContext = createContext<TabOrderContextValue | null>(null);

function loadTabOrder(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_TAB_ORDER];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_TAB_ORDER];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_TAB_ORDER];
    if (
      PREVIOUS_DEFAULT_TAB_ORDERS.some(
        (previous) => parsed.length === previous.length && parsed.every((id, index) => id === previous[index]),
      )
    ) {
      return [...DEFAULT_TAB_ORDER];
    }
    const validIds = new Set<string>(DEFAULT_TAB_ORDER);
    const filtered = (parsed as string[]).filter((id) => validIds.has(id));
    // New tabs join a customized order next to the tab they follow by default.
    const order = [...filtered];
    for (const id of DEFAULT_TAB_ORDER) {
      if (order.includes(id)) continue;
      const before = DEFAULT_TAB_ORDER[DEFAULT_TAB_ORDER.indexOf(id) - 1];
      const at = before ? order.indexOf(before) : -1;
      order.splice(at >= 0 ? at + 1 : order.length, 0, id);
    }
    return order;
  } catch {
    return [...DEFAULT_TAB_ORDER];
  }
}

export function TabOrderProvider({ children }: { children: React.ReactNode }) {
  const [tabOrder, setTabOrderState] = useState<string[]>([]);

  useEffect(() => {
    setTabOrderState(loadTabOrder());
  }, []);

  const setTabOrder = useCallback((order: string[]) => {
    const visibleOrder = order.filter((id) => DEFAULT_TAB_ORDER.includes(id as typeof DEFAULT_TAB_ORDER[number]));
    setTabOrderState(visibleOrder);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleOrder));
    }
  }, []);

  const value: TabOrderContextValue = { tabOrder, setTabOrder };

  return (
    <TabOrderContext.Provider value={value}>
      {children}
    </TabOrderContext.Provider>
  );
}

export function useTabOrder(): TabOrderContextValue {
  const ctx = useContext(TabOrderContext);
  if (!ctx) {
    throw new Error("useTabOrder must be used within TabOrderProvider");
  }
  return ctx;
}
