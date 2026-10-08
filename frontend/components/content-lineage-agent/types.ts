/** Data contract of the Content Lineage AI Agent (backend: backend/content_lineage_agent.py). */

import type { SourceCluster } from "@/components/lineage-agent/types";

export type RunStatus = "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type Stage = "queued" | "load" | "trace" | "compose" | "describe" | "regulate" | "review" | "translate" | "assemble" | "finished";
export type TermKind = "figure" | "concept" | "source";
export type Verdict = "consistent" | "simplified" | "deviation" | "not_covered" | "unverified";
export type FindingVerdict = "consistent" | "simplified" | "deviation";
export type Relation = "defines" | "prescribes" | "related";
export type Severity = "critical" | "warning" | "info";
export type CheckStatus = "pass" | "warn" | "fail" | "skipped";

export interface RegulationDocument {
  id: string;
  filename: string;
  short: string;
  title: string | null;
  status: string | null;
  ready: boolean;
  articles: number | null;
  pages: number | null;
  semantic: boolean;
  language: string | null;
}

export interface Sources {
  clusters: SourceCluster[];
  regulations: RegulationDocument[];
  model: string;
  llm_configured: boolean;
}

export interface Preview {
  execution_id: string;
  code: { filename: string | null; line_count: number };
  rows: number;
  inputs: string[];
  derived: { column: string; numeric: boolean; depth: number; upstream: number; used_by: string[]; default: boolean }[];
  figures: string[];
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
  /** Amounts are added up (false for text columns and for factors such as conversion factors or risk weights). */
  numeric: boolean;
  factor?: boolean;
  delivered: { records: number; amount: number | null };
  missing: number;
  derived: number;
}

export interface Term {
  column: string;
  kind: TermKind;
  classifier: boolean;
  in_source: boolean;
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
  lines: number[];
}

export interface Path {
  tokens: string[];
  records: number;
  amount: number | null;
  examples: string[];
}

export interface Segment {
  value: string;
  records: number;
  missing: number;
  amount: number | null;
}

export interface Figure {
  numeric: boolean;
  total: number | null;
  records: number;
  present: number;
  missing: number;
  origins: { origin: string; records: number; amount: number | null }[];
  paths: Path[];
  other_paths: { count: number; records: number; amount: number | null } | null;
  segments: Record<string, Segment[]>;
}

export interface RecordStep {
  line: number;
  before: unknown;
  after: unknown;
  inputs: Record<string, unknown>;
  case: string;
  key: string | null;
}

export interface RecordItem {
  label: string;
  id: string | null;
  values: Record<string, unknown>;
  steps: Record<string, RecordStep[]>;
}

export interface Link {
  candidate: string;
  regulation_id: string;
  regulation: string;
  regulation_file: string | null;
  unit: number;
  label: string;
  reference: string;
  title: string;
  path: string[];
  page: number | null;
  page_label: string;
  relation: Relation;
  quote: string;
  quote_status: "verified" | "corrected";
  similarity: number;
  highlights: string[];
  text: string;
  retargeted_from: string | null;
}

export interface RegulatoryFinding {
  case: string | null;
  key: string | null;
  verdict: FindingVerdict;
  link: number;
}

export interface Assessment {
  verdict: Verdict;
  links: Link[];
  findings: RegulatoryFinding[];
  dropped: string[];
  corrected: boolean;
  retrieval: { candidates: number; queries: string[]; semantic?: boolean; concepts?: string[]; framework?: string; outside_framework?: number; scoped?: number };
  review: {
    decision: "confirmed" | "corrected";
    issues: string[];
    applied: boolean;
    removed: { reference: string; title: string }[];
    original?: { verdict: Verdict; explanation: string; findings: (RegulatoryFinding & { explanation: string })[] };
  } | null;
}

export interface Texts {
  summary: string;
  domain: string;
  terms: Record<string, { name: string; definition: string }>;
  rules: Record<string, { name: string; statement: string; cases: Record<string, { label: string; description: string }> }>;
  regulation: Record<string, { explanation: string; links: string[]; findings: string[]; issues: string[] }>;
}

export interface GroundingIssue {
  code: "term_missing" | "rule_missing" | "case_missing" | "case_unknown" | "number_ungrounded" | string;
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

export interface Result {
  code: { filename: string; lines: string[]; line_count: number };
  scope: { figures: string[]; identifier: string | null; dimensions: string[]; records: number };
  terms: Term[];
  rules: Rule[];
  filters: { id: string; line: number; end_line: number; code: string; rows_removed: number }[];
  figures: Record<string, Figure>;
  records: { columns: string[]; items: RecordItem[]; total: number; identifier: string | null };
  replay: { ok: boolean; cells_compared: number; mismatches: number; columns_match: boolean; partial: boolean; rows: number; ms: number };
  regulation: { enabled: boolean; skipped: string | null; documents: { id: string; short: string; title: string | null; filename: string | null }[]; rules: Record<string, Assessment> };
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
  figures: number;
  figure_names: string[];
  terms: number;
  sources: number;
  concepts: number;
  rules: number;
  cases: number;
  records: number;
  paths: number;
  derived_pct: number | null;
  provisions: number;
  verdicts: Record<Verdict, number>;
  findings: Record<Severity, number>;
  checks: Record<CheckStatus, number>;
  replay_ok: boolean;
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
  settings: { figures: string[]; figures_traced: string[]; regulation_ids: string[]; record_rows: number };
  progress: { rules_total: number; rules_described: number; rules_regulated: number; provisions_linked: number; rules_reviewed: number; rules_to_review: number };
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
  settings: Run["settings"];
  summary: Summary | null;
}

export type View = "graph" | "figures" | "glossary" | "regulation" | "verification";

/** What a graph node or a link elsewhere points at. */
export type Selection = { kind: "term"; id: string } | { kind: "rule"; id: string } | { kind: "provision"; id: string } | null;

export interface Navigator {
  openTerm: (column: string, view?: View) => void;
  openRule: (rule: string, view?: View) => void;
  openProvision: (key: string) => void;
  openRecord: (figure: string, label: string) => void;
}
