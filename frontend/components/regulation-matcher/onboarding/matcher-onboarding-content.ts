/**
 * Copy and step definitions for the Regulation–Release Note Matcher onboarding (English / German).
 * Regulation terms such as article titles stay in English where the regulation text itself is English.
 */

export type MatcherLocale = "en" | "de";

export type DeckScreen = "language" | "welcome" | "challenge" | "pipeline" | "anatomy" | "grades" | "controls" | "ready";
export const DECK_SCREENS: DeckScreen[] = ["language", "welcome", "challenge", "pipeline", "anatomy", "grades", "controls", "ready"];

export type TourStage = "setup" | "progress" | "results";
export type ResultsTab = "evidence" | "matrix" | "provisions" | "audit";
export type TourAction = "selectFile" | "selectRegulation" | "startRun" | "awaitResults";

export type TourStepId =
  | "header"
  | "language"
  | "releaseNotes"
  | "regulations"
  | "method"
  | "runBar"
  | "progress"
  | "stages"
  | "liveLog"
  | "meta"
  | "kpis"
  | "tabs"
  | "noteList"
  | "noteCard"
  | "interpretation"
  | "link"
  | "quotes"
  | "checks"
  | "linkActions"
  | "dismissed"
  | "retrieval"
  | "matrix"
  | "provisions"
  | "audit"
  | "newRun";

export type TourStepDef = {
  id: TourStepId;
  /** data-tour attribute of the element to spotlight. */
  target: string;
  stage: TourStage;
  /** Results tab the step lives on. */
  tab?: ResultsTab;
  /** Steps with an action wait for the user (or "Do it for me"). */
  action?: TourAction;
  /** Open the collapsible section that is spotlighted. */
  expand?: boolean;
};

export const TOUR_STEPS: TourStepDef[] = [
  { id: "header", target: "matcher-header", stage: "setup" },
  { id: "language", target: "matcher-language", stage: "setup" },
  { id: "releaseNotes", target: "matcher-release-notes", stage: "setup", action: "selectFile" },
  { id: "regulations", target: "matcher-regulations", stage: "setup", action: "selectRegulation" },
  { id: "method", target: "matcher-method", stage: "setup" },
  { id: "runBar", target: "matcher-run-bar", stage: "setup", action: "startRun" },
  { id: "progress", target: "matcher-progress", stage: "progress" },
  { id: "stages", target: "matcher-stages", stage: "progress" },
  { id: "liveLog", target: "matcher-live-log", stage: "progress", action: "awaitResults" },
  { id: "meta", target: "matcher-meta", stage: "results", tab: "evidence" },
  { id: "kpis", target: "matcher-kpis", stage: "results", tab: "evidence" },
  { id: "tabs", target: "matcher-tabs", stage: "results", tab: "evidence" },
  { id: "noteList", target: "matcher-note-list", stage: "results", tab: "evidence" },
  { id: "noteCard", target: "matcher-note-card", stage: "results", tab: "evidence" },
  { id: "interpretation", target: "matcher-interpretation", stage: "results", tab: "evidence" },
  { id: "link", target: "matcher-link-head", stage: "results", tab: "evidence" },
  { id: "quotes", target: "matcher-quotes", stage: "results", tab: "evidence" },
  { id: "checks", target: "matcher-checks", stage: "results", tab: "evidence" },
  { id: "linkActions", target: "matcher-link-actions", stage: "results", tab: "evidence" },
  { id: "dismissed", target: "matcher-dismissed", stage: "results", tab: "evidence", expand: true },
  { id: "retrieval", target: "matcher-retrieval", stage: "results", tab: "evidence", expand: true },
  { id: "matrix", target: "matcher-matrix", stage: "results", tab: "matrix" },
  { id: "provisions", target: "matcher-provisions-view", stage: "results", tab: "provisions" },
  { id: "audit", target: "matcher-audit-view", stage: "results", tab: "audit" },
  { id: "newRun", target: "matcher-new-run", stage: "results", tab: "evidence" },
];

type TourText = { chapter: string; title: string; body: string[]; action?: string; empty?: string };

export type MatcherOnboardingCopy = {
  ui: {
    product: string;
    minutes: string;
    skipIntro: string;
    skipTour: string;
    back: string;
    next: string;
    begin: string;
    continue: string;
    startTour: string;
    finish: string;
    doItForMe: string;
    endTour: string;
    runFailed: string;
    startAgain: string;
    yourTurn: string;
    watch: string;
    wellDone: string;
    stepOf: string;
    keyboard: string;
    chapters: string[];
  };
  language: { title: string; subtitle: string; hint: string; defaultBadge: string; options: Record<MatcherLocale, { name: string; native: string }> };
  welcome: { eyebrow: string; title: string; body: string[]; learnTitle: string; learn: string[] };
  challenge: {
    eyebrow: string;
    title: string;
    intro: string;
    noteLabel: string;
    note: string;
    provisionLabel: string;
    provision: string;
    mappings: { from: string; to: string; label: string }[];
    play: string;
    pause: string;
    hurdles: { title: string; text: string }[];
  };
  pipeline: {
    eyebrow: string;
    title: string;
    intro: string;
    nodes: { key: string; title: string; text: string; example: string[] }[];
    play: string;
    pause: string;
    footnote: string;
  };
  anatomy: {
    eyebrow: string;
    title: string;
    intro: string;
    parts: { key: AnatomyPart; title: string; text: string }[];
    mock: {
      breadcrumb: string;
      title: string;
      direct: string;
      approach: string;
      elementLabel: string;
      element: string;
      rationale: string;
      noteLabel: string;
      note: string;
      regulationLabel: string;
      regulation: string;
      verified: string;
      checks: string[];
      read: string;
      pdf: string;
      showText: string;
    };
  };
  grades: {
    eyebrow: string;
    title: string;
    intro: string;
    linkTypes: { key: "direct" | "indirect"; title: string; text: string; example: string }[];
    statusesTitle: string;
    statuses: { key: "linked" | "review" | "no_link" | "failed"; title: string; text: string }[];
    bandsTitle: string;
    bands: { range: string; title: string; text: string }[];
  };
  controls: { eyebrow: string; title: string; intro: string; rules: { title: string; text: string }[]; note: string };
  ready: { eyebrow: string; title: string; body: string[]; checklistTitle: string; checklist: string[] };
  tour: Record<TourStepId, TourText>;
  complete: { title: string; body: string; tipsTitle: string; tips: string[] };
};

export type AnatomyPart = "provision" | "grade" | "confidence" | "rationale" | "quotes" | "checks" | "actions";

