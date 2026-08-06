"use client";

import { useState } from "react";
import { ListOrdered, GitMerge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentLineageRowLevelSection } from "@/components/content-lineage-row-level-section";
import { ContentLineage2Section } from "@/components/content-lineage-2-section";

export type ContentLineageResultData = {
  data?: unknown[];
  summary?: { columns?: string[]; computed_by_column?: Record<string, number> };
  computed_cells?: { row: number; column: string; value?: unknown }[];
  code_id?: string;
  execution_id?: string;
} | null;

interface ContentLineageTabsSectionProps {
  datasetId?: string | null;
  resultData?: ContentLineageResultData;
  isLoading?: boolean;
}

type ContentTab = "flow" | "rowlevel";

export function ContentLineageTabsSection({
  datasetId,
  resultData,
  isLoading = false,
}: ContentLineageTabsSectionProps) {
  const [contentTab, setContentTab] = useState<ContentTab>("flow");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Content Lineage
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Flow view (how rows and cells connect) and row-level lineage (input → output per cell). Run code above, then generate.
        </p>
        <div className="flex gap-2 border-b border-border pt-2 pb-0">
          <button
            type="button"
            onClick={() => setContentTab("flow")}
            className={`inline-flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              contentTab === "flow"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <GitMerge className="h-4 w-4" />
            Content Lineage
          </button>
          <button
            type="button"
            onClick={() => setContentTab("rowlevel")}
            className={`inline-flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              contentTab === "rowlevel"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ListOrdered className="h-4 w-4" />
            Content Lineage 2.0
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Render both always so generated data persists when switching tabs; hide inactive. */}
        <div className={contentTab === "flow" ? "block" : "hidden"}>
          <ContentLineage2Section
            datasetId={datasetId}
            resultData={resultData}
            isLoading={isLoading}
            embedded
            displayName="Content Lineage"
          />
        </div>
        <div className={contentTab === "rowlevel" ? "block" : "hidden"}>
          <ContentLineageRowLevelSection
            datasetId={datasetId}
            resultData={resultData}
            isLoading={isLoading}
            embedded
            displayName="Content Lineage 2.0"
          />
        </div>
      </CardContent>
    </Card>
  );
}
