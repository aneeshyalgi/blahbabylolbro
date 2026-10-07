/** Data contract of the Technical Lineage AI Agent (backend: backend/lineage_agent.py, backend/lineage_analysis.py). */

export type RunStatus = "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type Stage = "queued" | "load" | "parse" | "replay" | "probe" | "document" | "review" | "investigate" | "translate" | "assemble" | "finished";
export type Role = "passthrough" | "cast" | "enriched" | "overwritten" | "created" | "renamed" | "dropped" | "intermediate";
export type Operation =
  | "copy" | "cast" | "fill_missing" | "conditional" | "lookup" | "arithmetic" | "aggregation" | "window" | "function"
  | "string" | "date" | "rounding" | "binning" | "constant" | "rename" | "transformation";
export type TransformationType = "DIRECT" | "INDIRECT";
export type Severity = "critical" | "warning" | "info";
export type CheckStatus = "pass" | "warn" | "fail" | "skipped";

export interface SourceExecution {
  execution_id: string;
  executed_date: string | null;
  rows: number | null;
  columns: number;
  values_computed: number | null;
  code_filename: string | null;
  dataset_name: string | null;
}

export interface SourceCluster {
  id: string;
  name: string;
  reporting_date: string | null;
  description: string;
  is_reference: boolean;
  dataset_id: string | null;
  dataset_name: string | null;
  code_id: string | null;
  code_filename: string | null;
  executions: SourceExecution[];
}

export interface Sources {
  clusters: SourceCluster[];
  model: string;
  llm_configured: boolean;
}

export interface Preview {
  execution_id: string;
  code: { filename: string | null; lines: string[]; line_count: number; syntax_valid: boolean };
  inputs: { name: string; type: string | null; nulls: number | null; total: number | null }[];
  outputs: string[];
  computed_by_column: Record<string, number>;
  rows: number | null;
  values_computed: number | null;
}

export interface LogEntry {
  t: number;
  level: "info" | "success" | "warn" | "error";
  code: string;
  params: Record<string, string | number | boolean | string[] | null>;
  message: string;
}

export interface RunSource {
  execution_id: string;
  executed_date: string | null;
  cluster_id: string | null;
  cluster_name: string | null;
  reporting_date: string | null;
  dataset_id: string;
  dataset_name: string | null;
  dataset_file: string | null;
  table_id: string | null;
  code_id: string;
  code_filename: string;
  code_lines: number;
  rows: number | null;
  columns: number;
  values_computed: number | null;
}

export interface Transformation {
  type: TransformationType;
  subtype: string;
}

export interface Condition {
  kind: "rows" | "branch" | "loop";
  line: number | null;
  code: string;
  expanded: string | null;
  pretty: string;
}

export interface LineageNode {
  id: number;
  column: string;
  version: number;
  kind: "source" | "write";
  step: number | null;
  line: number | null;
  end_line: number | null;
  data: { node: number; level: "IDENTITY" | "TRANSFORMATION" | "AGGREGATION" }[];
  control: number[];
  group: number[];
  join: number[];
  lookups: string[];
  uses: string[];
  ops: string[];
  operation?: Operation;
  via?: string;
  retained?: boolean;
  reads_self?: boolean;
  possible?: boolean;
  conditions?: Condition[];
  expression?: string;
  pretty?: string;
  statement?: string;
  bindings?: Record<string, string | number | boolean | null>;
  previous?: number | null;
  renamed_from?: string | null;
}

export interface Step {
  id: number;
  line: number;
  end_line: number;
  code: string;
  kind: "write" | "frame" | "function" | "lookup" | "variable" | "import" | "other";
  writes: number[];
  reads: string[];
  defines: string[];
  frame_ops: { kind: string; columns: string[]; line: number | null; code?: string; renamed?: Record<string, string> }[];
  unresolved: boolean;
}

export interface Upstream {
  column: string;
  transformations: Transformation[];
  lines: number[];
  historical: boolean;
  dataset: boolean;
}

