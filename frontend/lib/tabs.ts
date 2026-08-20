/**
 * Default tab order and labels. Used by TabNavigation and ReorderTabsDialog.
 */
export const DEFAULT_TAB_ORDER = [
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
] as const;

export const TAB_LABELS: Record<string, string> = {
  code: "Code",
  "data-modal": "Data",
  "technical-lineage": "Technical Lineage",
  data: "Results",
  clustering: "Cluster",
  "content-lineage": "Content Lineage",
  "compare-clusters": "Compare",
  "root-cause": "Root Cause",
  "semantic-lineage": "Semantic Lineage",
  regulations: "Regulation",
  "release-notes": "Release Notes",
};

export function getTabLabel(id: string): string {
  return TAB_LABELS[id] ?? id;
}

/** Map tab id (kebab-case) to next-intl message key (camelCase) for tabs namespace */
export const TAB_ID_TO_MESSAGE_KEY: Record<string, string> = {
  code: "code",
  "data-modal": "dataModal",
  "technical-lineage": "technicalLineage",
  data: "data",
  clustering: "clustering",
  "content-lineage": "contentLineage",
  "compare-clusters": "compareClusters",
  "root-cause": "rootCause",
  "semantic-lineage": "semanticLineage",
  regulations: "regulations",
  "release-notes": "releaseNotes",
};
