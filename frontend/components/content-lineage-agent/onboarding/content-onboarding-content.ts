/**
 * Copy and step definitions for the Content Lineage AI Agents onboarding (English / German).
 * The examples come from a real analysis of the RWA_2 execution (code_2_rwa_again.py) that follows the field
 * ProductType forward; column names, data values and code stay as they are in the data, in both languages.
 */

export type ContentLocale = "en" | "de";

export type DeckScreen = "language" | "welcome" | "difference" | "pipeline" | "forward" | "view" | "controls" | "ready";
export const DECK_SCREENS: DeckScreen[] = ["language", "welcome", "difference", "pipeline", "forward", "view", "controls", "ready"];

export type TourStage = "setup" | "progress" | "results";
export type TourAction = "selectExecution" | "selectField" | "startRun" | "awaitResults" | "selectFlowField";

export type TourStepId =
  | "header"
  | "language"
  | "executions"
  | "fields"
  | "forwardPreview"
  | "method"
  | "runBar"
  | "progress"
  | "stages"
  | "console"
  | "meta"
  | "summary"
  | "lineage"
  | "lineageField"
  | "details"
  | "quality"
  | "newRun";

export type TourStepDef = {
  id: TourStepId;
  /** data-tour attribute of the element to spotlight. */
  target: string;
  stage: TourStage;
  /** Steps with an action wait for the user (or "Do it for me"). */
  action?: TourAction;
  /** The step can be passed without its action. */
  optional?: boolean;
};

export const TOUR_STEPS: TourStepDef[] = [
  { id: "header", target: "content-header", stage: "setup" },
  { id: "language", target: "content-language", stage: "setup" },
  { id: "executions", target: "content-executions", stage: "setup", action: "selectExecution" },
  { id: "fields", target: "content-fields", stage: "setup", action: "selectField" },
  { id: "forwardPreview", target: "content-forward-preview", stage: "setup" },
  { id: "method", target: "content-method", stage: "setup" },
  { id: "runBar", target: "content-run-bar", stage: "setup", action: "startRun" },
  { id: "progress", target: "content-progress", stage: "progress" },
  { id: "stages", target: "content-stages", stage: "progress" },
  { id: "console", target: "content-console", stage: "progress", action: "awaitResults" },
  { id: "meta", target: "content-meta", stage: "results" },
  { id: "summary", target: "content-summary", stage: "results" },
  { id: "lineage", target: "content-lineage", stage: "results" },
  { id: "lineageField", target: "content-lineage", stage: "results", action: "selectFlowField" },
  { id: "details", target: "content-details", stage: "results" },
  { id: "quality", target: "content-quality", stage: "results" },
  { id: "newRun", target: "content-new", stage: "results" },
];

type TourText = { chapter: string; title: string; body: string[]; action?: string; empty?: string };

/** How a record's downstream value depends on the followed field (as in the analysis). */
export type ReachKind = "value" | "decides" | "tested";

/** One record of the RWA_2 analysis followed forward from its product type. */
export type ForwardExample = {
  key: string;
  record: string;
  /** Its product type. */
  value: string;
  /** Its RWA at the end of the calculation. */
  end: number;
  steps: { term: string; value: string; how: string; reach: ReachKind }[];
  whatIf: string;
};

/** A field of the miniature result on the "Reading the result" screen. */
export type ViewField = {
  key: string;
  name: string;
  column: string;
  level: number;
  end?: boolean;
  /** Records reached, e.g. "5/5" (the selected field: its number of values). */
  records: string;
  /** The fields its content arrives through (empty for a next field). */
  via?: string;
  how: string;
  values?: { from: string; to: string }[];
};

export type ContentOnboardingCopy = {
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
    optional: string;
    stepOf: string;
    keyboard: string;
    play: string;
    pause: string;
    chapters: string[];
  };
  language: { title: string; subtitle: string; hint: string; defaultBadge: string; options: Record<ContentLocale, { name: string; native: string }> };
  welcome: { eyebrow: string; title: string; body: string[]; learnTitle: string; learn: string[] };
  difference: {
    eyebrow: string;
    title: string;
    intro: string;
    technicalLabel: string;
    contentLabel: string;
    questions: { key: string; question: string; technical: string[]; content: string; chips: string[] }[];
    footnote: string;
  };
  pipeline: { eyebrow: string; title: string; intro: string; footnote: string; nodes: { key: string; title: string; text: string; example: string[] }[] };
  forward: {
    eyebrow: string;
    title: string;
    intro: string;
    field: string;
    endLabel: string;
    recordLabel: string;
    reach: Record<ReachKind, string>;
    whatIfLabel: string;
    confirmed: string;
    footnote: string;
    items: ForwardExample[];
  };
  view: {
    eyebrow: string;
    title: string;
    intro: string;
    hint: string;
    columns: { start: string; next: string; step: string };
    legend: Record<"value" | "decides" | "end", string>;
    howLabel: string;
    viaLabel: string;
    directLabel: string;
    recordsLabel: string;
    valuesLabel: string;
    selectedLabel: string;
    fields: ViewField[];
    links: { from: string; to: string; kind: "value" | "decides" }[];
    parts: { title: string; text: string }[];
  };
  controls: { eyebrow: string; title: string; intro: string; rules: { title: string; text: string }[]; note: string };
  ready: { eyebrow: string; title: string; body: string[]; checklistTitle: string; checklist: string[] };
  tour: Record<TourStepId, TourText>;
  complete: { title: string; body: string; tipsTitle: string; tips: string[] };
};

/** The links of the miniature result (the same in both languages). */
const VIEW_LINKS: ContentOnboardingCopy["view"]["links"] = [
  { from: "productType", to: "bst", kind: "decides" },
  { from: "productType", to: "ab", kind: "decides" },
  { from: "bst", to: "ccf", kind: "decides" },
  { from: "ab", to: "ead", kind: "value" },
  { from: "ccf", to: "ead", kind: "value" },
  { from: "ead", to: "rwa", kind: "value" },
];

