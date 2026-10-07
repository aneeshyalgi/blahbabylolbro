import type { Verification } from "./atoms";
import type { Analysis, LineageColumn, LineageNode, Result, Step, Transformation } from "./types";

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

export interface MappingRow {
  key: string;
  output: string;
  input: string;
  inputKind: "column" | "self" | "lookup" | "none";
  transformations: Transformation[];
  operations: string[];
  lines: number[];
  verification: "confirmed" | "confirmed_via" | "not_observable" | "passthrough" | "none";
  historical: boolean;
}

/** Operations of the writes of a column that read a given column (its own name: the writes that keep or adjust its value). */
export function operationsByInput(model: Model, column: string): Map<string, string[]> {
  const { analysis } = model;
  const result = new Map<string, string[]>();
  for (const id of model.byName.get(column)?.chain ?? []) {
    const node = analysis.nodes[id];
    if (!node.operation) continue;
    const read = new Set<string>([
      ...node.data.map((item) => analysis.nodes[item.node].column),
      ...node.control.map((item) => analysis.nodes[item].column),
      ...node.group.map((item) => analysis.nodes[item].column),
      ...(node.join ?? []).map((item) => analysis.nodes[item].column),
    ]);
    if (node.operation === "cast" || node.reads_self || node.retained) read.add(column);
    for (const name of read) {
      const list = result.get(name) ?? [];
      if (!list.includes(node.operation)) list.push(node.operation);
      result.set(name, list);
    }
  }
  return result;
}

/** The classic Input → Output → Function table, one row per (output, input) pair. */
export function mappingRows(model: Model): MappingRow[] {
  const { analysis, result } = model;
  const rows: MappingRow[] = [];
  const dependencies = result.runtime.dependencies;
  const probes = result.runtime.probes.enabled;
  const inputs = new Set(analysis.inputs);
  for (const column of analysis.columns) {
    if (!column.in_output) continue;
    const confirmed = new Set(dependencies[column.name]?.confirmed ?? []);
    const operations = operationsByInput(model, column.name);
    // An input column is confirmed when changing it changed this column; a column the script creates is confirmed
    // through its own source columns.
    const status = (name: string): MappingRow["verification"] => {
      if (!probes) return "none";
      if (confirmed.has(name)) return "confirmed";
      if (!inputs.has(name)) {
        const sources = (model.byName.get(name)?.sources ?? []).map((source) => source.column);
        if (sources.length && sources.every((source) => confirmed.has(source))) return "confirmed_via";
      }
      return "not_observable";
    };
    const chainLines = [...new Set(column.chain.map((id) => analysis.nodes[id].line).filter((line): line is number => Boolean(line)))].sort((a, b) => a - b);
    if (column.role === "passthrough") {
      rows.push({
        key: `${column.name}|self`, output: column.name, input: column.name, inputKind: "self",
        transformations: [{ type: "DIRECT", subtype: "IDENTITY" }], operations: [], lines: [], verification: "passthrough", historical: false,
      });
      continue;
    }
    if (column.input_used) {
      rows.push({
        key: `${column.name}|self`, output: column.name, input: column.name, inputKind: "self",
        transformations: [{ type: "DIRECT", subtype: "IDENTITY" }], operations: operations.get(column.name) ?? column.operations, lines: chainLines,
        verification: status(column.name), historical: false,
      });
    }
    for (const entry of column.upstream) {
      rows.push({
        key: `${column.name}|${entry.column}`, output: column.name, input: entry.column, inputKind: "column",
        transformations: entry.transformations, operations: operations.get(entry.column) ?? column.operations, lines: entry.lines,
        verification: status(entry.column), historical: entry.historical,
      });
    }
    for (const lookup of column.lookups) {
      rows.push({
        key: `${column.name}|lookup:${lookup}`, output: column.name, input: lookup, inputKind: "lookup",
        transformations: [{ type: "DIRECT", subtype: "TRANSFORMATION" }], operations: ["lookup"],
        lines: analysis.lookups.find((item) => item.name === lookup)?.used_in_lines ?? [], verification: "none", historical: false,
      });
    }
    if (!column.upstream.length && !column.input_used && !column.lookups.length) {
      rows.push({
        key: `${column.name}|none`, output: column.name, input: "", inputKind: "none", transformations: [], operations: column.operations,
        lines: chainLines, verification: "none", historical: false,
      });
    }
  }
  return rows;
}
