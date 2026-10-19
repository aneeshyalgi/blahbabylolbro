import type { Verification } from "./atoms";
import type { Analysis, LineageColumn, LineageNode, Result, Step } from "./types";

export interface Model {
  result: Result;
  analysis: Analysis;
  byName: Map<string, LineageColumn>;
  columnNames: Set<string>;
  stepByLine: Map<number, Step>;
  /** Top-level statement containing a line. */
  stepOf: (line: number) => Step | undefined;
  /** Write nodes per top-level statement line. */
  writesByStep: Map<number, LineageNode[]>;
  /** Lines (with continuation lines) belonging to a column's lineage, for highlighting. */
  linesOf: (column: string) => Set<number>;
  verification: (column: string) => Verification;
  /** The write of ``column`` in the statement starting at ``line`` (the last one, for loops). */
  writeAt: (column: string, line: number) => LineageNode | undefined;
  rawInputs: Set<string>;
  /** Set when the AI texts are shown as a translation: the language the AI wrote in. */
  translatedFrom: string | null;
}

export function buildModel(result: Result, translatedFrom: string | null = null): Model {
  const analysis = result.analysis;
  const byName = new Map(analysis.columns.map((column) => [column.name, column]));
  const columnNames = new Set<string>([...analysis.inputs, ...analysis.outputs, ...analysis.columns.map((column) => column.name)]);
  const stepByLine = new Map(analysis.steps.map((step) => [step.line, step]));
  const stepOf = (line: number) => analysis.steps.find((step) => step.line <= line && line <= step.end_line);
  const writesByStep = new Map<number, LineageNode[]>();
  for (const step of analysis.steps) {
    writesByStep.set(step.line, step.writes.map((id) => analysis.nodes[id]));
  }
  const lineCache = new Map<string, Set<number>>();
  const linesOf = (column: string) => {
    const cached = lineCache.get(column);
    if (cached) return cached;
    const lines = new Set<number>();
    const item = byName.get(column);
    for (const id of item?.chain ?? []) {
      const node = analysis.nodes[id];
      if (!node.line) continue;
      for (let line = node.line; line <= (node.end_line ?? node.line); line += 1) lines.add(line);
      for (const name of node.uses ?? []) {
        const span = analysis.variables[name];
        if (span) for (let line = span.line; line <= span.end_line; line += 1) lines.add(line);
      }
    }
    for (const name of item?.lookups ?? []) {
      const lookup = analysis.lookups.find((entry) => entry.name === name);
      if (lookup) for (let line = lookup.line; line <= lookup.end_line; line += 1) lines.add(line);
    }
    lineCache.set(column, lines);
    return lines;
  };
  const dependencies = result.runtime.dependencies;
  const probesEnabled = result.runtime.probes.enabled;
  const verification = (column: string): Verification => {
    const item = byName.get(column);
    if (!item) return "unprobed";
    if (item.role === "passthrough") return "passthrough";
    if (!probesEnabled) return "unprobed";
    const dependency = dependencies[column];
    if (!dependency) return "unprobed";
    if (dependency.runtime_only.length) return "discrepancy";
    const staticOnly = dependency.static_only.filter((name) => name !== column);
    return staticOnly.length ? "partial" : "verified";
  };
  const writeAt = (column: string, line: number) => {
    const writes = (writesByStep.get(line) ?? []).filter((node) => node.column === column);
    return writes[writes.length - 1];
  };
  const rawInputs = new Set(analysis.columns.filter((column) => column.in_input && (column.role === "passthrough" || column.role === "dropped")).map((column) => column.name));
  return { result, analysis, byName, columnNames, stepByLine, stepOf, writesByStep, linesOf, verification, writeAt, rawInputs, translatedFrom };
}
