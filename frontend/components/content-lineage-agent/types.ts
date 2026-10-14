/** Data contract of the Content Lineage AI Agent (backend: backend/content_lineage_agent.py). */

import type { SourceCluster } from "@/components/lineage-agent/types";

export type RunStatus = "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type Stage = "queued" | "load" | "trace" | "follow" | "describe" | "translate" | "assemble" | "finished";
/** start: the selected field; next: its rule reads the selected field; downstream: further down; context: another input of a downstream rule. */
export type TermRole = "start" | "next" | "downstream" | "context";
export type Origin = "source" | "derived" | "intermediate";
/** How a field is used by a case: value = in the result, key = parameter-table key, condition = decides whether the case applies. */
export type Use = "value" | "key" | "condition" | "group" | "join" | "impact";
/** How a record's downstream value depends on the selected field. */
export type Reach = "value" | "decides" | "tested";
export type Evidence = "code" | "impact";
export type Severity = "critical" | "warning" | "info";
export type CheckStatus = "pass" | "warn" | "fail" | "skipped";

export interface Sources {
  clusters: SourceCluster[];
  model: string;
  llm_configured: boolean;
}

/** One field of an execution and what its content flows into (code analysis, completed by a quick impact test). */
export interface CatalogueField {
  column: string;
  origin: Origin;
  in_output: boolean;
  numeric: boolean;
  next: string[];
  ends: string[];
  fields: { column: string; level: number; direct: boolean; end: boolean; evidence: Evidence }[];
  edges: { from: string; to: string; lines: number[] }[];
  selection: { kind: string; line: number }[];
  tested: boolean;
  confirmed: string[];
}

export interface Preview {
  execution_id: string;
  code: { filename: string | null; line_count: number };
  rows: number;
  inputs: string[];
  fields: CatalogueField[];
  probe: { enabled: boolean; reason: string | null; rows: number; budget_hit: boolean; tested: number; ms?: number };
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
}

export interface Profile {
  non_null: number;
  total: number;
  distinct: number;
  values: string[];
  sum: number | null;
  min?: number | null;
  max?: number | null;
  samples: unknown[];
}

export interface Composition {
  total_records: number;
  in_result?: boolean;
  /** Amounts are added up (false for text columns and for factors such as conversion factors or risk weights). */
  numeric: boolean;
  factor?: boolean;
  delivered: { records: number; amount: number | null };
  missing: number;
  derived: number;
}

export interface Term {
  column: string;
  role: TermRole;
  level: number | null;
  end: boolean;
  evidence: Evidence | null;
  origin: Origin;
  in_result: boolean;
  classifier: boolean;
  numeric: boolean;
  /** A factor or rate (every value between 0 and 12.5): never summed. */
  factor?: boolean;
  type: "number" | "text" | "date" | "boolean" | "empty";
  rule: string | null;
  inputs: string[];
  used_by: string[];
  profile: Profile | null;
  composition: Composition | null;
  nulled: { count: number; examples: unknown[]; line: number } | null;
}

export interface CaseKey {
  key: string;
  value: unknown;
  records: number;
  amount: number | null;
  mapped: boolean;
  unmapped_rows?: number;
  categories?: Record<string, string[]>;
}

export interface Case {
  id: string;
  rule: string;
  column: string;
  line: number;
  end_line: number;
  code: string;
  operation: string;
  fills_missing: boolean;
  condition: string | null;
  formula: string | null;
  inputs: string[];
  selectors: string[];
  /** Every field the case reads, with how it uses it. */
  roles: Record<string, Use[]>;
  lookup: { name: string; key_column: string; entries: [unknown, unknown][]; line: number; end_line: number } | null;
  constants: number[];
  records: number;
  amount: number | null;
  keys: CaseKey[];
}

export interface Rule {
  id: string;
  column: string;
  cases: Case[];
  inputs: string[];
  selectors: string[];
  roles: Record<string, Use[]>;
  lines: number[];
}

export interface WhatIf {
  alternative: string;
  x_from: unknown;
  x_to: unknown;
  y_from: unknown;
  y_to: unknown;
}

export interface FlowRecords {
  total: number;
  reached: number;
  value: number;
  decides: number;
  tested: number;
  delivered: number;
  other: number;
  missing: number;
  missing_reached: number;
}

/** How the selected field's content reaches one downstream field. */
export interface Flow {
  column: string;
  level: number;
  distance: number | null;
  direct: boolean;
  end: boolean;
  evidence: Evidence;
  /** The fields its content arrives through (the selected field itself for a next field). */
  via: string[];
  lines: number[];
  in_result: boolean;
  records: FlowRecords;
  /** Records whose value changed in the impact test. */
  observed: number;
  /** The final values are not reached, but an earlier state of the field passes the content on. */
  passing: boolean;
  amount: { summable: boolean; total: number | null; reached: number | null };
  x_amount: number | null;
  cases: { id: string; reads: { column: string; roles: Use[] }[]; produced: number; reached: number; value: number; decides: number; tested: number }[];
  by_value: { key: string; value: unknown; records: number; reached: number; amount: number | null; outcomes: { value: unknown; records: number }[] | null; more_outcomes: number }[] | null;
  example: (WhatIf & { label: string; id: string | null }) | null;
}

