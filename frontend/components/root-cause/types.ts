/** Types of the normal RootCause tab and of its post-run human review (the chat beside the result). */

export type Status = "explained" | "partial" | "unexplained" | "unchanged";
/** How the compare run computes a field for the position: what it reads, which fields choose the rule, its statement. */
export type FieldRule = { parents: string[]; conditions: string[]; line: number | null; code: string };
/** A field of the lineage: both values; `rule` is null when the value comes from the input data (missing in results
 *  saved before the lineage graph). */
export type FieldValue = { a: unknown; b: unknown; in_a: boolean; in_b: boolean; changed: boolean; rule?: FieldRule | null };
export type Chain = {
  origin: string;
  kind: "rule" | "data";
  heads: string[];
  fields: string[];
  input: string;
  covered: boolean;
  note: string | null;
  condition: string;
  rule: { base: string[]; compare: string[]; base_code: string; compare_code: string } | null;
};
export type NoteRef = { id: string; workbook: string; sheet: string; solution: string; problem: string };
export type RootCauseRow = {
  position: string;
  output: string;
  value_a?: unknown;
  value_b?: unknown;
  difference?: number | null;
  changed?: boolean;
  status?: Status;
  lineage: string;
  input: string;
  release_note: string;
  explanation: string;
  confidence: number;
  score?: number | null;
  chains?: Chain[];
  other_chains?: Chain[];
  values?: Record<string, FieldValue>;
  effects?: { expected: number; calculation: number; data: number } | null;
  notes?: NoteRef[];
  /** The reviewer note, written in the post-run review. */
  comment?: string;
};
export type RunInfo = { execution_id: string; code: string; dataset: string; replayed: boolean; verified: boolean; problem: string };
export type RootCauseResult = {
  output_column?: string;
  release_note_id?: string | null;
  release_note_files?: string[];
  runs?: { base: RunInfo; compare: RunInfo };
  analysis: {
    root_cause?: string;
    explanation?: string;
    confidence?: number;
    evidence?: string[];
    next_checks?: string[];
    rows?: RootCauseRow[];
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Post-run human review
// ---------------------------------------------------------------------------------------------------------------------

/** What the review can change on a row (the values of both runs, the deviation and the lineage stay as computed). */
export type ReviewField = "status" | "score" | "input" | "release_note" | "explanation" | "comment";
/** One edit the review assistant made: a new value, or the computed value back (restore). */
export type ReviewChange = { position: string; field: ReviewField; value?: string | number; notes?: NoteRef[]; restore?: boolean };
export type ReviewSort = "deviation_desc" | "deviation_asc" | "score_desc" | "score_asc" | "position";
/** Which rows the table shows and in which order, as the review set it. */
export type ReviewView = { statuses: Status[]; positions: string[]; hide_positions: string[]; show_unchanged: boolean; sort: ReviewSort };
/** One line of an answer's change list, already worded ("Explanation Status: Partially explained → Explained"). */
export type ChangeLine = { position: string; field: ReviewField; text: string };

export type ReviewTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  /** Assistant turns: the edits, applied on top of the computed result in turn order (unless undone). */
  changes?: ReviewChange[];
  lines?: ChangeLine[];
  summary?: string | null;
  restoreSummary?: boolean;
  nextChecks?: string[] | null;
  restoreNextChecks?: boolean;
  view?: ReviewView | null;
  /** The table view before this turn changed it, to undo it. */
  viewBefore?: ReviewView | null;
  showUnchangedBefore?: boolean;
  rejected?: string[];
  undone?: boolean;
  error?: boolean;
};