const EN: MatcherOnboardingCopy = {
  ui: {
    product: "Release Note Matcher",
    minutes: "About 10 minutes",
    skipIntro: "Skip introduction",
    skipTour: "Skip tour",
    back: "Back",
    next: "Next",
    begin: "Begin",
    continue: "Continue",
    startTour: "Start hands-on tour",
    finish: "Finish",
    doItForMe: "Do it for me",
    endTour: "End the tour",
    runFailed: "The run stopped without a result",
    startAgain: "Start it again",
    yourTurn: "Your turn",
    watch: "Watch",
    wellDone: "Well done — continuing…",
    stepOf: "Step {n} of {total}",
    keyboard: "← → to navigate · Esc to leave",
    chapters: ["Language", "Welcome", "The challenge", "The pipeline", "Reading a link", "Grades & statuses", "Controls", "Hands-on"],
  },
  language: {
    title: "Choose your language",
    subtitle: "Wählen Sie Ihre Sprache",
    hint: "The introduction, the tour and the whole matcher use this language, including the explanations written for each link. You can change it any time with the EN | DE switch in the tab's header; the rest of the application keeps its own language.",
    defaultBadge: "Default",
    options: {
      en: { name: "English", native: "Continue in English" },
      de: { name: "Deutsch", native: "Auf Deutsch fortfahren" },
    },
  },
  welcome: {
    eyebrow: "Regulation–Release Note Matcher",
    title: "Every change, traced to the rule it touches",
    body: [
      "Each release of the calculation engine changes how figures are computed or which data feeds them. Supervisors and auditors expect you to show, for every change, which regulatory requirement it affects – with the exact article, paragraph, page and wording.",
      "The matcher does this groundwork for you. It reads every release note in the files you select, searches the regulations you select article by article, and returns a traceability matrix in which every link is backed by word-for-word quotes from both sources and a documented series of checks.",
      "You stay in control: every decision is shown with its evidence, every dismissed candidate with its reason, and anything doubtful is marked for your review.",
    ],
    learnTitle: "In the next minutes you will learn",
    learn: [
      "Why linking release notes to regulation is hard",
      "The five-stage pipeline behind every link",
      "How to read an evidence card",
      "What direct, indirect and Needs review mean",
      "The controls that keep the result auditable",
      "Hands-on: run the matcher and explore the result",
    ],
  },
  challenge: {
    eyebrow: "The challenge",
    title: "Two languages, two worlds",
    intro: "Release notes speak the language of the bank's systems; regulation speaks the language of the law. Linking them takes more than a keyword search.",
    noteLabel: "Release note · Jira 113873",
    note: "Für Darlehen an Private Haushalte wurden die Einzelwertberichtigungen (EWBs) in die Datenlieferung aufgenommen.",
    provisionLabel: "CRR · Article 111(1) · p. 163",
    provision: "The exposure value of an asset item shall be its accounting value remaining after specific credit risk adjustments in accordance with Article 110 …",
    mappings: [
      { from: "Darlehen an Private Haushalte", to: "asset item", label: "Loans to households are asset items of the retail exposure class." },
      { from: "Einzelwertberichtigungen (EWBs)", to: "specific credit risk adjustments", label: "EWB is the German business term for specific credit risk adjustments." },
      { from: "in die Datenlieferung aufgenommen", to: "accounting value remaining after", label: "Delivering the EWBs changes the value that remains after the adjustments – the exposure value." },
    ],
    play: "Play",
    pause: "Pause",
    hurdles: [
      { title: "Vocabulary", text: "German business terms such as EWB, PWB or anteilige Zinsen never appear in the English regulation text." },
      { title: "Scale", text: "The CRR alone has more than 700 articles on almost 900 pages; the same words appear in dozens of unrelated places." },
      { title: "Precision", text: "A useful link names the exact paragraph and point, quotes it word for word and survives an auditor's check." },
    ],
  },
  pipeline: {
    eyebrow: "How it works",
    title: "Five stages behind every link",
    intro: "Each release note runs through the same pipeline. Up to four release notes are processed in parallel, and every stage is recorded.",
    nodes: [
      {
        key: "interpret",
        title: "Interpret",
        text: "A model restates the release note in regulatory terms: what changed, which quantity or input it affects, and the search queries a regulatory specialist would use.",
        example: ["„Einzelwertberichtigungen (EWBs)“ → specific credit risk adjustments", "Affects: exposure value of loans to households", "Query: exposure value … accounting value after specific credit risk adjustments"],
      },
      {
        key: "retrieve",
        title: "Retrieve",
        text: "Hybrid search over every article: keyword ranking with a bilingual glossary plus semantic similarity, the provisions whose titles name the note's concepts, and the provisions the best hits refer to.",
        example: ["270 passages scored · 16 candidates kept", "C1 Article 111(1) – Exposure value", "C2 Article 127(1) – Exposures in default", "C3 Article 110(1) – Treatment of credit risk adjustment"],
      },
      {
        key: "adjudicate",
        title: "Adjudicate",
        text: "The model decides only among the numbered candidates – it cannot invent an article. For each link it gives the grade, the affected element, a rationale and word-for-word quotes from the provision and the release note.",
        example: ["[C1] direct · confidence 98", "„The exposure value of an asset item shall be its accounting value remaining after specific credit risk adjustments …“"],
      },
      {
        key: "verify",
        title: "Verify",
        text: "Deterministic checks against the source text: quotes verbatim, scope of the provision, no empowerment clause, shared regulatory concept, complete reference chains. Failures go back to the model once; whatever still fails is rejected.",
        example: ["✓ Quote found verbatim in Article 111(1), p. 163", "✓ Scope fits: retail exposures, loans", "✓ Shared concept: specific credit risk adjustment"],
      },
      {
        key: "review",
        title: "Four-eyes review",
        text: "A second, independent model call challenges every accepted link and confirms it, downgrades it to indirect or rejects it. If it rejects every link of a note, the note is escalated to you as Needs review.",
        example: ["✓ Confirmed – Article 111(1) governs exactly the exposure value the EWB delivery changes", "✕ Rejected – Article 159(1) concerns IRB expected-loss amounts only"],
      },
    ],
    play: "Play",
    pause: "Pause",
    footnote: "Every stage is written to the run log, which you find in the audit trail and in the Excel audit workbook.",
  },
  anatomy: {
    eyebrow: "Reading a link",
    title: "Anatomy of an evidence card",
    intro: "Every link is presented as an evidence card. Select a part to see what it tells you.",
    parts: [
      { key: "provision", title: "Provision & location", text: "The regulation, the provision down to paragraph and point, its title and its place in the regulation (part › title › chapter › section) with the PDF page." },
      { key: "grade", title: "Grade & approach", text: "Direct or indirect, and whether the provision applies to the standardised approach, the IRB approach or both." },
      { key: "confidence", title: "Confidence", text: "0–100: 60 % the model's assessment and 40 % evidence – quote verification, shared regulatory concept and retrieval rank. Green from 80, amber from 60, red below. Hover the dial in the app for the breakdown." },
      { key: "rationale", title: "Affected element & rationale", text: "What exactly changes in regulatory terms and why the provision governs it – written in your language, with German business terms explained." },
      { key: "quotes", title: "Quotes from both sources", text: "The release-note wording and the regulation wording side by side, each verified character by character against its source." },
      { key: "checks", title: "Verification record", text: "Every check that was run, with its result – regulation quote, release-note quote, scope, substantive provision, shared concept and the four-eyes verdict – plus how the provision was found." },
      { key: "actions", title: "Drill-down", text: "Show the full paragraph with the quote highlighted, read the whole article in a side panel, or open the PDF at the exact page." },
    ],
    mock: {
      breadcrumb: "Part Three › Title II › Chapter 2 · Standardised approach › Section 1 · p. 163",
      title: "Exposure value",
      direct: "Direct",
      approach: "Standardised approach",
      elementLabel: "Affected element",
      element: "Exposure value – accounting value after specific credit risk adjustments",
      rationale: "With the EWBs now delivered, the exposure value of loans to households is reduced by their specific credit risk adjustments, exactly as Article 111(1) prescribes.",
      noteLabel: "Release note",
      note: "„Für Darlehen an Private Haushalte wurden die Einzelwertberichtigungen (EWBs) in die Datenlieferung aufgenommen.“",
      regulationLabel: "CRR Article 111(1)",
      regulation: "„The exposure value of an asset item shall be its accounting value remaining after specific credit risk adjustments …“",
      verified: "Verified verbatim",
      checks: ["Quote found verbatim, p. 163", "Scope fits: retail exposures", "Substantive requirement", "Shared concept: specific credit risk adjustment", "Four-eyes review confirmed"],
      read: "Read Article 111",
      pdf: "PDF p. 163",
      showText: "Show provision text",
    },
  },
  grades: {
    eyebrow: "Reading the results",
    title: "Grades, statuses and confidence",
    intro: "Three signals tell you how a release note relates to the regulation and how much you can rely on it.",
    linkTypes: [
      {
        key: "direct",
        title: "Direct link",
        text: "The provision defines, sets or prescribes the quantity, input or treatment that the release note changes.",
        example: "EWBs now delivered → Article 111(1): the exposure value is the accounting value after specific credit risk adjustments.",
      },
      {
        key: "indirect",
        title: "Indirect link",
        text: "The provision uses the changed value in another calculation or treatment.",
        example: "EWBs now delivered → Article 127(1): the risk weight of defaulted exposures depends on the specific credit risk adjustments.",
      },
    ],
    statusesTitle: "Status of a release note",
    statuses: [
      { key: "linked", title: "Linked", text: "At least one link passed every check with a confidence of 60 or more." },
      { key: "review", title: "Needs review", text: "Low confidence, or the four-eyes reviewer disagreed with every link – a person must decide." },
      { key: "no_link", title: "No link", text: "No selected regulation governs the change. The reason is shown – nothing is forced." },
      { key: "failed", title: "Failed", text: "The release note could not be analysed, for example because the model was unreachable. Run it again." },
    ],
    bandsTitle: "Confidence bands",
    bands: [
      { range: "80–100", title: "High", text: "Strong model judgement backed by verified evidence." },
      { range: "60–79", title: "Medium", text: "Sound, but check the rationale before relying on it." },
      { range: "0–59", title: "Low", text: "The release note is marked Needs review." },
    ],
  },
  controls: {
    eyebrow: "Trust & control",
    title: "Built to survive an audit",
    intro: "Nine controls run on every link, whatever the model says. You find them again in each run's audit trail.",
    rules: [
      { title: "Closed candidate set", text: "Only provisions retrieved from the regulation text can be linked, by id – no invented articles or paragraphs." },
      { title: "Verbatim quotes", text: "Every quote is matched against its source; typo-level differences are replaced by the exact wording, anything else is rejected." },
      { title: "Scope check", text: "The provision must apply to the exposures the note concerns – loans are not 'other non credit-obligation assets'." },
      { title: "Substantive provisions only", text: "Clauses that merely mandate technical standards or delegated acts are never accepted." },
      { title: "Shared regulatory concept", text: "The linked paragraph must itself deal with what the note changes – general and specific credit risk adjustments are kept apart." },
      { title: "Reference chains", text: "Provisions a linked rule applies 'in accordance with' are followed, then linked or dismissed with a reason." },
      { title: "Self-correction", text: "Failed checks go back to the model once with the reasons; links that still fail are rejected and listed." },
      { title: "Four-eyes review", text: "An independent second review confirms, downgrades or rejects every link; disagreement is escalated to you." },
      { title: "No forced links", text: "A note without a governing provision is reported as 'No link' – after a challenge when candidates name its concepts." },
    ],
    note: "The matcher is an AI-assisted analysis. Its links are evidence-backed and checked, but the regulatory judgement stays with you: review notes marked Needs review and spot-check the evidence before you sign off.",
  },
  ready: {
    eyebrow: "Hands-on",
    title: "Ready for the hands-on tour",
    body: [
      "The tour walks you through the real tab: you select your sources, start a run and explore every part of the result.",
      "Run matching starts a real run with the sources you select – exactly as outside the tour. A small release-note file keeps it short: each release note takes about 10–20 seconds, up to four run in parallel. The run is saved under Runs like any other.",
    ],
    checklistTitle: "What you will do",
    checklist: [
      "Select release notes and a regulation",
      "Start a run and watch the pipeline",
      "Read the key figures",
      "Open an evidence card and its checks",
      "Explore the matrix, provisions and audit trail",
      "Start your own run",
    ],
  },
  tour: {
    header: {
      chapter: "Setup",
      title: "Your traceability workspace",
      body: [
        "This tab links release notes to the regulation provisions they affect. Each run analyses the files you choose and is stored with its complete evidence.",
        "Runs lists every earlier run – open one later to review or export it. Guided tour brings you back to this tour at any time.",
      ],
    },
    language: {
      chapter: "Setup",
      title: "Work in English or German",
      body: [
        "This switch sets the language of the whole tab: labels, the AI-written interpretations and rationales, the verification messages, the log and the Excel audit workbook.",
        "Every run is written in both languages, so you can switch at any time – also while you read a result. The rest of the application keeps its own language.",
      ],
    },
    releaseNotes: {
      chapter: "Setup",
      title: "Choose the release notes",
      body: [
        "Every release-note file uploaded in the Release Notes tab appears here, with its number of release notes and the first Jira IDs.",
        "Every release note in a selected file is analysed – Excel rows and PDF passages alike. Nothing is selected until you choose.",
      ],
      action: "Tick at least one release-note file.",
      empty: "No release-note file is uploaded yet, so there is nothing to match. Upload a file in the Release Notes tab, then start this tour again with “Guided tour”.",
    },
    regulations: {
      chapter: "Setup",
      title: "Choose the regulations",
      body: [
        "The indexed regulation PDFs from the Regulation tab. Only files marked Ready can be selected; Semantic index means the search also matches by meaning, not only by words.",
        "You can match against several regulations at once – every link names the regulation it comes from.",
      ],
      action: "Tick at least one ready regulation.",
      empty: "No regulation is indexed yet, so there is nothing to match against. Upload a regulation PDF in the Regulation tab, then start this tour again with “Guided tour”.",
    },
    method: {
      chapter: "Setup",
      title: "What happens when you run",
      body: ["Five stages per release note: interpret, retrieve, adjudicate, verify and the four-eyes review. You will watch them live in a moment."],
    },
    runBar: {
      chapter: "Setup",
      title: "Start the run",
      body: [
        "The bar sums up the scope of the run and the model in use. A real run takes about 10–20 seconds per release note; up to four are analysed in parallel.",
        "This starts a real run – exactly as outside the tour – and saves it under Runs.",
      ],
      action: "Press Run matching.",
    },
    progress: {
      chapter: "Run",
      title: "Live progress",
      body: [
        "Your run is in progress now: elapsed time, model calls, tokens and links found so far, with the overall progress below. It continues on the server if you leave the tab; Cancel stops it after the steps in progress, and finished release notes are kept.",
      ],
    },
    stages: {
      chapter: "Run",
      title: "The pipeline, stage by stage",
      body: ["Each card counts the release notes that have passed the stage. The list below shows where every single release note is right now."],
    },
    liveLog: {
      chapter: "Run",
      title: "The live log",
      body: ["Every decision is logged as it happens: concepts found, candidates retrieved, correction rounds, review verdicts and the final links. The same log is kept in the audit trail and the Excel workbook."],
      action: "Wait for the run to finish – the tour continues by itself as soon as the result is ready.",
    },
    meta: {
      chapter: "Results",
      title: "Run summary and exports",
      body: [
        "Status, start time, runtime, model and sources of the run.",
        "Excel audit workbook exports everything – summary, traceability matrix, coverage grid, dismissed candidates and the log – ready to file. JSON gives the raw result for further processing.",
      ],
    },
    kpis: {
      chapter: "Results",
      title: "The key figures",
      body: [
        "Coverage is the share of release notes with a link. Links counts direct and indirect links, Provisions the distinct provisions touched.",
        "Quotes verified shows how many quotes were found in their source. Candidates shows how many provisions were considered and how many were dismissed with a reason. Avg. confidence combines model judgement and verified evidence.",
      ],
    },
    tabs: {
      chapter: "Results",
      title: "Four views on one result",
      body: ["Evidence: every release note with its links and proof. Traceability matrix: release notes against provisions at a glance. Provisions: the result from the regulation's side. Audit trail: how the run was produced."],
    },
    noteList: {
      chapter: "Evidence",
      title: "The release notes",
      body: ["Filter by status or search by Jira ID, text or provision. Each entry shows its status, a one-line regulatory summary and its links – D for direct, I for indirect."],
    },
    noteCard: {
      chapter: "Evidence",
      title: "The release note itself",
      body: ["The original fields: Jira ID, change type, module, problem and solution description. The words quoted as evidence are highlighted, so you see exactly which statement each link rests on."],
    },
    interpretation: {
      chapter: "Evidence",
      title: "Regulatory interpretation",
      body: ["How the change reads in regulatory terms: a summary, the kind of change and each regulatory concept with the exact words of the release note it comes from. The search was based on this."],
    },
    link: {
      chapter: "Evidence",
      title: "A linked provision",
      body: [
        "Regulation, provision down to paragraph and point, title and position in the regulation with the page.",
        "On the right: the grade (direct or indirect), the approach it applies to, and the confidence dial – hover it for the breakdown.",
      ],
    },
    quotes: {
      chapter: "Evidence",
      title: "Proof from both sides",
      body: ["Left the release note, right the regulation – each quote verified character by character against its source. Verified verbatim means it was found exactly; Aligned means a typo-level difference was replaced by the exact source wording."],
    },
    checks: {
      chapter: "Evidence",
      title: "The verification record",
      body: ["Every check that was run on this link, with its outcome: regulation quote, release-note quote, scope, substantive provision, shared concept and the four-eyes review with the reviewer's reason. The last line shows how the provision was found."],
    },
    linkActions: {
      chapter: "Evidence",
      title: "Drill down to the source",
      body: ["Refers to lists the provisions this one cross-references. Show provision text expands the full paragraph with the quote highlighted; Read opens the whole article in a side panel; PDF opens the regulation at the exact page (switched off for the tour replay)."],
    },
    dismissed: {
      chapter: "Evidence",
      title: "What was ruled out – and why",
      body: ["Every candidate that was considered but not linked, with the reason and who decided: the model, the verification or the four-eyes review. Auditors often ask exactly this: why not that article?"],
    },
    retrieval: {
      chapter: "Evidence",
      title: "The retrieval trace",
      body: ["The search queries that were run and every candidate with its score, keyword rank, semantic similarity, how it was found and the decision – full transparency on how the evidence was gathered."],
    },
    matrix: {
      chapter: "Overview",
      title: "Traceability matrix",
      body: ["Release notes as rows, provisions as columns grouped by article. A filled dot is a direct link, a ring an indirect one; the number is the confidence. Hover a cell for the rationale, click it to jump to its evidence card."],
    },
    provisions: {
      chapter: "Overview",
      title: "Provisions view",
      body: ["The same result from the regulation's side: every provision that is touched, by how many release notes and by which – a sound basis for an impact assessment per article."],
    },
    audit: {
      chapter: "Overview",
      title: "Audit trail",
      body: ["Run ID, timing, model, token usage and sources; the controls that were applied; and the complete run log, filterable by level – everything needed to retrace the result."],
    },
    newRun: {
      chapter: "Next steps",
      title: "Your turn",
      body: ["New run takes you back to the setup: select your files and start a real run. Earlier runs stay available under Runs."],
    },
  },
  complete: {
    title: "You're ready to trace",
    body: "You know the pipeline, the evidence and the controls. Close the tour and start your first run.",
    tipsTitle: "Good practice",
    tips: [
      "Check every release note marked Needs review before relying on the matrix.",
      "Use the dismissed candidates to answer “why not this article?”.",
      "Export the Excel audit workbook for your documentation.",
      "Run again after new release notes or a new regulation version – runs are kept side by side.",
      "Restart this tour any time with the Guided tour button.",
    ],
  },
};

