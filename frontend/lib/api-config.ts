/**
 * API Configuration for DataFlow Platform
 *
 * Browser requests go through the Next.js frontend so the frontend domain keeps
 * the signed session cookie and proxies the request to the backend.
 */

export const API_BASE_URL = typeof window === 'undefined'
  ? process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  : '/backend';

export const API_ENDPOINTS = {
  // Datasets
  datasets: `${API_BASE_URL}/api/datasets`,
  datasetsUpload: `${API_BASE_URL}/api/datasets/upload`,
  datasetById: (id: string) => `${API_BASE_URL}/api/datasets/${id}`,
  datasetTableData: (datasetId: string, tableId: string) =>
    `${API_BASE_URL}/api/datasets/${datasetId}/tables/${tableId}/data`,
  datasetDelete: (id: string) => `${API_BASE_URL}/api/datasets/${id}`,
  datasetMappings: (id: string) => `${API_BASE_URL}/api/datasets/${id}/mappings`,
  datasetSheets: (id: string) => `${API_BASE_URL}/api/datasets/${id}/sheets`,
  datasetSheet: (id: string, sheetIndex: number) =>
    `${API_BASE_URL}/api/datasets/${id}/sheets/${sheetIndex}`,
  
  // Code
  code: `${API_BASE_URL}/api/code`,
  codeUpload: `${API_BASE_URL}/api/code/upload`,
  codeById: (id: string) => `${API_BASE_URL}/api/code/${id}`,
  codeDelete: (id: string) => `${API_BASE_URL}/api/code/${id}`,
  generateCode: `${API_BASE_URL}/api/generate-code`,
  generateColumnInstructions: `${API_BASE_URL}/api/generate-column-instructions`,
  // AI agents
  agents: `${API_BASE_URL}/api/agents`,
  agentById: (id: string) => `${API_BASE_URL}/api/agents/${id}`,
  agentTools: `${API_BASE_URL}/api/agents/tools`,
  agentTemplates: `${API_BASE_URL}/api/agents/templates`,
  agentContextOptions: `${API_BASE_URL}/api/agents/context-options`,
  generateAgent: `${API_BASE_URL}/api/agents/generate`,
  agentTranscribe: `${API_BASE_URL}/api/agents/transcribe`,
  agentConversations: (agentId: string) => `${API_BASE_URL}/api/agents/${agentId}/conversations`,
  agentConversation: (conversationId: string) => `${API_BASE_URL}/api/agents/conversations/${conversationId}`,
  // Streams through a Next route handler so server-sent events are not buffered by the rewrite proxy.
  agentRunStream: `/api/agent-runs/stream`,
  chat: `${API_BASE_URL}/api/chat`,
  
  // Execution
  execute: `${API_BASE_URL}/api/execute`,
  resultById: (id: string) => `${API_BASE_URL}/api/results/${id}`,
  exportResult: (id: string) => `${API_BASE_URL}/api/export/${id}`,
  
  // Clusters
  clusters: `${API_BASE_URL}/api/clusters`,
  clustersExecutions: `${API_BASE_URL}/api/clusters/executions`,
  clusterById: (id: string) => `${API_BASE_URL}/api/clusters/${id}`,
  clusterExecute: (id: string) => `${API_BASE_URL}/api/clusters/${id}/execute`,
  clusterLinkExecution: (id: string) => `${API_BASE_URL}/api/clusters/${id}/link-execution`,
  clusterExecutionDelete: (id: string) => `${API_BASE_URL}/api/clusters/executions/${id}`,
  clustersCompare: `${API_BASE_URL}/api/clusters/compare`,
  rootCauseAnalyze: `/api/rootcause/analyze`,
  rootCauseAgentsAnalyze: `/api/rootcause/agents/analyze`,
  
  // Lineage
  contentLineage: `${API_BASE_URL}/api/content-lineage`,

  // Regulations (EUR-Lex scraper)
  regulations: `${API_BASE_URL}/api/regulations`,
  regulationsScrape: `${API_BASE_URL}/api/regulations/scrape`,
  regulationsStop: `${API_BASE_URL}/api/regulations/stop`,
  regulationsClear: `${API_BASE_URL}/api/regulations/results`,
  regulationDocuments: `${API_BASE_URL}/api/regulations/documents`,
  regulationDocumentsFromUpload: `${API_BASE_URL}/api/regulations/documents/from-upload`,
  regulationDocumentFile: (id: string) => `${API_BASE_URL}/api/regulations/documents/${id}/file`,
  regulationDocumentView: (id: string) => `${API_BASE_URL}/api/regulations/documents/${id}/file?inline=true`,
  regulationDocument: (id: string) => `${API_BASE_URL}/api/regulations/documents/${id}`,
  regulationReindex: (id: string) => `${API_BASE_URL}/api/regulations/documents/${id}/reindex`,

  // Regulation–release note matcher
  regulationMatcherSources: `${API_BASE_URL}/api/regulation-matcher/sources`,
  regulationMatcherRuns: `${API_BASE_URL}/api/regulation-matcher/runs`,
  regulationMatcherRun: (id: string) => `${API_BASE_URL}/api/regulation-matcher/runs/${id}`,
  regulationMatcherRunProgress: (id: string) => `${API_BASE_URL}/api/regulation-matcher/runs/${id}?lite=true`,
  regulationMatcherCancel: (id: string) => `${API_BASE_URL}/api/regulation-matcher/runs/${id}/cancel`,
  regulationMatcherExport: (id: string, language = "en") => `${API_BASE_URL}/api/regulation-matcher/runs/${id}/export?language=${language}`,
  regulationMatcherProvision: (regulationId: string, unit: number) =>
    `${API_BASE_URL}/api/regulation-matcher/provision?regulation_id=${encodeURIComponent(regulationId)}&unit=${unit}`,

  // Technical lineage AI agent
  lineageAgentSources: `${API_BASE_URL}/api/lineage-agent/sources`,
  lineageAgentPreview: (executionId: string) => `${API_BASE_URL}/api/lineage-agent/preview?execution_id=${encodeURIComponent(executionId)}`,
  lineageAgentRuns: `${API_BASE_URL}/api/lineage-agent/runs`,
  lineageAgentRun: (id: string) => `${API_BASE_URL}/api/lineage-agent/runs/${id}`,
  lineageAgentRunProgress: (id: string) => `${API_BASE_URL}/api/lineage-agent/runs/${id}?lite=true`,
  lineageAgentCancel: (id: string) => `${API_BASE_URL}/api/lineage-agent/runs/${id}/cancel`,
  lineageAgentExport: (id: string, format: "xlsx" | "openlineage", language: string) =>
    `${API_BASE_URL}/api/lineage-agent/runs/${id}/export?format=${format}&language=${encodeURIComponent(language)}`,

  // Release notes workbooks
  releaseNotes: `${API_BASE_URL}/api/release-notes`,
  releaseNotesFromUpload: `${API_BASE_URL}/api/release-notes/from-upload`,
  uploadChunk: (uploadId: string, index: number) => `${API_BASE_URL}/api/uploads/${uploadId}/chunks/${index}`,
  releaseNoteSheet: (id: string, sheetIndex: number) =>
    `${API_BASE_URL}/api/release-notes/${id}/sheets/${sheetIndex}`,
  releaseNoteFile: (id: string) => `${API_BASE_URL}/api/release-notes/${id}/file`,
  releaseNoteView: (id: string) => `${API_BASE_URL}/api/release-notes/${id}/file?inline=true`,
  releaseNoteDelete: (id: string) => `${API_BASE_URL}/api/release-notes/${id}`,

  // Health check
  health: `${API_BASE_URL}/`,
};
