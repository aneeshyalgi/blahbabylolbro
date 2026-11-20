/**
 * The post-run human review of a RootCause result: the review assistant's edits are kept per chat turn and applied on
 * top of the computed result in turn order, so the table shows the reviewed report, every edit stays visible as an
 * edit (with the computed value) and the latest one can be undone.
 */
import type { ChangeLine, ReviewChange, ReviewField, ReviewSort, ReviewTurn, ReviewView, RootCauseResult, RootCauseRow, Status } from "./types";

export const STATUS_LABEL: Record<Status, string> = { explained: "Explained", partial: "Partially explained", unexplained: "Not explained", unchanged: "Unchanged" };
export const FIELD_LABEL: Record<ReviewField, string> = {
  status: "Explanation Status",
  score: "Score",
  input: "Input",
  release_note: "Release Note",
  explanation: "Explanation",
  comment: "Reviewer note",
};
const REVIEW_FIELDS: ReviewField[] = ["status", "score", "input", "release_note", "explanation", "comment"];

export const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
};
export const statusOf = (row: RootCauseRow): Status => row.status ?? (row.changed === false ? "unchanged" : row.release_note ? "explained" : "unexplained");
export const isChanged = (row: RootCauseRow) => row.changed ?? statusOf(row) !== "unchanged";
const clip = (text: string, size = 70) => (text.length > size ? `${text.slice(0, size - 1).trimEnd()}…` : text);

/** A field's value as text, to compare a row with its computed version. */
export function fieldValue(row: RootCauseRow, field: ReviewField): string {
  switch (field) {
    case "status":
      return statusOf(row);
    case "score":
      return String(Math.round(toNumber(row.confidence) ?? 0));
    case "input":
      return row.input ?? "";
    case "release_note":
      return row.release_note ?? "";
    case "explanation":
      return row.explanation ?? "";
    case "comment":
      return row.comment ?? "";
  }
}

function applyChange(row: RootCauseRow, computed: RootCauseRow, change: ReviewChange): RootCauseRow {
  const restore = Boolean(change.restore);
  switch (change.field) {
    case "status":
      return { ...row, status: restore ? computed.status : (String(change.value) as Status) };
    case "score": {
      const score = restore ? computed.confidence : Number(change.value);
      return Number.isFinite(score) ? { ...row, confidence: score, score: restore ? computed.score : score } : row;
    }
    case "input":
      return { ...row, input: restore ? computed.input : String(change.value ?? "") };
    case "release_note":
      return restore ? { ...row, release_note: computed.release_note, notes: computed.notes } : { ...row, release_note: String(change.value ?? ""), notes: change.notes ?? [] };
    case "explanation":
      return { ...row, explanation: restore ? computed.explanation : String(change.value ?? "") };
    case "comment":
      return { ...row, comment: restore ? computed.comment ?? "" : String(change.value ?? "") };
  }
}

const COUNTS: [Status, string][] = [["explained", "durch Release Notes erklärt"], ["partial", "teilweise erklärt"], ["unexplained", "nicht erklärt"]];

