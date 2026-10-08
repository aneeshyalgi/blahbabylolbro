/**
 * Copy and step definitions for the Content Lineage AI Agents onboarding (English / German).
 * The examples come from a real analysis of the RWA_2 execution (code_2_rwa_again.py) against the CRR; column names
 * and code stay as they are in the data, in both languages.
 */

export type ContentLocale = "en" | "de";

export type DeckScreen = "language" | "welcome" | "difference" | "pipeline" | "rules" | "paths" | "graph" | "regulation" | "controls" | "ready";
export const DECK_SCREENS: DeckScreen[] = ["language", "welcome", "difference", "pipeline", "rules", "paths", "graph", "regulation", "controls", "ready"];

export type TourStage = "setup" | "progress" | "results";
export type TourView = "graph" | "figures" | "glossary" | "regulation" | "verification";
export type TourAction =
  | "selectExecution"
  | "selectFigure"
  | "selectRegulation"
  | "startRun"
  | "awaitResults"
  | "selectFigureNode"
  | "selectRule"
  | "selectProvision"
  | "selectRecord";
/** Parts of an analysis a step needs; steps whose part the analysis does not have are left out. */
export type TourRequirement = "regulation" | "provisions" | "segments";

export type TourStepId =
  | "header"
  | "language"
  | "executions"
  | "figures"
  | "regulations"
  | "method"
  | "runBar"
  | "progress"
  | "stages"
  | "console"
  | "meta"
  | "tabs"
  | "graph"
  | "graphFigure"
  | "graphRule"
  | "graphProvision"
  | "figureHead"
  | "origins"
  | "paths"
  | "segments"
  | "records"
  | "derivation"
  | "summary"
  | "glossary"
  | "rules"
  | "regulationHead"
  | "assessment"
  | "checks"
  | "findings"
  | "newRun";

export type TourStepDef = {
  id: TourStepId;
  /** data-tour attribute of the element to spotlight. */
  target: string;
  stage: TourStage;
  /** Result view the step lives on. */
  view?: TourView;
  /** Steps with an action wait for the user (or "Do it for me"). */
  action?: TourAction;
  /** The step can be passed without its action (the analysis also works without it). */
  optional?: boolean;
  requires?: TourRequirement;
};

export const TOUR_STEPS: TourStepDef[] = [
  { id: "header", target: "content-header", stage: "setup" },
  { id: "language", target: "content-language", stage: "setup" },
  { id: "executions", target: "content-executions", stage: "setup", action: "selectExecution" },
  { id: "figures", target: "content-figures", stage: "setup", action: "selectFigure" },
  { id: "regulations", target: "content-regulations", stage: "setup", action: "selectRegulation", optional: true },
  { id: "method", target: "content-method", stage: "setup" },
  { id: "runBar", target: "content-run-bar", stage: "setup", action: "startRun" },
  { id: "progress", target: "content-progress", stage: "progress" },
  { id: "stages", target: "content-stages", stage: "progress" },
  { id: "console", target: "content-console", stage: "progress", action: "awaitResults" },
  { id: "meta", target: "content-meta", stage: "results", view: "graph" },
  { id: "tabs", target: "content-tabs", stage: "results", view: "graph" },
  { id: "graph", target: "content-graph", stage: "results", view: "graph" },
  { id: "graphFigure", target: "content-graph", stage: "results", view: "graph", action: "selectFigureNode" },
  { id: "graphRule", target: "content-graph", stage: "results", view: "graph", action: "selectRule" },
  { id: "graphProvision", target: "content-graph", stage: "results", view: "graph", action: "selectProvision", requires: "provisions" },
  { id: "figureHead", target: "content-figure-head", stage: "results", view: "figures" },
  { id: "origins", target: "content-origins", stage: "results", view: "figures" },
  { id: "paths", target: "content-paths", stage: "results", view: "figures" },
  { id: "segments", target: "content-segments", stage: "results", view: "figures", requires: "segments" },
  { id: "records", target: "content-records", stage: "results", view: "figures", action: "selectRecord" },
  { id: "derivation", target: "content-derivation", stage: "results", view: "figures" },
  { id: "summary", target: "content-summary", stage: "results", view: "glossary" },
  { id: "glossary", target: "content-glossary", stage: "results", view: "glossary" },
  { id: "rules", target: "content-rules", stage: "results", view: "glossary" },
  { id: "regulationHead", target: "content-regulation-head", stage: "results", view: "regulation", requires: "regulation" },
  { id: "assessment", target: "content-assessment", stage: "results", view: "regulation", requires: "regulation" },
  { id: "checks", target: "content-checks", stage: "results", view: "verification" },
  { id: "findings", target: "content-findings", stage: "results", view: "verification" },
  { id: "newRun", target: "content-new", stage: "results", view: "graph" },
];

type TourText = { chapter: string; title: string; body: string[]; action?: string; empty?: string };

/** One content path of RWA in the RWA_2 analysis: the record, its amount and the chain of cases (term → case). */
export type PathExample = { key: string; record: string; amount: number; share: number; steps: { term: string; case: string; tone: "figure" | "concept" | "source" }[] };

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
  rules: {
    eyebrow: string;
    title: string;
    intro: string;
    whenLabel: string;
    yieldsLabel: string;
    codeLabel: string;
    recordsLabel: string;
    amountLabel: string;
    behindLabel: string;
    deliveredNote: string;
    examples: {
      key: string;
      tab: string;
      rule: string;
      derives: string;
      statement: string;
      cases: { key: string; label: string; when: string; yields: string; code: string; records: number; amount: number | null; behind?: string }[];
    }[];
  };
  paths: {
    eyebrow: string;
    title: string;
    intro: string;
    figure: string;
    totalLabel: string;
    recordLabel: string;
    shareLabel: string;
    reconciled: string;
    footnote: string;
    items: PathExample[];
  };
  graph: {
    eyebrow: string;
    title: string;
    intro: string;
    hint: string;
    upstream: string;
    downstream: string;
    nodesTitle: string;
    nodeKinds: { key: "figure" | "concept" | "source" | "rule" | "provision"; title: string; text: string }[];
    edgesTitle: string;
    edgeKinds: { key: "value" | "selector" | "regulation"; title: string; text: string }[];
    barTitle: string;
    barText: string;
    labels: Record<string, string>;
  };
  regulation: {
    eyebrow: string;
    title: string;
    intro: string;
    illustration: string;
    verifiedLabel: string;
    reviewedLabel: string;
    verdicts: { key: "consistent" | "simplified" | "deviation" | "not_covered"; title: string; meaning: string; rule: string; reference: string; quote: string; assessment: string; illustration?: boolean }[];
    principles: { title: string; text: string }[];
  };
  controls: { eyebrow: string; title: string; intro: string; rules: { title: string; text: string }[]; note: string };
  ready: { eyebrow: string; title: string; body: string[]; checklistTitle: string; checklist: string[] };
  tour: Record<TourStepId, TourText>;
  complete: { title: string; body: string; tipsTitle: string; tips: string[] };
};

