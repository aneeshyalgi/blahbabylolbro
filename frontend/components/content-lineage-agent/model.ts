import type { Case, Flow, Result, Rule, Term, TermRole, Texts, Use } from "./types";

/** Results of the earlier version of the agent (backward from reported figures) cannot be shown by this one. */
export const isForwardResult = (result: Result | null | undefined): result is Result => Boolean(result && result.mode === "forward" && result.flows && result.scope?.field);

/** How the content travels along one link of the lineage: its value is carried, it decides a case or parameter (a
 *  condition or table key), or only re-running the calculation shows the link (the code does not show how). */
export type LinkKind = "value" | "decides" | "impact";

export interface Link {
  from: string;
  to: string;
  kind: LinkKind;
}

/**
 * Everything the view needs about one analysis, with the AI texts in the tab's language. The agent writes in the
 * language of the run and translates every text; a text missing in the shown language falls back to the original.
 */
export class Model {
  readonly result: Result;
  readonly texts: Texts;
  readonly original: Texts;
  /** The field whose content the analysis follows. */
  readonly field: string;
  /** Every downstream field, in the order of the calculation. */
  readonly downstream: string[];
  readonly termBy: Map<string, Term>;
  readonly ruleOfColumn: Map<string, Rule>;
  readonly caseBy: Map<string, Case>;
  readonly flowBy: Map<string, Flow>;
  /** The selected field and every downstream field: the fields that carry its content. */
  readonly carriers: Set<string>;
  /** The links between the fields that carry the content (from the selected field or a downstream field to a downstream field). */
  readonly links: Link[];

  constructor(result: Result, locale: string) {
    this.result = result;
    this.original = result.ai.texts[result.ai.language] ?? Object.values(result.ai.texts)[0];
    this.texts = result.ai.texts[locale] ?? this.original;
    this.field = result.scope.field;
    this.downstream = result.scope.fields;
    this.carriers = new Set([this.field, ...this.downstream]);
    this.termBy = new Map(result.terms.map((term) => [term.column, term]));
    this.ruleOfColumn = new Map(result.rules.map((rule) => [rule.column, rule]));
    this.caseBy = new Map(result.rules.flatMap((rule) => rule.cases.map((item) => [item.id, item] as const)));
    this.flowBy = new Map(Object.entries(result.flows));
    const downstream = new Set(this.downstream);
    const links = new Map<string, Link>();
    for (const edge of result.scope.edges) {
      if (!this.carriers.has(edge.from) || !downstream.has(edge.to) || edge.from === edge.to) continue;
      const kind: LinkKind = edge.roles.includes("value") ? "value" : edge.roles.length === 0 || edge.roles.every((role) => role === "impact") ? "impact" : "decides";
      links.set(`${edge.from}>${edge.to}`, { from: edge.from, to: edge.to, kind });
    }
    this.links = [...links.values()];
  }

  role(column: string): TermRole {
    return this.termBy.get(column)?.role ?? "context";
  }

  termName(column: string): string {
    return this.texts.terms[column]?.name || this.original.terms[column]?.name || column;
  }

  definition(column: string): string {
    return this.texts.terms[column]?.definition || this.original.terms[column]?.definition || "";
  }

  /** How the selected field reaches a downstream field (AI text). */
  usage(column: string): string {
    return this.texts.usage?.[column] || this.original.usage?.[column] || "";
  }

  ruleName(rule: string): string {
    return this.texts.rules[rule]?.name || this.original.rules[rule]?.name || rule;
  }

  ruleStatement(rule: string): string {
    return this.texts.rules[rule]?.statement || this.original.rules[rule]?.statement || "";
  }

  caseLabel(caseId: string): string {
    const rule = caseId.split(".")[0];
    return this.texts.rules[rule]?.cases[caseId]?.label || this.original.rules[rule]?.cases[caseId]?.label || caseId;
  }

  caseDescription(caseId: string): string {
    const rule = caseId.split(".")[0];
    return this.texts.rules[rule]?.cases[caseId]?.description || this.original.rules[rule]?.cases[caseId]?.description || "";
  }

  /** Values of a field are factors or rates (shown in percent). */
  isFactor(column: string): boolean {
    return Boolean(this.termBy.get(column)?.factor);
  }

  /** The step of a field in the lineage: 0 for the selected field, 1 for its next fields, and so on. */
  level(column: string): number {
    return column === this.field ? 0 : this.flowBy.get(column)?.level ?? 1;
  }

  /** The fields grouped by their step: the selected field first, then its next fields, up to the end of the calculation. */
  steps(): { level: number; columns: string[] }[] {
    const groups = new Map<number, string[]>([[0, [this.field]]]);
    for (const column of this.downstream) {
      const level = this.level(column);
      groups.set(level, [...(groups.get(level) ?? []), column]);
    }
    return [...groups.entries()].sort(([a], [b]) => a - b).map(([level, columns]) => ({ level, columns }));
  }

  /** The fields the content passes through on its way to a field (the selected field included). */
  ancestors(column: string): Set<string> {
    const found = new Set<string>();
    const stack = [column];
    while (stack.length) {
      const current = stack.pop()!;
      for (const link of this.links) {
        if (link.to === current && !found.has(link.from)) {
          found.add(link.from);
          stack.push(link.from);
        }
      }
    }
    return found;
  }

  /** The fields the content of a field reaches further on. */
  descendants(column: string): Set<string> {
    const found = new Set<string>();
    const stack = [column];
    while (stack.length) {
      const current = stack.pop()!;
      for (const link of this.links) {
        if (link.from === current && !found.has(link.to)) {
          found.add(link.to);
          stack.push(link.to);
        }
      }
    }
    return found;
  }

  /** What a case reads of the selected field's content (the field itself or a downstream field), with how it uses it. */
  carriedReads(caseId: string): { column: string; roles: Use[] }[] {
    const item = this.caseBy.get(caseId);
    if (!item) return [];
    return Object.entries(item.roles)
      .filter(([column]) => column !== item.column && this.carriers.has(column))
      .map(([column, roles]) => ({ column, roles }));
  }
}