export interface LineageColumn {
  name: string;
  in_input: boolean;
  in_output: boolean;
  role: Role;
  final_node: number | null;
  chain: number[];
  input_used: boolean;
  upstream: Upstream[];
  sources: { column: string; mode: "direct" | "indirect" }[];
  lookups: string[];
  lookups_all: string[];
  uses: string[];
  operations: Operation[];
  possible?: boolean;
  depth: number;
  downstream: string[];
}

export interface Edge {
  from: string;
  to: string;
  kind: "column" | "lookup";
  transformations: Transformation[];
  lines: number[];
  historical: boolean;
  dataset: boolean;
}

export interface Lookup {
  name: string;
  kind: "mapping" | "table";
  line: number;
  end_line: number;
  entries: [unknown, unknown][];
  size: number;
  used_by: string[];
  used_in_lines: number[];
  keys_from: string[];
  uses: { line: number; column: string | null; method: string | null }[];
}

export interface Analysis {
  inputs: string[];
  outputs: string[];
  nodes: LineageNode[];
  steps: Step[];
  columns: LineageColumn[];
  edges: Edge[];
  lookups: Lookup[];
  dataset_ops: { kind: string; line: number | null; code: string | null; columns: string[] }[];
  dead_writes: { node: number; column: string; line: number | null; statement: string }[];
  unresolved: { line: number; reason: string; detail: string; code: string }[];
  variables: Record<string, { line: number; end_line: number }>;
}

export interface RuntimeStatement {
  line: number;
  end_line: number;
  ms: number;
  error: string | null;
  changed: Record<string, number>;
  added?: string[];
  removed?: string[];
  reordered?: boolean;
  rows_removed?: number;
  rows_added?: number;
  order_changed?: boolean;
  nulled?: Record<string, { count: number; examples: unknown[] }>;
}

export interface Probe {
  column: string;
  mode: "perturb" | "null" | "fill";
  changed: Record<string, number>;
  error?: string;
  skipped?: boolean;
  ms?: number;
}

export interface Replay {
  cells_compared: number;
  mismatches: number;
  examples: { row: number; column: string; stored: unknown; replayed: unknown }[];
  rows_match: boolean;
  columns_match: boolean;
  replayed_rows: number;
  stored_rows: number;
  ok: boolean;
  ms: number;
  partial: boolean;
  rows: number;
  error: { line: number; message: string } | null;
  write_consistency: { unexplained: { line: number; column: string; cells: number }[] };
  attribution: { computed: number; attributed: number };
}

export interface Dependency {
  confirmed: string[];
  static_only: string[];
  runtime_only: string[];
}

export interface CellChange {
  line: number;
  before: unknown;
  after: unknown;
  inputs: Record<string, unknown>;
}

export interface Cells {
  columns: string[];
  rows: { label: string; values: Record<string, unknown> }[];
  input: Record<string, Record<string, unknown>>;
  input_columns: string[];
  changes: Record<string, Record<string, CellChange[]>>;
  computed: string[];
  total_rows: number;
}

export interface Rule {
  text: string;
  lines: number[];
  inputs: string[];
}

/** A deterministic grounding problem: a code and parameters for the UI, an English text that went back to the model. */
export interface GroundingIssue {
  code: "no_rules" | "uncited_rule" | "lines_outside" | "inputs_outside" | "formula_name" | "missing_inputs" | string;
  params: Record<string, string | number>;
  text: string;
}

export interface ColumnDoc {
  status: "documented" | "failed" | "passthrough";
  error?: string;
  meaning?: string;
  summary?: string;
  formula?: string;
  rules?: Rule[];
  notes?: { text: string; lines: number[]; severity: "info" | "warning" }[];
  grounding?: { status: "verified" | "partial"; issues: GroundingIssue[]; corrected: boolean };
  review?: {
    verdict: "confirmed" | "corrected" | "unavailable";
    issues: string[];
    applied?: boolean;
    rejected_because?: GroundingIssue[];
    original?: { summary: string; formula: string; rules: Rule[] };
  };
}

