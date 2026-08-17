/**
 * Default tab order and labels. Used by TabNavigation and ReorderTabsDialog.
 */
export const DEFAULT_TAB_ORDER = [
  "code",
  "data-modal",
  "data",
  "technical-lineage",
  "clustering",
  "content-lineage",
  "compare-clusters",
  "root-cause",
  "semantic-lineage",
  "regulations",
  "release-notes",
] as const;

export const TAB_LABELS: Record<string, string> = {
  code: "Code",
  "data-modal": "Data Model",
  "technical-lineage": "Technical Lineage",
  data: "Results",
  clustering: "Clusters",
  "content-lineage": "Content Lineage",
  "compare-clusters": "Compare",
  "root-cause": "RootCause",
  "semantic-lineage": "Semantic Lineage",
  regulations: "Regulations",
  "release-notes": "Release notes",
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
