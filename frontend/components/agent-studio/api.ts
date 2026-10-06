import { API_ENDPOINTS } from "@/lib/api-config";
import type { AgentDefinition, RunEvent } from "./types";

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...(init.headers || {}) } : init?.headers,
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload ? (payload as { detail?: unknown }).detail : null;
    throw new Error(typeof detail === "string" ? detail : text || `Request failed (${response.status})`);
  }
  return payload as T;
}

export type RunRequest = {
  message: string;
  /** Language for the agent's answer and the run-trace summaries. */
  language?: "en" | "de";
  agent_id?: string;
  definition?: AgentDefinition;
  conversation_id?: string | null;
  context?: { cluster_ids: string[]; execution_ids: string[]; dataset_ids: string[] };
};

/** POST a run and invoke onEvent for every server-sent event until the stream ends. */
export async function streamAgentRun(payload: RunRequest, onEvent: (event: RunEvent) => void, signal: AbortSignal) {
  const response = await fetch(API_ENDPOINTS.agentRunStream, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok || !response.body) {
    const text = await response.text();
    let detail = text || `Run failed (${response.status})`;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.detail === "string") detail = parsed.detail;
    } catch {
      // keep raw text
    }
    throw new Error(detail);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onEvent(JSON.parse(data) as RunEvent);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return "";
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function definitionsEqual(a: AgentDefinition | null, b: AgentDefinition | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