export interface Route {
  fields: string[];
  records: number;
  amount: number | null;
  examples: string[];
}

export interface RecordField {
  case: string | null;
  key: string | null;
  reach: Reach | null;
  via: string[];
  whatif: WhatIf | null;
}

export interface RecordItem {
  label: string;
  id: string | null;
  x: unknown;
  values: Record<string, unknown>;
  fields: Record<string, RecordField>;
}

export interface Impact {
  enabled: boolean;
  reason: string | null;
  rows: number;
  partial: boolean;
  classes: number;
  all_values: boolean;
  alternatives: { id: string; kind: string; changed: Record<string, number>; error: { line: number; message: string } | null; rows_removed: number; rows_added: number; ms?: number }[];
  planned: number;
  tested: number;
  budget_hit: boolean;
  errors: { alternative: string; line: number; message: string }[];
  unexpected: string[];
  silent: string[];
  confirmed: number;
  selection: { removed: number; added: number } | null;
  ms: number;
}

export interface Texts {
  /** How the selected field's content is used downstream, in two or three sentences. */
  summary: string;
  domain: string;
  terms: Record<string, { name: string; definition: string }>;
  rules: Record<string, { name: string; statement: string; cases: Record<string, { label: string; description: string }> }>;
  /** Per downstream field: how the selected field reaches it. */
  usage?: Record<string, string>;
}

export interface GroundingIssue {
  code: "term_missing" | "rule_missing" | "case_missing" | "case_unknown" | "number_ungrounded" | "usage_missing" | string;
  params: Record<string, unknown>;
  text: string;
}

export interface Check {
  id: string;
  status: CheckStatus;
  params: Record<string, unknown>;
}

export interface Finding {
  id: string;
  code: string;
  severity: Severity;
  params: Record<string, unknown>;
}

export interface Scope {
  field: string;
  origin: Origin;
  next: string[];
  /** Every downstream field, in the order of the calculation. */
  fields: string[];
  ends: string[];
  context: string[];
  identifier: string | null;
  records: number;
  /** The selected field has few values: the flows are shown value by value. */
  categorical: boolean;
  values: { key: string; value: unknown; records: number }[];
  edges: { from: string; to: string; lines: number[]; roles: Use[] }[];
  selection: { kind: string; line: number; statement_line: number; rows_removed: number; code: string | null; columns: string[] }[];
}

export interface Result {
  /** 'forward' for analyses of this version; analyses of the earlier version (backward from reported figures) have none. */
  mode?: "forward";
  code: { filename: string; lines: string[]; line_count: number };
  scope: Scope;
  terms: Term[];
  rules: Rule[];
  flows: Record<string, Flow>;
  routes: Route[];
  other_routes: number;
  records: { columns: string[]; items: RecordItem[]; total: number; identifier: string | null };
  impact: Impact;
  filters: { id: string; line: number; end_line: number; code: string; rows_removed: number }[];
  replay: { ok: boolean; cells_compared: number; mismatches: number; columns_match: boolean; partial: boolean; rows: number; ms: number };
  ai: {
    language: string;
    texts: Record<string, Texts>;
    grounding: { issues: GroundingIssue[]; corrected: boolean; status: "verified" | "partial" };
    translation: { languages: string[]; kept: number };
  };
  checks: Check[];
  findings: Finding[];
}

export interface Summary {
  field?: string;
  next?: number;
  fields?: number;
  ends?: number;
  end_names?: string[];
  terms: number;
  rules: number;
  cases: number;
  records: number;
  reached?: number;
  routes?: number;
  impact?: { enabled: boolean; confirmed: number; unexpected: number };
  findings: Record<Severity, number>;
  checks: Record<CheckStatus, number>;
  replay_ok: boolean;
}

export interface RunSettings {
  mode?: "forward";
  field?: string;
  fields_reached?: string[];
  /** Analyses of the earlier version: the reported figures traced backward. */
  figures?: string[];
  figures_traced?: string[];
  record_rows: number;
}

export interface Run {
  id: string;
  status: RunStatus;
  stage: Stage | "compose";
  created_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  language: string;
  model: string | null;
  usage: { llm_calls: number; prompt_tokens: number; completion_tokens: number; tool_calls: number };
  source: RunSource;
  settings: RunSettings;
  progress: { rules_total: number; rules_described: number };
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
  settings: RunSettings;
  summary: Summary | null;
}
