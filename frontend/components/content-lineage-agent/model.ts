import type { Assessment, Case, Link, Relation, Result, Rule, Term, Texts, Verdict } from "./types";

export interface Provision {
  /** regulation id + unit + cited reference. */
  key: string;
  link: Link;
  rules: { rule: string; relation: Relation; index: number }[];
  verdict: Verdict;
}

export interface TokenInfo {
  column: string;
  rule: string | null;
  case: string | null;
  key: string | null;
  delivered: boolean;
}

const VERDICT_ORDER: Verdict[] = ["not_covered", "unverified", "consistent", "simplified", "deviation"];

export function worstVerdict(verdicts: Verdict[]): Verdict {
  return verdicts.reduce<Verdict>((worst, verdict) => (VERDICT_ORDER.indexOf(verdict) > VERDICT_ORDER.indexOf(worst) ? verdict : worst), "not_covered");
}

/** One node per cited provision (Article 111(1) and Article 111(2) are two), however many rules cite it. */
export const provisionKey = (link: Pick<Link, "regulation_id" | "unit" | "reference">) => `${link.regulation_id}:${link.unit}:${link.reference}`;

/**
 * Everything the views need about one analysis, with the AI texts in the tab's language. The agent writes in the
 * language of the run and translates every text; a text missing in the shown language falls back to the original.
 */
export class Model {
  readonly result: Result;
  readonly texts: Texts;
  readonly original: Texts;
  /** Set when the texts are a translation: the language the AI originally wrote in. */
  readonly translatedFrom: string | null;
  readonly termBy: Map<string, Term>;
  readonly ruleBy: Map<string, Rule>;
  readonly ruleOfColumn: Map<string, Rule>;
  readonly caseBy: Map<string, Case>;
  readonly provisions: Provision[];
  readonly provisionBy: Map<string, Provision>;
  readonly figures: string[];

  constructor(result: Result, locale: string) {
    this.result = result;
    const originalLanguage = result.ai.language;
    this.original = result.ai.texts[originalLanguage] ?? Object.values(result.ai.texts)[0];
    const shown = result.ai.texts[locale];
    this.texts = shown ?? this.original;
    this.translatedFrom = shown && locale !== originalLanguage ? originalLanguage : null;
    this.termBy = new Map(result.terms.map((term) => [term.column, term]));
    this.ruleBy = new Map(result.rules.map((rule) => [rule.id, rule]));
    this.ruleOfColumn = new Map(result.rules.map((rule) => [rule.column, rule]));
    this.caseBy = new Map(result.rules.flatMap((rule) => rule.cases.map((item) => [item.id, item] as const)));
    this.figures = result.scope.figures;
    const provisions = new Map<string, Provision>();
    for (const rule of result.rules) {
      const assessment = result.regulation.rules[rule.id];
      if (!assessment) continue;
      assessment.links.forEach((link, index) => {
        const key = provisionKey(link);
        const entry = provisions.get(key) ?? { key, link, rules: [], verdict: "not_covered" as Verdict };
        entry.rules.push({ rule: rule.id, relation: link.relation, index });
        provisions.set(key, entry);
      });
    }
    for (const entry of provisions.values()) {
      entry.verdict = worstVerdict(entry.rules.map((item) => this.provisionVerdict(item.rule, item.index)));
    }
    this.provisions = [...provisions.values()];
    this.provisionBy = provisions;
  }

  /** The verdict a provision carries for one rule: its own findings, else the rule's verdict. */
  provisionVerdict(rule: string, index: number): Verdict {
    const assessment = this.result.regulation.rules[rule];
    if (!assessment) return "not_covered";
    const own = assessment.findings.filter((finding) => finding.link === index).map((finding) => finding.verdict as Verdict);
    return own.length ? worstVerdict(own) : assessment.verdict;
  }

  termName(column: string): string {
    return this.texts.terms[column]?.name || this.original.terms[column]?.name || column;
  }

  definition(column: string): string {
    return this.texts.terms[column]?.definition || this.original.terms[column]?.definition || "";
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

  assessment(rule: string): Assessment | undefined {
    return this.result.regulation.rules[rule];
  }

  regulationText(rule: string) {
    return this.texts.regulation[rule] ?? this.original.regulation[rule] ?? { explanation: "", links: [], findings: [], issues: [] };
  }

  /** A content-path token: 'R4.1', 'R5.1|OffBalance' or 'EAD|delivered'. */
  token(token: string): TokenInfo {
    if (token.endsWith("|delivered")) {
      return { column: token.slice(0, -"|delivered".length), rule: null, case: null, key: null, delivered: true };
    }
    const [caseId, ...rest] = token.split("|");
    const item = this.caseBy.get(caseId);
    return { column: item?.column ?? caseId, rule: item?.rule ?? null, case: caseId, key: rest.length ? rest.join("|") : null, delivered: false };
  }

  /** The parameter a lookup case applies to a key, e.g. 0.2 for 'OffBalance'. */
  parameter(caseId: string, key: string | null): unknown {
    if (!key) return undefined;
    return this.caseBy.get(caseId)?.keys.find((item) => item.key === key)?.value;
  }

  /** A table of factors (every value a number between 0 and 12.5, one below 1.5) is shown in percent. */
  percentTable(caseId: string): boolean {
    const values = (this.caseBy.get(caseId)?.lookup?.entries ?? []).map(([, value]) => value);
    return values.length > 0 && values.every((value) => typeof value === "number" && value >= 0 && value <= 12.5) && values.some((value) => (value as number) < 1.5);
  }

  /** Every rule upstream of a term, nearest first. */
  upstreamRules(column: string): Rule[] {
    const seen = new Set<string>();
    const order: Rule[] = [];
    const visit = (name: string) => {
      const rule = this.ruleOfColumn.get(name);
      if (!rule || seen.has(rule.id)) return;
      seen.add(rule.id);
      order.push(rule);
      for (const input of [...rule.inputs, ...rule.selectors]) visit(input);
    };
    visit(column);
    return order;
  }
}