const EN: ContentOnboardingCopy = {
  ui: {
    product: "Content Lineage",
    minutes: "AI agents · about 12 minutes",
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
    chapters: ["Language", "Welcome", "Two kinds of lineage", "How the agent works", "Rules and cases", "What's in the number", "Reading the graph", "Regulatory basis", "Controls", "Ready"],
  },
  language: {
    title: "Choose your language",
    subtitle: "Wählen Sie Ihre Sprache",
    hint: "The whole tab follows this choice – including the business terms, rules and regulatory assessments, which the agent writes in English and German for every analysis. You can switch at any time with the EN | DE switch in the tab's header; the rest of the application keeps its own language.",
    defaultBadge: "Default",
    options: { en: { name: "English", native: "English" }, de: { name: "German", native: "Deutsch" } },
  },
  welcome: {
    eyebrow: "Content Lineage AI Agents",
    title: "What is in a reported figure – and why is it there?",
    body: [
      "A reported RWA of 94,200 is a single number. Behind it sit business concepts such as the exposure value and the risk weight, rules that distinguish credit lines from loans and guarantees, values the source system delivered and values the calculation derived – and regulatory provisions that say how it all should be done.",
      "These agents lay that content open for any executed calculation. They name every business term, state every rule and its cases in business language, measure how much of the figure each case produces – down to the single record – and link every rule to the provisions of the regulation that govern it, quoted verbatim and assessed.",
    ],
    learnTitle: "In the next twelve minutes you will learn",
    learn: [
      "how content lineage differs from technical lineage",
      "the six stages of the agent and what each one guarantees",
      "how rules, cases and content paths explain a figure",
      "how to read the content graph",
      "how the regulatory basis is found, quoted and assessed",
      "which controls make the result audit-ready",
    ],
  },
  difference: {
    eyebrow: "Two kinds of lineage",
    title: "Technical lineage tells you how the code moves data. Content lineage tells you what the figure is.",
    intro: "Both look at the same calculation. Step through four questions a reviewer asks about RWA and compare the answers.",
    technicalLabel: "Technical lineage answers",
    contentLabel: "Content lineage answers",
    footnote: "Answers from a real analysis of the RWA_2 execution against the CRR.",
    questions: [
      {
        key: "what",
        question: "What is RWA made of?",
        technical: ["line 45: df['RWA'] = df['RWA'].fillna(", "    df['EAD'] * df['Risk Weight'])", "inputs: EAD, Risk Weight"],
        content: "The risk-weighted exposure amount is the exposure value multiplied by the risk weight. None of the 5 values was delivered by the source – all were derived by this rule.",
        chips: ["Exposure value (EAD)", "Risk weight", "5 of 5 derived"],
      },
      {
        key: "why",
        question: "Why is Limit_5 at 9,000?",
        technical: ["line 24: Assessment Base ← Nominal (mask)", "line 36: CCF ← map(BalanceSheetType)", "line 37: EAD ← Assessment Base * CCF", "line 45: RWA ← EAD * Risk Weight"],
        content: "A credit line: the assessment base is its nominal of 90,000; as an off-balance item it gets a 20 % conversion factor, so the exposure value is 18,000; as an exposure to a bank it is weighted at 50 %.",
        chips: ["Credit line → nominal", "Off-balance → 20 %", "Banks → 50 %"],
      },
      {
        key: "share",
        question: "Where does most of the figure come from?",
        technical: ["5 rows written at line 45", "no breakdown in the code"],
        content: "53 % comes from one deposit with a bank, 21 % from one loan to a corporate. The guarantee to a sovereign contributes nothing: its risk weight is 0 %.",
        chips: ["Deposit · Banks 53 %", "Loan · Corporates 21 %", "Guarantee 0 %"],
      },
      {
        key: "allowed",
        question: "Is the rule what the regulation requires?",
        technical: ["The code does not know the regulation."],
        content: "RWA = exposure value × risk weight is consistent with CRR Article 113(2). The 20 % conversion factor for every off-balance item is a simplification: Article 111(2) distinguishes five buckets.",
        chips: ["Art. 113(2) · consistent", "Art. 111(2) · simplified"],
      },
    ],
  },
  pipeline: {
    eyebrow: "How the agent works",
    title: "Six stages – facts first, then words, then the regulation",
    intro: "The first two stages are deterministic: they establish what the figure is made of. The AI only names, explains and assesses those facts – and every claim it makes is checked.",
    footnote: "Examples from a real analysis of the RWA_2 execution (RWA, CRR).",
    nodes: [
      {
        key: "trace",
        title: "Trace",
        text: "The calculation is replayed statement by statement in the platform's sandbox. Every value of every column is attributed to the statement that wrote it – or recognised as delivered by the source. The replay must reproduce the stored execution.",
        example: ["18 statements replayed", "65 of 65 values identical to the stored execution", "Limit_5 · Assessment Base ∅ → 90,000 (line 24)"],
      },
      {
        key: "compose",
        title: "Compose",
        text: "Statements become business rules, and every statement that writes a column becomes a case of its rule; every key of a parameter table becomes a sub-case. Each case is measured: records, amounts, and the content paths and segments of every reported figure.",
        example: ["RWA: 12 business terms, 8 rules, 11 cases", "5 content paths · 3 business segments", "CCF · OffBalance → 20 %: 2 records"],
      },
      {
        key: "describe",
        title: "Describe",
        text: "The AI names every business term, defines it and states every rule and case in business language. Term and case ids are closed sets, and every number in a rule must be a parameter of the code – otherwise the text goes back for correction.",
        example: ["EAD → “Exposure value (EAD)”", "Case R4.1 → “Credit line: nominal amount”", "Numbers check: passed"],
      },
      {
        key: "regulate",
        title: "Regulate",
        text: "For every rule, the indexed regulation is searched within the calculation's framework – here the standardised approach, so IRB, securitisation and trading-book articles are left out. The AI links the provisions that define the term or prescribe the rule and quotes them; each quote is checked against the regulation text.",
        example: ["Framework: credit risk – standardised approach", "RWA → Article 113(2) · quote verbatim", "Verdict: consistent"],
      },
      {
        key: "review",
        title: "Review",
        text: "A second AI reviewer checks every assessment against the quoted provisions: it removes links that do not govern the rule and corrects verdicts that do not follow from the text (four-eyes principle).",
        example: ["7 assessments reviewed", "Assessment base: Article 138(c) removed – not applicable", "Verdicts confirmed or corrected"],
      },
      {
        key: "translate",
        title: "Translate",
        text: "Every AI text is translated, with numbers and references kept exactly. The whole result is available in English and German.",
        example: ["97 texts translated into German", "“Exposure value” → “Risikopositionswert”", "References such as Article 113(2) unchanged"],
      },
    ],
  },
  rules: {
    eyebrow: "Rules and cases",
    title: "A rule is split into the cases the calculation distinguishes",
    intro: "Each derived business concept has one rule. Its cases are the situations the calculation tells apart – a condition, or a category of a parameter table. Click a case to see when it applies, what it yields and how much of the content it produced.",
    whenLabel: "Applies when",
    yieldsLabel: "Yields",
    codeLabel: "Implemented as",
    recordsLabel: "Records",
    amountLabel: "Amount",
    behindLabel: "Source categories behind it",
    deliveredNote: "Every case here only fills values that are missing: a value delivered by the source is kept as it is. The agent counts both – delivered and derived – for every term.",
    examples: [
      {
        key: "conditions",
        tab: "A rule with conditions",
        rule: "R4 · Assessment base by product type",
        derives: "Assessment base",
        statement: "The assessment base is taken from the source; where it is missing it depends on the product: credit lines and guarantees use the nominal amount, securities the market value, all others book value plus accrued interest.",
        cases: [
          { key: "limit", label: "Credit line: nominal amount", when: "Assessment base missing and product type is Limit", yields: "the nominal amount", code: "df.loc[limit_mask, 'Assessment Base'] = df.loc[limit_mask, 'Nominal']", records: 1, amount: 90000 },
          { key: "security", label: "Security: market value", when: "Assessment base missing and product type is Security", yields: "the market value", code: "df.loc[security_mask, 'Assessment Base'] = df.loc[security_mask, 'Market Value']", records: 1, amount: 30000 },
          { key: "guarantee", label: "Guarantee: nominal amount", when: "Assessment base missing and product type is Guarantee", yields: "the nominal amount", code: "df.loc[guarantee_mask, 'Assessment Base'] = df.loc[guarantee_mask, 'Nominal']", records: 1, amount: 50000 },
          { key: "other", label: "Other products: book value + accrued interest", when: "Assessment base still missing (loans, deposits)", yields: "book value plus accrued interest", code: "df['Assessment Base'].fillna(df['Accrued Interests'].fillna(0.0) + df['Book Value'].fillna(0.0))", records: 2, amount: 120200 },
        ],
      },
      {
        key: "table",
        tab: "A rule with a parameter table",
        rule: "R6 · Credit conversion factor by balance-sheet type",
        derives: "Credit conversion factor (CCF)",
        statement: "The conversion factor is taken from the source; where it is missing it is 100 % for on-balance and 20 % for off-balance items.",
        cases: [
          { key: "on", label: "OnBalance → 100 %", when: "CCF missing and the balance-sheet type is OnBalance", yields: "a factor of 100 %", code: "ccf_by_balance_sheet['OnBalance'] = 1.0", records: 3, amount: null, behind: "Loan, Deposit, Security" },
          { key: "off", label: "OffBalance → 20 %", when: "CCF missing and the balance-sheet type is OffBalance", yields: "a factor of 20 %", code: "ccf_by_balance_sheet['OffBalance'] = 0.2", records: 2, amount: null, behind: "Limit, Guarantee" },
        ],
      },
    ],
  },
  paths: {
    eyebrow: "What's in the number",
    title: "Every value of a figure travels along one path of cases",
    intro: "A content path is the chain of cases that produced a value – from the figure back to its inputs. The paths of a figure add up to its total. Click a path to follow it.",
    figure: "Risk-weighted exposure amount (RWA)",
    totalLabel: "Reported total",
    recordLabel: "Record",
    shareLabel: "of the total",
    reconciled: "Origins, paths and segments add up to 94,200 – checked for every analysis.",
    footnote: "The five content paths of RWA in the RWA_2 analysis – here each path holds one record; in larger data a path holds many.",
    items: [
      { key: "deposit", record: "Deposit_2", amount: 50000, share: 53.1, steps: [
        { term: "RWA", case: "exposure value × risk weight", tone: "figure" },
        { term: "Exposure value", case: "assessment base × CCF", tone: "concept" },
        { term: "Assessment base", case: "book value + accrued interest", tone: "concept" },
        { term: "Accrued interest", case: "missing → 0", tone: "concept" },
        { term: "CCF", case: "OnBalance → 100 %", tone: "concept" },
        { term: "Risk weight", case: "Banks → 50 %", tone: "concept" },
      ] },
      { key: "loan", record: "Loan_1", amount: 20200, share: 21.4, steps: [
        { term: "RWA", case: "exposure value × risk weight", tone: "figure" },
        { term: "Exposure value", case: "assessment base × CCF", tone: "concept" },
        { term: "Assessment base", case: "book value + accrued interest", tone: "concept" },
        { term: "Accrued interest", case: "delivered by the source", tone: "source" },
        { term: "CCF", case: "OnBalance → 100 %", tone: "concept" },
        { term: "Risk weight", case: "Corporates → 100 %", tone: "concept" },
      ] },
      { key: "security", record: "Security_3", amount: 15000, share: 15.9, steps: [
        { term: "RWA", case: "exposure value × risk weight", tone: "figure" },
        { term: "Exposure value", case: "assessment base × CCF", tone: "concept" },
        { term: "Assessment base", case: "security: market value", tone: "concept" },
        { term: "CCF", case: "OnBalance → 100 %", tone: "concept" },
        { term: "Risk weight", case: "Banks → 50 %", tone: "concept" },
      ] },
      { key: "limit", record: "Limit_5", amount: 9000, share: 9.6, steps: [
        { term: "RWA", case: "exposure value × risk weight", tone: "figure" },
        { term: "Exposure value", case: "assessment base × CCF", tone: "concept" },
        { term: "Assessment base", case: "credit line: nominal", tone: "concept" },
        { term: "CCF", case: "OffBalance → 20 %", tone: "concept" },
        { term: "Risk weight", case: "Banks → 50 %", tone: "concept" },
      ] },
      { key: "guarantee", record: "Guarantee_4", amount: 0, share: 0, steps: [
        { term: "RWA", case: "exposure value × risk weight", tone: "figure" },
        { term: "Exposure value", case: "assessment base × CCF", tone: "concept" },
        { term: "Assessment base", case: "guarantee: nominal", tone: "concept" },
        { term: "CCF", case: "OffBalance → 20 %", tone: "concept" },
        { term: "Risk weight", case: "Sovereigns → 0 %", tone: "concept" },
      ] },
    ],
  },
  graph: {
    eyebrow: "Reading the graph",
    title: "Source data on the left, the reported figure on the right, the regulation on top",
    intro: "The content graph shows business terms, the rules that derive them and the provisions behind the rules. Click any node to light up what it is built from (gold) and what builds on it (blue).",
    hint: "Click a node in the graph.",
    upstream: "built from",
    downstream: "feeds",
    nodesTitle: "Nodes",
    nodeKinds: [
      { key: "figure", title: "Reported figure", text: "The figure you chose to explain, with its total." },
      { key: "concept", title: "Business concept", text: "A derived term such as the exposure value." },
      { key: "source", title: "Source data", text: "An element delivered by the source system." },
      { key: "rule", title: "Business rule", text: "Derives the term on its right; holds the cases." },
      { key: "provision", title: "Provision", text: "Where the regulation defines or prescribes a rule." },
    ],
    edgesTitle: "Edges",
    edgeKinds: [
      { key: "value", title: "Value", text: "The input's value goes into the result." },
      { key: "selector", title: "Selects the case", text: "The input decides which case applies." },
      { key: "regulation", title: "Regulatory basis", text: "The provision governs the rule." },
    ],
    barTitle: "The bar under each term",
    barText: "Blue: delivered by the source. Green: derived by the rule. Red: still missing at the end.",
    labels: {
      productType: "Product type", nominal: "Nominal amount", assetClass: "Asset class",
      ruleCcf: "CCF rule", ruleBase: "Base rule", ruleWeight: "Weight rule", ruleEad: "EAD rule", ruleRwa: "RWA rule",
      ccf: "Credit conversion factor", base: "Assessment base", weight: "Risk weight", ead: "Exposure value", rwa: "RWA",
    },
  },
  regulation: {
    eyebrow: "Regulatory basis",
    title: "Each rule is checked against the regulation",
    intro: "For each rule the agent returns one of four verdicts – each backed by a quote that was found word for word in the regulation. Click a verdict to see an example.",
    illustration: "Illustration",
    verifiedLabel: "Quote verified verbatim",
    reviewedLabel: "Confirmed by the second reviewer",
    verdicts: [
      { key: "consistent", title: "Consistent", meaning: "The rule's cases and parameters match the provision.", rule: "RWA = exposure value × risk weight", reference: "CRR Article 113(2)", quote: "the exposure value shall be multiplied by the risk weight specified or determined in accordance with Section 2.", assessment: "The calculation multiplies the exposure value by the risk weight, exactly as the provision prescribes." },
      { key: "simplified", title: "Simplified", meaning: "Coarser than the regulation, without contradicting it.", rule: "CCF: OnBalance 100 %, OffBalance 20 %", reference: "CRR Article 111(2)(d)", quote: "The exposure value of an off-balance-sheet item listed in Annex I shall be the following percentage of the item's nominal value … (d) 20 % for items in bucket 4;", assessment: "One factor of 20 % for every off-balance item, where the regulation distinguishes five buckets (100 %, 50 %, 40 %, 20 %, 10 %)." },
      { key: "deviation", title: "Deviation", meaning: "A case or parameter contradicts the provision.", rule: "Risk weight: unrated corporates 50 %", reference: "CRR Article 122(2)", quote: "Exposures for which such a credit assessment is not available shall be assigned a risk weight of 100 %.", assessment: "If a calculation weighted unrated corporates at 50 %, this provision would make it a deviation. (RWA_2 uses 100 % – consistent.)", illustration: true },
      { key: "not_covered", title: "No regulatory basis", meaning: "No provision governs the rule – typically an internal data convention.", rule: "Accrued interest: missing → 0", reference: "–", quote: "", assessment: "Treating missing accrued interest as zero is a convention of the data feed; no provision prescribes it, so no link is made." },
    ],
    principles: [
      { title: "Framework first", text: "The search stays inside the framework the calculation implements: a standardised-approach calculation is never linked to IRB, securitisation or trading-book articles that merely share its words." },
      { title: "Verbatim or nothing", text: "Every quote is checked against the regulation text. A quote that is not word for word goes back once for correction; if it still fails, the link is dropped." },
      { title: "Missing support is no deviation", text: "A deviation needs a provision that prescribes something else for exactly that case. A case no provision addresses simply gets no finding." },
    ],
  },
  controls: {
    eyebrow: "Controls",
    title: "Eleven controls make the result audit-ready",
    intro: "Every analysis runs the same deterministic checks. You find them, with their figures, in the Checks & log view and in the Excel export.",
    rules: [
      { title: "Replay reproduces", text: "The replayed calculation equals the stored execution, value by value." },
      { title: "Every value attributed", text: "Each value of a reported figure is traced to the source or to one case." },
      { title: "Breakdowns reconcile", text: "Origins, content paths and segments add up to the reported totals." },
      { title: "Terms named", text: "Every business term has a name and a definition." },
      { title: "Cases described", text: "Every case of every rule is described in business language." },
      { title: "Numbers grounded", text: "Every number in a rule text is a parameter of the code." },
      { title: "Quotes verbatim", text: "Every regulatory quote was found word for word in the regulation." },
      { title: "Four-eyes review", text: "A second AI reviewer checked every regulatory assessment." },
      { title: "Categories covered", text: "Every category in the data has a parameter in its table." },
      { title: "Figures complete", text: "Every record carries a value for every reported figure." },
      { title: "Texts translated", text: "Every AI text is available in English and German." },
    ],
    note: "The trace and the composition are facts; the AI names, explains and assesses them. Where a check fails, the agent shows it – here, in the findings and in the export – and never smooths it over.",
  },
  ready: {
    eyebrow: "Ready",
    title: "Now try it on the real tab",
    body: [
      "The hands-on tour walks you through the live tab. You choose an execution, its reported figure and a regulation, and start a real analysis yourself; the tour follows it while it runs (about one to two minutes) and then walks you through its result.",
      "Wherever the tour asks you to act, you can also click “Do it for me”.",
    ],
    checklistTitle: "In the hands-on tour you will",
    checklist: [
      "choose an execution, a reported figure and a regulation",
      "watch the six stages and the agent log",
      "explore the content graph: figure, rule and provision",
      "see what the figure is made of and follow one record",
      "read the business glossary and the rules",
      "read a regulatory assessment and check the controls",
    ],
  },
  tour: {
    header: { chapter: "Setup", title: "The Content Lineage AI Agents", body: ["Every analysis starts here. Earlier analyses stay in the Analyses menu; the Guided tour button starts this tour again at any time."] },
    language: {
      chapter: "Setup",
      title: "Work in English or German",
      body: [
        "This switch sets the language of the whole tab: labels, business terms, rules, regulatory assessments, the log and the Excel export.",
        "Each analysis is written in both languages, so you can switch at any time – also while you read a result. Quotes stay in the language of the regulation.",
      ],
    },
    executions: {
      chapter: "Setup",
      title: "Choose an execution",
      body: ["An execution is one run of a cluster: its code applied to its dataset, with the stored result. The agent explains the figures of exactly that result."],
      action: "Select an execution – an RWA calculation shows the most.",
      empty: "No cluster has been executed yet, so there is nothing to explain. Run a cluster in the Cluster tab first, then start this tour again with “Guided tour”.",
    },
    figures: {
      chapter: "Setup",
      title: "Choose the reported figure",
      body: ["These are the columns the code derives. The agent explains the figures you tick – and traces everything they are built from. Suggested are the figures at the end of a calculation chain, such as RWA."],
      action: "Tick the suggested figure.",
      empty: "This execution derives no column, so there is nothing to explain. Go back and choose another execution.",
    },
    regulations: {
      chapter: "Setup",
      title: "Add the regulation",
      body: ["With an indexed regulation, the agent finds the provisions behind every rule, quotes them and assesses the rule. Without one, the content lineage is complete but has no regulatory basis."],
      action: "Tick the regulation (for example the CRR).",
      empty: "No regulation is indexed yet. The tour continues without the regulatory basis; upload one in the Regulation tab to add it to later analyses.",
    },
    method: { chapter: "Setup", title: "The method in six stages", body: ["Trace and compose establish the facts; describe, regulate and review put them into business and regulatory language; translate makes everything available in English and German."] },
    runBar: {
      chapter: "Setup",
      title: "Start the analysis",
      body: ["This starts a real analysis – exactly as outside the tour. It takes about one to two minutes and calls the language model; the result is saved in the Analyses menu."],
      action: "Click “Build content lineage”.",
    },
    progress: { chapter: "Live", title: "The agent at work", body: ["Your analysis is running now. It continues on the server – you can leave the tab and come back, it will be reattached – and Cancel stops it after the current step."] },
    stages: { chapter: "Live", title: "Six stages with live counters", body: ["Each card fills in as the agent completes the stage: values reproduced, terms, rules and cases found, rules described, provisions linked, assessments reviewed, texts translated."] },
    console: {
      chapter: "Live",
      title: "The agent log",
      body: ["Every step in plain language: the scope of the figure, the framework of the calculation, which provisions were linked to which rule and with what verdict, what the second reviewer decided."],
      action: "Wait for the analysis to finish – the tour continues by itself as soon as the result is ready.",
    },
    meta: { chapter: "Results", title: "The analysis at a glance", body: ["Cluster, execution, code, dataset, the figures explained, runtime and model. A badge shows the most serious regulatory verdict; Export gives you the Excel workbook in the language you are using."] },
    tabs: { chapter: "Results", title: "Five views on one content lineage", body: ["Content graph, what's in the figures, glossary & rules, regulatory basis, checks & log. Results open on the graph; clicking a term, rule or provision anywhere takes you to the right place."] },
    graph: { chapter: "Graph", title: "The content graph", body: ["Source data on the left, the reported figure on the right; violet pills are the business rules, the orange cards on top the provisions. Drag the background to pan, drag a node to move it – its connections follow – and scroll to zoom."] },
    graphFigure: {
      chapter: "Graph",
      title: "Start from the figure",
      body: ["Selecting the figure lights up everything it is built from. The panel on the right shows its definition, its reported value and the rule that derives it."],
      action: "Click the reported figure – the node with the gold border on the right.",
    },
    graphRule: {
      chapter: "Graph",
      title: "Open a business rule",
      body: ["A rule shows its statement and every case: when it applies, how many records it produced and – for a parameter table – the value per category."],
      action: "Click a business rule – one of the violet pills.",
    },
    graphProvision: {
      chapter: "Graph",
      title: "Read a provision",
      body: ["A provision shows the rules it governs, how, and the verified quote. “Read the whole provision” opens its full text."],
      action: "Click a provision – one of the orange cards on top.",
    },
    figureHead: { chapter: "Figures", title: "What's in the figure", body: ["The reported total, how many records carry a value, how much was derived rather than delivered, and how many distinct content paths lie behind it."] },
    origins: { chapter: "Figures", title: "Where the value comes from", body: ["Every value is either delivered by the source system or derived by one case of the figure's rule – with records, amounts and shares."] },
    paths: { chapter: "Figures", title: "Content paths", body: ["Each path is one chain of business cases, from the figure back to its inputs, with the records and amount it holds. The largest paths come first; the record buttons open an example."] },
    segments: { chapter: "Figures", title: "By business segment", body: ["The figure broken down by the classifications of the records – product type, asset class or any other category in the data."] },
    records: {
      chapter: "Figures",
      title: "Follow a single record",
      body: ["Every record of the figure can be traced: how its value came about, case by case, with the values each case used."],
      action: "Choose a record on the left – a credit line such as Limit_5 is a good one.",
    },
    derivation: { chapter: "Figures", title: "The record's derivation", body: ["From the figure down to the source data: each value with the case that produced it, the parameter applied and the values it was built from."] },
    summary: { chapter: "Glossary", title: "What the calculation produces", body: ["The business domain and a short summary, written by the AI from the facts of the calculation. A note shows when you read a translation."] },
    glossary: { chapter: "Glossary", title: "The business glossary", body: ["Every term the figure is built from: its business name, the column behind it, its definition, how its content splits into delivered and derived, and its regulatory basis."] },
    rules: { chapter: "Glossary", title: "Rules and their cases", body: ["Each rule with its statement and a table of its cases: when each applies, what it yields, how it is implemented in the code, and the records and amounts it produced."] },
    regulationHead: { chapter: "Regulation", title: "The regulatory basis", body: ["The regulation searched, the framework the search was restricted to, and the verdicts at a glance – with the number of quotes verified word for word."] },
    assessment: { chapter: "Regulation", title: "An assessment", body: ["The rule, its verdict and the reasoning; the provisions with their verified quotes; findings per case or category; and what the second reviewer decided. Deviations and simplifications come first."] },
    checks: { chapter: "Checks", title: "The eleven controls", body: ["Each control with its result and figures. A failed control is never hidden: it is shown here and in the export."] },
    findings: { chapter: "Checks", title: "Content findings", body: ["What the content lineage reveals: deviations from the regulation, values missing in a figure, categories without a parameter, source values that were not numbers, mixed delivered and derived values."] },
    newRun: { chapter: "Done", title: "Your turn", body: ["Start a new analysis for any executed calculation. Earlier analyses – including the one from this tour – stay in the Analyses menu."] },
  },
  complete: {
    title: "You're ready to explain any figure",
    body: "The analysis from this tour is yours: it stays on screen and in the Analyses menu. Start the next one with New analysis.",
    tipsTitle: "Good practice",
    tips: [
      "Start from the findings: a deviation or a missing value tells you where to look first.",
      "Read a verdict together with its quote – the provision text is the evidence, the AI's reasoning is a summary.",
      "Follow one record of every large content path before you sign off a figure.",
      "Export the Excel workbook to file the content lineage with a review or an audit.",
    ],
  },
};