const EN: ContentOnboardingCopy = {
  ui: {
    product: "Content Lineage",
    minutes: "AI agents · about 7 minutes",
    skipIntro: "Skip introduction",
    skipTour: "Skip tour",
    back: "Back",
    next: "Next",
    begin: "Let's begin",
    continue: "Continue",
    startTour: "Start the hands-on tour",
    finish: "Finish",
    doItForMe: "Do it for me",
    endTour: "End the tour",
    runFailed: "The analysis stopped without a result",
    startAgain: "Start it again",
    yourTurn: "Your turn",
    watch: "Watch",
    wellDone: "Well done – moving on",
    optional: "Optional",
    stepOf: "Step {n} of {total}",
    keyboard: "← → to navigate · Esc to close",
    play: "Play",
    pause: "Pause",
    chapters: ["Language", "Welcome", "Two kinds of lineage", "How the agent works", "Follow a record", "Reading the result", "Controls", "Ready"],
  },
  language: {
    title: "Choose your language",
    subtitle: "Wählen Sie Ihre Sprache",
    hint: "The whole tab follows this choice – including the business terms and explanations, which the agent writes in English and German for every analysis. You can switch at any time with the EN | DE switch in the tab's header; the rest of the application keeps its own language.",
    defaultBadge: "Default",
    options: { en: { name: "English", native: "English" }, de: { name: "German", native: "Deutsch" } },
  },
  welcome: {
    eyebrow: "Content Lineage AI Agents",
    title: "Pick a field – see where its content goes",
    body: [
      "A field such as the product type is one value per record. But it does not stay there: the calculation uses it to classify each position as on- or off-balance, to choose how the assessment base is determined, and through those it reaches the conversion factor, the exposure value and finally the risk-weighted assets.",
      "This agent follows that content forward for any field of any executed calculation. It shows the next fields it flows into and every field further downstream, step by step to the end of the calculation – and for each of them how the field reaches it, which records it affects and what they would be with another value.",
    ],
    learnTitle: "In the next few minutes you will learn",
    learn: [
      "how content lineage differs from technical lineage",
      "the four stages of the agent and what each one guarantees",
      "how one record's value travels to the end of the calculation",
      "how to read the result – one screen, from the field to the end",
      "which controls make the result reliable",
    ],
  },
  difference: {
    eyebrow: "Two kinds of lineage",
    title: "Technical lineage tells you which columns the code writes. Content lineage tells you what becomes of a field.",
    intro: "Both look at the same calculation. Step through three questions a reviewer asks about the product type and compare the answers.",
    technicalLabel: "Technical lineage answers",
    contentLabel: "Content lineage answers",
    footnote: "Answers from a real analysis of the RWA_2 execution that follows ProductType.",
    questions: [
      {
        key: "where",
        question: "Where does the product type go?",
        technical: ["line 13: BalanceSheetType ← map(ProductType)", "lines 20–26: masks on ProductType", "     → Assessment Base", "downstream: BalanceSheetType, Assessment Base"],
        content: "It is the key of the balance-sheet table and decides which assessment base applies. Through these two next fields it reaches the conversion factor, the exposure value and finally RWA – in all 5 records.",
        chips: ["2 next fields", "5 downstream fields", "RWA: 5 of 5 records"],
      },
      {
        key: "limit",
        question: "What does it decide for Limit_5?",
        technical: ["Limit_5 · ProductType = 'Limit'", "line 24 writes Assessment Base", "line 36 writes CCF"],
        content: "As a 'Limit' it is off-balance, so its conversion factor is 20 %, and its assessment base is the nominal of 90,000: exposure value 18,000, RWA 9,000. As a 'Loan' its RWA would be 40,000.",
        chips: ["'Limit' → 'OffBalance' → 20 %", "'Limit' → nominal 90,000", "as 'Loan': RWA 40,000"],
      },
      {
        key: "reach",
        question: "Which records does it reach – and how?",
        technical: ["no record-level view in the code"],
        content: "All 5. For loans and deposits the assessment base comes from a default case that does not read the product type – re-running the calculation with another product type shows that it still decides that this case applies.",
        chips: ["decides the case", "changes with it"],
      },
    ],
  },
  pipeline: {
    eyebrow: "How the agent works",
    title: "Four stages – facts first, then words",
    intro: "The first two stages are deterministic: they establish where the field's content goes and confirm it by re-running the calculation with other values of the field. The AI only names and explains those facts – and every claim it makes is checked.",
    footnote: "Examples from a real analysis of the RWA_2 execution (ProductType).",
    nodes: [
      {
        key: "trace",
        title: "Trace",
        text: "The calculation is replayed statement by statement in the platform's sandbox. Every value of every column is attributed to the statement that wrote it – or recognised as delivered by the source. The replay must reproduce the stored execution.",
        example: ["18 statements replayed", "65 of 65 values identical to the stored execution", "Limit_5 · Assessment Base ∅ → 90,000 (line 24)"],
      },
      {
        key: "follow",
        title: "Follow",
        text: "From the selected field the agent follows every statement that reads it – and every statement that reads what those wrote – up to the end of the calculation. Each downstream field gets its rule and cases; each record is attributed. Then the calculation is re-run with other values of the field and every value is compared: a field that changes but was not found is added.",
        example: ["ProductType → 2 next fields, 5 downstream, 1 end field", "Re-run 7 times · 5 of 5 fields change", "RWA reached in 5 of 5 records"],
      },
      {
        key: "describe",
        title: "Describe",
        text: "The AI names every business term, states every rule and case in business language and explains how the field reaches each downstream field. Fields and cases are closed sets, and every number must be a parameter of the code – otherwise the text goes back for correction.",
        example: ["BalanceSheetType → “Balance Sheet Type”", "Case → “Limit: use nominal”", "Numbers check: passed"],
      },
      {
        key: "translate",
        title: "Translate",
        text: "Every AI text is translated, with numbers and the data's values kept exactly. The whole result is available in English and German.",
        example: ["55 texts translated into German", "“Credit Conversion Factor (CCF)” → “Kreditumrechnungsfaktor (CCF)”", "Values such as 'OffBalance' unchanged"],
      },
    ],
  },
  forward: {
    eyebrow: "Follow a record",
    title: "One record's product type, all the way to RWA",
    intro: "Choose a record: you see the value of each downstream field, the case behind it and how the product type reaches it – and, from re-running the calculation, what the record would get with another product type.",
    field: "Product type",
    endLabel: "RWA",
    recordLabel: "Record",
    reach: { value: "uses its value", decides: "decides the case", tested: "changes with it" },
    whatIfLabel: "What if",
    confirmed: "All 5 records reach RWA: 94,200 of 94,200 depend on the product type – confirmed by re-running the calculation.",
    footnote: "The five records of the RWA_2 analysis that follows ProductType.",
    items: [
      { key: "limit", record: "Limit_5", value: "Limit", end: 9000, steps: [
        { term: "Balance-sheet type", value: "'OffBalance'", how: "table key 'Limit' → 'OffBalance'", reach: "decides" },
        { term: "Assessment base", value: "90,000", how: "case Limit: use nominal", reach: "decides" },
        { term: "Credit conversion factor", value: "20 %", how: "table key 'OffBalance' → 20 %", reach: "decides" },
        { term: "Exposure value (EAD)", value: "18,000", how: "assessment base × CCF", reach: "decides" },
        { term: "RWA", value: "9,000", how: "EAD × risk weight (banks 50 %)", reach: "decides" },
      ], whatIf: "As a 'Loan' it would be on balance (100 %) with book value plus accrued interest as its base: RWA 40,000 instead of 9,000." },
      { key: "loan", record: "Loan_1", value: "Loan", end: 20200, steps: [
        { term: "Balance-sheet type", value: "'OnBalance'", how: "table key 'Loan' → 'OnBalance'", reach: "decides" },
        { term: "Assessment base", value: "20,200", how: "other: book value + accrued interest", reach: "tested" },
        { term: "Credit conversion factor", value: "100 %", how: "table key 'OnBalance' → 100 %", reach: "decides" },
        { term: "Exposure value (EAD)", value: "20,200", how: "assessment base × CCF", reach: "decides" },
        { term: "RWA", value: "20,200", how: "EAD × risk weight (corporates 100 %)", reach: "decides" },
      ], whatIf: "As a 'Security' its base would be its market value, which is 0: RWA 0 instead of 20,200." },
      { key: "deposit", record: "Deposit_2", value: "Deposit", end: 50000, steps: [
        { term: "Balance-sheet type", value: "'OnBalance'", how: "table key 'Deposit' → 'OnBalance'", reach: "decides" },
        { term: "Assessment base", value: "100,000", how: "other: book value + accrued interest", reach: "tested" },
        { term: "Credit conversion factor", value: "100 %", how: "table key 'OnBalance' → 100 %", reach: "decides" },
        { term: "Exposure value (EAD)", value: "100,000", how: "assessment base × CCF", reach: "decides" },
        { term: "RWA", value: "50,000", how: "EAD × risk weight (banks 50 %)", reach: "decides" },
      ], whatIf: "As a 'Guarantee' it would be off balance (20 %) with its nominal of 150,000 as base: RWA 15,000 instead of 50,000." },
      { key: "security", record: "Security_3", value: "Security", end: 15000, steps: [
        { term: "Balance-sheet type", value: "'OnBalance'", how: "table key 'Security' → 'OnBalance'", reach: "decides" },
        { term: "Assessment base", value: "30,000", how: "case Security: use market value", reach: "decides" },
        { term: "Credit conversion factor", value: "100 %", how: "table key 'OnBalance' → 100 %", reach: "decides" },
        { term: "Exposure value (EAD)", value: "30,000", how: "assessment base × CCF", reach: "decides" },
        { term: "RWA", value: "15,000", how: "EAD × risk weight (banks 50 %)", reach: "decides" },
      ], whatIf: "As a 'Deposit' its base would be book value plus accrued interest (40,100): RWA 20,050 instead of 15,000." },
      { key: "guarantee", record: "Guarantee_4", value: "Guarantee", end: 0, steps: [
        { term: "Balance-sheet type", value: "'OffBalance'", how: "table key 'Guarantee' → 'OffBalance'", reach: "decides" },
        { term: "Assessment base", value: "50,000", how: "case Guarantee: use nominal", reach: "decides" },
        { term: "Credit conversion factor", value: "20 %", how: "table key 'OffBalance' → 20 %", reach: "decides" },
        { term: "Exposure value (EAD)", value: "10,000", how: "assessment base × CCF", reach: "decides" },
        { term: "RWA", value: "0", how: "EAD × risk weight (sovereigns 0 %)", reach: "decides" },
      ], whatIf: "With any other product type RWA stays 0 – the risk weight of sovereigns is 0 %. Only a product type the tables do not know changes it: RWA then stays empty." },
    ],
  },
  view: {
    eyebrow: "Reading the result",
    title: "One screen: the field on the left, everything it reaches to the right",
    intro: "The result shows the selected field, its next fields and every further step up to the end of the calculation. Click a field to see how the selected field reaches it – the path to it lights up.",
    hint: "Click a field.",
    columns: { start: "Selected field", next: "Next fields", step: "Step {level}" },
    legend: { value: "carries the value", decides: "decides the case or parameter", end: "end of the calculation" },
    howLabel: "How the product type reaches it",
    viaLabel: "Arrives via",
    directLabel: "Its rule reads the product type directly",
    recordsLabel: "Records reached",
    valuesLabel: "Value by value",
    selectedLabel: "The field you follow. Its values:",
    fields: [
      { key: "productType", name: "Product type", column: "ProductType", level: 0, records: "5 values", how: "'Loan', 'Deposit', 'Security', 'Limit', 'Guarantee'" },
      { key: "bst", name: "Balance-sheet type", column: "BalanceSheetType", level: 1, records: "5/5", how: "A table keyed by the product type: 'Loan', 'Deposit' and 'Security' are 'OnBalance', 'Limit' and 'Guarantee' 'OffBalance' – unless the source delivers a value.", values: [{ from: "Limit", to: "OffBalance" }, { from: "Loan", to: "OnBalance" }] },
      { key: "ab", name: "Assessment base", column: "Assessment Base", level: 1, records: "5/5", how: "Conditions on the product type: 'Limit' and 'Guarantee' use the nominal amount, 'Security' the market value, all others book value plus accrued interest.", values: [{ from: "Limit", to: "90,000" }, { from: "Loan", to: "20,200" }] },
      { key: "ccf", name: "Credit conversion factor", column: "CCF", level: 2, records: "5/5", via: "Balance-sheet type", how: "Keyed by the balance-sheet type, which the product type sets: 'OnBalance' 100 %, 'OffBalance' 20 %.", values: [{ from: "Limit", to: "20 %" }, { from: "Loan", to: "100 %" }] },
      { key: "ead", name: "Exposure value (EAD)", column: "EAD", level: 3, records: "5/5", via: "Assessment base, credit conversion factor", how: "Assessment base × credit conversion factor – both decided by the product type.", values: [{ from: "Limit", to: "18,000" }, { from: "Loan", to: "20,200" }] },
      { key: "rwa", name: "RWA", column: "RWA", level: 4, end: true, records: "5/5", via: "Exposure value (EAD)", how: "Exposure value × risk weight – the end of the calculation.", values: [{ from: "Limit", to: "9,000" }, { from: "Loan", to: "20,200" }] },
    ],
    links: VIEW_LINKS,
    parts: [
      { title: "Summary", text: "Where the content goes in a few sentences, with the number of next, downstream and end fields." },
      { title: "Lineage", text: "Each column is a step of the calculation; the arrows show which field feeds which." },
      { title: "Details", text: "For the field you click: how the selected field reaches it, the records it affects, value by value, and an example." },
      { title: "Checks and notes", text: "Ten controls and any data issues, one click away at the bottom." },
    ],
  },
  controls: {
    eyebrow: "Controls",
    title: "Ten controls make the result reliable",
    intro: "Every analysis runs the same deterministic checks. You find them, with their figures, under Checks and notes at the bottom of the result and in the Excel export.",
    rules: [
      { title: "Replay reproduces", text: "The replayed calculation equals the stored execution, value by value." },
      { title: "Nothing missed", text: "Re-running the calculation finds no field that changes with the field but is missing from the result." },
      { title: "Every field confirmed", text: "Every downstream field the code shows changes when the calculation is re-run with other values." },
      { title: "Terms named", text: "Every business term has a name and a definition." },
      { title: "Cases described", text: "Every case of every rule is described in business language." },
      { title: "Usage explained", text: "How the field reaches every downstream field is explained." },
      { title: "Numbers grounded", text: "Every number in an AI text is a parameter of the code." },
      { title: "Categories covered", text: "Every category in the data has a parameter in its table." },
      { title: "End fields complete", text: "Every record carries a value in every end field." },
      { title: "Texts translated", text: "Every AI text is available in English and German." },
    ],
    note: "Where the content goes is a fact – established from the code and confirmed by re-running it; the AI names and explains it. Where a check fails, the agent shows it – under Checks and notes and in the export – and never smooths it over.",
  },
  ready: {
    eyebrow: "Ready",
    title: "Now try it on the real tab",
    body: [
      "The hands-on tour walks you through the live tab. You choose an execution and the field to follow, and start a real analysis yourself; the tour follows it while it runs (usually under a minute) and then walks you through its result.",
      "Wherever the tour asks you to act, you can also click “Do it for me”.",
    ],
    checklistTitle: "In the hands-on tour you will",
    checklist: [
      "choose an execution and the field to follow – and see what comes next before you start",
      "watch the four stages and the agent log",
      "read where the content goes, step by step",
      "click a field to see how the selected field reaches it",
      "find the checks and notes",
    ],
  },
  tour: {
    header: { chapter: "Setup", title: "Content Lineage AI Agents", body: ["Choose an execution and a field – the agent shows where the field's content goes. Earlier analyses stay in the Analyses menu; Guided tour starts this tour again at any time."] },
    language: {
      chapter: "Setup",
      title: "Work in English or German",
      body: [
        "This switch sets the language of the whole tab: labels, business terms, explanations, the log and the Excel export.",
        "Each analysis is written in both languages, so you can switch at any time – also while you read a result.",
      ],
    },
    executions: {
      chapter: "Setup",
      title: "Choose an execution",
      body: ["An execution is one run of a cluster: its code applied to its dataset, with the stored result. The agent follows a field through exactly that calculation."],
      action: "Select an execution – an RWA calculation shows the most.",
      empty: "No cluster has been executed yet, so there is nothing to follow. Run a cluster in the Cluster tab first, then start this tour again with “Guided tour”.",
    },
    fields: {
      chapter: "Setup",
      title: "Choose the field to follow",
      body: ["Every field of the execution is listed with the fields it flows into next. A field nothing is derived from – an identifier, or the last figure of the calculation – cannot be followed."],
      action: "Select a field – the product type of an RWA calculation reaches the most.",
      empty: "No field of this execution flows into another field. Go back and choose another execution.",
    },
    forwardPreview: {
      chapter: "Setup",
      title: "What comes next – before you start",
      body: [
        "The fields the analysis will follow, step by step to the end of the calculation. It is the same computation the analysis runs, so the result will show exactly these fields.",
        "A quick check on the first records has already re-run the calculation with other values of the field; a field only this check finds is marked.",
      ],
    },
    method: { chapter: "Setup", title: "The method in four stages", body: ["Trace and follow establish the facts – where the content goes, confirmed by re-running the calculation; describe puts them into business language; translate makes everything available in English and German."] },
    runBar: {
      chapter: "Setup",
      title: "Start the analysis",
      body: ["This starts a real analysis – exactly as outside the tour. It usually takes under a minute and calls the language model; the result is saved in the Analyses menu."],
      action: "Click “Follow …”.",
    },
    progress: { chapter: "Live", title: "The agent at work", body: ["Your analysis is running now. It continues on the server – you can leave the tab and come back, it will be reattached – and Cancel stops it after the current step."] },
    stages: { chapter: "Live", title: "Four stages with live counters", body: ["Each card fills in as the agent completes the stage: values reproduced, next and downstream fields found and confirmed by re-running, rules described, texts translated."] },
    console: {
      chapter: "Live",
      title: "The agent log",
      body: ["Every step in plain language: the fields the content flows into, the re-run that confirms them, the business terms and rules described, the translation."],
      action: "Wait for the analysis to finish – the tour continues by itself as soon as the result is ready.",
    },
    meta: { chapter: "Result", title: "The analysis at a glance", body: ["The field you followed and how many fields it reaches, then cluster, execution, code, dataset, runtime and model. Export to Excel gives you the workbook in the language you are using."] },
    summary: { chapter: "Result", title: "Where the content goes", body: ["A short summary in business language, then the numbers: the next fields, how many fields downstream in how many steps, the end fields, and how many records reach the end. The line below says whether re-running the calculation confirmed it."] },
    lineage: {
      chapter: "Result",
      title: "The lineage, step by step",
      body: [
        "The selected field on the left; each column to the right is one step of the calculation, up to the end fields (flag).",
        "Solid green arrows carry the value, dashed amber arrows decide a case or parameter – a condition or a table key. The bar on each field shows how many records the selected field reaches there.",
      ],
    },
    lineageField: {
      chapter: "Result",
      title: "Click a next field",
      body: ["Clicking a field shows how the selected field reaches it; the path from the selected field lights up."],
      action: "Click one of the next fields – the column right after the selected field.",
    },
    details: {
      chapter: "Result",
      title: "How the field reaches it",
      body: [
        "The AI's explanation, backed by the facts: which records it affects and how – it uses the value, it decides the case, or the value changes with it – then value by value what the field becomes, and an example of what a record would get with another value.",
        "The business rule with its cases is one click further down.",
      ],
    },
    quality: { chapter: "Result", title: "Checks and notes", body: ["Ten controls and any points to note – for example source values that are not numbers. Click the bar to open them; the agent log is there too. A failed control is never hidden."] },
    newRun: { chapter: "Done", title: "Your turn", body: ["Follow another field of any executed calculation. Earlier analyses – including the one from this tour – stay in the Analyses menu."] },
  },
  complete: {
    title: "You're ready to follow any field",
    body: "The analysis from this tour is yours: it stays on screen and in the Analyses menu. Start the next one with New analysis.",
    tipsTitle: "Good practice",
    tips: [
      "Before you change a field or its source, follow it: the end fields show what the change would touch.",
      "“Changes with it” means the field decides a case that does not read it – re-running the calculation shows it.",
      "Read a field's example before you sign off a change: it shows what one record would get with another value.",
    ],
  },
};

