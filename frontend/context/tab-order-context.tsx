"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_TAB_ORDER } from "@/lib/tabs";

const STORAGE_KEY = "dataflow_tab_order";

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
    const validIds = new Set(DEFAULT_TAB_ORDER);
    const filtered = (parsed as string[]).filter((id) => validIds.has(id));
    const missing = DEFAULT_TAB_ORDER.filter((id) => !filtered.includes(id));
    return [...filtered, ...missing];
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
    setTabOrderState(order);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
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
