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
  "technical-lineage-agent",
  "content-lineage",
  "release-notes",
  "regulations",
  "regulation-matcher",
  "root-cause",
  "rootcause-ai-agents",
] as const;

export const TAB_LABELS: Record<string, string> = {
  code: "Code",
  "data-modal": "Data",
  "technical-lineage": "Technical Lineage",
  "technical-lineage-agent": "Technical Lineage AI Agent",
  data: "Results",
  clustering: "Cluster",
  "content-lineage": "Content Lineage",
  "compare-clusters": "Compare",
  "root-cause": "Root Cause",
  "rootcause-ai-agents": "Rootcause AI Agents",
  "semantic-lineage": "Semantic Lineage",
  regulations: "Regulation",
  "regulation-matcher": "Regulation–Release Note Matcher",
  "release-notes": "Release Notes",
  "create-ai-agents": "Create AI Agents",
};

export function getTabLabel(id: string): string {
  return TAB_LABELS[id] ?? id;
}

/** Map tab id (kebab-case) to next-intl message key (camelCase) for tabs namespace */
export const TAB_ID_TO_MESSAGE_KEY: Record<string, string> = {
  code: "code",
  "data-modal": "dataModal",
  "technical-lineage": "technicalLineage",
  "technical-lineage-agent": "technicalLineageAgent",
  data: "data",
  clustering: "clustering",
  "content-lineage": "contentLineage",
  "compare-clusters": "compareClusters",
  "root-cause": "rootCause",
  "semantic-lineage": "semanticLineage",
  regulations: "regulations",
  "regulation-matcher": "regulationMatcher",
  "release-notes": "releaseNotes",
};
