"use client";

import { useState, useEffect } from "react";
import { DatasetsSection } from "@/components/datasets-section";
import { InputDataSection } from "@/components/input-data-section";

const STORAGE_KEY = "dataflow_data_modal_dataset_id";

interface DataModalTabContentProps {
  isLoading?: boolean;
}

export function DataModalTabContent({ isLoading = false }: DataModalTabContentProps) {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setSelectedDatasetId(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedDatasetId) localStorage.setItem(STORAGE_KEY, selectedDatasetId);
    else localStorage.removeItem(STORAGE_KEY);
  }, [selectedDatasetId]);

  return (
    <div className="space-y-6">
      <DatasetsSection
        isLoading={isLoading}
        onDatasetSelect={setSelectedDatasetId}
        selectedDatasetId={selectedDatasetId}
      />
      <InputDataSection
        isLoading={isLoading}
        datasetId={selectedDatasetId}
      />
    </div>
  );
}
