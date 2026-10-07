import type { Check, NoteResult, Run } from "./types";

/**
 * A run as the reader sees it in `language`: the AI-written texts from the note's translation (when the run has one),
 * the verification messages and log lines from their German / English versions, and the glossary concepts by their
 * name in that language. Quotes from the release note and the regulation always stay verbatim.
 */
export function localizeRun(run: Run, language: string): Run {
  const conceptNames = run.concept_names?.[language] ?? null;
  return {
    ...run,
    log: run.log.map((entry) => {
      const message = entry.i18n?.[language];
      return message ? { ...entry, message } : entry;
    }),
    notes: run.notes.map((note) => localizeNote(note, language, conceptNames)),
  };
}

function localizeNote(note: NoteResult, language: string, conceptNames: Record<string, string> | null): NoteResult {
  const fields = note.translations?.[language];
  const rename = (names: unknown) => (Array.isArray(names) && conceptNames ? names.map((name) => conceptNames[String(name)] ?? name) : names);
  const localized: NoteResult = { ...note };

  const interpretation = note.interpretation;
  if (interpretation && fields) {
    localized.interpretation = {
      ...interpretation,
      summary: fields.summary ?? interpretation.summary,
      concepts: interpretation.concepts.map((concept, index) => ({
        ...concept,
        term: fields.terms?.[String(index)] ?? concept.term,
        effect: fields.effects?.[String(index)] ?? concept.effect,
      })),
      affected_items: interpretation.affected_items.map((item, index) => fields.affected_items?.[String(index)] ?? item),
    };
  }
  if (note.assessment && interpretation && note.assessment === interpretation.summary) {
    // The page hides an assessment that repeats the summary; keep them equal in every language.
    localized.assessment = localized.interpretation?.summary ?? note.assessment;
  } else if (fields?.assessment) {
    localized.assessment = fields.assessment;
  }
  if (fields?.no_link_reason) localized.no_link_reason = fields.no_link_reason;
  if (note.corrections_i18n?.[language]) localized.corrections = note.corrections_i18n[language];

  if (note.links) {
    localized.links = note.links.map((link, index) => {
      const texts = fields?.links?.[String(index)];
      return {
        ...link,
        rationale: texts?.rationale ?? link.rationale,
        affected_element: texts?.affected_element ?? link.affected_element,
        checks: link.checks.map((check): Check => {
          if (check.id === "review" && texts?.review_reason) return { ...check, params: { ...check.params, reason: texts.review_reason } };
          if (check.id === "concept" && conceptNames) return { ...check, params: { ...check.params, concepts: rename(check.params.concepts), note: rename(check.params.note) } };
          return check;
        }),
      };
    });
  }
  if (note.rejected) {
    localized.rejected = note.rejected.map((item, index) => ({
      ...item,
      reason: item.reason_i18n?.[language] ?? fields?.rejected?.[String(index)] ?? item.reason,
    }));
  }
  return localized;
}

/** Languages in which the run's AI-written texts can be read: the run language plus every translation. */
export function textLanguages(run: Run): string[] {
  const languages = new Set<string>([run.language]);
  for (const note of run.notes) {
    for (const language of Object.keys(note.translations ?? {})) {
      // Only translations of the run's own texts count: a German run also carries German names of its English regulation terms.
      const fields = note.translations![language];
      if (fields.summary || fields.links || fields.no_link_reason) languages.add(language);
    }
  }
  return Array.from(languages);
}