const DE: MatcherOnboardingCopy = {
  ui: {
    product: "Release-Note-Abgleich",
    minutes: "Etwa 10 Minuten",
    skipIntro: "Einführung überspringen",
    skipTour: "Tour überspringen",
    back: "Zurück",
    next: "Weiter",
    begin: "Los geht's",
    continue: "Weiter",
    startTour: "Praxis-Tour starten",
    finish: "Abschließen",
    doItForMe: "Für mich erledigen",
    endTour: "Tour beenden",
    runFailed: "Der Lauf wurde ohne Ergebnis beendet",
    startAgain: "Erneut starten",
    yourTurn: "Sie sind dran",
    watch: "Zuschauen",
    wellDone: "Gut gemacht – es geht weiter…",
    stepOf: "Schritt {n} von {total}",
    keyboard: "← → zum Navigieren · Esc zum Verlassen",
    chapters: ["Sprache", "Willkommen", "Die Herausforderung", "Die Pipeline", "Einen Bezug lesen", "Bewertungen & Status", "Kontrollen", "Praxis"],
  },
  language: {
    title: "Wählen Sie Ihre Sprache",
    subtitle: "Choose your language",
    hint: "Einführung, Tour und der gesamte Abgleich verwenden diese Sprache – auch die Begründungen, die zu jedem Bezug geschrieben werden. Sie können sie jederzeit mit dem Schalter EN | DE in der Kopfzeile des Tabs ändern; die übrige Anwendung behält ihre eigene Sprache.",
    defaultBadge: "Standard",
    options: {
      en: { name: "English", native: "Continue in English" },
      de: { name: "Deutsch", native: "Auf Deutsch fortfahren" },
    },
  },
  welcome: {
    eyebrow: "Regulierung–Release-Note-Abgleich",
    title: "Jede Änderung, zurückverfolgt bis zur Vorschrift",
    body: [
      "Jedes Release der Berechnungsengine ändert, wie Größen berechnet werden oder welche Daten einfließen. Aufsicht und Prüfer erwarten, dass Sie für jede Änderung zeigen, welche regulatorische Anforderung sie berührt – mit genauem Artikel, Absatz, Seite und Wortlaut.",
      "Der Abgleich übernimmt diese Vorarbeit. Er liest jede Release Note der ausgewählten Dateien, durchsucht die ausgewählten Regulierungen Artikel für Artikel und liefert eine Rückverfolgbarkeitsmatrix, in der jeder Bezug durch wörtliche Zitate aus beiden Quellen und eine dokumentierte Folge von Prüfungen belegt ist.",
      "Sie behalten die Kontrolle: Jede Entscheidung wird mit ihren Nachweisen gezeigt, jeder verworfene Kandidat mit seiner Begründung, und alles Zweifelhafte wird zur Prüfung markiert.",
    ],
    learnTitle: "In den nächsten Minuten lernen Sie",
    learn: [
      "Warum die Verknüpfung von Release Notes mit Regulierung schwierig ist",
      "Die fünfstufige Pipeline hinter jedem Bezug",
      "Wie Sie eine Nachweiskarte lesen",
      "Was direkt, indirekt und „Prüfen“ bedeuten",
      "Die Kontrollen, die das Ergebnis prüffähig machen",
      "Praxis: den Abgleich starten und das Ergebnis erkunden",
    ],
  },
  challenge: {
    eyebrow: "Die Herausforderung",
    title: "Zwei Sprachen, zwei Welten",
    intro: "Release Notes sprechen die Sprache der Banksysteme, die Regulierung die Sprache des Rechts. Sie zu verknüpfen, erfordert mehr als eine Stichwortsuche.",
    noteLabel: "Release Note · Jira 113873",
    note: "Für Darlehen an Private Haushalte wurden die Einzelwertberichtigungen (EWBs) in die Datenlieferung aufgenommen.",
    provisionLabel: "CRR · Article 111(1) · S. 163",
    provision: "The exposure value of an asset item shall be its accounting value remaining after specific credit risk adjustments in accordance with Article 110 …",
    mappings: [
      { from: "Darlehen an Private Haushalte", to: "asset item", label: "Darlehen an private Haushalte sind Aktivposten der Forderungsklasse Mengengeschäft." },
      { from: "Einzelwertberichtigungen (EWBs)", to: "specific credit risk adjustments", label: "EWB ist der deutsche Fachbegriff für spezifische Kreditrisikoanpassungen (specific credit risk adjustments)." },
      { from: "in die Datenlieferung aufgenommen", to: "accounting value remaining after", label: "Mit den gelieferten EWBs ändert sich der Wert, der nach den Anpassungen verbleibt – der Risikopositionswert." },
    ],
    play: "Abspielen",
    pause: "Pause",
    hurdles: [
      { title: "Vokabular", text: "Deutsche Fachbegriffe wie EWB, PWB oder anteilige Zinsen kommen im englischen Verordnungstext nie vor." },
      { title: "Umfang", text: "Allein die CRR hat über 700 Artikel auf fast 900 Seiten; dieselben Wörter stehen an Dutzenden unzusammenhängenden Stellen." },
      { title: "Präzision", text: "Ein brauchbarer Bezug nennt den genauen Absatz und Buchstaben, zitiert ihn wörtlich und hält einer Prüfung stand." },
    ],
  },
  pipeline: {
    eyebrow: "So funktioniert es",
    title: "Fünf Stufen hinter jedem Bezug",
    intro: "Jede Release Note durchläuft dieselbe Pipeline. Bis zu vier Release Notes werden parallel verarbeitet, und jede Stufe wird protokolliert.",
    nodes: [
      {
        key: "interpret",
        title: "Interpretieren",
        text: "Ein Modell formuliert die Release Note in regulatorischen Begriffen: was sich geändert hat, welche Größe oder Eingabe betroffen ist und mit welchen Suchanfragen eine Fachperson suchen würde.",
        example: ["„Einzelwertberichtigungen (EWBs)“ → specific credit risk adjustments", "Betrifft: Risikopositionswert von Darlehen an private Haushalte", "Anfrage: exposure value … accounting value after specific credit risk adjustments"],
      },
      {
        key: "retrieve",
        title: "Suchen",
        text: "Hybride Suche über alle Artikel: Stichwortranking mit zweisprachigem Glossar plus semantische Ähnlichkeit, dazu Vorschriften, deren Titel die Begriffe der Note nennen, und die Vorschriften, auf die die besten Treffer verweisen.",
        example: ["270 Passagen bewertet · 16 Kandidaten übernommen", "C1 Article 111(1) – Exposure value", "C2 Article 127(1) – Exposures in default", "C3 Article 110(1) – Treatment of credit risk adjustment"],
      },
      {
        key: "adjudicate",
        title: "Bewerten",
        text: "Das Modell entscheidet nur zwischen den nummerierten Kandidaten – es kann keinen Artikel erfinden. Zu jedem Bezug liefert es Bewertung, betroffenes Element, Begründung und wörtliche Zitate aus Vorschrift und Release Note.",
        example: ["[C1] direkt · Konfidenz 98", "„The exposure value of an asset item shall be its accounting value remaining after specific credit risk adjustments …“"],
      },
      {
        key: "verify",
        title: "Prüfen",
        text: "Deterministische Prüfungen gegen den Quelltext: wörtliche Zitate, Anwendungsbereich, keine Ermächtigungsklausel, gemeinsamer regulatorischer Begriff, vollständige Verweisketten. Fehler gehen einmal an das Modell zurück; was weiterhin scheitert, wird verworfen.",
        example: ["✓ Zitat wörtlich in Article 111(1), S. 163 gefunden", "✓ Anwendungsbereich passt: Mengengeschäft, Darlehen", "✓ Gemeinsamer Begriff: specific credit risk adjustment"],
      },
      {
        key: "review",
        title: "Vier-Augen-Prüfung",
        text: "Ein zweiter, unabhängiger Modellaufruf hinterfragt jeden akzeptierten Bezug und bestätigt ihn, stuft ihn auf indirekt herab oder verwirft ihn. Verwirft er alle Bezüge einer Note, wird sie Ihnen als „Prüfen“ vorgelegt.",
        example: ["✓ Bestätigt – Article 111(1) regelt genau den Risikopositionswert, den die EWB-Lieferung ändert", "✕ Verworfen – Article 159(1) betrifft nur erwartete Verlustbeträge im IRB-Ansatz"],
      },
    ],
    play: "Abspielen",
    pause: "Pause",
    footnote: "Jede Stufe wird im Laufprotokoll festgehalten – im Prüfpfad und in der Excel-Prüfmappe.",
  },
  anatomy: {
    eyebrow: "Einen Bezug lesen",
    title: "Aufbau einer Nachweiskarte",
    intro: "Jeder Bezug wird als Nachweiskarte dargestellt. Wählen Sie einen Bereich, um zu sehen, was er Ihnen sagt.",
    parts: [
      { key: "provision", title: "Vorschrift & Fundstelle", text: "Die Regulierung, die Vorschrift bis auf Absatz und Buchstabe, ihr Titel und ihre Stellung in der Verordnung (Teil › Titel › Kapitel › Abschnitt) mit der PDF-Seite." },
      { key: "grade", title: "Bewertung & Ansatz", text: "Direkt oder indirekt, und ob die Vorschrift für den Standardansatz, den IRB-Ansatz oder beide gilt." },
      { key: "confidence", title: "Konfidenz", text: "0–100: 60 % Bewertung des Modells und 40 % Nachweise – Zitatprüfung, gemeinsamer regulatorischer Begriff und Suchrang. Grün ab 80, gelb ab 60, rot darunter. In der App zeigt der Tooltip am Ring die Zusammensetzung." },
      { key: "rationale", title: "Betroffenes Element & Begründung", text: "Was sich regulatorisch genau ändert und warum die Vorschrift das regelt – in Ihrer Sprache, mit erklärten Fachbegriffen." },
      { key: "quotes", title: "Zitate aus beiden Quellen", text: "Der Wortlaut der Release Note und der Wortlaut der Regulierung nebeneinander, jeweils Zeichen für Zeichen gegen die Quelle geprüft." },
      { key: "checks", title: "Prüfprotokoll", text: "Jede durchgeführte Prüfung mit Ergebnis – Regulierungszitat, Release-Note-Zitat, Anwendungsbereich, materielle Vorschrift, gemeinsamer Begriff und das Urteil der Vier-Augen-Prüfung – sowie wie die Vorschrift gefunden wurde." },
      { key: "actions", title: "Bis zur Quelle", text: "Den ganzen Absatz mit markiertem Zitat einblenden, den vollständigen Artikel in einer Seitenleiste lesen oder das PDF genau auf der richtigen Seite öffnen." },
    ],
    mock: {
      breadcrumb: "Part Three › Title II › Chapter 2 · Standardised approach › Section 1 · S. 163",
      title: "Exposure value",
      direct: "Direkt",
      approach: "Standardansatz",
      elementLabel: "Betroffenes Element",
      element: "Risikopositionswert – Buchwert nach spezifischen Kreditrisikoanpassungen",
      rationale: "Da die EWBs nun geliefert werden, mindert sich der Risikopositionswert der Darlehen an private Haushalte um ihre spezifischen Kreditrisikoanpassungen – genau wie Article 111(1) es vorschreibt.",
      noteLabel: "Release Note",
      note: "„Für Darlehen an Private Haushalte wurden die Einzelwertberichtigungen (EWBs) in die Datenlieferung aufgenommen.“",
      regulationLabel: "CRR Article 111(1)",
      regulation: "„The exposure value of an asset item shall be its accounting value remaining after specific credit risk adjustments …“",
      verified: "Wörtlich bestätigt",
      checks: ["Zitat wörtlich gefunden, S. 163", "Anwendungsbereich passt: Mengengeschäft", "Materielle Anforderung", "Gemeinsamer Begriff: specific credit risk adjustment", "Vier-Augen-Prüfung bestätigt"],
      read: "Article 111 lesen",
      pdf: "PDF S. 163",
      showText: "Vorschriftentext anzeigen",
    },
  },
  grades: {
    eyebrow: "Ergebnisse lesen",
    title: "Bewertungen, Status und Konfidenz",
    intro: "Drei Signale zeigen, wie eine Release Note mit der Regulierung zusammenhängt und wie belastbar das ist.",
    linkTypes: [
      {
        key: "direct",
        title: "Direkter Bezug",
        text: "Die Vorschrift bestimmt, setzt oder schreibt die Größe, Eingabe oder Behandlung vor, die die Release Note ändert.",
        example: "EWBs werden nun geliefert → Article 111(1): Der Risikopositionswert ist der Buchwert nach spezifischen Kreditrisikoanpassungen.",
      },
      {
        key: "indirect",
        title: "Indirekter Bezug",
        text: "Die Vorschrift verwendet den geänderten Wert in einer anderen Berechnung oder Behandlung.",
        example: "EWBs werden nun geliefert → Article 127(1): Das Risikogewicht ausgefallener Positionen hängt von den spezifischen Kreditrisikoanpassungen ab.",
      },
    ],
    statusesTitle: "Status einer Release Note",
    statuses: [
      { key: "linked", title: "Verknüpft", text: "Mindestens ein Bezug hat alle Prüfungen mit einer Konfidenz von 60 oder mehr bestanden." },
      { key: "review", title: "Prüfen", text: "Niedrige Konfidenz, oder die Vier-Augen-Prüfung widerspricht jedem Bezug – ein Mensch muss entscheiden." },
      { key: "no_link", title: "Kein Bezug", text: "Keine ausgewählte Regulierung regelt die Änderung. Die Begründung wird angezeigt – nichts wird erzwungen." },
      { key: "failed", title: "Fehlgeschlagen", text: "Die Release Note konnte nicht analysiert werden, etwa weil das Modell nicht erreichbar war. Erneut ausführen." },
    ],
    bandsTitle: "Konfidenzbereiche",
    bands: [
      { range: "80–100", title: "Hoch", text: "Klares Modellurteil, gestützt durch geprüfte Nachweise." },
      { range: "60–79", title: "Mittel", text: "Schlüssig, aber die Begründung vor der Verwendung prüfen." },
      { range: "0–59", title: "Niedrig", text: "Die Release Note wird als „Prüfen“ markiert." },
    ],
  },
  controls: {
    eyebrow: "Vertrauen & Kontrolle",
    title: "Gebaut, um einer Prüfung standzuhalten",
    intro: "Neun Kontrollen laufen bei jedem Bezug – unabhängig davon, was das Modell sagt. Sie finden sie im Prüfpfad jedes Laufs wieder.",
    rules: [
      { title: "Geschlossene Kandidatenmenge", text: "Nur aus dem Verordnungstext gefundene Vorschriften können per ID verknüpft werden – keine erfundenen Artikel oder Absätze." },
      { title: "Wörtliche Zitate", text: "Jedes Zitat wird gegen seine Quelle geprüft; Abweichungen auf Tippfehlerniveau werden durch den exakten Wortlaut ersetzt, alles andere wird verworfen." },
      { title: "Anwendungsbereich", text: "Die Vorschrift muss für die Positionen der Note gelten – Darlehen sind keine „other non credit-obligation assets“." },
      { title: "Nur materielle Vorschriften", text: "Klauseln, die nur technische Standards oder delegierte Rechtsakte beauftragen, werden nie akzeptiert." },
      { title: "Gemeinsamer regulatorischer Begriff", text: "Der verknüpfte Absatz muss selbst behandeln, was die Note ändert – allgemeine und spezifische Kreditrisikoanpassungen werden unterschieden." },
      { title: "Verweisketten", text: "Vorschriften, nach denen eine verknüpfte Regel „in accordance with“ angewendet wird, werden verfolgt und verknüpft oder begründet verworfen." },
      { title: "Selbstkorrektur", text: "Nicht bestandene Prüfungen gehen einmal mit Begründung an das Modell zurück; Bezüge, die weiterhin scheitern, werden verworfen und aufgeführt." },
      { title: "Vier-Augen-Prüfung", text: "Eine unabhängige Zweitprüfung bestätigt, stuft herab oder verwirft jeden Bezug; Widerspruch wird an Sie eskaliert." },
      { title: "Keine erzwungenen Bezüge", text: "Eine Note ohne maßgebliche Vorschrift wird als „Kein Bezug“ gemeldet – nach einer Gegenprüfung, wenn Kandidaten ihre Begriffe nennen." },
    ],
    note: "Der Abgleich ist eine KI-gestützte Analyse. Seine Bezüge sind belegt und geprüft, das regulatorische Urteil bleibt aber bei Ihnen: Prüfen Sie Notes mit dem Status „Prüfen“ und stichprobenartig die Nachweise, bevor Sie freigeben.",
  },
  ready: {
    eyebrow: "Praxis",
    title: "Bereit für die Praxis-Tour",
    body: [
      "Die Tour führt Sie durch den echten Tab: Sie wählen Ihre Quellen, starten einen Lauf und erkunden jeden Teil des Ergebnisses.",
      "„Abgleich starten“ startet einen echten Lauf mit den von Ihnen gewählten Quellen – genau wie außerhalb der Tour. Eine kleine Release-Note-Datei hält ihn kurz: Jede Release Note dauert etwa 10–20 Sekunden, bis zu vier laufen parallel. Der Lauf wird wie jeder andere unter „Läufe“ gespeichert.",
    ],
    checklistTitle: "Was Sie tun werden",
    checklist: [
      "Release Notes und eine Regulierung auswählen",
      "Einen Lauf starten und die Pipeline verfolgen",
      "Die Kennzahlen lesen",
      "Eine Nachweiskarte und ihre Prüfungen öffnen",
      "Matrix, Vorschriften und Prüfpfad erkunden",
      "Einen eigenen Lauf starten",
    ],
  },
  tour: {
    header: {
      chapter: "Einrichtung",
      title: "Ihr Arbeitsbereich für Rückverfolgbarkeit",
      body: [
        "Dieser Tab verknüpft Release Notes mit den Regulierungsvorschriften, die sie betreffen. Jeder Lauf analysiert die von Ihnen gewählten Dateien und wird mit allen Nachweisen gespeichert.",
        "„Läufe“ listet alle früheren Läufe – öffnen Sie einen später, um ihn zu prüfen oder zu exportieren. „Geführte Tour“ bringt Sie jederzeit zu dieser Tour zurück.",
      ],
    },
    language: {
      chapter: "Einrichtung",
      title: "Auf Deutsch oder Englisch arbeiten",
      body: [
        "Dieser Schalter legt die Sprache des gesamten Tabs fest: Beschriftungen, die von der KI verfassten Interpretationen und Begründungen, die Prüfmeldungen, das Protokoll und die Excel-Prüfmappe.",
        "Jeder Lauf wird in beiden Sprachen erstellt – Sie können also jederzeit wechseln, auch während Sie ein Ergebnis lesen. Die übrige Anwendung behält ihre eigene Sprache.",
      ],
    },
    releaseNotes: {
      chapter: "Einrichtung",
      title: "Release Notes auswählen",
      body: [
        "Hier erscheint jede im Tab Versionshinweise hochgeladene Release-Note-Datei, mit der Anzahl ihrer Release Notes und den ersten Jira-IDs.",
        "Jede Release Note einer ausgewählten Datei wird analysiert – Excel-Zeilen wie PDF-Passagen. Ausgewählt ist nichts, bis Sie wählen.",
      ],
      action: "Haken Sie mindestens eine Release-Note-Datei an.",
      empty: "Noch keine Release-Note-Datei hochgeladen, es gibt also nichts abzugleichen. Laden Sie im Tab Versionshinweise eine Datei hoch und starten Sie diese Tour dann erneut über „Geführte Tour“.",
    },
    regulations: {
      chapter: "Einrichtung",
      title: "Regulierungen auswählen",
      body: [
        "Die indizierten Regulierungs-PDFs aus dem Tab Vorschriften. Nur Dateien mit „Bereit“ sind wählbar; „Semantischer Index“ heißt, dass die Suche auch nach Bedeutung findet, nicht nur nach Wörtern.",
        "Sie können gegen mehrere Regulierungen gleichzeitig abgleichen – jeder Bezug nennt die Regulierung, aus der er stammt.",
      ],
      action: "Haken Sie mindestens eine bereite Regulierung an.",
      empty: "Noch keine Regulierung indiziert, es gibt also nichts, wogegen abgeglichen werden kann. Laden Sie im Tab Vorschriften ein Regulierungs-PDF hoch und starten Sie diese Tour dann erneut über „Geführte Tour“.",
    },
    method: {
      chapter: "Einrichtung",
      title: "Was bei einem Lauf passiert",
      body: ["Fünf Stufen je Release Note: Interpretieren, Suchen, Bewerten, Prüfen und die Vier-Augen-Prüfung. Gleich sehen Sie sie live."],
    },
    runBar: {
      chapter: "Einrichtung",
      title: "Den Lauf starten",
      body: [
        "Die Leiste fasst den Umfang des Laufs und das verwendete Modell zusammen. Ein echter Lauf dauert etwa 10–20 Sekunden je Release Note; bis zu vier werden parallel analysiert.",
        "Damit startet ein echter Lauf – genau wie außerhalb der Tour – und wird unter „Läufe“ gespeichert.",
      ],
      action: "Klicken Sie auf „Abgleich starten“.",
    },
    progress: {
      chapter: "Lauf",
      title: "Fortschritt live",
      body: [
        "Ihr Lauf läuft jetzt: Dauer, Modellaufrufe, Tokens und bisher gefundene Bezüge, darunter der Gesamtfortschritt. Er läuft auf dem Server weiter, wenn Sie den Tab verlassen; „Abbrechen“ stoppt ihn nach den laufenden Schritten, fertige Release Notes bleiben erhalten.",
      ],
    },
    stages: {
      chapter: "Lauf",
      title: "Die Pipeline, Stufe für Stufe",
      body: ["Jede Karte zählt die Release Notes, die die Stufe durchlaufen haben. Die Liste darunter zeigt, wo jede einzelne Release Note gerade steht."],
    },
    liveLog: {
      chapter: "Lauf",
      title: "Das Live-Protokoll",
      body: ["Jede Entscheidung wird protokolliert, während sie fällt: gefundene Begriffe, gesuchte Kandidaten, Korrekturrunden, Urteile der Zweitprüfung und die endgültigen Bezüge. Dasselbe Protokoll steht im Prüfpfad und in der Excel-Mappe."],
      action: "Warten Sie, bis der Lauf fertig ist – die Tour geht von selbst weiter, sobald das Ergebnis vorliegt.",
    },
    meta: {
      chapter: "Ergebnis",
      title: "Zusammenfassung und Export",
      body: [
        "Status, Startzeit, Laufzeit, Modell und Quellen des Laufs.",
        "„Excel-Prüfmappe“ exportiert alles – Zusammenfassung, Rückverfolgbarkeitsmatrix, Abdeckungsraster, verworfene Kandidaten und Protokoll – ablagefertig. JSON liefert das Rohergebnis zur Weiterverarbeitung.",
      ],
    },
    kpis: {
      chapter: "Ergebnis",
      title: "Die Kennzahlen",
      body: [
        "Abdeckung ist der Anteil der Release Notes mit Bezug. Bezüge zählt direkte und indirekte Bezüge, Vorschriften die unterschiedlichen berührten Vorschriften.",
        "„Zitate bestätigt“ zeigt, wie viele Zitate in ihrer Quelle gefunden wurden. Kandidaten zeigt, wie viele Vorschriften betrachtet und wie viele begründet verworfen wurden. Die Ø Konfidenz verbindet Modellurteil und geprüfte Nachweise.",
      ],
    },
    tabs: {
      chapter: "Ergebnis",
      title: "Vier Ansichten auf ein Ergebnis",
      body: ["Nachweise: jede Release Note mit ihren Bezügen und Belegen. Rückverfolgbarkeitsmatrix: Release Notes gegen Vorschriften auf einen Blick. Vorschriften: das Ergebnis aus Sicht der Regulierung. Prüfpfad: wie der Lauf entstanden ist."],
    },
    noteList: {
      chapter: "Nachweise",
      title: "Die Release Notes",
      body: ["Nach Status filtern oder nach Jira-ID, Text oder Vorschrift suchen. Jeder Eintrag zeigt Status, eine einzeilige regulatorische Zusammenfassung und die Bezüge – D für direkt, I für indirekt."],
    },
    noteCard: {
      chapter: "Nachweise",
      title: "Die Release Note selbst",
      body: ["Die Originalfelder: Jira-ID, Änderungsart, Modul, Problem- und Lösungsbeschreibung. Die als Beleg zitierten Wörter sind markiert – Sie sehen genau, auf welcher Aussage jeder Bezug beruht."],
    },
    interpretation: {
      chapter: "Nachweise",
      title: "Regulatorische Interpretation",
      body: ["Wie die Änderung regulatorisch zu lesen ist: eine Zusammenfassung, die Art der Änderung und jeder regulatorische Begriff mit den genauen Wörtern der Release Note, aus denen er stammt. Darauf beruhte die Suche."],
    },
    link: {
      chapter: "Nachweise",
      title: "Eine verknüpfte Vorschrift",
      body: [
        "Regulierung, Vorschrift bis auf Absatz und Buchstabe, Titel und Stellung in der Verordnung mit der Seite.",
        "Rechts: die Bewertung (direkt oder indirekt), der Ansatz, für den sie gilt, und der Konfidenzring – der Tooltip zeigt die Zusammensetzung.",
      ],
    },
    quotes: {
      chapter: "Nachweise",
      title: "Belege aus beiden Quellen",
      body: ["Links die Release Note, rechts die Regulierung – jedes Zitat Zeichen für Zeichen gegen die Quelle geprüft. „Wörtlich bestätigt“ heißt exakt gefunden; „angeglichen“ heißt, eine Abweichung auf Tippfehlerniveau wurde durch den exakten Quelltext ersetzt."],
    },
    checks: {
      chapter: "Nachweise",
      title: "Das Prüfprotokoll",
      body: ["Jede Prüfung zu diesem Bezug mit Ergebnis: Regulierungszitat, Release-Note-Zitat, Anwendungsbereich, materielle Vorschrift, gemeinsamer Begriff und die Vier-Augen-Prüfung mit der Begründung des Prüfers. Die letzte Zeile zeigt, wie die Vorschrift gefunden wurde."],
    },
    linkActions: {
      chapter: "Nachweise",
      title: "Bis zur Quelle",
      body: ["„Verweist auf“ listet die Vorschriften, auf die diese verweist. „Vorschriftentext anzeigen“ blendet den ganzen Absatz mit markiertem Zitat ein; „lesen“ öffnet den vollständigen Artikel in einer Seitenleiste; PDF öffnet die Verordnung auf der genauen Seite (für die Tour-Wiedergabe abgeschaltet)."],
    },
    dismissed: {
      chapter: "Nachweise",
      title: "Was ausgeschlossen wurde – und warum",
      body: ["Jeder Kandidat, der betrachtet, aber nicht verknüpft wurde, mit Begründung und Entscheider: das Modell, die Prüfung oder die Vier-Augen-Prüfung. Genau das fragen Prüfer oft: Warum nicht dieser Artikel?"],
    },
    retrieval: {
      chapter: "Nachweise",
      title: "Die Suchspur",
      body: ["Die ausgeführten Suchanfragen und jeder Kandidat mit Score, Stichwortrang, semantischer Ähnlichkeit, Fundweg und Entscheidung – volle Transparenz darüber, wie die Nachweise zusammengetragen wurden."],
    },
    matrix: {
      chapter: "Überblick",
      title: "Rückverfolgbarkeitsmatrix",
      body: ["Release Notes als Zeilen, Vorschriften als Spalten, nach Artikel gruppiert. Ein gefüllter Punkt ist ein direkter Bezug, ein Ring ein indirekter; die Zahl ist die Konfidenz. Tooltip zeigt die Begründung, ein Klick springt zur Nachweiskarte."],
    },
    provisions: {
      chapter: "Überblick",
      title: "Ansicht Vorschriften",
      body: ["Dasselbe Ergebnis aus Sicht der Regulierung: jede berührte Vorschrift, wie viele Release Notes sie berühren und welche – eine solide Grundlage für eine Auswirkungsanalyse je Artikel."],
    },
    audit: {
      chapter: "Überblick",
      title: "Prüfpfad",
      body: ["Lauf-ID, Zeiten, Modell, Tokenverbrauch und Quellen; die angewandten Kontrollen; und das vollständige Laufprotokoll, nach Ebene filterbar – alles, um das Ergebnis nachzuvollziehen."],
    },
    newRun: {
      chapter: "Nächste Schritte",
      title: "Jetzt Sie",
      body: ["„Neuer Lauf“ bringt Sie zurück zur Einrichtung: Dateien wählen und einen echten Lauf starten. Frühere Läufe bleiben unter „Läufe“ verfügbar."],
    },
  },
  complete: {
    title: "Bereit für die Rückverfolgung",
    body: "Sie kennen die Pipeline, die Nachweise und die Kontrollen. Schließen Sie die Tour und starten Sie Ihren ersten Lauf.",
    tipsTitle: "Gute Praxis",
    tips: [
      "Prüfen Sie jede Release Note mit dem Status „Prüfen“, bevor Sie sich auf die Matrix stützen.",
      "Beantworten Sie „Warum nicht dieser Artikel?“ mit den verworfenen Kandidaten.",
      "Exportieren Sie die Excel-Prüfmappe für Ihre Dokumentation.",
      "Starten Sie nach neuen Release Notes oder einer neuen Verordnungsfassung erneut – Läufe bleiben nebeneinander erhalten.",
      "Starten Sie diese Tour jederzeit über „Geführte Tour“ neu.",
    ],
  },
};

export const MATCHER_ONBOARDING_COPY: Record<MatcherLocale, MatcherOnboardingCopy> = { en: EN, de: DE };
