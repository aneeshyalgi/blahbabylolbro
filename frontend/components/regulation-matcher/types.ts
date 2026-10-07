export type LinkType = "direct" | "indirect";
export type NoteStatus = "linked" | "review" | "no_link" | "failed";
export type NotePhase =
  | "queued" | "interpreting" | "retrieving" | "adjudicating" | "verifying" | "reviewing" | "translating" | "done" | "failed" | "cancelled";
export type RunStatus = "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type CheckStatus = "pass" | "corrected" | "fail" | "warn" | "info";
export type Approach = "standardised" | "irb" | "both" | "not_specific";

export type ReleaseNoteFileSource = {
  id: string;
  filename: string;
  kind: "excel" | "pdf";
  notes: number;
  jira_ids: string[];
  upload_date?: string;
};

export type RegulationSource = {
  id: string;
  filename: string;
  short: string;
  title?: string | null;
  status?: "ready" | "indexing" | "failed" | string;
  articles?: number | null;
  annexes?: number | null;
  passages?: number | null;
  pages?: number | null;
  semantic?: boolean;
  language?: string | null;
};

export type Sources = {
  release_note_files: ReleaseNoteFileSource[];
  regulations: RegulationSource[];
  model: string;
};

export type Check = {
  id: "regulation_quote" | "note_quote" | "scope" | "substantive" | "concept" | "retrieval" | "citation_retargeted" | "review";
  status: CheckStatus;
  params: Record<string, unknown>;
};

export type Retrieval = {
  rank: number;
  best_rank?: number;
  keyword_rank?: number | null;
  similarity?: number | null;
  queries?: number;
  via_concept?: boolean;
  concept_rank?: number | null;
  via_reference?: string | null;
};

export type Link = {
  candidate: string;
  regulation_id: string;
  regulation: string;
  regulation_file: string;
  unit: number;
  label: string;
  reference: string;
  title: string;
  path: string[];
  pages: number[];
  page: number | null;
  page_label: string;
  paragraph: string | null;
  point: string | null;
  link_type: LinkType;
  approach: Approach;
  model_confidence: number;
  confidence: number;
  band: "high" | "medium" | "low";
  affected_element: string;
  rationale: string;
  regulation_quote: string;
  regulation_highlights: string[];
  note_quote: string;
  note_highlights: string[];
  provision_text: string;
  formula?: boolean;
  concepts: string[];
  checks: Check[];
  references: string[];
  provision_key?: string;
};

export type Rejected = {
  candidate: string;
  reference: string;
  title: string;
  regulation: string;
  page_label: string;
  source: "model" | "verification" | "review";
  reason: string;
  /** Verification reasons in every text language (they come from templates, not from the model). */
  reason_i18n?: Record<string, string>;
};

export type CandidateRow = {
  id: string;
  reference: string;
  title: string;
  regulation: string;
  regulation_id: string;
  unit: number;
  page_label: string;
  page: number | null;
  path: string[];
  score: number;
  retrieval: Retrieval;
  flags: { mandate: boolean; side: boolean; scope: boolean };
  decision: "linked" | "rejected" | "not_selected";
  excerpt: string;
};

export type Interpretation = {
  summary: string;
  summary_en: string;
  change_kind: string;
  affected_items: string[];
  concepts: { term: string; source_phrase: string; effect: string; verbatim?: boolean }[];
  queries?: string[];
};

/** A note's AI-written texts in another language; list positions are keys ("0", "1", …). */
export type NoteTranslation = {
  summary?: string;
  effects?: Record<string, string>;
  terms?: Record<string, string>;
  affected_items?: Record<string, string>;
  assessment?: string;
  no_link_reason?: string;
  links?: Record<string, { rationale?: string; affected_element?: string; review_reason?: string }>;
  rejected?: Record<string, string>;
};

export type NoteResult = {
  key: string;
  jira_id: string;
  file_id: string;
  file: string;
  kind: string;
  sheet: string;
  ordinal: number;
  fields: { name: string; value: string }[];
  problem: string;
  solution: string;
  text: string;
  full_text: string;
  phase: NotePhase;
  status: NoteStatus | null;
  link_count: number;
  interpretation?: Interpretation;
  links?: Link[];
  rejected?: Rejected[];
  candidates?: CandidateRow[];
  retrieval?: { queries: string[]; semantic: boolean; pool: number; concepts: string[] };
  assessment?: string;
  no_link_reason?: string;
  no_link_code?: string;
  corrections?: string[];
  corrections_i18n?: Record<string, string[]>;
  translations?: Record<string, NoteTranslation>;
  duration_ms?: number;
  error?: string | null;
};

export type ProvisionSummary = {
  key: string;
  regulation: string;
  regulation_id: string;
  reference: string;
  label: string;
  title: string;
  path: string[];
  unit: number;
  page_label: string;
  page: number | null;
  number: string | null;
  kind: string;
  notes: { key: string; jira_id: string; link_type: LinkType; confidence: number }[];
  direct: number;
  indirect: number;
};

export type RunSummary = {
  notes: number;
  analysed: number;
  linked: number;
  review: number;
  no_link: number;
  failed: number;
  links: number;
  direct: number;
  indirect: number;
  provisions: number;
  articles: number;
  quotes_total: number;
  quotes_verified: number;
  quotes_corrected: number;
  average_confidence: number | null;
  candidates_reviewed: number;
  rejected: number;
  corrections: number;
  coverage: number;
};

export type LogEntry = {
  t: number;
  level: "info" | "warn" | "error" | "success";
  /** English text; `i18n` holds the other languages of coded lines. */
  message: string;
  note?: string | null;
  code?: string;
  i18n?: Record<string, string>;
};

export type Run = {
  id: string;
  status: RunStatus;
  stage: string;
  created_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  language: string;
  model: string | null;
  usage: { llm_calls: number; prompt_tokens: number; completion_tokens: number };
  release_note_files: { id: string; filename: string; kind: string; notes: number }[];
  regulations: { id: string; filename: string; short: string; title?: string | null; articles?: number | null; pages?: number | null }[];
  settings?: Record<string, number>;
  notes: NoteResult[];
  provisions?: ProvisionSummary[];
  summary: RunSummary | null;
  log: LogEntry[];
  error: string | null;
  /** Names of the glossary concepts per language ({ de: { "accrued interest": "aufgelaufene Zinsen" } }). */
  concept_names?: Record<string, Record<string, string>>;
  translation?: { notes: number; texts: number; kept: number };
};

export type RunListItem = Pick<
  Run,
  "id" | "status" | "created_at" | "finished_at" | "duration_ms" | "model" | "language" | "release_note_files" | "regulations" | "summary"
>;

export type Provision = {
  regulation_id: string;
  regulation: string;
  regulation_file: string;
  document_title?: string | null;
  label: string;
  title?: string | null;
  path: string[];
  page_start?: number;
  page_end?: number;
  passages: {
    paragraph?: string | null;
    points: string[];
    page: number;
    page_end?: number | null;
    kind: string;
    footnote?: string | null;
    text: string;
    context?: string | null;
    formula?: boolean;
  }[];
  references: string[];
};

export type ProvisionTarget = {
  regulationId: string;
  unit: number;
  reference: string;
  paragraph?: string | null;
  highlights: string[];
  page?: number | null;
};
