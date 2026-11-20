"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Database } from "lucide-react";
import { DatasetsSection, type DatasetSummary } from "@/components/datasets-section";
import { InputDataSection } from "@/components/input-data-section";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/workspace/ui";

const STORAGE_KEY = "dataflow_data_modal_dataset_id";

interface DataModalTabContentProps {
  isLoading?: boolean;
}

/** The Data tab: the uploaded Excel datasets and the input tables detected in the selected one. */
export function DataModalTabContent({ isLoading = false }: DataModalTabContentProps) {
  const t = useTranslations("dataTab");
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<DatasetSummary[] | null>(null);
  const [dirty, setDirty] = useState(false);
  // A dataset picked while the open table has unsaved edits waits for "Discard" (undefined: nothing waiting).
  const [pending, setPending] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSelectedDatasetId(saved);
    } catch {
      // Storage unavailable: nothing remembered.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (selectedDatasetId) localStorage.setItem(STORAGE_KEY, selectedDatasetId);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable: the selection lasts for this visit.
    }
  }, [selectedDatasetId]);

  // A remembered dataset that was deleted since is no longer selected.
  useEffect(() => {
    if (datasets && selectedDatasetId && !datasets.some((dataset) => dataset.id === selectedDatasetId)) setSelectedDatasetId(null);
  }, [datasets, selectedDatasetId]);

  const select = (id: string | null) => {
    if (id === selectedDatasetId) return;
    if (dirty) {
      setPending(id);
      return;
    }
    setSelectedDatasetId(id);
  };

  const selected = datasets?.find((dataset) => dataset.id === selectedDatasetId) ?? null;
  // The dataset whose unsaved edits "Discard" would drop.
  const openName = selected?.user_name || selected?.filename || "";

  return (
    // Bottom room so the last panel can scroll clear of the app's floating assistant button.
    <div className="space-y-5 pb-16">
      <PageHeader icon={Database} title={t("title")} description={t("description")} />
      <DatasetsSection
        isLoading={isLoading}
        selectedDatasetId={selectedDatasetId}
        onDatasetSelect={select}
        onDatasetDeleted={(id) => {
          if (id !== selectedDatasetId) return;
          setDirty(false);
          setSelectedDatasetId(null);
        }}
        onDatasetsChange={setDatasets}
      />
      <InputDataSection isLoading={isLoading} datasetId={selectedDatasetId} dataset={selected} onDirtyChange={setDirty} />

      <AlertDialog open={pending !== undefined} onOpenChange={(open) => { if (!open) setPending(undefined); }}>
        <AlertDialogContent className="border-[#252a33] bg-[#0b0f15]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{t("discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-[#aab3c2]">{t("discardBody", { name: openName })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keepEditing")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              onClick={() => {
                setDirty(false);
                setSelectedDatasetId(pending ?? null);
                setPending(undefined);
              }}
            >
              {t("discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
