export type AgentDefinition = {
  name: string;
  description: string;
  purpose: string;
  instructions: string;
  tools: string[];
  starters: string[];
  guardrails: string[];
  output_format: string;
  icon: string;
  color: string;
  max_steps: number;
  temperature: number;
  /** Release-note file ids the search tool is limited to; empty means every uploaded file. */
  release_note_sources: string[];
};

/** An uploaded release-note file (Excel workbook or PDF), as listed by /api/release-notes. */
export type ReleaseNoteFile = {
  id: string;
  filename: string;
  upload_date: string;
  sheets: string[];
  kind?: "excel" | "pdf";
  page_count?: number;
};

export type SavedAgent = {
  id: string;
  name: string;
  description: string;
  source_prompt: string;
  definition: AgentDefinition;
  created_date: string;
  updated_date?: string | null;
  conversation_count: number;
  last_run_date?: string | null;
};

export type ToolInfo = {
  name: string;
  label: string;
  category: string;
  icon: string;
  description: string;
};

export type AgentTemplate = {
  id: string;
  tagline: string;
  definition: AgentDefinition;
};

export type ContextChip = {
  type: "cluster" | "execution" | "dataset";
  id: string;
  label: string;
};

export type ToolStep = {
  kind: "tool";
  id: string;
  tool: string;
  label: string;
  arguments: Record<string, unknown>;
  status: "running" | "ok" | "error";
  summary?: string;
  preview?: string;
  duration_ms?: number;
};

export type NoteStep = { kind: "note"; text: string };

export type TimelineItem = ToolStep | NoteStep;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  context?: ContextChip[];
  timeline?: TimelineItem[];
  status?: "running" | "complete" | "error" | "stopped";
  error?: string;
  duration_ms?: number;
  created_date?: string;
};

export type ConversationSummary = {
  id: string;
  agent_id: string;
  title: string;
  created_date: string;
  updated_date: string;
  message_count: number;
};

export type Conversation = ConversationSummary & { messages: ChatMessage[] };

export type ContextOptions = {
  clusters: {
    id: string;
    name: string;
    reporting_date?: string;
    dataset_name?: string | null;
    code_filename?: string | null;
    is_reference?: boolean;
    executions: { execution_id: string; executed_date: string; values_computed?: number | null }[];
  }[];
  datasets: { id: string; name: string; filename?: string; version?: string }[];
};

export type RunEvent =
  | { type: "start"; conversation_id: string; title: string; user_message: ChatMessage; assistant_message_id: string }
  | { type: "token"; text: string }
  | { type: "step_start"; step: ToolStep }
  | { type: "step_end"; step: ToolStep }
  | { type: "done"; message: ChatMessage };

export const EMPTY_DEFINITION: AgentDefinition = {
  name: "",
  description: "",
  purpose: "",
  instructions: "",
  tools: ["workspace_overview", "list_executions", "query_data", "compare_executions", "calculator"],
  starters: [],
  guardrails: [],
  output_format: "",
  icon: "bot",
  color: "amber",
  max_steps: 8,
  temperature: 0.2,
  release_note_sources: [],
};