const DE: ContentOnboardingCopy = {
  ui: {
    product: "Inhalts-Herkunft",
    minutes: "KI-Agenten · etwa 7 Minuten",
    skipIntro: "Einführung überspringen",
    skipTour: "Tour beenden",
    back: "Zurück",
    next: "Weiter",
    begin: "Los geht's",
    continue: "Weiter",
    startTour: "Praxis-Tour starten",
    finish: "Abschließen",
    doItForMe: "Für mich erledigen",
    endTour: "Tour beenden",
    runFailed: "Die Analyse wurde ohne Ergebnis beendet",
    startAgain: "Erneut starten",
    yourTurn: "Ihr Schritt",
    watch: "Zusehen",
    wellDone: "Gut gemacht – weiter geht's",
    optional: "Optional",
    stepOf: "Schritt {n} von {total}",
    keyboard: "← → zum Blättern · Esc zum Schließen",
    play: "Abspielen",
    pause: "Pause",
    chapters: ["Sprache", "Willkommen", "Zwei Arten von Herkunft", "So arbeitet der Agent", "Einen Datensatz verfolgen", "Das Ergebnis lesen", "Kontrollen", "Bereit"],
  },
  language: {
    title: "Wählen Sie Ihre Sprache",
    subtitle: "Choose your language",
    hint: "Der ganze Tab folgt dieser Wahl – auch die Fachbegriffe und Erklärungen, die der Agent für jede Analyse auf Deutsch und Englisch verfasst. Sie können jederzeit mit dem Schalter EN | DE in der Kopfzeile des Tabs wechseln; die übrige Anwendung behält ihre eigene Sprache.",
    defaultBadge: "Standard",
    options: { en: { name: "Englisch", native: "English" }, de: { name: "Deutsch", native: "Deutsch" } },
  },
  welcome: {
    eyebrow: "Inhalts-Herkunft – KI-Agenten",
    title: "Feld wählen – sehen, wohin sein Inhalt fließt",
    body: [
      "Ein Feld wie der Produkttyp ist ein Wert je Datensatz. Aber er bleibt nicht dort: Die Berechnung klassifiziert damit jede Position als bilanziell oder außerbilanziell, wählt, wie die Bemessungsgrundlage bestimmt wird, und über diese erreicht er den Kreditumrechnungsfaktor, den Risikopositionswert und schließlich den risikogewichteten Positionsbetrag.",
      "Dieser Agent verfolgt diesen Inhalt vorwärts – für jedes Feld jeder ausgeführten Berechnung. Er zeigt die nächsten Felder, in die er fließt, und jedes weiter nachgelagerte Feld, Schritt für Schritt bis zum Ende der Berechnung – und für jedes davon, wie das Feld es erreicht, welche Datensätze es betrifft und was diese mit einem anderen Wert wären.",
    ],
    learnTitle: "In den nächsten Minuten lernen Sie",
    learn: [
      "wie sich die Inhalts-Herkunft von der technischen Herkunft unterscheidet",
      "die vier Stufen des Agenten und was jede gewährleistet",
      "wie der Wert eines Datensatzes bis zum Ende der Berechnung wandert",
      "wie Sie das Ergebnis lesen – ein Bildschirm, vom Feld bis zum Ende",
      "welche Kontrollen das Ergebnis verlässlich machen",
    ],
  },
  difference: {
    eyebrow: "Zwei Arten von Herkunft",
    title: "Technische Herkunft zeigt, welche Spalten der Code schreibt. Inhalts-Herkunft zeigt, was aus einem Feld wird.",
    intro: "Beide betrachten dieselbe Berechnung. Gehen Sie drei Fragen durch, die ein Prüfer zum Produkttyp stellt, und vergleichen Sie die Antworten.",
    technicalLabel: "Technische Herkunft antwortet",
    contentLabel: "Inhalts-Herkunft antwortet",
    footnote: "Antworten aus einer echten Analyse der Ausführung RWA_2, die ProductType verfolgt.",
    questions: [
      {
        key: "where",
        question: "Wohin fließt der Produkttyp?",
        technical: ["Zeile 13: BalanceSheetType ← map(ProductType)", "Zeilen 20–26: Masken auf ProductType", "     → Assessment Base", "nachgelagert: BalanceSheetType, Assessment Base"],
        content: "Er ist der Schlüssel der Bilanztabelle und entscheidet, welche Bemessungsgrundlage gilt. Über diese beiden nächsten Felder erreicht er den Kreditumrechnungsfaktor, den Risikopositionswert und schließlich den RWA – in allen 5 Datensätzen.",
        chips: ["2 nächste Felder", "5 nachgelagerte Felder", "RWA: 5 von 5 Datensätzen"],
      },
      {
        key: "limit",
        question: "Was entscheidet er für Limit_5?",
        technical: ["Limit_5 · ProductType = 'Limit'", "Zeile 24 schreibt Assessment Base", "Zeile 36 schreibt CCF"],
        content: "Als 'Limit' ist die Position außerbilanziell, ihr Kreditumrechnungsfaktor also 20 %, und ihre Bemessungsgrundlage ist der Nominalbetrag von 90.000: Risikopositionswert 18.000, RWA 9.000. Als 'Loan' läge ihr RWA bei 40.000.",
        chips: ["'Limit' → 'OffBalance' → 20 %", "'Limit' → Nominal 90.000", "als 'Loan': RWA 40.000"],
      },
      {
        key: "reach",
        question: "Welche Datensätze erreicht er – und wie?",
        technical: ["keine Sicht auf einzelne Datensätze im Code"],
        content: "Alle 5. Für Darlehen und Einlagen stammt die Bemessungsgrundlage aus einem Standardfall, der den Produkttyp nicht liest – das erneute Ausführen der Berechnung mit einem anderen Produkttyp zeigt, dass er trotzdem entscheidet, dass dieser Fall gilt.",
        chips: ["entscheidet den Fall", "ändert sich mit ihm"],
      },
    ],
  },
  pipeline: {
    eyebrow: "So arbeitet der Agent",
    title: "Vier Stufen – erst Fakten, dann Worte",
    intro: "Die ersten beiden Stufen sind deterministisch: Sie stellen fest, wohin der Inhalt des Feldes fließt, und bestätigen es, indem sie die Berechnung mit anderen Werten des Feldes erneut ausführen. Die KI benennt und erklärt nur diese Fakten – und jede ihrer Aussagen wird geprüft.",
    footnote: "Beispiele aus einer echten Analyse der Ausführung RWA_2 (ProductType).",
    nodes: [
      {
        key: "trace",
        title: "Nachverfolgen",
        text: "Die Berechnung wird Anweisung für Anweisung in der Sandbox der Plattform wiederholt. Jeder Wert jeder Spalte wird der Anweisung zugeordnet, die ihn geschrieben hat – oder als von der Quelle geliefert erkannt. Die Wiederholung muss die gespeicherte Ausführung reproduzieren.",
        example: ["18 Anweisungen wiederholt", "65 von 65 Werten identisch mit der gespeicherten Ausführung", "Limit_5 · Assessment Base ∅ → 90.000 (Zeile 24)"],
      },
      {
        key: "follow",
        title: "Verfolgen",
        text: "Vom ausgewählten Feld aus verfolgt der Agent jede Anweisung, die es liest – und jede Anweisung, die liest, was diese geschrieben haben – bis zum Ende der Berechnung. Jedes nachgelagerte Feld erhält seine Regel und Fälle; jeder Datensatz wird zugeordnet. Dann wird die Berechnung mit anderen Werten des Feldes erneut ausgeführt und jeder Wert verglichen: Ein Feld, das sich ändert, aber nicht gefunden wurde, wird ergänzt.",
        example: ["ProductType → 2 nächste Felder, 5 nachgelagerte, 1 Endfeld", "7-mal erneut ausgeführt · 5 von 5 Feldern ändern sich", "RWA in 5 von 5 Datensätzen erreicht"],
      },
      {
        key: "describe",
        title: "Beschreiben",
        text: "Die KI benennt jeden Fachbegriff, formuliert jede Regel und jeden Fall fachlich und erklärt, wie das Feld jedes nachgelagerte Feld erreicht. Felder und Fälle sind geschlossene Mengen, und jede Zahl muss ein Parameter des Codes sein – sonst geht der Text zur Korrektur zurück.",
        example: ["BalanceSheetType → „Bilanzpostentyp“", "Fall → „Limit: Nominal verwenden“", "Zahlenprüfung: bestanden"],
      },
      {
        key: "translate",
        title: "Übersetzen",
        text: "Jeder KI-Text wird übersetzt; Zahlen und die Werte der Daten bleiben exakt erhalten. Das ganze Ergebnis steht auf Deutsch und Englisch zur Verfügung.",
        example: ["55 Texte ins Deutsche übersetzt", "„Credit Conversion Factor (CCF)“ → „Kreditumrechnungsfaktor (CCF)“", "Werte wie 'OffBalance' unverändert"],
      },
    ],
  },
  forward: {
    eyebrow: "Einen Datensatz verfolgen",
    title: "Der Produkttyp eines Datensatzes, den ganzen Weg bis zum RWA",
    intro: "Wählen Sie einen Datensatz: Sie sehen den Wert jedes nachgelagerten Feldes, den Fall dahinter und wie der Produkttyp ihn erreicht – und, aus dem erneuten Ausführen der Berechnung, was der Datensatz mit einem anderen Produkttyp erhielte.",
    field: "Produkttyp",
    endLabel: "RWA",
    recordLabel: "Datensatz",
    reach: { value: "übernimmt seinen Wert", decides: "entscheidet den Fall", tested: "ändert sich mit ihm" },
    whatIfLabel: "Was wäre wenn",
    confirmed: "Alle 5 Datensätze erreichen den RWA: 94.200 von 94.200 hängen vom Produkttyp ab – bestätigt durch erneutes Ausführen der Berechnung.",
    footnote: "Die fünf Datensätze der Analyse von RWA_2, die ProductType verfolgt.",
    items: [
      { key: "limit", record: "Limit_5", value: "Limit", end: 9000, steps: [
        { term: "Bilanztyp", value: "'OffBalance'", how: "Tabellenschlüssel 'Limit' → 'OffBalance'", reach: "decides" },
        { term: "Bemessungsgrundlage", value: "90.000", how: "Fall Limit: Nominal verwenden", reach: "decides" },
        { term: "Kreditumrechnungsfaktor", value: "20 %", how: "Tabellenschlüssel 'OffBalance' → 20 %", reach: "decides" },
        { term: "Risikopositionswert (EAD)", value: "18.000", how: "Bemessungsgrundlage × CCF", reach: "decides" },
        { term: "RWA", value: "9.000", how: "EAD × Risikogewicht (Institute 50 %)", reach: "decides" },
      ], whatIf: "Als 'Loan' wäre die Position bilanziell (100 %) mit Buchwert plus aufgelaufenen Zinsen als Grundlage: RWA 40.000 statt 9.000." },
      { key: "loan", record: "Loan_1", value: "Loan", end: 20200, steps: [
        { term: "Bilanztyp", value: "'OnBalance'", how: "Tabellenschlüssel 'Loan' → 'OnBalance'", reach: "decides" },
        { term: "Bemessungsgrundlage", value: "20.200", how: "Sonstige: Buchwert + aufgelaufene Zinsen", reach: "tested" },
        { term: "Kreditumrechnungsfaktor", value: "100 %", how: "Tabellenschlüssel 'OnBalance' → 100 %", reach: "decides" },
        { term: "Risikopositionswert (EAD)", value: "20.200", how: "Bemessungsgrundlage × CCF", reach: "decides" },
        { term: "RWA", value: "20.200", how: "EAD × Risikogewicht (Unternehmen 100 %)", reach: "decides" },
      ], whatIf: "Als 'Security' wäre die Grundlage ihr Marktwert, und der ist 0: RWA 0 statt 20.200." },
      { key: "deposit", record: "Deposit_2", value: "Deposit", end: 50000, steps: [
        { term: "Bilanztyp", value: "'OnBalance'", how: "Tabellenschlüssel 'Deposit' → 'OnBalance'", reach: "decides" },
        { term: "Bemessungsgrundlage", value: "100.000", how: "Sonstige: Buchwert + aufgelaufene Zinsen", reach: "tested" },
        { term: "Kreditumrechnungsfaktor", value: "100 %", how: "Tabellenschlüssel 'OnBalance' → 100 %", reach: "decides" },
        { term: "Risikopositionswert (EAD)", value: "100.000", how: "Bemessungsgrundlage × CCF", reach: "decides" },
        { term: "RWA", value: "50.000", how: "EAD × Risikogewicht (Institute 50 %)", reach: "decides" },
      ], whatIf: "Als 'Guarantee' wäre die Position außerbilanziell (20 %) mit ihrem Nominalbetrag von 150.000 als Grundlage: RWA 15.000 statt 50.000." },
      { key: "security", record: "Security_3", value: "Security", end: 15000, steps: [
        { term: "Bilanztyp", value: "'OnBalance'", how: "Tabellenschlüssel 'Security' → 'OnBalance'", reach: "decides" },
        { term: "Bemessungsgrundlage", value: "30.000", how: "Fall Wertpapier: Marktwert verwenden", reach: "decides" },
        { term: "Kreditumrechnungsfaktor", value: "100 %", how: "Tabellenschlüssel 'OnBalance' → 100 %", reach: "decides" },
        { term: "Risikopositionswert (EAD)", value: "30.000", how: "Bemessungsgrundlage × CCF", reach: "decides" },
        { term: "RWA", value: "15.000", how: "EAD × Risikogewicht (Institute 50 %)", reach: "decides" },
      ], whatIf: "Als 'Deposit' wäre die Grundlage Buchwert plus aufgelaufene Zinsen (40.100): RWA 20.050 statt 15.000." },
      { key: "guarantee", record: "Guarantee_4", value: "Guarantee", end: 0, steps: [
        { term: "Bilanztyp", value: "'OffBalance'", how: "Tabellenschlüssel 'Guarantee' → 'OffBalance'", reach: "decides" },
        { term: "Bemessungsgrundlage", value: "50.000", how: "Fall Garantie: Nominal verwenden", reach: "decides" },
        { term: "Kreditumrechnungsfaktor", value: "20 %", how: "Tabellenschlüssel 'OffBalance' → 20 %", reach: "decides" },
        { term: "Risikopositionswert (EAD)", value: "10.000", how: "Bemessungsgrundlage × CCF", reach: "decides" },
        { term: "RWA", value: "0", how: "EAD × Risikogewicht (Zentralstaaten 0 %)", reach: "decides" },
      ], whatIf: "Mit jedem anderen Produkttyp bleibt der RWA 0 – das Risikogewicht von Zentralstaaten ist 0 %. Nur ein Produkttyp, den die Tabellen nicht kennen, ändert ihn: Der RWA bleibt dann leer." },
    ],
  },
  view: {
    eyebrow: "Das Ergebnis lesen",
    title: "Ein Bildschirm: das Feld links, alles, was es erreicht, rechts",
    intro: "Das Ergebnis zeigt das ausgewählte Feld, seine nächsten Felder und jeden weiteren Schritt bis zum Ende der Berechnung. Klicken Sie ein Feld an, um zu sehen, wie das ausgewählte Feld es erreicht – der Weg dorthin leuchtet auf.",
    hint: "Klicken Sie ein Feld an.",
    columns: { start: "Ausgewähltes Feld", next: "Nächste Felder", step: "Schritt {level}" },
    legend: { value: "übernimmt den Wert", decides: "entscheidet Fall oder Parameter", end: "Ende der Berechnung" },
    howLabel: "Wie der Produkttyp es erreicht",
    viaLabel: "Kommt an über",
    directLabel: "Seine Regel liest den Produkttyp direkt",
    recordsLabel: "Erreichte Datensätze",
    valuesLabel: "Wert für Wert",
    selectedLabel: "Das Feld, das Sie verfolgen. Seine Werte:",
    fields: [
      { key: "productType", name: "Produkttyp", column: "ProductType", level: 0, records: "5 Werte", how: "'Loan', 'Deposit', 'Security', 'Limit', 'Guarantee'" },
      { key: "bst", name: "Bilanztyp", column: "BalanceSheetType", level: 1, records: "5/5", how: "Eine Tabelle mit dem Produkttyp als Schlüssel: 'Loan', 'Deposit' und 'Security' sind 'OnBalance', 'Limit' und 'Guarantee' 'OffBalance' – sofern die Quelle keinen Wert liefert.", values: [{ from: "Limit", to: "OffBalance" }, { from: "Loan", to: "OnBalance" }] },
      { key: "ab", name: "Bemessungs­grundlage", column: "Assessment Base", level: 1, records: "5/5", how: "Bedingungen auf dem Produkttyp: 'Limit' und 'Guarantee' nutzen den Nominalbetrag, 'Security' den Marktwert, alle übrigen Buchwert plus aufgelaufene Zinsen.", values: [{ from: "Limit", to: "90.000" }, { from: "Loan", to: "20.200" }] },
      { key: "ccf", name: "Kredit­umrechnungs­faktor", column: "CCF", level: 2, records: "5/5", via: "Bilanztyp", how: "Schlüssel ist der Bilanztyp, den der Produkttyp setzt: 'OnBalance' 100 %, 'OffBalance' 20 %.", values: [{ from: "Limit", to: "20 %" }, { from: "Loan", to: "100 %" }] },
      { key: "ead", name: "Risiko­positions­wert (EAD)", column: "EAD", level: 3, records: "5/5", via: "Bemessungsgrundlage, Kreditumrechnungsfaktor", how: "Bemessungsgrundlage × Kreditumrechnungsfaktor – beide entscheidet der Produkttyp.", values: [{ from: "Limit", to: "18.000" }, { from: "Loan", to: "20.200" }] },
      { key: "rwa", name: "RWA", column: "RWA", level: 4, end: true, records: "5/5", via: "Risikopositionswert (EAD)", how: "Risikopositionswert × Risikogewicht – das Ende der Berechnung.", values: [{ from: "Limit", to: "9.000" }, { from: "Loan", to: "20.200" }] },
    ],
    links: VIEW_LINKS,
    parts: [
      { title: "Zusammenfassung", text: "Wohin der Inhalt fließt, in wenigen Sätzen, mit der Zahl der nächsten, nachgelagerten und Endfelder." },
      { title: "Herkunft", text: "Jede Spalte ist ein Schritt der Berechnung; die Pfeile zeigen, welches Feld welches speist." },
      { title: "Details", text: "Für das angeklickte Feld: wie das ausgewählte Feld es erreicht, die betroffenen Datensätze, Wert für Wert, und ein Beispiel." },
      { title: "Prüfungen und Hinweise", text: "Zehn Kontrollen und etwaige Datenprobleme, einen Klick entfernt ganz unten." },
    ],
  },
  controls: {
    eyebrow: "Kontrollen",
    title: "Zehn Kontrollen machen das Ergebnis verlässlich",
    intro: "Jede Analyse durchläuft dieselben deterministischen Prüfungen. Sie finden sie mit ihren Kennzahlen unter Prüfungen und Hinweise ganz unten im Ergebnis und im Excel-Export.",
    rules: [
      { title: "Wiederholung reproduziert", text: "Die wiederholte Berechnung entspricht der gespeicherten Ausführung, Wert für Wert." },
      { title: "Nichts übersehen", text: "Das erneute Ausführen findet kein Feld, das sich mit dem Feld ändert, aber im Ergebnis fehlt." },
      { title: "Jedes Feld bestätigt", text: "Jedes nachgelagerte Feld, das der Code zeigt, ändert sich, wenn die Berechnung mit anderen Werten erneut ausgeführt wird." },
      { title: "Begriffe benannt", text: "Jeder Fachbegriff hat einen Namen und eine Definition." },
      { title: "Fälle beschrieben", text: "Jeder Fall jeder Regel ist fachlich beschrieben." },
      { title: "Verwendung erklärt", text: "Wie das Feld jedes nachgelagerte Feld erreicht, ist erklärt." },
      { title: "Zahlen belegt", text: "Jede Zahl in einem KI-Text ist ein Parameter des Codes." },
      { title: "Kategorien abgedeckt", text: "Jede Kategorie in den Daten hat einen Parameter in ihrer Tabelle." },
      { title: "Endfelder vollständig", text: "Jeder Datensatz hat in jedem Endfeld einen Wert." },
      { title: "Texte übersetzt", text: "Jeder KI-Text ist auf Deutsch und Englisch verfügbar." },
    ],
    note: "Wohin der Inhalt fließt, ist ein Fakt – festgestellt aus dem Code und bestätigt durch erneutes Ausführen; die KI benennt und erklärt ihn. Wo eine Prüfung scheitert, zeigt der Agent es – unter Prüfungen und Hinweise und im Export – und beschönigt nichts.",
  },
  ready: {
    eyebrow: "Bereit",
    title: "Jetzt im echten Tab ausprobieren",
    body: [
      "Die Praxis-Tour führt Sie durch den echten Tab. Sie wählen eine Ausführung und das zu verfolgende Feld und starten selbst eine echte Analyse; die Tour begleitet sie, während sie läuft (meist unter einer Minute), und führt Sie dann durch ihr Ergebnis.",
      "Wo die Tour Sie zum Handeln auffordert, können Sie auch auf „Für mich erledigen“ klicken.",
    ],
    checklistTitle: "In der Praxis-Tour werden Sie",
    checklist: [
      "eine Ausführung und das zu verfolgende Feld wählen – und vor dem Start sehen, was als Nächstes kommt",
      "die vier Stufen und das Agenten-Protokoll beobachten",
      "Schritt für Schritt lesen, wohin der Inhalt fließt",
      "ein Feld anklicken und sehen, wie das ausgewählte Feld es erreicht",
      "die Prüfungen und Hinweise finden",
    ],
  },
  tour: {
    header: { chapter: "Einrichtung", title: "Inhalts-Herkunft – KI-Agenten", body: ["Wählen Sie eine Ausführung und ein Feld – der Agent zeigt, wohin der Inhalt des Feldes fließt. Frühere Analysen bleiben im Menü Analysen; Geführte Tour startet diese Tour jederzeit erneut."] },
    language: {
      chapter: "Einrichtung",
      title: "Auf Deutsch oder Englisch arbeiten",
      body: [
        "Dieser Schalter legt die Sprache des ganzen Tabs fest: Beschriftungen, Fachbegriffe, Erklärungen, das Protokoll und den Excel-Export.",
        "Jede Analyse wird in beiden Sprachen verfasst, Sie können also jederzeit wechseln – auch während Sie ein Ergebnis lesen.",
      ],
    },
    executions: {
      chapter: "Einrichtung",
      title: "Eine Ausführung wählen",
      body: ["Eine Ausführung ist ein Lauf eines Clusters: sein Code, angewandt auf seinen Datensatz, mit dem gespeicherten Ergebnis. Der Agent verfolgt ein Feld durch genau diese Berechnung."],
      action: "Wählen Sie eine Ausführung – eine RWA-Berechnung zeigt am meisten.",
      empty: "Es wurde noch kein Cluster ausgeführt, es gibt also nichts zu verfolgen. Führen Sie zuerst einen Cluster im Tab Cluster aus und starten Sie diese Tour dann mit „Geführte Tour“ erneut.",
    },
    fields: {
      chapter: "Einrichtung",
      title: "Das zu verfolgende Feld wählen",
      body: ["Jedes Feld der Ausführung ist mit den Feldern aufgeführt, in die es als Nächstes fließt. Ein Feld, aus dem nichts abgeleitet wird – ein Identifikator oder die letzte Größe der Berechnung –, kann nicht verfolgt werden."],
      action: "Wählen Sie ein Feld – der Produkttyp einer RWA-Berechnung erreicht am meisten.",
      empty: "Kein Feld dieser Ausführung fließt in ein anderes Feld. Gehen Sie zurück und wählen Sie eine andere Ausführung.",
    },
    forwardPreview: {
      chapter: "Einrichtung",
      title: "Was als Nächstes kommt – vor dem Start",
      body: [
        "Die Felder, die die Analyse verfolgen wird, Schritt für Schritt bis zum Ende der Berechnung. Es ist dieselbe Berechnung, die die Analyse ausführt; das Ergebnis zeigt also genau diese Felder.",
        "Eine schnelle Prüfung auf den ersten Datensätzen hat die Berechnung bereits mit anderen Werten des Feldes erneut ausgeführt; ein Feld, das nur diese Prüfung findet, ist markiert.",
      ],
    },
    method: { chapter: "Einrichtung", title: "Die Methode in vier Stufen", body: ["Nachverfolgen und Verfolgen stellen die Fakten fest – wohin der Inhalt fließt, bestätigt durch erneutes Ausführen der Berechnung; Beschreiben fasst sie in fachliche Sprache; Übersetzen macht alles auf Deutsch und Englisch verfügbar."] },
    runBar: {
      chapter: "Einrichtung",
      title: "Die Analyse starten",
      body: ["Damit startet eine echte Analyse – genau wie außerhalb der Tour. Sie dauert meist unter einer Minute und ruft das Sprachmodell auf; das Ergebnis wird im Menü Analysen gespeichert."],
      action: "Klicken Sie auf „… verfolgen“.",
    },
    progress: { chapter: "Live", title: "Der Agent bei der Arbeit", body: ["Ihre Analyse läuft jetzt. Sie läuft auf dem Server weiter – Sie können den Tab verlassen und zurückkehren, sie wird wieder verbunden –, und Abbrechen stoppt sie nach dem aktuellen Schritt."] },
    stages: { chapter: "Live", title: "Vier Stufen mit Live-Zählern", body: ["Jede Karte füllt sich, sobald der Agent die Stufe abschließt: reproduzierte Werte, gefundene und durch erneutes Ausführen bestätigte nächste und nachgelagerte Felder, beschriebene Regeln, übersetzte Texte."] },
    console: {
      chapter: "Live",
      title: "Das Agenten-Protokoll",
      body: ["Jeder Schritt in Klartext: die Felder, in die der Inhalt fließt, das erneute Ausführen, das sie bestätigt, die beschriebenen Fachbegriffe und Regeln, die Übersetzung."],
      action: "Warten Sie, bis die Analyse fertig ist – die Tour geht von selbst weiter, sobald das Ergebnis vorliegt.",
    },
    meta: { chapter: "Ergebnis", title: "Die Analyse auf einen Blick", body: ["Das verfolgte Feld und wie viele Felder es erreicht, dann Cluster, Ausführung, Code, Datensatz, Laufzeit und Modell. Nach Excel exportieren liefert die Arbeitsmappe in der Sprache, die Sie gerade verwenden."] },
    summary: { chapter: "Ergebnis", title: "Wohin der Inhalt fließt", body: ["Eine kurze Zusammenfassung in fachlicher Sprache, dann die Zahlen: die nächsten Felder, wie viele Felder in wie vielen Schritten nachgelagert sind, die Endfelder und wie viele Datensätze das Ende erreichen. Die Zeile darunter sagt, ob das erneute Ausführen der Berechnung es bestätigt hat."] },
    lineage: {
      chapter: "Ergebnis",
      title: "Die Herkunft, Schritt für Schritt",
      body: [
        "Links das ausgewählte Feld; jede Spalte rechts davon ist ein Schritt der Berechnung, bis zu den Endfeldern (Fahne).",
        "Durchgezogene grüne Pfeile übernehmen den Wert, gestrichelte bernsteinfarbene entscheiden einen Fall oder Parameter – eine Bedingung oder einen Tabellenschlüssel. Der Balken auf jedem Feld zeigt, wie viele Datensätze das ausgewählte Feld dort erreicht.",
      ],
    },
    lineageField: {
      chapter: "Ergebnis",
      title: "Ein nächstes Feld anklicken",
      body: ["Ein Klick auf ein Feld zeigt, wie das ausgewählte Feld es erreicht; der Weg vom ausgewählten Feld dorthin leuchtet auf."],
      action: "Klicken Sie eines der nächsten Felder an – die Spalte direkt nach dem ausgewählten Feld.",
    },
    details: {
      chapter: "Ergebnis",
      title: "Wie das Feld es erreicht",
      body: [
        "Die Erklärung der KI, durch die Fakten belegt: welche Datensätze es betrifft und wie – es übernimmt den Wert, es entscheidet den Fall, oder der Wert ändert sich mit ihm –, dann Wert für Wert, was aus dem Feld wird, und ein Beispiel, was ein Datensatz mit einem anderen Wert erhielte.",
        "Die fachliche Regel mit ihren Fällen ist einen Klick weiter unten.",
      ],
    },
    quality: { chapter: "Ergebnis", title: "Prüfungen und Hinweise", body: ["Zehn Kontrollen und etwaige Hinweise – zum Beispiel Quellwerte, die keine Zahlen sind. Klicken Sie auf die Leiste, um sie zu öffnen; dort ist auch das Agenten-Protokoll. Eine gescheiterte Kontrolle wird nie verborgen."] },
    newRun: { chapter: "Fertig", title: "Ihr Schritt", body: ["Verfolgen Sie ein weiteres Feld einer beliebigen ausgeführten Berechnung. Frühere Analysen – auch die aus dieser Tour – bleiben im Menü Analysen."] },
  },
  complete: {
    title: "Sie sind bereit, jedes Feld zu verfolgen",
    body: "Die Analyse aus dieser Tour gehört Ihnen: Sie bleibt auf dem Bildschirm und im Menü Analysen. Starten Sie die nächste mit Neue Analyse.",
    tipsTitle: "Gute Praxis",
    tips: [
      "Bevor Sie ein Feld oder seine Quelle ändern, verfolgen Sie es: Die Endfelder zeigen, was die Änderung berühren würde.",
      "„Ändert sich mit ihm“ heißt, das Feld entscheidet einen Fall, der es nicht liest – das erneute Ausführen der Berechnung zeigt es.",
      "Lesen Sie das Beispiel eines Feldes, bevor Sie eine Änderung freigeben: Es zeigt, was ein Datensatz mit einem anderen Wert erhielte.",
    ],
  },
};

export const CONTENT_ONBOARDING_COPY: Record<ContentLocale, ContentOnboardingCopy> = { en: EN, de: DE };