export interface Overview {
  purpose: string;
  stages: { title: string; start_line: number; end_line: number; description: string }[];
  key_outputs: string[];
}

export interface Investigation {
  issues: Record<string, unknown>[];
  steps: { tool: string; arguments: Record<string, unknown> }[];
  findings: {
    title: string;
    detail: string;
    severity: Severity;
    resolution: string;
    lines: number[];
    columns: string[];
  }[];
}

export interface Translation {
  overview: { purpose: string; stages: { title: string; description: string }[] } | null;
  columns: Record<string, { meaning: string; summary: string; formula: string; rules: string[]; notes: string[]; review_issues?: string[] }>;
  investigation: { title: string; detail: string }[] | null;
  rejected?: number;
}

export interface Finding {
  id: string;
  code: string;
  severity: Severity;
  columns: string[];
  lines: number[];
  params: Record<string, unknown>;
}

export interface Check {
  id: string;
  status: CheckStatus;
  params: Record<string, unknown>;
}

export interface Result {
  code: { filename: string; lines: string[]; line_count: number };
  analysis: Analysis;
  runtime: {
    replay: Replay;
    statements: RuntimeStatement[];
    unmapped: { name: string; line: number; column: string; values: { value: string; rows: number }[] }[];
    probes: { enabled: boolean; reason?: string; message?: string; rows?: number; limited?: boolean; budget_hit?: boolean; baseline_ms?: number; probes: Probe[]; planned?: number };
    dependencies: Record<string, Dependency>;
  };
  profiles: {
    input: Record<string, { non_null: number; total: number; samples: unknown[] }>;
    output: Record<string, { non_null: number; total: number; samples: unknown[] }>;
  };
  cells: Cells;
  ai: {
    overview: Overview | null;
    columns: Record<string, ColumnDoc>;
    investigation: Investigation | null;
    /** Language the AI wrote in; translations hold the same texts in the other display languages. */
    language?: string;
    translations?: Record<string, Translation>;
  };
  findings: Finding[];
  checks: Check[];
}

export interface Summary {
  outputs: number;
  inputs: number;
  derived: number;
  roles: Partial<Record<Role, number>>;
  edges: number;
  direct: number;
  indirect: number;
  lookups: number;
  statements: number;
  writes: number;
  unresolved: number;
  replay_ok: boolean;
  cells_compared: number;
  cell_changes: number;
  computed: number;
  attributed: number;
  probes: number;
  confirmed: number;
  static_dependencies: number;
  runtime_only: number;
  verified_pct: number | null;
  findings: Record<Severity, number>;
  documented: number;
  grounded: number;
  reviewed: number;
  corrected: number;
  languages?: string[];
}

export interface Run {
  id: string;
  status: RunStatus;
  stage: Stage;
  created_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  language: string;
  model: string | null;
  usage: { llm_calls: number; prompt_tokens: number; completion_tokens: number; tool_calls: number };
  source: RunSource;
  settings: { probes: boolean; trace_rows: number; probe_row_limit: number; batch_size: number };
  progress: { probes_total: number; probes_done: number; columns_total: number; columns_documented: number };
  summary: Summary | null;
  result?: Result | null;
  log: LogEntry[];
  error: string | null;
}

export interface RunListItem {
  id: string;
  status: RunStatus;
  created_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  model: string | null;
  language: string;
  source: RunSource;
  summary: Summary | null;
}

export type View = "graph" | "columns" | "code" | "cells" | "mapping" | "verification";

/** Cross-view navigation: every view can open a column, a line of code or a cell. */
export interface Navigator {
  openColumn: (column: string, view?: View) => void;
  openLine: (line: number) => void;
  openCell: (row: string, column: string) => void;
}
