"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const BASE_CLUSTER_STORAGE_KEY = "dataflow_base_cluster_id";
const COMPARISON_CLUSTER_STORAGE_KEY = "dataflow_comparison_cluster_id";

type ClusterSelectionContextValue = {
  baseClusterId: string;
  comparisonClusterId: string;
  setBaseClusterId: (clusterId: string) => void;
  setComparisonClusterId: (clusterId: string) => void;
};

const ClusterSelectionContext = createContext<ClusterSelectionContextValue | null>(null);

function readStoredValue(key: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(key) ?? "";
}

export function ClusterSelectionProvider({ children }: { children: React.ReactNode }) {
  const [baseClusterId, setBaseClusterIdState] = useState("");
  const [comparisonClusterId, setComparisonClusterIdState] = useState("");

  useEffect(() => {
    setBaseClusterIdState(readStoredValue(BASE_CLUSTER_STORAGE_KEY));
    setComparisonClusterIdState(readStoredValue(COMPARISON_CLUSTER_STORAGE_KEY));
  }, []);

  const setBaseClusterId = (clusterId: string) => {
    setBaseClusterIdState(clusterId);
    if (typeof window !== "undefined") {
      if (clusterId) localStorage.setItem(BASE_CLUSTER_STORAGE_KEY, clusterId);
      else localStorage.removeItem(BASE_CLUSTER_STORAGE_KEY);
    }
  };

  const setComparisonClusterId = (clusterId: string) => {
    setComparisonClusterIdState(clusterId);
    if (typeof window !== "undefined") {
      if (clusterId) localStorage.setItem(COMPARISON_CLUSTER_STORAGE_KEY, clusterId);
      else localStorage.removeItem(COMPARISON_CLUSTER_STORAGE_KEY);
    }
  };

  const value = useMemo(
    () => ({
      baseClusterId,
      comparisonClusterId,
      setBaseClusterId,
      setComparisonClusterId,
    }),
    [baseClusterId, comparisonClusterId]
  );

  return <ClusterSelectionContext.Provider value={value}>{children}</ClusterSelectionContext.Provider>;
}

export function useClusterSelection(): ClusterSelectionContextValue {
  const ctx = useContext(ClusterSelectionContext);
  if (!ctx) {
    throw new Error("useClusterSelection must be used within ClusterSelectionProvider");
  }
  return ctx;
}
