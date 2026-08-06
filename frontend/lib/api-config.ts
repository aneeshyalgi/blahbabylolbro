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
  
  // Code
  code: `${API_BASE_URL}/api/code`,
  codeUpload: `${API_BASE_URL}/api/code/upload`,
  codeById: (id: string) => `${API_BASE_URL}/api/code/${id}`,
  codeDelete: (id: string) => `${API_BASE_URL}/api/code/${id}`,
  generateCode: `${API_BASE_URL}/api/generate-code`,
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
  
  // Lineage
  contentLineage: `${API_BASE_URL}/api/content-lineage`,

  // Regulations (EUR-Lex scraper)
  regulations: `${API_BASE_URL}/api/regulations`,

  // Health check
  health: `${API_BASE_URL}/`,
};
