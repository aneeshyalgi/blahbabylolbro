import type { Result } from "./types";

export interface LocalizedResult {
  result: Result;
  /** The language the AI texts are shown in. */
  shown: string;
  /** Set when the texts are a translation: the language the AI originally wrote in. */
  translatedFrom: string | null;
}

/**
 * The run's AI texts in the UI language. The agent writes in the language of the run and translates every text into
 * English and German; citations, inputs and column names are identical in every language.
 */
export function localizeResult(result: Result, locale: string, runLanguage: string): LocalizedResult {
  const original = result.ai.language ?? runLanguage;
  const translation = locale === original ? undefined : result.ai.translations?.[locale];
  if (!translation) return { result, shown: original, translatedFrom: null };
  const ai = structuredClone(result.ai);
  if (ai.overview && translation.overview) {
    ai.overview.purpose = translation.overview.purpose || ai.overview.purpose;
    ai.overview.stages.forEach((stage, index) => {
      const text = translation.overview!.stages[index];
      if (!text) return;
      stage.title = text.title || stage.title;
      stage.description = text.description || stage.description;
    });
  }
  for (const [column, text] of Object.entries(translation.columns ?? {})) {
    const doc = ai.columns[column];
    if (!doc || doc.status !== "documented") continue;
    if (text.meaning) doc.meaning = text.meaning;
    if (text.summary) doc.summary = text.summary;
    if (text.formula) doc.formula = text.formula;
    doc.rules?.forEach((rule, index) => {
      if (text.rules[index]) rule.text = text.rules[index];
    });
    doc.notes?.forEach((note, index) => {
      if (text.notes[index]) note.text = text.notes[index];
    });
    if (doc.review && text.review_issues?.length === doc.review.issues.length) doc.review.issues = text.review_issues;
  }
  if (ai.investigation && translation.investigation) {
    ai.investigation.findings.forEach((finding, index) => {
      const text = translation.investigation![index];
      if (!text) return;
      finding.title = text.title || finding.title;
      finding.detail = text.detail || finding.detail;
    });
  }
  return { result: { ...result, ai }, shown: locale, translatedFrom: original };
}