const DE: ContentOnboardingCopy = {
  ui: {
    product: "Inhalts-Herkunft",
    minutes: "KI-Agenten · etwa 12 Minuten",
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
    chapters: ["Sprache", "Willkommen", "Zwei Arten von Herkunft", "So arbeitet der Agent", "Regeln und Fälle", "Was in der Zahl steckt", "Den Graphen lesen", "Regulatorische Grundlage", "Kontrollen", "Bereit"],
  },
  language: {
    title: "Wählen Sie Ihre Sprache",
    subtitle: "Choose your language",
    hint: "Der ganze Tab folgt dieser Wahl – auch die Fachbegriffe, Regeln und regulatorischen Bewertungen, die der Agent für jede Analyse auf Deutsch und Englisch verfasst. Sie können jederzeit mit dem Schalter EN | DE in der Kopfzeile des Tabs wechseln; die übrige Anwendung behält ihre eigene Sprache.",
    defaultBadge: "Standard",
    options: { en: { name: "Englisch", native: "English" }, de: { name: "Deutsch", native: "Deutsch" } },
  },
  welcome: {
    eyebrow: "Inhalts-Herkunft – KI-Agenten",
    title: "Was steckt in einer Meldegröße – und warum?",
    body: [
      "Ein gemeldeter RWA von 94.200 ist eine einzige Zahl. Dahinter stehen fachliche Begriffe wie Risikopositionswert und Risikogewicht, Regeln, die Kreditlinien von Darlehen und Bürgschaften unterscheiden, Werte, die das Quellsystem geliefert hat, und Werte, die die Berechnung abgeleitet hat – und Vorschriften, die festlegen, wie das alles zu geschehen hat.",
      "Diese Agenten legen diesen Inhalt für jede ausgeführte Berechnung offen. Sie benennen jeden Fachbegriff, formulieren jede Regel und ihre Fälle fachlich, messen, wie viel jeder Fall zur Größe beiträgt – bis zum einzelnen Datensatz – und verknüpfen jede Regel mit den maßgeblichen Vorschriften der Regulierung, wörtlich zitiert und bewertet.",
    ],
    learnTitle: "In den nächsten zwölf Minuten lernen Sie",
    learn: [
      "wie sich die Inhalts-Herkunft von der technischen Herkunft unterscheidet",
      "die sechs Stufen des Agenten und was jede gewährleistet",
      "wie Regeln, Fälle und Inhaltspfade eine Größe erklären",
      "wie Sie den Inhalts-Graphen lesen",
      "wie die regulatorische Grundlage gefunden, zitiert und bewertet wird",
      "welche Kontrollen das Ergebnis prüfungsfest machen",
    ],
  },
  difference: {
    eyebrow: "Zwei Arten von Herkunft",
    title: "Die technische Herkunft zeigt, wie der Code Daten bewegt. Die Inhalts-Herkunft zeigt, was die Größe ist.",
    intro: "Beide betrachten dieselbe Berechnung. Gehen Sie vier Fragen durch, die Prüfer zum RWA stellen, und vergleichen Sie die Antworten.",
    technicalLabel: "Antwort der technischen Herkunft",
    contentLabel: "Antwort der Inhalts-Herkunft",
    footnote: "Antworten aus einer echten Analyse der Ausführung RWA_2 gegen die CRR.",
    questions: [
      {
        key: "what",
        question: "Woraus besteht der RWA?",
        technical: ["Zeile 45: df['RWA'] = df['RWA'].fillna(", "    df['EAD'] * df['Risk Weight'])", "Eingaben: EAD, Risk Weight"],
        content: "Der risikogewichtete Positionsbetrag ist der Risikopositionswert multipliziert mit dem Risikogewicht. Keiner der 5 Werte kam aus der Quelle – alle hat diese Regel abgeleitet.",
        chips: ["Risikopositionswert (EAD)", "Risikogewicht", "5 von 5 abgeleitet"],
      },
      {
        key: "why",
        question: "Warum steht Limit_5 bei 9.000?",
        technical: ["Zeile 24: Assessment Base ← Nominal (Maske)", "Zeile 36: CCF ← map(BalanceSheetType)", "Zeile 37: EAD ← Assessment Base * CCF", "Zeile 45: RWA ← EAD * Risk Weight"],
        content: "Eine Kreditlinie: Die Bemessungsgrundlage ist ihr Nominal von 90.000; als außerbilanzielle Position erhält sie einen Umrechnungsfaktor von 20 %, der Risikopositionswert ist also 18.000; als Forderung an eine Bank wird sie mit 50 % gewichtet.",
        chips: ["Kreditlinie → Nominal", "Außerbilanziell → 20 %", "Banken → 50 %"],
      },
      {
        key: "share",
        question: "Woher kommt der größte Teil der Größe?",
        technical: ["5 Zeilen in Zeile 45 geschrieben", "keine Aufschlüsselung im Code"],
        content: "53 % stammen aus einer Einlage bei einer Bank, 21 % aus einem Darlehen an ein Unternehmen. Die Bürgschaft gegenüber einem Staat trägt nichts bei: Ihr Risikogewicht ist 0 %.",
        chips: ["Einlage · Banken 53 %", "Darlehen · Unternehmen 21 %", "Bürgschaft 0 %"],
      },
      {
        key: "allowed",
        question: "Entspricht die Regel der Regulierung?",
        technical: ["Der Code kennt die Regulierung nicht."],
        content: "RWA = Risikopositionswert × Risikogewicht ist konform mit Artikel 113 Absatz 2 CRR. Der Umrechnungsfaktor von 20 % für jede außerbilanzielle Position ist eine Vereinfachung: Artikel 111 Absatz 2 unterscheidet fünf Klassen.",
        chips: ["Art. 113(2) · konform", "Art. 111(2) · vereinfacht"],
      },
    ],
  },
  pipeline: {
    eyebrow: "So arbeitet der Agent",
    title: "Sechs Stufen – erst die Fakten, dann die Worte, dann die Regulierung",
    intro: "Die ersten beiden Stufen sind deterministisch: Sie ermitteln, woraus die Größe besteht. Die KI benennt, erläutert und bewertet nur diese Fakten – und jede ihrer Aussagen wird geprüft.",
    footnote: "Beispiele aus einer echten Analyse der Ausführung RWA_2 (RWA, CRR).",
    nodes: [
      {
        key: "trace",
        title: "Verfolgen",
        text: "Die Berechnung wird Anweisung für Anweisung in der Sandbox der Plattform wiederholt. Jeder Wert jeder Spalte wird der Anweisung zugeordnet, die ihn geschrieben hat – oder als von der Quelle geliefert erkannt. Die Wiederholung muss die gespeicherte Ausführung reproduzieren.",
        example: ["18 Anweisungen wiederholt", "65 von 65 Werten identisch mit der gespeicherten Ausführung", "Limit_5 · Assessment Base ∅ → 90.000 (Zeile 24)"],
      },
      {
        key: "compose",
        title: "Zusammensetzen",
        text: "Aus Anweisungen werden fachliche Regeln, und jede Anweisung, die eine Spalte schreibt, wird ein Fall ihrer Regel; jeder Schlüssel einer Parametertabelle wird ein Unterfall. Jeder Fall wird gemessen: Datensätze, Beträge sowie Inhaltspfade und Segmente jeder Meldegröße.",
        example: ["RWA: 12 Fachbegriffe, 8 Regeln, 11 Fälle", "5 Inhaltspfade · 3 fachliche Segmente", "CCF · OffBalance → 20 %: 2 Datensätze"],
      },
      {
        key: "describe",
        title: "Beschreiben",
        text: "Die KI benennt jeden Fachbegriff, definiert ihn und formuliert jede Regel und jeden Fall fachlich. Begriffs- und Fall-IDs sind geschlossene Mengen, und jede Zahl in einer Regel muss ein Parameter des Codes sein – sonst geht der Text zur Korrektur zurück.",
        example: ["EAD → „Risikopositionswert (EAD)“", "Fall R4.1 → „Kreditlinie: Nominalbetrag“", "Zahlenprüfung: bestanden"],
      },
      {
        key: "regulate",
        title: "Regulatorisch einordnen",
        text: "Für jede Regel wird die indizierte Regulierung im Rahmen der Berechnung durchsucht – hier dem Standardansatz, IRB-, Verbriefungs- und Handelsbuchartikel bleiben also außen vor. Die KI verknüpft die Vorschriften, die den Begriff definieren oder die Regel vorschreiben, und zitiert sie; jedes Zitat wird gegen den Regulierungstext geprüft.",
        example: ["Rahmen: Kreditrisiko – Standardansatz", "RWA → Artikel 113(2) · Zitat wörtlich", "Bewertung: konform"],
      },
      {
        key: "review",
        title: "Prüfen",
        text: "Ein zweiter KI-Prüfer kontrolliert jede Bewertung an den zitierten Vorschriften: Er entfernt Verknüpfungen, die die Regel nicht regeln, und korrigiert Bewertungen, die nicht aus dem Text folgen (Vier-Augen-Prinzip).",
        example: ["7 Bewertungen geprüft", "Bemessungsgrundlage: Artikel 138(c) entfernt – nicht einschlägig", "Bewertungen bestätigt oder korrigiert"],
      },
      {
        key: "translate",
        title: "Übersetzen",
        text: "Jeder KI-Text wird übersetzt, Zahlen und Fundstellen bleiben exakt erhalten. Das gesamte Ergebnis steht auf Deutsch und Englisch bereit.",
        example: ["97 Texte ins Deutsche übersetzt", "„Exposure value“ → „Risikopositionswert“", "Fundstellen wie Article 113(2) unverändert"],
      },
    ],
  },
  rules: {
    eyebrow: "Regeln und Fälle",
    title: "Eine Regel zerfällt in die Fälle, die die Berechnung unterscheidet",
    intro: "Jeder abgeleitete fachliche Begriff hat eine Regel. Ihre Fälle sind die Situationen, die die Berechnung auseinanderhält – eine Bedingung oder eine Kategorie einer Parametertabelle. Klicken Sie auf einen Fall, um zu sehen, wann er gilt, was er ergibt und wie viel Inhalt er erzeugt hat.",
    whenLabel: "Gilt, wenn",
    yieldsLabel: "Ergibt",
    codeLabel: "Umgesetzt als",
    recordsLabel: "Datensätze",
    amountLabel: "Betrag",
    behindLabel: "Quellkategorien dahinter",
    deliveredNote: "Jeder Fall hier füllt nur fehlende Werte: Ein von der Quelle gelieferter Wert bleibt, wie er ist. Der Agent zählt beides – geliefert und abgeleitet – für jeden Begriff.",
    examples: [
      {
        key: "conditions",
        tab: "Eine Regel mit Bedingungen",
        rule: "R4 · Bemessungsgrundlage nach Produktart",
        derives: "Bemessungsgrundlage",
        statement: "Die Bemessungsgrundlage wird aus der Quelle übernommen; fehlt sie, hängt sie vom Produkt ab: Kreditlinien und Bürgschaften nutzen den Nominalbetrag, Wertpapiere den Marktwert, alle anderen Buchwert plus anteilige Zinsen.",
        cases: [
          { key: "limit", label: "Kreditlinie: Nominalbetrag", when: "Bemessungsgrundlage fehlt und Produktart ist Limit", yields: "den Nominalbetrag", code: "df.loc[limit_mask, 'Assessment Base'] = df.loc[limit_mask, 'Nominal']", records: 1, amount: 90000 },
          { key: "security", label: "Wertpapier: Marktwert", when: "Bemessungsgrundlage fehlt und Produktart ist Security", yields: "den Marktwert", code: "df.loc[security_mask, 'Assessment Base'] = df.loc[security_mask, 'Market Value']", records: 1, amount: 30000 },
          { key: "guarantee", label: "Bürgschaft: Nominalbetrag", when: "Bemessungsgrundlage fehlt und Produktart ist Guarantee", yields: "den Nominalbetrag", code: "df.loc[guarantee_mask, 'Assessment Base'] = df.loc[guarantee_mask, 'Nominal']", records: 1, amount: 50000 },
          { key: "other", label: "Übrige Produkte: Buchwert + anteilige Zinsen", when: "Bemessungsgrundlage fehlt weiterhin (Darlehen, Einlagen)", yields: "Buchwert plus anteilige Zinsen", code: "df['Assessment Base'].fillna(df['Accrued Interests'].fillna(0.0) + df['Book Value'].fillna(0.0))", records: 2, amount: 120200 },
        ],
      },
      {
        key: "table",
        tab: "Eine Regel mit Parametertabelle",
        rule: "R6 · Kreditumrechnungsfaktor nach Bilanzart",
        derives: "Kreditumrechnungsfaktor (CCF)",
        statement: "Der Umrechnungsfaktor wird aus der Quelle übernommen; fehlt er, beträgt er 100 % für bilanzielle und 20 % für außerbilanzielle Positionen.",
        cases: [
          { key: "on", label: "OnBalance → 100 %", when: "CCF fehlt und die Bilanzart ist OnBalance", yields: "einen Faktor von 100 %", code: "ccf_by_balance_sheet['OnBalance'] = 1.0", records: 3, amount: null, behind: "Loan, Deposit, Security" },
          { key: "off", label: "OffBalance → 20 %", when: "CCF fehlt und die Bilanzart ist OffBalance", yields: "einen Faktor von 20 %", code: "ccf_by_balance_sheet['OffBalance'] = 0.2", records: 2, amount: null, behind: "Limit, Guarantee" },
        ],
      },
    ],
  },
  paths: {
    eyebrow: "Was in der Zahl steckt",
    title: "Jeder Wert einer Größe entsteht entlang eines Pfads von Fällen",
    intro: "Ein Inhaltspfad ist die Kette der Fälle, die einen Wert erzeugt hat – von der Größe zurück zu ihren Eingaben. Die Pfade einer Größe ergeben zusammen ihre Summe. Klicken Sie auf einen Pfad, um ihm zu folgen.",
    figure: "Risikogewichteter Positionsbetrag (RWA)",
    totalLabel: "Gemeldete Summe",
    recordLabel: "Datensatz",
    shareLabel: "der Summe",
    reconciled: "Herkünfte, Pfade und Segmente ergeben zusammen 94.200 – bei jeder Analyse geprüft.",
    footnote: "Die fünf Inhaltspfade des RWA in der Analyse RWA_2 – hier mit je einem Datensatz; bei größeren Daten umfasst ein Pfad viele.",
    items: [
      { key: "deposit", record: "Deposit_2", amount: 50000, share: 53.1, steps: [
        { term: "RWA", case: "Risikopositionswert × Risikogewicht", tone: "figure" },
        { term: "Risikopositionswert", case: "Bemessungsgrundlage × CCF", tone: "concept" },
        { term: "Bemessungsgrundlage", case: "Buchwert + anteilige Zinsen", tone: "concept" },
        { term: "Anteilige Zinsen", case: "fehlend → 0", tone: "concept" },
        { term: "CCF", case: "OnBalance → 100 %", tone: "concept" },
        { term: "Risikogewicht", case: "Banks → 50 %", tone: "concept" },
      ] },
      { key: "loan", record: "Loan_1", amount: 20200, share: 21.4, steps: [
        { term: "RWA", case: "Risikopositionswert × Risikogewicht", tone: "figure" },
        { term: "Risikopositionswert", case: "Bemessungsgrundlage × CCF", tone: "concept" },
        { term: "Bemessungsgrundlage", case: "Buchwert + anteilige Zinsen", tone: "concept" },
        { term: "Anteilige Zinsen", case: "von der Quelle geliefert", tone: "source" },
        { term: "CCF", case: "OnBalance → 100 %", tone: "concept" },
        { term: "Risikogewicht", case: "Corporates → 100 %", tone: "concept" },
      ] },
      { key: "security", record: "Security_3", amount: 15000, share: 15.9, steps: [
        { term: "RWA", case: "Risikopositionswert × Risikogewicht", tone: "figure" },
        { term: "Risikopositionswert", case: "Bemessungsgrundlage × CCF", tone: "concept" },
        { term: "Bemessungsgrundlage", case: "Wertpapier: Marktwert", tone: "concept" },
        { term: "CCF", case: "OnBalance → 100 %", tone: "concept" },
        { term: "Risikogewicht", case: "Banks → 50 %", tone: "concept" },
      ] },
      { key: "limit", record: "Limit_5", amount: 9000, share: 9.6, steps: [
        { term: "RWA", case: "Risikopositionswert × Risikogewicht", tone: "figure" },
        { term: "Risikopositionswert", case: "Bemessungsgrundlage × CCF", tone: "concept" },
        { term: "Bemessungsgrundlage", case: "Kreditlinie: Nominal", tone: "concept" },
        { term: "CCF", case: "OffBalance → 20 %", tone: "concept" },
        { term: "Risikogewicht", case: "Banks → 50 %", tone: "concept" },
      ] },
      { key: "guarantee", record: "Guarantee_4", amount: 0, share: 0, steps: [
        { term: "RWA", case: "Risikopositionswert × Risikogewicht", tone: "figure" },
        { term: "Risikopositionswert", case: "Bemessungsgrundlage × CCF", tone: "concept" },
        { term: "Bemessungsgrundlage", case: "Bürgschaft: Nominal", tone: "concept" },
        { term: "CCF", case: "OffBalance → 20 %", tone: "concept" },
        { term: "Risikogewicht", case: "Sovereigns → 0 %", tone: "concept" },
      ] },
    ],
  },
  graph: {
    eyebrow: "Den Graphen lesen",
    title: "Quelldaten links, die Meldegröße rechts, die Regulierung darüber",
    intro: "Der Inhalts-Graph zeigt Fachbegriffe, die Regeln, die sie ableiten, und die Vorschriften hinter den Regeln. Klicken Sie auf einen Knoten, um hervorzuheben, woraus er entsteht (gold) und was auf ihm aufbaut (blau).",
    hint: "Klicken Sie im Graphen auf einen Knoten.",
    upstream: "entsteht aus",
    downstream: "fließt in",
    nodesTitle: "Knoten",
    nodeKinds: [
      { key: "figure", title: "Meldegröße", text: "Die Größe, die Sie erklären lassen, mit ihrer Summe." },
      { key: "concept", title: "Fachlicher Begriff", text: "Ein abgeleiteter Begriff wie der Risikopositionswert." },
      { key: "source", title: "Quelldaten", text: "Ein vom Quellsystem geliefertes Element." },
      { key: "rule", title: "Fachliche Regel", text: "Leitet den Begriff rechts von ihr ab; enthält die Fälle." },
      { key: "provision", title: "Vorschrift", text: "Wo die Regulierung eine Regel definiert oder vorschreibt." },
    ],
    edgesTitle: "Kanten",
    edgeKinds: [
      { key: "value", title: "Wert", text: "Der Wert der Eingabe geht in das Ergebnis ein." },
      { key: "selector", title: "Wählt den Fall", text: "Die Eingabe entscheidet, welcher Fall gilt." },
      { key: "regulation", title: "Regulatorische Grundlage", text: "Die Vorschrift regelt die Regel." },
    ],
    barTitle: "Der Balken unter jedem Begriff",
    barText: "Blau: von der Quelle geliefert. Grün: von der Regel abgeleitet. Rot: am Ende noch fehlend.",
    labels: {
      productType: "Produktart", nominal: "Nominalbetrag", assetClass: "Assetklasse",
      ruleCcf: "CCF-Regel", ruleBase: "Grundlagen-Regel", ruleWeight: "Gewichts-Regel", ruleEad: "EAD-Regel", ruleRwa: "RWA-Regel",
      ccf: "Kreditumrechnungsfaktor", base: "Bemessungsgrundlage", weight: "Risikogewicht", ead: "Risikopositionswert", rwa: "RWA",
    },
  },
  regulation: {
    eyebrow: "Regulatorische Grundlage",
    title: "Jede Regel wird an der Regulierung gemessen",
    intro: "Für jede Regel liefert der Agent eine von vier Bewertungen – jede gestützt auf ein Zitat, das Wort für Wort in der Regulierung gefunden wurde. Klicken Sie auf eine Bewertung, um ein Beispiel zu sehen.",
    illustration: "Veranschaulichung",
    verifiedLabel: "Zitat wörtlich verifiziert",
    reviewedLabel: "Vom Zweitprüfer bestätigt",
    verdicts: [
      { key: "consistent", title: "Konform", meaning: "Fälle und Parameter der Regel entsprechen der Vorschrift.", rule: "RWA = Risikopositionswert × Risikogewicht", reference: "CRR Article 113(2)", quote: "the exposure value shall be multiplied by the risk weight specified or determined in accordance with Section 2.", assessment: "Die Berechnung multipliziert den Risikopositionswert mit dem Risikogewicht – genau wie die Vorschrift es verlangt." },
      { key: "simplified", title: "Vereinfacht", meaning: "Gröber als die Regulierung, ohne ihr zu widersprechen.", rule: "CCF: OnBalance 100 %, OffBalance 20 %", reference: "CRR Article 111(2)(d)", quote: "The exposure value of an off-balance-sheet item listed in Annex I shall be the following percentage of the item's nominal value … (d) 20 % for items in bucket 4;", assessment: "Ein Faktor von 20 % für jede außerbilanzielle Position, wo die Regulierung fünf Klassen unterscheidet (100 %, 50 %, 40 %, 20 %, 10 %)." },
      { key: "deviation", title: "Abweichung", meaning: "Ein Fall oder Parameter widerspricht der Vorschrift.", rule: "Risikogewicht: Unternehmen ohne Rating 50 %", reference: "CRR Article 122(2)", quote: "Exposures for which such a credit assessment is not available shall be assigned a risk weight of 100 %.", assessment: "Gewichtete eine Berechnung Unternehmen ohne Rating mit 50 %, wäre das nach dieser Vorschrift eine Abweichung. (RWA_2 verwendet 100 % – konform.)", illustration: true },
      { key: "not_covered", title: "Keine regulatorische Grundlage", meaning: "Keine Vorschrift regelt die Regel – meist eine interne Datenkonvention.", rule: "Anteilige Zinsen: fehlend → 0", reference: "–", quote: "", assessment: "Fehlende anteilige Zinsen als null zu behandeln ist eine Konvention der Datenlieferung; keine Vorschrift legt das fest, daher wird nichts verknüpft." },
    ],
    principles: [
      { title: "Erst der Rahmen", text: "Die Suche bleibt im Rahmen, den die Berechnung umsetzt: Eine Berechnung nach dem Standardansatz wird nie mit IRB-, Verbriefungs- oder Handelsbuchartikeln verknüpft, die nur dieselben Wörter verwenden." },
      { title: "Wörtlich oder gar nicht", text: "Jedes Zitat wird gegen den Regulierungstext geprüft. Ein nicht wörtliches Zitat geht einmal zur Korrektur zurück; scheitert es erneut, entfällt die Verknüpfung." },
      { title: "Fehlender Beleg ist keine Abweichung", text: "Eine Abweichung braucht eine Vorschrift, die für genau diesen Fall etwas anderes vorschreibt. Ein Fall, den keine Vorschrift behandelt, erhält schlicht keine Feststellung." },
    ],
  },
  controls: {
    eyebrow: "Kontrollen",
    title: "Elf Kontrollen machen das Ergebnis prüfungsfest",
    intro: "Jede Analyse führt dieselben deterministischen Prüfungen aus. Sie finden sie mit ihren Werten in der Ansicht „Prüfungen & Protokoll“ und im Excel-Export.",
    rules: [
      { title: "Wiederholung stimmt", text: "Die wiederholte Berechnung entspricht der gespeicherten Ausführung, Wert für Wert." },
      { title: "Jeder Wert zugeordnet", text: "Jeder Wert einer Meldegröße ist der Quelle oder genau einem Fall zugeordnet." },
      { title: "Aufschlüsselungen stimmen", text: "Herkünfte, Inhaltspfade und Segmente ergeben die gemeldeten Summen." },
      { title: "Begriffe benannt", text: "Jeder Fachbegriff hat einen Namen und eine Definition." },
      { title: "Fälle beschrieben", text: "Jeder Fall jeder Regel ist fachlich beschrieben." },
      { title: "Zahlen belegt", text: "Jede Zahl in einem Regeltext ist ein Parameter des Codes." },
      { title: "Zitate wörtlich", text: "Jedes regulatorische Zitat wurde Wort für Wort in der Regulierung gefunden." },
      { title: "Vier-Augen-Prüfung", text: "Ein zweiter KI-Prüfer hat jede regulatorische Bewertung kontrolliert." },
      { title: "Kategorien abgedeckt", text: "Jede Kategorie in den Daten hat einen Parameter in ihrer Tabelle." },
      { title: "Größen vollständig", text: "Jeder Datensatz hat für jede Meldegröße einen Wert." },
      { title: "Texte übersetzt", text: "Jeder KI-Text steht auf Deutsch und Englisch bereit." },
    ],
    note: "Verfolgung und Zusammensetzung sind Fakten; die KI benennt, erläutert und bewertet sie. Schlägt eine Prüfung fehl, zeigt der Agent das – hier, in den Feststellungen und im Export – und glättet es nie.",
  },
  ready: {
    eyebrow: "Bereit",
    title: "Jetzt am echten Tab ausprobieren",
    body: [
      "Die Praxis-Tour führt Sie durch den echten Tab. Sie wählen eine Ausführung, ihre Meldegröße und eine Regulierung und starten selbst eine echte Analyse; die Tour begleitet sie, während sie läuft (etwa ein bis zwei Minuten), und führt Sie dann durch ihr Ergebnis.",
      "Wo die Tour Sie zum Handeln auffordert, können Sie auch „Für mich erledigen“ klicken.",
    ],
    checklistTitle: "In der Praxis-Tour werden Sie",
    checklist: [
      "eine Ausführung, eine Meldegröße und eine Regulierung wählen",
      "die sechs Stufen und das Agentenprotokoll verfolgen",
      "den Inhalts-Graphen erkunden: Größe, Regel und Vorschrift",
      "sehen, woraus die Größe besteht, und einem Datensatz folgen",
      "das fachliche Glossar und die Regeln lesen",
      "eine regulatorische Bewertung lesen und die Kontrollen prüfen",
    ],
  },
  tour: {
    header: { chapter: "Einrichtung", title: "Die Inhalts-Herkunft – KI-Agenten", body: ["Jede Analyse beginnt hier. Frühere Analysen bleiben im Menü „Analysen“; die Schaltfläche „Geführte Tour“ startet diese Tour jederzeit erneut."] },
    language: {
      chapter: "Einrichtung",
      title: "Auf Deutsch oder Englisch arbeiten",
      body: [
        "Dieser Schalter legt die Sprache des gesamten Tabs fest: Beschriftungen, Fachbegriffe, Regeln, regulatorische Bewertungen, das Protokoll und den Excel-Export.",
        "Jede Analyse wird in beiden Sprachen erstellt – Sie können also jederzeit wechseln, auch während Sie ein Ergebnis lesen. Zitate bleiben in der Sprache der Regulierung.",
      ],
    },
    executions: {
      chapter: "Einrichtung",
      title: "Ausführung wählen",
      body: ["Eine Ausführung ist ein Lauf eines Clusters: sein Code auf seinem Datensatz, mit gespeichertem Ergebnis. Der Agent erklärt die Größen genau dieses Ergebnisses."],
      action: "Wählen Sie eine Ausführung – eine RWA-Berechnung zeigt am meisten.",
      empty: "Es wurde noch kein Cluster ausgeführt, es gibt also nichts zu erklären. Führen Sie zuerst im Tab „Cluster“ einen Cluster aus und starten Sie diese Tour dann erneut über „Geführte Tour“.",
    },
    figures: {
      chapter: "Einrichtung",
      title: "Meldegröße wählen",
      body: ["Das sind die Spalten, die der Code ableitet. Der Agent erklärt die Größen, die Sie ankreuzen – und verfolgt alles, woraus sie entstehen. Vorgeschlagen sind die Größen am Ende einer Berechnungskette, etwa RWA."],
      action: "Kreuzen Sie die vorgeschlagene Größe an.",
      empty: "Diese Ausführung leitet keine Spalte ab, es gibt also nichts zu erklären. Gehen Sie zurück und wählen Sie eine andere Ausführung.",
    },
    regulations: {
      chapter: "Einrichtung",
      title: "Die Regulierung hinzufügen",
      body: ["Mit einer indizierten Regulierung findet der Agent die Vorschriften hinter jeder Regel, zitiert sie und bewertet die Regel. Ohne sie ist die Inhalts-Herkunft vollständig, hat aber keine regulatorische Grundlage."],
      action: "Kreuzen Sie die Regulierung an (zum Beispiel die CRR).",
      empty: "Noch keine Regulierung ist indiziert. Die Tour geht ohne regulatorische Grundlage weiter; laden Sie im Tab „Vorschriften“ eine hoch, um sie späteren Analysen hinzuzufügen.",
    },
    method: { chapter: "Einrichtung", title: "Die Methode in sechs Stufen", body: ["Verfolgen und Zusammensetzen ermitteln die Fakten; Beschreiben, regulatorisch Einordnen und Prüfen bringen sie in fachliche und regulatorische Sprache; Übersetzen stellt alles auf Deutsch und Englisch bereit."] },
    runBar: {
      chapter: "Einrichtung",
      title: "Analyse starten",
      body: ["Damit startet eine echte Analyse – genau wie außerhalb der Tour. Sie dauert etwa ein bis zwei Minuten und ruft das Sprachmodell auf; das Ergebnis wird im Menü „Analysen“ gespeichert."],
      action: "Klicken Sie auf „Inhalts-Herkunft erstellen“.",
    },
    progress: { chapter: "Live", title: "Der Agent arbeitet", body: ["Ihre Analyse läuft jetzt. Sie läuft auf dem Server weiter – Sie können den Tab verlassen und zurückkehren, sie wird wieder angezeigt – und „Abbrechen“ stoppt sie nach dem aktuellen Schritt."] },
    stages: { chapter: "Live", title: "Sechs Stufen mit Live-Zählern", body: ["Jede Karte füllt sich, sobald der Agent die Stufe abschließt: reproduzierte Werte, gefundene Begriffe, Regeln und Fälle, beschriebene Regeln, verknüpfte Vorschriften, geprüfte Bewertungen, übersetzte Texte."] },
    console: {
      chapter: "Live",
      title: "Das Agentenprotokoll",
      body: ["Jeder Schritt in verständlicher Sprache: der Umfang der Größe, der Rahmen der Berechnung, welche Vorschriften mit welcher Regel und welcher Bewertung verknüpft wurden, wie der Zweitprüfer entschieden hat."],
      action: "Warten Sie, bis die Analyse fertig ist – die Tour geht von selbst weiter, sobald das Ergebnis vorliegt.",
    },
    meta: { chapter: "Ergebnisse", title: "Die Analyse auf einen Blick", body: ["Cluster, Ausführung, Code, Datensatz, die erklärten Größen, Laufzeit und Modell. Ein Abzeichen zeigt die schwerste regulatorische Bewertung; „Export“ liefert die Excel-Arbeitsmappe in Ihrer Sprache."] },
    tabs: { chapter: "Ergebnisse", title: "Fünf Ansichten auf eine Inhalts-Herkunft", body: ["Inhalts-Graph, was in den Größen steckt, Glossar & Regeln, regulatorische Grundlage, Prüfungen & Protokoll. Ergebnisse öffnen im Graph; ein Klick auf einen Begriff, eine Regel oder eine Vorschrift führt überall an die richtige Stelle."] },
    graph: { chapter: "Graph", title: "Der Inhalts-Graph", body: ["Quelldaten links, die Meldegröße rechts; violette Pillen sind die fachlichen Regeln, die orangefarbenen Karten oben die Vorschriften. Hintergrund ziehen verschiebt die Ansicht, einen Knoten ziehen versetzt ihn – seine Verbindungen folgen –, Scrollen zoomt."] },
    graphFigure: {
      chapter: "Graph",
      title: "Bei der Größe beginnen",
      body: ["Die ausgewählte Größe hebt alles hervor, woraus sie entsteht. Das Feld rechts zeigt ihre Definition, ihren gemeldeten Wert und die Regel, die sie ableitet."],
      action: "Klicken Sie auf die Meldegröße – den Knoten mit goldenem Rand rechts.",
    },
    graphRule: {
      chapter: "Graph",
      title: "Eine fachliche Regel öffnen",
      body: ["Eine Regel zeigt ihre Aussage und jeden Fall: wann er gilt, wie viele Datensätze er erzeugt hat und – bei einer Parametertabelle – den Wert je Kategorie."],
      action: "Klicken Sie auf eine fachliche Regel – eine der violetten Pillen.",
    },
    graphProvision: {
      chapter: "Graph",
      title: "Eine Vorschrift lesen",
      body: ["Eine Vorschrift zeigt die Regeln, die sie regelt, auf welche Weise, und das verifizierte Zitat. „Ganze Vorschrift lesen“ öffnet ihren vollständigen Text."],
      action: "Klicken Sie auf eine Vorschrift – eine der orangefarbenen Karten oben.",
    },
    figureHead: { chapter: "Größen", title: "Was in der Größe steckt", body: ["Die gemeldete Summe, wie viele Datensätze einen Wert haben, wie viel abgeleitet statt geliefert wurde und wie viele unterschiedliche Inhaltspfade dahinterliegen."] },
    origins: { chapter: "Größen", title: "Woher der Wert stammt", body: ["Jeder Wert wird entweder vom Quellsystem geliefert oder von einem Fall der Regel der Größe abgeleitet – mit Datensätzen, Beträgen und Anteilen."] },
    paths: { chapter: "Größen", title: "Inhaltspfade", body: ["Jeder Pfad ist eine Kette fachlicher Fälle, von der Größe zurück zu ihren Eingaben, mit den Datensätzen und dem Betrag, die er umfasst. Die größten Pfade stehen oben; die Datensatz-Schaltflächen öffnen ein Beispiel."] },
    segments: { chapter: "Größen", title: "Nach fachlichem Segment", body: ["Die Größe aufgeschlüsselt nach den Klassifikationen der Datensätze – Produktart, Assetklasse oder jede andere Kategorie in den Daten."] },
    records: {
      chapter: "Größen",
      title: "Einem einzelnen Datensatz folgen",
      body: ["Jeder Datensatz der Größe lässt sich verfolgen: wie sein Wert Fall für Fall entstanden ist, mit den Werten, die jeder Fall verwendet hat."],
      action: "Wählen Sie links einen Datensatz – eine Kreditlinie wie Limit_5 eignet sich gut.",
    },
    derivation: { chapter: "Größen", title: "Die Herleitung des Datensatzes", body: ["Von der Größe bis zu den Quelldaten: jeder Wert mit dem Fall, der ihn erzeugt hat, dem angewandten Parameter und den Werten, aus denen er entstanden ist."] },
    summary: { chapter: "Glossar", title: "Was die Berechnung liefert", body: ["Das Fachgebiet und eine kurze Zusammenfassung, von der KI aus den Fakten der Berechnung verfasst. Ein Hinweis zeigt, wenn Sie eine Übersetzung lesen."] },
    glossary: { chapter: "Glossar", title: "Das fachliche Glossar", body: ["Jeder Begriff, aus dem die Größe entsteht: sein fachlicher Name, die Spalte dahinter, seine Definition, wie sich sein Inhalt auf geliefert und abgeleitet verteilt, und seine regulatorische Grundlage."] },
    rules: { chapter: "Glossar", title: "Regeln und ihre Fälle", body: ["Jede Regel mit ihrer Aussage und einer Tabelle ihrer Fälle: wann jeder gilt, was er ergibt, wie er im Code umgesetzt ist und welche Datensätze und Beträge er erzeugt hat."] },
    regulationHead: { chapter: "Regulierung", title: "Die regulatorische Grundlage", body: ["Die durchsuchte Regulierung, der Rahmen, auf den die Suche beschränkt war, und die Bewertungen auf einen Blick – mit der Zahl der Wort für Wort verifizierten Zitate."] },
    assessment: { chapter: "Regulierung", title: "Eine Bewertung", body: ["Die Regel, ihre Bewertung und die Begründung; die Vorschriften mit ihren verifizierten Zitaten; Feststellungen je Fall oder Kategorie; und die Entscheidung des Zweitprüfers. Abweichungen und Vereinfachungen stehen oben."] },
    checks: { chapter: "Prüfungen", title: "Die elf Kontrollen", body: ["Jede Kontrolle mit Ergebnis und Kennzahlen. Eine nicht bestandene Kontrolle wird nie versteckt: Sie erscheint hier und im Export."] },
    findings: { chapter: "Prüfungen", title: "Inhaltliche Feststellungen", body: ["Was die Inhalts-Herkunft zeigt: Abweichungen von der Regulierung, fehlende Werte einer Größe, Kategorien ohne Parameter, Quellwerte, die keine Zahlen waren, gemischt gelieferte und abgeleitete Werte."] },
    newRun: { chapter: "Fertig", title: "Jetzt Sie", body: ["Starten Sie eine neue Analyse für jede ausgeführte Berechnung. Frühere Analysen – auch die aus dieser Tour – bleiben im Menü „Analysen“."] },
  },
  complete: {
    title: "Sie können jetzt jede Größe erklären",
    body: "Die Analyse aus dieser Tour gehört Ihnen: Sie bleibt auf dem Bildschirm und im Menü „Analysen“. Die nächste starten Sie mit „Neue Analyse“.",
    tipsTitle: "Gute Praxis",
    tips: [
      "Beginnen Sie mit den Feststellungen: Eine Abweichung oder ein fehlender Wert zeigt, wo Sie zuerst hinsehen sollten.",
      "Lesen Sie eine Bewertung zusammen mit ihrem Zitat – der Vorschriftentext ist der Beleg, die Begründung der KI eine Zusammenfassung.",
      "Folgen Sie einem Datensatz jedes großen Inhaltspfads, bevor Sie eine Größe freigeben.",
      "Exportieren Sie die Excel-Arbeitsmappe, um die Inhalts-Herkunft bei einer Prüfung abzulegen.",
    ],
  },
};

export const CONTENT_ONBOARDING_COPY: Record<ContentLocale, ContentOnboardingCopy> = { en: EN, de: DE };