/** The summary with its status counts line ("Davon: …", as the analysis writes it) in step with the rows. */
export function withCounts(summary: string, rows: RootCauseRow[]): string {
  const deviating = rows.filter(isChanged);
  const parts = COUNTS.map(([status, label]) => [deviating.filter((row) => statusOf(row) === status).length, label] as const)
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`);
  if (!parts.length) return summary;
  return summary.split("\n").map((line) => (line.startsWith("Davon:") ? `Davon: ${parts.join(", ")}.` : line)).join("\n");
}

const applied = (turns: ReviewTurn[]) => turns.filter((turn) => turn.role === "assistant" && !turn.undone && !turn.error);

export type ReviewedReport = {
  rows: RootCauseRow[];
  summary: string;
  nextChecks: string[];
  /** Rewritten by an answer (and not restored since). */
  summaryEdited: boolean;
  nextChecksEdited: boolean;
  /** Differs from the computed text in any way (a rewrite, or the counts after a status change). */
  summaryChanged: boolean;
};

/** The report as the review left it: the computed result with every edit that is not undone. */
export function applyReview(result: RootCauseResult, turns: ReviewTurn[]): ReviewedReport {
  const computedRows = result.analysis.rows ?? [];
  const computedSummary = result.analysis.root_cause || result.analysis.explanation || "";
  const computedChecks = result.analysis.next_checks ?? [];
  const computed = new Map(computedRows.map((row) => [row.position, row]));
  const current = new Map(computed);
  let summary = computedSummary;
  let nextChecks = computedChecks;
  let summaryEdited = false;
  let nextChecksEdited = false;
  for (const turn of applied(turns)) {
    for (const change of turn.changes ?? []) {
      const row = current.get(change.position);
      const base = computed.get(change.position);
      if (row && base) current.set(change.position, applyChange(row, base, change));
    }
    if (turn.restoreSummary) [summary, summaryEdited] = [computedSummary, false];
    else if (typeof turn.summary === "string") [summary, summaryEdited] = [turn.summary, true];
    if (turn.restoreNextChecks) [nextChecks, nextChecksEdited] = [computedChecks, false];
    else if (Array.isArray(turn.nextChecks)) [nextChecks, nextChecksEdited] = [turn.nextChecks, true];
  }
  const rows = computedRows.map((row) => current.get(row.position) ?? row);
  const statusEdited = rows.some((row, index) => statusOf(row) !== statusOf(computedRows[index]));
  const shown = statusEdited ? withCounts(summary, rows) : summary;
  return { rows, summary: shown, nextChecks, summaryEdited, nextChecksEdited, summaryChanged: shown !== computedSummary };
}

/** The fields the review changed on a row, each with its computed value. */
export function editsOf(row: RootCauseRow, computed: RootCauseRow | undefined): Partial<Record<ReviewField, string>> {
  const edits: Partial<Record<ReviewField, string>> = {};
  if (!computed) return edits;
  for (const field of REVIEW_FIELDS) {
    const value = fieldValue(computed, field);
    if (fieldValue(row, field) !== value) edits[field] = value;
  }
  return edits;
}

/** A field value as the table words it. */
export function displayValue(field: ReviewField, value: string): string {
  if (field === "status") return STATUS_LABEL[value as Status] ?? value;
  if (field === "score") return `${value}%`;
  return value.trim() ? value : "–";
}

/** How an answer changes the rows, worded for the chat ("Explanation Status: Partially explained → Explained"). */
export function describeChanges(rows: RootCauseRow[], computedRows: RootCauseRow[], changes: ReviewChange[]): ChangeLine[] {
  const current = new Map(rows.map((row) => [row.position, row]));
  const computed = new Map(computedRows.map((row) => [row.position, row]));
  const lines: ChangeLine[] = [];
  for (const change of changes) {
    const row = current.get(change.position);
    const base = computed.get(change.position);
    if (!row || !base) continue;
    const next = applyChange(row, base, change);
    current.set(change.position, next);
    const was = fieldValue(row, change.field);
    const now = fieldValue(next, change.field);
    let text: string;
    if (change.field === "explanation") text = change.restore ? "back to the computed text" : "rewritten";
    else if (change.field === "comment") text = !now ? "removed" : !was ? `added – “${clip(now)}”` : `changed – “${clip(now)}”`;
    else if (change.field === "release_note") text = `${was || "none"} → ${now || "none"}`;
    else text = `${displayValue(change.field, was)} → ${displayValue(change.field, now)}`;
    if (change.restore && change.field !== "explanation" && change.field !== "comment") text += " (computed)";
    lines.push({ position: change.position, field: change.field, text: `${FIELD_LABEL[change.field]}: ${text}` });
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------------------------------
// Table view
// ---------------------------------------------------------------------------------------------------------------------

const SORT_LABEL: Record<ReviewSort, string> = {
  deviation_desc: "largest deviation first",
  deviation_asc: "smallest deviation first",
  score_desc: "highest score first",
  score_asc: "lowest score first",
  position: "sorted by position",
};

/** A view that narrows or reorders the table (the default view is every deviating position, largest deviation first). */
export const isNarrowingView = (view: ReviewView | null | undefined): view is ReviewView =>
  Boolean(view && (view.statuses.length || view.positions.length || view.hide_positions.length || view.sort !== "deviation_desc"));

export function viewLabel(view: ReviewView): string {
  const parts: string[] = [];
  if (view.statuses.length) parts.push(`only ${view.statuses.map((status) => STATUS_LABEL[status]).join(", ")}`);
  if (view.positions.length) parts.push(`only ${clip(view.positions.join(", "), 60)}`);
  if (view.hide_positions.length) parts.push(`${clip(view.hide_positions.join(", "), 60)} hidden`);
  if (view.show_unchanged && !view.statuses.length) parts.push("unchanged positions shown");
  if (view.sort !== "deviation_desc") parts.push(SORT_LABEL[view.sort]);
  return parts.length ? parts.join(" · ") : "every deviating position, largest deviation first";
}

/** The rows the table shows: deviating ones (unchanged ones on request), narrowed by the review's view and the filter. */
export function visibleRows(rows: RootCauseRow[], view: ReviewView | null, showUnchanged: boolean, filter: string): RootCauseRow[] {
  const query = filter.trim().toLowerCase();
  const sort = view?.sort ?? "deviation_desc";
  const size = (row: RootCauseRow) => Math.abs(toNumber(row.difference) ?? 0);
  const score = (row: RootCauseRow) => toNumber(row.confidence) ?? 0;
  return rows
    .filter((row) => showUnchanged || isChanged(row))
    .filter((row) => !view?.statuses.length || view.statuses.includes(statusOf(row)))
    .filter((row) => !view?.positions.length || view.positions.includes(row.position))
    .filter((row) => !view?.hide_positions.includes(row.position))
    .filter((row) => !query || row.position.toLowerCase().includes(query))
    .sort((left, right) => {
      const changed = Number(isChanged(right)) - Number(isChanged(left));
      if (changed) return changed;
      switch (sort) {
        case "deviation_asc":
          return size(left) - size(right);
        case "score_desc":
          return score(right) - score(left) || size(right) - size(left);
        case "score_asc":
          return score(left) - score(right) || size(right) - size(left);
        case "position":
          return left.position.localeCompare(right.position, undefined, { numeric: true });
        default:
          return size(right) - size(left);
      }
    });
}

// ---------------------------------------------------------------------------------------------------------------------
// The chat
// ---------------------------------------------------------------------------------------------------------------------

const hasEffect = (turn: ReviewTurn) =>
  Boolean(turn.changes?.length || turn.summary || turn.restoreSummary || turn.nextChecks || turn.restoreNextChecks || turn.view);

/** The answer whose edits the Undo button takes back: the latest one that changed something and is still applied. */
export function undoableTurn(turns: ReviewTurn[]): string | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn.role === "assistant" && !turn.error && !turn.undone && hasEffect(turn)) return turn.id;
  }
  return null;
}

/** The conversation for the review assistant: messages without the failed ones, with what each answer changed. */
export function requestHistory(turns: ReviewTurn[]) {
  const kept = turns.filter((turn, index) => !turn.error && !(turn.role === "user" && turns[index + 1]?.error));
  return kept.slice(-16).map((turn) => ({
    role: turn.role,
    content: turn.text,
    changes: (turn.changes ?? []).map((change) => ({ position: change.position, field: change.field, value: change.field === "explanation" ? "" : change.value ?? "", restore: Boolean(change.restore) })),
    summary: Boolean(turn.summary || turn.restoreSummary),
    next_checks: Boolean(turn.nextChecks || turn.restoreNextChecks),
    view: Boolean(turn.view),
    undone: Boolean(turn.undone),
  }));
}

/** The rows as the review assistant gets them: as the table shows them, with the computed value of each reviewed field. */
export function requestRows(rows: RootCauseRow[], computedRows: RootCauseRow[]) {
  const computed = new Map(computedRows.map((row) => [row.position, row]));
  return rows.map((row) => {
    if (!isChanged(row)) return { position: row.position, changed: false, status: statusOf(row) };
    const edits = editsOf(row, computed.get(row.position));
    return {
      position: row.position,
      changed: true,
      status: statusOf(row),
      score: toNumber(row.confidence),
      value_a: row.value_a ?? null,
      value_b: row.value_b ?? null,
      difference: row.difference ?? null,
      input: row.input ?? "",
      release_note: row.release_note ?? "",
      explanation: row.explanation ?? "",
      comment: row.comment ?? "",
      chains: row.chains ?? [],
      other_chains: row.other_chains ?? [],
      values: row.values ?? {},
      notes: row.notes ?? [],
      edited: Object.fromEntries(
        Object.entries(edits).map(([field, value]) => [field, field === "score" ? Number(value) : field === "explanation" ? null : value]),
      ),
    };
  });
}

/** Prompts to start with, from the result. */
export function reviewSuggestions(rows: RootCauseRow[]): string[] {
  const deviating = rows.filter(isChanged);
  const size = (row: RootCauseRow) => Math.abs(toNumber(row.difference) ?? 0);
  const open = deviating.filter((row) => statusOf(row) !== "explained").sort((left, right) => size(right) - size(left));
  const items: string[] = [];
  if (open[0]) items.push(`Why is ${open[0].position} ${statusOf(open[0]) === "partial" ? "only partially explained" : "not explained"}?`);
  if (open.length && open.length < deviating.length) items.push("Show only the positions that are not fully explained");
  if (deviating.length) items.push("Shorten every explanation to one sentence");
  items.push("Translate the summary into English");
  return items.slice(0, 4);
}
