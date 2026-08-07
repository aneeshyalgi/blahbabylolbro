export type GuidedMappingEntry = {
  key: string;
  value: string;
};

export type GuidedMapping = {
  id: string;
  variable: string;
  start: number;
  end: number;
  entries: GuidedMappingEntry[];
};

export type GuidedRule = {
  id: string;
  target: string;
  start: number;
  end: number;
  indent: string;
  expression: string;
  fillMissing: boolean;
};

export type GuidedDocument = {
  mappings: GuidedMapping[];
  rules: GuidedRule[];
};

export function humanizeIdentifier(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function sourceExpressionToFriendly(expression: string): string {
  return expression.replace(
    /df\[(?:'([^']+)'|"([^"]+)")\]/g,
    (_match, singleQuoted: string | undefined, doubleQuoted: string | undefined) =>
      `[${singleQuoted ?? doubleQuoted}]`,
  );
}

export function friendlyExpressionToSource(expression: string): string {
  return expression
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\[([^\]]+)\]/g, (_match, column: string) => `df['${column.trim()}']`);
}

export function parseGuidedCode(source: string): GuidedDocument {
  const mappings: GuidedMapping[] = [];
  const mappingPattern = /^([A-Za-z_]\w*)\s*=\s*\{\s*\r?\n([\s\S]*?)^\}/gm;

  for (const match of source.matchAll(mappingPattern)) {
    if (match.index == null) continue;
    const entries: GuidedMappingEntry[] = [];
    const entryPattern = /^\s*(['"])(.*?)\1\s*:\s*(.+?)\s*,?\s*$/gm;
    for (const entryMatch of match[2].matchAll(entryPattern)) {
      entries.push({
        key: entryMatch[2],
        value: entryMatch[3].replace(/,\s*$/, "").trim(),
      });
    }
    if (entries.length === 0) continue;
    mappings.push({
      id: `${match[1]}-${match.index}`,
      variable: match[1],
      start: match.index,
      end: match.index + match[0].length,
      entries,
    });
  }

  const rules: GuidedRule[] = [];
  const assignmentPattern = /^([ \t]*)df\[(['"])(.*?)\2\]\s*=\s*(.+)$/gm;
  for (const match of source.matchAll(assignmentPattern)) {
    if (match.index == null) continue;
    const target = match[3];
    const rightHandSide = match[4].trim();
    const fillMatch = rightHandSide.match(/^df\[(?:'[^']+'|"[^"]+")\]\.fillna\((.*)\)$/);
    rules.push({
      id: `${target}-${match.index}`,
      target,
      start: match.index,
      end: match.index + match[0].length,
      indent: match[1],
      expression: sourceExpressionToFriendly(fillMatch?.[1] ?? rightHandSide),
      fillMissing: Boolean(fillMatch),
    });
  }

  return { mappings, rules };
}

function replaceRange(source: string, start: number, end: number, replacement: string): string {
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

export function updateGuidedMapping(
  source: string,
  mapping: GuidedMapping,
  entries: GuidedMappingEntry[],
): string {
  const body = entries
    .map((entry) => `    ${JSON.stringify(entry.key)}: ${entry.value || "None"},`)
    .join("\n");
  return replaceRange(source, mapping.start, mapping.end, `${mapping.variable} = {\n${body}\n}`);
}

export function updateGuidedRule(source: string, rule: GuidedRule, expression: string): string {
  const sourceExpression = friendlyExpressionToSource(expression.trim() || "None");
  const rightHandSide = rule.fillMissing
    ? `df['${rule.target}'].fillna(${sourceExpression})`
    : sourceExpression;
  return replaceRange(
    source,
    rule.start,
    rule.end,
    `${rule.indent}df['${rule.target}'] = ${rightHandSide}`,
  );
}