"use client";

import { useState, useEffect } from "react";
import { AppHeader } from "@/components/app-header";
import { TabNavigation } from "@/components/tab-navigation";
import { DataTabContent } from "@/components/data-tab-content";
import { DataModalTabContent } from "@/components/data-modal-tab-content";
import { CodeTabContent } from "@/components/code-tab-content";
import { ClusteringTabContent } from "@/components/clustering-tab-content";
import { CompareClustersTabContent } from "@/components/compare-clusters-tab-content";
import { RootCauseTabContent } from "@/components/root-cause-tab-content";
import { LineageTabContent } from "@/components/lineage-tab-content";
import { RegulationsTabContent } from "@/components/regulations-tab-content";
import { PatchNotesTabContent } from "@/components/release-notes-tab-content";
import { PlaceholderTab } from "@/components/placeholder-tab";
import { DataAssistant } from "@/components/data-assistant";

const TAB_STORAGE_KEY = "dataflow_active_tab";
const VALID_TAB_IDS = new Set([
  "code", "data-modal", "data", "clustering",
  "content-lineage", "technical-lineage", "semantic-lineage",
  "compare-clusters", "regulations", "release-notes",
  "root-cause",
]);

const tabLabels: Record<string, string> = {
  context: "Context",
  data: "Results",
  code: "Code",
  clustering: "Clustering",
  "compare-clusters": "Compare",
  "root-cause": "RootCause",
  regulations: "Regulations",
  "data-model": "Data Model",
  "data-modal": "Data Model",
  "content-lineage": "Content Lineage",
  "technical-lineage": "Technical Lineage",
  "semantic-lineage": "Semantic Lineage",
  validation: "Validation",
  regression: "Regression",
  "release-notes": "Release Notes",
  testing: "Testing",
  forecast: "Forecast",
};

export default function HomePage() {
  const [activeTab, setActiveTab] = useState("code");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(TAB_STORAGE_KEY) : null;
    if (!saved) return;
    const tab = saved === "lineage" ? "content-lineage" : saved;
    if (VALID_TAB_IDS.has(tab)) setActiveTab(tab);
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") localStorage.setItem(TAB_STORAGE_KEY, tab);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "data":
        return <DataTabContent />;
      case "code":
        return <CodeTabContent />;
      case "data-modal":
        return <DataModalTabContent />;
      case "clustering":
        return <ClusteringTabContent />;
      case "compare-clusters":
        return <CompareClustersTabContent />;
      case "root-cause":
        return <RootCauseTabContent />;
      case "content-lineage":
        return <LineageTabContent variant="content" />;
      case "technical-lineage":
        return <LineageTabContent variant="technical" />;
      case "semantic-lineage":
        return <LineageTabContent variant="semantic" />;
      case "regulations":
        return <RegulationsTabContent />;
      case "release-notes":
        return <PatchNotesTabContent />;
      default:
        return <PlaceholderTab tabName={tabLabels[activeTab] || activeTab} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="flex min-w-0 flex-1 flex-col ml-72">
        <AppHeader title={tabLabels[activeTab] || activeTab} />
        <main className="flex-1 overflow-auto bg-[#0d1117] p-5 sm:p-6">
          <div className="mx-auto max-w-[1600px] min-w-[1000px]">{renderTabContent()}</div>
        </main>
      </div>

      <DataAssistant />
    </div>
  );
}
