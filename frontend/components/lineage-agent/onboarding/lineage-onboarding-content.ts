/**
 * Copy and step definitions for the Technical Lineage AI Agent onboarding (English / German).
 * Column names, code and lookup-table names stay as they are in the data, in both languages.
 */

export type LineageLocale = "en" | "de";

export type DeckScreen = "language" | "welcome" | "challenge" | "pipeline" | "proof" | "graph" | "evidence" | "controls" | "ready";
export const DECK_SCREENS: DeckScreen[] = ["language", "welcome", "challenge", "pipeline", "proof", "graph", "evidence", "controls", "ready"];

export type TourStage = "setup" | "progress" | "results";
export type TourView = "graph" | "columns" | "code" | "cells" | "mapping" | "verification";
export type TourAction = "selectExecution" | "startRun" | "awaitResults" | "selectNode" | "selectCell";

export type TourStepId =
  | "header"
  | "language"
  | "executions"
  | "preview"
  | "method"
  | "runBar"
  | "progress"
  | "stages"
  | "console"
  | "meta"
  | "tabs"
  | "graph"
  | "graphNode"
  | "columnList"
  | "columnHeader"
  | "aiExplanation"
  | "derivation"
  | "columnLineage"
  | "code"
  | "cells"
  | "provenance"
  | "mapping"
  | "checks"
  | "matrix"
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
};

export const TOUR_STEPS: TourStepDef[] = [
  { id: "header", target: "lineage-header", stage: "setup" },
  { id: "language", target: "lineage-language", stage: "setup" },
  { id: "executions", target: "lineage-executions", stage: "setup", action: "selectExecution" },
  { id: "preview", target: "lineage-preview", stage: "setup" },
  { id: "method", target: "lineage-method", stage: "setup" },
  { id: "runBar", target: "lineage-run-bar", stage: "setup", action: "startRun" },
  { id: "progress", target: "lineage-progress", stage: "progress" },
  { id: "stages", target: "lineage-stages", stage: "progress" },
  { id: "console", target: "lineage-console", stage: "progress", action: "awaitResults" },
  { id: "meta", target: "lineage-meta", stage: "results", view: "graph" },
  { id: "tabs", target: "lineage-tabs", stage: "results", view: "graph" },
  { id: "graph", target: "lineage-graph", stage: "results", view: "graph" },
  { id: "graphNode", target: "lineage-graph", stage: "results", view: "graph", action: "selectNode" },
  { id: "columnList", target: "lineage-column-list", stage: "results", view: "columns" },
  { id: "columnHeader", target: "lineage-column-header", stage: "results", view: "columns" },
  { id: "aiExplanation", target: "lineage-ai-explanation", stage: "results", view: "columns" },
  { id: "derivation", target: "lineage-derivation", stage: "results", view: "columns" },
  { id: "columnLineage", target: "lineage-column-lineage", stage: "results", view: "columns" },
  { id: "code", target: "lineage-code", stage: "results", view: "code" },
  { id: "cells", target: "lineage-cells", stage: "results", view: "cells", action: "selectCell" },
  { id: "provenance", target: "lineage-provenance", stage: "results", view: "cells" },
  { id: "mapping", target: "lineage-mapping", stage: "results", view: "mapping" },
  { id: "checks", target: "lineage-checks", stage: "results", view: "verification" },
  { id: "matrix", target: "lineage-matrix", stage: "results", view: "verification" },
  { id: "newRun", target: "lineage-new", stage: "results", view: "graph" },
];

type TourText = { chapter: string; title: string; body: string[]; action?: string; empty?: string };

export type EvidencePart = "explanation" | "formula" | "derivation" | "cell" | "runtime" | "finding";

/** The code shown on the "challenge" screen (lines of code_2-style RWA script). */
export const CHALLENGE_CODE = [
  "balance_sheet_by_product = {'Loan': 'OnBalance', ...}",
  "for col in ['Nominal', 'Accrued Interests', 'EAD']:",
  "    df[col] = pd.to_numeric(df[col], errors='coerce')",
  "df['BalanceSheetType'] = df['BalanceSheetType'].fillna(",
  "    df['ProductType'].map(balance_sheet_by_product))",
  "mask = df['Assessment Base'].isna() & df['ProductType'].eq('Limit')",
  "df.loc[mask, 'Assessment Base'] = df.loc[mask, 'Nominal']",
  "df['Assessment Base'] = df['Assessment Base'].fillna(",
  "    df['Accrued Interests'].fillna(0) + df['Book Value'].fillna(0))",
  "df['EAD'] = df['EAD'].fillna(df['Assessment Base'] * df['CCF'])",
];

/** Dependencies of the probe demo: input column → output columns that react (from a real run). */
export const PROBE_DEMO: { inputs: string[]; outputs: string[]; reacts: Record<string, string[]> } = {
  inputs: ["ProductType", "Nominal", "Book Value", "Market Value", "Asset Class"],
  outputs: ["BalanceSheetType", "Assessment Base", "CCF", "EAD", "Risk Weight", "RWA"],
  reacts: {
    ProductType: ["BalanceSheetType", "Assessment Base", "CCF", "EAD", "RWA"],
    Nominal: ["Assessment Base", "EAD", "RWA"],
    "Book Value": ["Assessment Base", "EAD", "RWA"],
    "Market Value": ["Assessment Base", "EAD", "RWA"],
    "Asset Class": ["Risk Weight", "RWA"],
  },
};

export type LineageOnboardingCopy = {
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
  language: { title: string; subtitle: string; hint: string; defaultBadge: string; options: Record<LineageLocale, { name: string; native: string }> };
  welcome: { eyebrow: string; title: string; body: string[]; learnTitle: string; learn: string[] };
  challenge: {
    eyebrow: string;
    title: string;
    intro: string;
    codeLabel: string;
    naiveLabel: string;
    agentLabel: string;
    play: string;
    pause: string;
    traps: { key: string; title: string; lines: number[]; naive: string; agent: string; chips: string[] }[];
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
  proof: {
    eyebrow: string;
    title: string;
    intro: string;
    inputsLabel: string;
    outputsLabel: string;
    hint: string;
    rerun: string;
    changed: string;
    unchanged: string;
    result: string;
    modesTitle: string;
    modes: { title: string; text: string }[];
  };
  graph: {
    eyebrow: string;
    title: string;
    intro: string;
    hint: string;
    upstream: string;
    downstream: string;
    rolesTitle: string;
    roles: { key: "passthrough" | "cast" | "enriched" | "lookup"; title: string; text: string }[];
    edgesTitle: string;
    edges: { key: "direct" | "indirect" | "lookup"; title: string; text: string }[];
  };
  evidence: {
    eyebrow: string;
    title: string;
    intro: string;
    parts: { key: EvidencePart; title: string; text: string }[];
    mock: {
      column: string;
      role: string;
      verified: string;
      grounded: string;
      reviewed: string;
      summary: string;
      formula: string;
      stepTitle: string;
      keepsOthers: string;
      condition: string;
      changed: string;
      cellTitle: string;
      cellRow: string;
      runtimeTitle: string;
      findingTitle: string;
      findingText: string;
    };
  };
  controls: { eyebrow: string; title: string; intro: string; rules: { title: string; text: string }[]; note: string };
  ready: { eyebrow: string; title: string; body: string[]; checklistTitle: string; checklist: string[] };
  tour: Record<TourStepId, TourText>;
  complete: { title: string; body: string; tipsTitle: string; tips: string[] };
};

const EN: LineageOnboardingCopy = {
  ui: {
    product: "Lineage AI Agent",
    minutes: "About 10 minutes",
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
    stepOf: "Step {n} of {total}",
    keyboard: "← → to navigate · Esc to close",
    chapters: ["Language", "Welcome", "Why it is hard", "How the agent works", "Proof by experiment", "Reading the graph", "Every value has a trail", "Controls", "Ready"],
  },
  language: {
    title: "Choose your language",
    subtitle: "Wählen Sie Ihre Sprache",
    hint: "The whole tab follows this choice – including the AI explanations, which the agent writes in English and German for every analysis. You can switch at any time with the EN | DE switch in the tab's header; the rest of the application keeps its own language.",
    defaultBadge: "Default",
    options: { en: { name: "English", native: "English" }, de: { name: "German", native: "Deutsch" } },
  },
  welcome: {
    eyebrow: "Technical Lineage AI Agent",
    title: "Where does every value come from – and can you prove it?",
    body: [
      "Your reporting scripts turn input data into figures such as Assessment Base, EAD and RWA. Auditors, model validators and colleagues ask the same questions again and again: which input columns feed this figure, under which conditions, and through which hard-coded mappings?",
      "This agent answers those questions for any executed cluster. It reads the code line by line, replays it on the real data, tests every dependency by experiment and writes a plain-language explanation for each column – citing the exact code lines and checked by a second reviewer.",
    ],
    learnTitle: "In the next ten minutes you will learn",
    learn: [
      "why reading code by eye misses dependencies",
      "the five stages of the agent and what each one proves",
      "how to read the lineage graph and trace any path",
      "how to trace a single value back to its code line",
      "which controls make the result audit-ready",
    ],
  },
  challenge: {
    eyebrow: "Why it is hard",
    title: "The dependencies that matter are the ones you don't see at first glance",
    intro: "A script rarely writes `column = input * 2`. Masks, loops, lookup tables and fill rules hide where values really come from. Step through four typical traps.",
    codeLabel: "Excerpt of a real RWA script",
    naiveLabel: "Reading by eye",
    agentLabel: "What the agent records",
    play: "Play",
    pause: "Pause",
    traps: [
      {
        key: "mask",
        title: "Rows chosen by a mask",
        lines: [6, 7],
        naive: "Assessment Base comes from Accrued Interests and Book Value (line 8).",
        agent: "For Limit rows Assessment Base is Nominal – a value dependency on Nominal and a condition on ProductType and on the empty Assessment Base.",
        chips: ["Nominal", "ProductType", "Assessment Base"],
      },
      {
        key: "loop",
        title: "A loop over column names",
        lines: [2, 3],
        naive: "`df[col]` – no column is visibly written.",
        agent: "The loop is unrolled: one type conversion per column. In the replay, the text ' -   € ' in Accrued Interests becomes empty.",
        chips: ["Nominal", "Accrued Interests", "EAD"],
      },
      {
        key: "lookup",
        title: "A hard-coded lookup table",
        lines: [1, 4, 5],
        naive: "BalanceSheetType depends on ProductType.",
        agent: "…through the mapping balance_sheet_by_product (5 entries). Product types it does not cover would stay empty – the agent checks the data for them.",
        chips: ["ProductType", "balance_sheet_by_product"],
      },
      {
        key: "fill",
        title: "Keep or fill?",
        lines: [8, 9, 10],
        naive: "A 1:1 mapping of EAD.",
        agent: "EAD keeps every reported value and only fills the gaps with Assessment Base × CCF – the reported input is a source, too.",
        chips: ["EAD", "Assessment Base", "CCF"],
      },
    ],
  },
  pipeline: {
    eyebrow: "How the agent works",
    title: "Five stages – three prove, two explain",
    intro: "The first three stages are deterministic: they establish the lineage and prove it. The AI only explains what they found, and its explanations are checked against the proof.",
    play: "Play",
    pause: "Pause",
    footnote: "Examples from a real analysis of an RWA script (RWA_2).",
    nodes: [
      {
        key: "parse",
        title: "Static analysis",
        text: "The code is read as a syntax tree. Every column write becomes a versioned node with the columns it reads as values, the columns that decide which rows it applies to, and the lookup tables it maps through. Loops are unrolled, functions are followed.",
        example: ["18 statements · 20 column writes", "Assessment Base ← Nominal  (rows where ProductType = 'Limit')", "3 lookup tables found"],
      },
      {
        key: "replay",
        title: "Execution replay",
        text: "The code runs again, statement by statement, in the same sandbox the platform uses. The result is compared with the stored execution cell by cell, and every changed cell is attributed to the line that changed it.",
        example: ["Replaying 18 statements in the platform sandbox", "65 of 65 cells identical to the stored execution", "Row Limit_5 · Assessment Base: ∅ → 90,000 (line 24)"],
      },
      {
        key: "probe",
        title: "Dependency probes",
        text: "Each input column is changed, emptied and filled in turn while all others stay as they are. The outputs that react prove the dependency – independently of the code analysis.",
        example: ["Change ProductType → 5 outputs react", "Empty Nominal → Assessment Base, EAD, RWA react", "41 of 41 static dependencies confirmed"],
      },
      {
        key: "document",
        title: "AI documentation",
        text: "The LLM explains every derived column: meaning, rules and a formula. Each rule must cite the code lines it describes; lines or inputs outside the verified lineage are rejected and sent back.",
        example: ["EAD = EAD if reported, else Assessment Base × CCF", "Rule 2 cites line 37 · inputs: Assessment Base, CCF", "Grounding check passed"],
      },
      {
        key: "review",
        title: "Four-eyes review",
        text: "A second, independent AI pass checks every explanation against the code. If static analysis and probes disagree, an investigator agent uses tools – code, probes, cell traces – to find out why.",
        example: ["10 of 10 explanations confirmed", "Investigator: not needed – both analyses agree", "Explanations available in English and German"],
      },
    ],
  },
  proof: {
    eyebrow: "Proof by experiment",
    title: "Change one input – see exactly what reacts",
    intro: "Reading code can be wrong. Experiments cannot. Click an input column: the agent changes only that column, re-runs the script and watches which outputs move.",
    inputsLabel: "Input column changed",
    outputsLabel: "Output columns",
    hint: "Click an input column on the left.",
    rerun: "re-run",
    changed: "changed",
    unchanged: "unchanged",
    result: "{count} outputs reacted – exactly the ones the code analysis predicted.",
    modesTitle: "Three probes per input column",
    modes: [
      { title: "Change", text: "Every filled value is altered (numbers scaled, texts tagged)." },
      { title: "Empty", text: "All values removed – reveals fallbacks such as fillna." },
      { title: "Fill", text: "Empty values filled – reveals whether reported values are kept." },
    ],
  },
  graph: {
    eyebrow: "Reading the graph",
    title: "Sources on the left, results on the right",
    intro: "The lineage graph orders columns by dependency. Click any column to light up everything it depends on (gold) and everything that depends on it (blue).",
    hint: "Click a column in the graph.",
    upstream: "depends on",
    downstream: "used by",
    rolesTitle: "Column roles",
    roles: [
      { key: "passthrough", title: "Pass-through", text: "Taken unchanged from the input." },
      { key: "cast", title: "Type-converted", text: "Only converted, e.g. text to number." },
      { key: "enriched", title: "Enriched", text: "Keeps input values, fills or adjusts them." },
      { key: "lookup", title: "Lookup table", text: "A mapping hard-coded in the script." },
    ],
    edgesTitle: "Edges",
    edges: [
      { key: "direct", title: "Data", text: "The value flows into the column." },
      { key: "indirect", title: "Condition", text: "Decides which rows a rule applies to." },
      { key: "lookup", title: "Lookup", text: "Values pass through a mapping table." },
    ],
  },
  evidence: {
    eyebrow: "Every value has a trail",
    title: "From a column to the line of code – and down to a single cell",
    intro: "Each column gets a dossier. Click its parts to see what they tell you and how they are verified.",
    parts: [
      { key: "explanation", title: "AI explanation", text: "Plain-language summary, written from the verified lineage. Badges show that every cited line and input passed the grounding check and that the second reviewer confirmed it." },
      { key: "formula", title: "Formula", text: "One line that a reviewer can check at a glance. Column names appear as chips – click one to jump to its own dossier." },
      { key: "derivation", title: "Derivation from the code", text: "Every write to the column in execution order, taken directly from the code, with conditions, loop bindings and the number of rows each step changed in the replay." },
      { key: "cell", title: "Cell trace", text: "Pick any value in the result: you see the line that produced it and the formula evaluated with that row's actual values." },
      { key: "runtime", title: "Runtime verification", text: "Which input columns were proven by probes to influence this column – and any that could not be observed with this data." },
      { key: "finding", title: "Findings", text: "Deterministic observations such as values emptied by a type conversion, categories a lookup does not cover or values that stay empty." },
    ],
    mock: {
      column: "EAD",
      role: "Enriched",
      verified: "Runtime-verified",
      grounded: "Grounding verified",
      reviewed: "Review: confirmed",
      summary: "EAD keeps every reported value; where it is missing it is calculated as Assessment Base multiplied by CCF.",
      formula: "if reported, else",
      stepTitle: "Fill missing values",
      keepsOthers: "keeps other rows",
      condition: "rows where EAD is empty",
      changed: "5 rows changed",
      cellTitle: "Row Limit_5",
      cellRow: "= 18,000",
      runtimeTitle: "Confirmed dependencies",
      findingTitle: "Values emptied by a type conversion",
      findingText: "' -   € ' (3×) could not be converted and became empty – line 9.",
    },
  },
  controls: {
    eyebrow: "Controls",
    title: "Nine controls make the result audit-ready",
    intro: "Every analysis runs the same deterministic checks. You find them, with their values, in the Verification view and in the Excel export.",
    rules: [
      { title: "Code parsed", text: "The script is valid Python and every statement was analysed." },
      { title: "Output columns match", text: "The columns derived from the code equal the stored execution's columns." },
      { title: "Static coverage", text: "Every statement was resolved to column reads and writes." },
      { title: "Replay reproduces", text: "Re-running the code reproduces the stored result cell by cell." },
      { title: "Runtime writes match", text: "Every changed cell was changed where the analysis expected it." },
      { title: "Cells attributed", text: "Every computed value is traced to the line that produced it." },
      { title: "Lineage agrees", text: "No output reacts to an input the analysis does not list." },
      { title: "AI grounded", text: "Every cited line and input belongs to the verified lineage." },
      { title: "Four-eyes review", text: "A second AI pass reviewed every explanation against the code." },
    ],
    note: "The AI explains; the code analysis, the replay and the probes prove. When they disagree, the agent says so and investigates – it never smooths over a gap.",
  },
  ready: {
    eyebrow: "Ready",
    title: "Now try it on the real tab",
    body: [
      "The hands-on tour walks you through the live tab. You choose an execution and start a real analysis yourself; the tour follows it while it runs (usually about a minute) and then walks you through its result.",
      "Wherever the tour asks you to act, you can also click “Do it for me”.",
    ],
    checklistTitle: "In the hands-on tour you will",
    checklist: [
      "choose an execution and start an analysis",
      "watch the five stages and the agent console",
      "trace a column in the lineage graph",
      "read a column dossier and its derivation",
      "trace a single cell back to its code line",
      "check the controls and the dependency matrix",
    ],
  },
  tour: {
    header: { chapter: "Setup", title: "The Technical Lineage AI Agent", body: ["Every analysis starts here. Earlier analyses stay in the Runs menu; this Guided tour button starts the tour again at any time."] },
    language: {
      chapter: "Setup",
      title: "Work in English or German",
      body: [
        "This switch sets the language of the whole tab: labels, the AI explanations of every column, findings, the log and every export.",
        "Each analysis is written in both languages, so you can switch at any time – also while you read a result. The rest of the application keeps its own language.",
      ],
    },
    executions: {
      chapter: "Setup",
      title: "Choose an execution",
      body: ["An execution is one run of a cluster: its code applied to its dataset, with the stored result. The agent analyses exactly that combination."],
      action: "Select any execution in the list.",
      empty: "No cluster has been executed yet, so there is nothing to analyse. Run a cluster in the Cluster tab first, then start this tour again with “Guided tour”.",
    },
    preview: { chapter: "Setup", title: "Review the input", body: ["The code and the input columns the agent will analyse. Column names in the code are underlined – the agent will trace each of them."] },
    method: { chapter: "Setup", title: "The method in five stages", body: ["Static analysis, replay and probes prove the lineage; AI documentation and review explain it. Probes run the code about three times per input column – keep them on unless a script is very slow."] },
    runBar: {
      chapter: "Setup",
      title: "Start the analysis",
      body: ["This starts a real analysis of the selected execution – exactly as outside the tour. It usually takes about a minute and calls the language model; the result is saved in the Runs menu."],
      action: "Click “Start lineage analysis”.",
    },
    progress: {
      chapter: "Live",
      title: "The agent at work",
      body: [
        "Your analysis is running now. It continues on the server – you can leave the tab and come back, it will be reattached – and Cancel stops it after the current step.",
      ],
    },
    stages: { chapter: "Live", title: "Five stages with live counters", body: ["Each card fills in as the agent completes the stage: statements analysed, cells compared, probes run, columns documented and reviewed."] },
    console: {
      chapter: "Live",
      title: "The agent console",
      body: ["Every step in plain language: which input moved which outputs, which column was documented, what the reviewer decided."],
      action: "Wait for the analysis to finish – the tour continues by itself as soon as the result is ready.",
    },
    meta: { chapter: "Results", title: "The analysis at a glance", body: ["Cluster, execution, code file, dataset, runtime and model. Export gives you an Excel workbook and an OpenLineage file for data catalogues – both in the language you are using."] },
    tabs: { chapter: "Results", title: "Six views on one lineage", body: ["Graph, column dossiers, annotated code, cell trace, mapping table and verification. Results open on the graph; clicking a column, line or cell anywhere takes you to the right view."] },
    graph: { chapter: "Graph", title: "The lineage graph", body: ["Sources on the left, derived columns on the right. Solid edges carry values, dashed edges are conditions, dotted edges come from lookup tables. Drag the background to pan, drag a node to move it – its connections follow – and scroll to zoom."] },
    graphNode: {
      chapter: "Graph",
      title: "Trace a column",
      body: ["Selecting a column lights up its complete upstream lineage in gold and its consumers in blue. The panel on the right summarises the column."],
      action: "Click a derived column such as EAD or RWA.",
    },
    columnList: { chapter: "Columns", title: "Every column, one dossier each", body: ["Filter by role or search. The tick marks columns whose AI explanation passed the grounding check."] },
    columnHeader: { chapter: "Columns", title: "The column at a glance", body: ["Role, runtime verification and the operations applied – plus the number of direct inputs, source columns, writes and changed rows."] },
    aiExplanation: { chapter: "Columns", title: "The AI explanation", body: ["Meaning, summary, formula and rules – every rule cites its code lines and inputs. The badges show the grounding check and the four-eyes review."] },
    derivation: { chapter: "Columns", title: "Derivation from the code", body: ["The ground truth behind the explanation: every write in execution order, with its condition and how many rows it changed. Expand a step to see the code."] },
    columnLineage: { chapter: "Columns", title: "Inputs, consumers and sources", body: ["Direct inputs with their OpenLineage transformation type, the columns that use this one, and the input columns it ultimately depends on."] },
    code: { chapter: "Code", title: "The annotated code", body: ["The script with the AI's processing stages. Every statement shows the columns it writes and how many cells it changed; click a line to inspect it."] },
    cells: {
      chapter: "Cell trace",
      title: "Trace a single value",
      body: ["Green cells were filled by the script, amber cells were changed, red cells were emptied."],
      action: "Click a coloured cell, for example in the RWA column.",
    },
    provenance: { chapter: "Cell trace", title: "The value's paper trail", body: ["The input value, then every line that changed it – with the formula evaluated on this row's actual values."] },
    mapping: { chapter: "Mapping", title: "The classic mapping table", body: ["Input → output → function, one row per dependency, with OpenLineage types, code lines and runtime verification – ready for documentation."] },
    checks: { chapter: "Verification", title: "The nine controls", body: ["Each control with its result and figures. A failed control is never hidden: it is shown here and in the export."] },
    matrix: { chapter: "Verification", title: "Static versus runtime", body: ["Every derived column against every input column: confirmed by a probe, in the code but not observable with this data, or – rare – found only at runtime."] },
    newRun: { chapter: "Done", title: "Your turn", body: ["Start a new analysis on any executed cluster. It takes about a minute; earlier analyses – including the one from this tour – stay in the Runs menu."] },
  },
  complete: {
    title: "You're ready to trace any figure",
    body: "The analysis from this tour is yours: it stays on screen and in the Runs menu. Start the next one with New analysis.",
    tipsTitle: "Good practice",
    tips: [
      "Start from the Verification view: a failed control tells you where to look first.",
      "Treat the AI explanation as a summary – the derivation and the cell trace are the evidence.",
      "Export the Excel workbook to file the lineage with a model validation or audit.",
      "Re-run the analysis after the code of a cluster changes.",
    ],
  },
};

const DE: LineageOnboardingCopy = {
  ui: {
    product: "Herkunfts-KI-Agent",
    minutes: "Etwa 10 Minuten",
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
    stepOf: "Schritt {n} von {total}",
    keyboard: "← → zum Blättern · Esc zum Schließen",
    chapters: ["Sprache", "Willkommen", "Warum es schwer ist", "So arbeitet der Agent", "Beweis durch Experiment", "Den Graphen lesen", "Jeder Wert hat eine Spur", "Kontrollen", "Bereit"],
  },
  language: {
    title: "Wählen Sie Ihre Sprache",
    subtitle: "Choose your language",
    hint: "Der ganze Tab folgt dieser Wahl – auch die KI-Erläuterungen, die der Agent für jede Analyse auf Deutsch und Englisch verfasst. Sie können jederzeit mit dem Schalter EN | DE in der Kopfzeile des Tabs wechseln; die übrige Anwendung behält ihre eigene Sprache.",
    defaultBadge: "Standard",
    options: { en: { name: "Englisch", native: "English" }, de: { name: "Deutsch", native: "Deutsch" } },
  },
  welcome: {
    eyebrow: "Technische Herkunft – KI-Agent",
    title: "Woher kommt jeder Wert – und können Sie es belegen?",
    body: [
      "Ihre Reporting-Skripte machen aus Eingabedaten Kennzahlen wie Assessment Base, EAD und RWA. Prüfer, Modellvalidierung und Kolleginnen und Kollegen stellen immer wieder dieselben Fragen: Welche Eingabespalten fließen in diese Kennzahl ein, unter welchen Bedingungen und über welche fest codierten Zuordnungen?",
      "Dieser Agent beantwortet diese Fragen für jeden ausgeführten Cluster. Er liest den Code Zeile für Zeile, führt ihn auf den echten Daten erneut aus, prüft jede Abhängigkeit per Experiment und erläutert jede Spalte in verständlicher Sprache – mit Verweis auf die genauen Codezeilen und geprüft von einem zweiten Prüfer.",
    ],
    learnTitle: "In den nächsten zehn Minuten lernen Sie",
    learn: [
      "warum das Lesen von Code mit bloßem Auge Abhängigkeiten übersieht",
      "die fünf Stufen des Agenten und was jede belegt",
      "wie Sie den Herkunftsgraphen lesen und jeden Pfad verfolgen",
      "wie Sie einen einzelnen Wert bis zu seiner Codezeile zurückverfolgen",
      "welche Kontrollen das Ergebnis prüfungsfest machen",
    ],
  },
  challenge: {
    eyebrow: "Warum es schwer ist",
    title: "Die wichtigen Abhängigkeiten sind die, die man nicht auf den ersten Blick sieht",
    intro: "Ein Skript schreibt selten `spalte = eingabe * 2`. Masken, Schleifen, Mapping-Tabellen und Füllregeln verbergen, woher Werte wirklich kommen. Gehen Sie vier typische Fallen durch.",
    codeLabel: "Auszug aus einem echten RWA-Skript",
    naiveLabel: "Mit bloßem Auge gelesen",
    agentLabel: "Was der Agent festhält",
    play: "Abspielen",
    pause: "Pause",
    traps: [
      {
        key: "mask",
        title: "Zeilen per Maske ausgewählt",
        lines: [6, 7],
        naive: "Assessment Base stammt aus Accrued Interests und Book Value (Zeile 8).",
        agent: "Für Limit-Zeilen ist Assessment Base gleich Nominal – eine Wertabhängigkeit von Nominal und eine Bedingung auf ProductType und auf die leere Assessment Base.",
        chips: ["Nominal", "ProductType", "Assessment Base"],
      },
      {
        key: "loop",
        title: "Eine Schleife über Spaltennamen",
        lines: [2, 3],
        naive: "`df[col]` – sichtbar wird keine Spalte geschrieben.",
        agent: "Die Schleife wird aufgerollt: eine Typkonvertierung je Spalte. In der Wiederholung wird der Text ' -   € ' in Accrued Interests leer.",
        chips: ["Nominal", "Accrued Interests", "EAD"],
      },
      {
        key: "lookup",
        title: "Eine fest codierte Mapping-Tabelle",
        lines: [1, 4, 5],
        naive: "BalanceSheetType hängt von ProductType ab.",
        agent: "…über die Zuordnung balance_sheet_by_product (5 Einträge). Produkttypen, die sie nicht abdeckt, blieben leer – der Agent prüft die Daten darauf.",
        chips: ["ProductType", "balance_sheet_by_product"],
      },
      {
        key: "fill",
        title: "Behalten oder füllen?",
        lines: [8, 9, 10],
        naive: "Eine 1:1-Zuordnung von EAD.",
        agent: "EAD behält jeden gemeldeten Wert und füllt nur die Lücken mit Assessment Base × CCF – auch die gemeldete Eingabe ist eine Quelle.",
        chips: ["EAD", "Assessment Base", "CCF"],
      },
    ],
  },
  pipeline: {
    eyebrow: "So arbeitet der Agent",
    title: "Fünf Stufen – drei belegen, zwei erläutern",
    intro: "Die ersten drei Stufen sind deterministisch: Sie ermitteln die Herkunft und belegen sie. Die KI erläutert nur, was sie gefunden haben, und ihre Erläuterungen werden gegen diesen Beleg geprüft.",
    play: "Abspielen",
    pause: "Pause",
    footnote: "Beispiele aus einer echten Analyse eines RWA-Skripts (RWA_2).",
    nodes: [
      {
        key: "parse",
        title: "Statische Analyse",
        text: "Der Code wird als Syntaxbaum gelesen. Jeder Spaltenschreibzugriff wird zu einem versionierten Knoten mit den Spalten, die er als Werte liest, den Spalten, die bestimmen, für welche Zeilen er gilt, und den Mapping-Tabellen, die er nutzt. Schleifen werden aufgerollt, Funktionen verfolgt.",
        example: ["18 Anweisungen · 20 Spaltenschreibzugriffe", "Assessment Base ← Nominal  (Zeilen mit ProductType = 'Limit')", "3 Mapping-Tabellen gefunden"],
      },
      {
        key: "replay",
        title: "Wiederholte Ausführung",
        text: "Der Code läuft Anweisung für Anweisung erneut in derselben Sandbox, die die Plattform verwendet. Das Ergebnis wird Zelle für Zelle mit der gespeicherten Ausführung verglichen, und jede geänderte Zelle wird der Zeile zugeordnet, die sie geändert hat.",
        example: ["18 Anweisungen in der Sandbox der Plattform wiederholt", "65 von 65 Zellen identisch mit der gespeicherten Ausführung", "Zeile Limit_5 · Assessment Base: ∅ → 90.000 (Zeile 24)"],
      },
      {
        key: "probe",
        title: "Abhängigkeitstests",
        text: "Jede Eingabespalte wird nacheinander verändert, geleert und gefüllt, während alle anderen unverändert bleiben. Die Ausgaben, die reagieren, belegen die Abhängigkeit – unabhängig von der Codeanalyse.",
        example: ["ProductType verändert → 5 Ausgaben reagieren", "Nominal geleert → Assessment Base, EAD, RWA reagieren", "41 von 41 statischen Abhängigkeiten bestätigt"],
      },
      {
        key: "document",
        title: "KI-Dokumentation",
        text: "Das LLM erläutert jede abgeleitete Spalte: Bedeutung, Regeln und eine Formel. Jede Regel muss die Codezeilen nennen, die sie beschreibt; Zeilen oder Eingaben außerhalb der verifizierten Herkunft werden zurückgewiesen.",
        example: ["EAD = EAD wenn gemeldet, sonst Assessment Base × CCF", "Regel 2 nennt Zeile 37 · Eingaben: Assessment Base, CCF", "Belegprüfung bestanden"],
      },
      {
        key: "review",
        title: "Vier-Augen-Prüfung",
        text: "Ein zweiter, unabhängiger KI-Durchlauf prüft jede Erläuterung gegen den Code. Wenn statische Analyse und Tests nicht übereinstimmen, klärt ein Untersuchungsagent mit Werkzeugen – Code, Tests, Zellverfolgung – die Ursache.",
        example: ["10 von 10 Erläuterungen bestätigt", "Untersuchung: nicht nötig – beide Analysen stimmen überein", "Erläuterungen auf Deutsch und Englisch verfügbar"],
      },
    ],
  },
  proof: {
    eyebrow: "Beweis durch Experiment",
    title: "Eine Eingabe ändern – genau sehen, was reagiert",
    intro: "Codelesen kann irren. Experimente nicht. Klicken Sie auf eine Eingabespalte: Der Agent ändert nur diese Spalte, führt das Skript erneut aus und beobachtet, welche Ausgaben sich bewegen.",
    inputsLabel: "Veränderte Eingabespalte",
    outputsLabel: "Ausgabespalten",
    hint: "Klicken Sie links auf eine Eingabespalte.",
    rerun: "neu ausführen",
    changed: "geändert",
    unchanged: "unverändert",
    result: "{count} Ausgaben haben reagiert – genau die, die die Codeanalyse vorhergesagt hat.",
    modesTitle: "Drei Tests je Eingabespalte",
    modes: [
      { title: "Verändern", text: "Jeder gefüllte Wert wird verändert (Zahlen skaliert, Texte markiert)." },
      { title: "Leeren", text: "Alle Werte entfernt – deckt Ersatzwerte wie fillna auf." },
      { title: "Füllen", text: "Leere Werte gefüllt – zeigt, ob gemeldete Werte erhalten bleiben." },
    ],
  },
  graph: {
    eyebrow: "Den Graphen lesen",
    title: "Quellen links, Ergebnisse rechts",
    intro: "Der Herkunftsgraph ordnet die Spalten nach Abhängigkeit. Klicken Sie auf eine Spalte, um alles hervorzuheben, wovon sie abhängt (gold), und alles, was sie verwendet (blau).",
    hint: "Klicken Sie im Graphen auf eine Spalte.",
    upstream: "hängt ab von",
    downstream: "verwendet von",
    rolesTitle: "Spaltenrollen",
    roles: [
      { key: "passthrough", title: "Durchgereicht", text: "Unverändert aus der Eingabe übernommen." },
      { key: "cast", title: "Typkonvertiert", text: "Nur konvertiert, z. B. Text in Zahl." },
      { key: "enriched", title: "Angereichert", text: "Behält Eingabewerte, füllt oder passt sie an." },
      { key: "lookup", title: "Mapping-Tabelle", text: "Eine im Skript fest codierte Zuordnung." },
    ],
    edgesTitle: "Kanten",
    edges: [
      { key: "direct", title: "Daten", text: "Der Wert fließt in die Spalte ein." },
      { key: "indirect", title: "Bedingung", text: "Bestimmt, für welche Zeilen eine Regel gilt." },
      { key: "lookup", title: "Mapping", text: "Werte laufen durch eine Zuordnungstabelle." },
    ],
  },
  evidence: {
    eyebrow: "Jeder Wert hat eine Spur",
    title: "Von der Spalte zur Codezeile – bis hinunter zur einzelnen Zelle",
    intro: "Jede Spalte erhält ein Dossier. Klicken Sie auf seine Teile, um zu sehen, was sie aussagen und wie sie geprüft werden.",
    parts: [
      { key: "explanation", title: "KI-Erläuterung", text: "Zusammenfassung in verständlicher Sprache, verfasst aus der verifizierten Herkunft. Die Abzeichen zeigen, dass jede zitierte Zeile und Eingabe die Belegprüfung bestanden hat und der zweite Prüfer bestätigt hat." },
      { key: "formula", title: "Formel", text: "Eine Zeile, die sich auf einen Blick prüfen lässt. Spaltennamen erscheinen als Chips – ein Klick öffnet deren eigenes Dossier." },
      { key: "derivation", title: "Ableitung aus dem Code", text: "Jeder Schreibzugriff auf die Spalte in Ausführungsreihenfolge, direkt aus dem Code, mit Bedingungen, Schleifenbindungen und der Zahl der Zeilen, die jeder Schritt in der Wiederholung geändert hat." },
      { key: "cell", title: "Zellverfolgung", text: "Wählen Sie einen beliebigen Ergebniswert: Sie sehen die Zeile, die ihn erzeugt hat, und die Formel, ausgewertet mit den echten Werten dieser Zeile." },
      { key: "runtime", title: "Laufzeitbestätigung", text: "Welche Eingabespalten diese Spalte nachweislich beeinflussen – und welche sich mit diesen Daten nicht beobachten ließen." },
      { key: "finding", title: "Befunde", text: "Deterministische Beobachtungen wie durch Typkonvertierung geleerte Werte, Kategorien ohne Zuordnung oder Werte, die leer bleiben." },
    ],
    mock: {
      column: "EAD",
      role: "Angereichert",
      verified: "Zur Laufzeit bestätigt",
      grounded: "Belege bestätigt",
      reviewed: "Prüfung: bestätigt",
      summary: "EAD behält jeden gemeldeten Wert; fehlt er, wird er als Assessment Base multipliziert mit CCF berechnet.",
      formula: "wenn gemeldet, sonst",
      stepTitle: "Fehlende Werte füllen",
      keepsOthers: "andere Zeilen bleiben",
      condition: "Zeilen mit leerem EAD",
      changed: "5 Zeilen geändert",
      cellTitle: "Zeile Limit_5",
      cellRow: "= 18.000",
      runtimeTitle: "Bestätigte Abhängigkeiten",
      findingTitle: "Werte durch Typkonvertierung geleert",
      findingText: "' -   € ' (3×) ließ sich nicht konvertieren und wurde leer – Zeile 9.",
    },
  },
  controls: {
    eyebrow: "Kontrollen",
    title: "Neun Kontrollen machen das Ergebnis prüfungsfest",
    intro: "Jede Analyse führt dieselben deterministischen Prüfungen aus. Sie finden sie mit ihren Werten in der Ansicht „Verifikation“ und im Excel-Export.",
    rules: [
      { title: "Code eingelesen", text: "Das Skript ist gültiges Python und jede Anweisung wurde analysiert." },
      { title: "Ausgabespalten stimmen", text: "Die aus dem Code abgeleiteten Spalten entsprechen denen der gespeicherten Ausführung." },
      { title: "Statische Abdeckung", text: "Jede Anweisung wurde auf gelesene und geschriebene Spalten zurückgeführt." },
      { title: "Wiederholung stimmt", text: "Das erneute Ausführen reproduziert das gespeicherte Ergebnis Zelle für Zelle." },
      { title: "Schreibzugriffe passen", text: "Jede geänderte Zelle wurde dort geändert, wo die Analyse es erwartet." },
      { title: "Zellen zugeordnet", text: "Jeder berechnete Wert ist auf die Zeile zurückgeführt, die ihn erzeugt hat." },
      { title: "Herkunft stimmt überein", text: "Keine Ausgabe reagiert auf eine Eingabe, die die Analyse nicht führt." },
      { title: "KI belegt", text: "Jede zitierte Zeile und Eingabe gehört zur verifizierten Herkunft." },
      { title: "Vier-Augen-Prüfung", text: "Ein zweiter KI-Durchlauf hat jede Erläuterung gegen den Code geprüft." },
    ],
    note: "Die KI erläutert; Codeanalyse, Wiederholung und Tests belegen. Wenn sie sich widersprechen, sagt der Agent das und untersucht die Ursache – er glättet keine Lücke.",
  },
  ready: {
    eyebrow: "Bereit",
    title: "Jetzt am echten Tab ausprobieren",
    body: [
      "Die Praxis-Tour führt Sie durch den echten Tab. Sie wählen eine Ausführung und starten selbst eine echte Analyse; die Tour begleitet sie, während sie läuft (meist etwa eine Minute), und führt Sie dann durch ihr Ergebnis.",
      "Wo die Tour Sie zum Handeln auffordert, können Sie auch „Für mich erledigen“ klicken.",
    ],
    checklistTitle: "In der Praxis-Tour werden Sie",
    checklist: [
      "eine Ausführung wählen und eine Analyse starten",
      "die fünf Stufen und die Agentenkonsole verfolgen",
      "eine Spalte im Herkunftsgraphen verfolgen",
      "ein Spaltendossier und seine Ableitung lesen",
      "eine einzelne Zelle bis zu ihrer Codezeile zurückverfolgen",
      "die Kontrollen und die Abhängigkeitsmatrix prüfen",
    ],
  },
  tour: {
    header: { chapter: "Einrichtung", title: "Der Technische-Herkunft-KI-Agent", body: ["Jede Analyse beginnt hier. Frühere Analysen bleiben im Menü „Analysen“; die Schaltfläche „Geführte Tour“ startet diese Tour jederzeit erneut."] },
    language: {
      chapter: "Einrichtung",
      title: "Auf Deutsch oder Englisch arbeiten",
      body: [
        "Dieser Schalter legt die Sprache des gesamten Tabs fest: Beschriftungen, die KI-Erläuterungen jeder Spalte, Befunde, das Protokoll und alle Exporte.",
        "Jede Analyse wird in beiden Sprachen erstellt – Sie können also jederzeit wechseln, auch während Sie ein Ergebnis lesen. Die übrige Anwendung behält ihre eigene Sprache.",
      ],
    },
    executions: {
      chapter: "Einrichtung",
      title: "Ausführung wählen",
      body: ["Eine Ausführung ist ein Lauf eines Clusters: sein Code auf seinem Datensatz, mit gespeichertem Ergebnis. Der Agent analysiert genau diese Kombination."],
      action: "Wählen Sie eine beliebige Ausführung in der Liste.",
      empty: "Es wurde noch kein Cluster ausgeführt, es gibt also nichts zu analysieren. Führen Sie zuerst im Tab „Cluster“ einen Cluster aus und starten Sie diese Tour dann erneut über „Geführte Tour“.",
    },
    preview: { chapter: "Einrichtung", title: "Eingabe prüfen", body: ["Der Code und die Eingabespalten, die der Agent analysiert. Spaltennamen im Code sind unterstrichen – der Agent verfolgt jede von ihnen."] },
    method: { chapter: "Einrichtung", title: "Die Methode in fünf Stufen", body: ["Statische Analyse, Wiederholung und Tests belegen die Herkunft; KI-Dokumentation und Prüfung erläutern sie. Die Tests führen den Code etwa dreimal je Eingabespalte aus – lassen Sie sie an, außer bei sehr langsamen Skripten."] },
    runBar: {
      chapter: "Einrichtung",
      title: "Analyse starten",
      body: ["Damit startet eine echte Analyse der gewählten Ausführung – genau wie außerhalb der Tour. Sie dauert meist etwa eine Minute und ruft das Sprachmodell auf; das Ergebnis wird im Menü „Analysen“ gespeichert."],
      action: "Klicken Sie auf „Herkunftsanalyse starten“.",
    },
    progress: {
      chapter: "Live",
      title: "Der Agent arbeitet",
      body: [
        "Ihre Analyse läuft jetzt. Sie läuft auf dem Server weiter – Sie können den Tab verlassen und zurückkehren, sie wird wieder angezeigt – und „Abbrechen“ stoppt sie nach dem aktuellen Schritt.",
      ],
    },
    stages: { chapter: "Live", title: "Fünf Stufen mit Live-Zählern", body: ["Jede Karte füllt sich, sobald der Agent die Stufe abschließt: analysierte Anweisungen, verglichene Zellen, ausgeführte Tests, dokumentierte und geprüfte Spalten."] },
    console: {
      chapter: "Live",
      title: "Die Agentenkonsole",
      body: ["Jeder Schritt in verständlicher Sprache: welche Eingabe welche Ausgaben bewegt hat, welche Spalte dokumentiert wurde, wie der Prüfer entschieden hat."],
      action: "Warten Sie, bis die Analyse fertig ist – die Tour geht von selbst weiter, sobald das Ergebnis vorliegt.",
    },
    meta: { chapter: "Ergebnisse", title: "Die Analyse auf einen Blick", body: ["Cluster, Ausführung, Codedatei, Datensatz, Laufzeit und Modell. „Export“ liefert eine Excel-Arbeitsmappe und eine OpenLineage-Datei für Datenkataloge – beide in Ihrer Sprache."] },
    tabs: { chapter: "Ergebnisse", title: "Sechs Ansichten auf eine Herkunft", body: ["Graph, Spaltendossiers, kommentierter Code, Zellverfolgung, Zuordnungstabelle und Verifikation. Ergebnisse öffnen im Graph; ein Klick auf eine Spalte, Zeile oder Zelle führt überall zur passenden Ansicht."] },
    graph: { chapter: "Graph", title: "Der Herkunftsgraph", body: ["Quellen links, abgeleitete Spalten rechts. Durchgezogene Kanten tragen Werte, gestrichelte sind Bedingungen, gepunktete kommen aus Mapping-Tabellen. Hintergrund ziehen verschiebt die Ansicht, einen Knoten ziehen versetzt ihn – seine Verbindungen folgen –, Scrollen zoomt."] },
    graphNode: {
      chapter: "Graph",
      title: "Eine Spalte verfolgen",
      body: ["Eine ausgewählte Spalte zeigt ihre gesamte Herkunft in Gold und ihre Verwender in Blau. Das Feld rechts fasst die Spalte zusammen."],
      action: "Klicken Sie auf eine abgeleitete Spalte wie EAD oder RWA.",
    },
    columnList: { chapter: "Spalten", title: "Jede Spalte, je ein Dossier", body: ["Nach Rolle filtern oder suchen. Das Häkchen markiert Spalten, deren KI-Erläuterung die Belegprüfung bestanden hat."] },
    columnHeader: { chapter: "Spalten", title: "Die Spalte auf einen Blick", body: ["Rolle, Laufzeitbestätigung und angewandte Operationen – dazu die Zahl der direkten Eingaben, Quellspalten, Schreibzugriffe und geänderten Zeilen."] },
    aiExplanation: { chapter: "Spalten", title: "Die KI-Erläuterung", body: ["Bedeutung, Zusammenfassung, Formel und Regeln – jede Regel nennt ihre Codezeilen und Eingaben. Die Abzeichen zeigen Belegprüfung und Vier-Augen-Prüfung."] },
    derivation: { chapter: "Spalten", title: "Ableitung aus dem Code", body: ["Die Grundlage der Erläuterung: jeder Schreibzugriff in Ausführungsreihenfolge, mit Bedingung und der Zahl geänderter Zeilen. Einen Schritt aufklappen, um den Code zu sehen."] },
    columnLineage: { chapter: "Spalten", title: "Eingaben, Verwender und Quellen", body: ["Direkte Eingaben mit ihrem OpenLineage-Transformationstyp, die Spalten, die diese verwenden, und die Eingabespalten, von denen sie letztlich abhängt."] },
    code: { chapter: "Code", title: "Der kommentierte Code", body: ["Das Skript mit den Verarbeitungsstufen der KI. Jede Anweisung zeigt die geschriebenen Spalten und wie viele Zellen sie geändert hat; ein Klick auf eine Zeile öffnet den Inspektor."] },
    cells: {
      chapter: "Zellverfolgung",
      title: "Einen einzelnen Wert verfolgen",
      body: ["Grüne Zellen hat das Skript gefüllt, gelbe geändert, rote geleert."],
      action: "Klicken Sie auf eine farbige Zelle, zum Beispiel in der Spalte RWA.",
    },
    provenance: { chapter: "Zellverfolgung", title: "Die Spur des Wertes", body: ["Der Eingabewert, dann jede Zeile, die ihn geändert hat – mit der Formel, ausgewertet auf den echten Werten dieser Zeile."] },
    mapping: { chapter: "Zuordnung", title: "Die klassische Zuordnungstabelle", body: ["Eingabe → Ausgabe → Funktion, eine Zeile je Abhängigkeit, mit OpenLineage-Typen, Codezeilen und Laufzeitbestätigung – bereit für die Dokumentation."] },
    checks: { chapter: "Verifikation", title: "Die neun Kontrollen", body: ["Jede Kontrolle mit Ergebnis und Kennzahlen. Eine nicht bestandene Kontrolle wird nie versteckt: Sie erscheint hier und im Export."] },
    matrix: { chapter: "Verifikation", title: "Statisch gegen Laufzeit", body: ["Jede abgeleitete Spalte gegen jede Eingabespalte: durch einen Test bestätigt, im Code aber mit diesen Daten nicht beobachtbar, oder – selten – nur zur Laufzeit gefunden."] },
    newRun: { chapter: "Fertig", title: "Jetzt Sie", body: ["Starten Sie eine neue Analyse für einen beliebigen ausgeführten Cluster. Sie dauert etwa eine Minute; frühere Analysen – auch die aus dieser Tour – bleiben im Menü „Analysen“."] },
  },
  complete: {
    title: "Sie können jetzt jede Kennzahl zurückverfolgen",
    body: "Die Analyse aus dieser Tour gehört Ihnen: Sie bleibt auf dem Bildschirm und im Menü „Analysen“. Die nächste starten Sie mit „Neue Analyse“.",
    tipsTitle: "Gute Praxis",
    tips: [
      "Beginnen Sie mit der Ansicht „Verifikation“: Eine nicht bestandene Kontrolle zeigt, wo Sie zuerst hinsehen sollten.",
      "Verstehen Sie die KI-Erläuterung als Zusammenfassung – Ableitung und Zellverfolgung sind die Belege.",
      "Exportieren Sie die Excel-Arbeitsmappe, um die Herkunft bei einer Modellvalidierung oder Prüfung abzulegen.",
      "Wiederholen Sie die Analyse, wenn sich der Code eines Clusters ändert.",
    ],
  },
};

export const LINEAGE_ONBOARDING_COPY: Record<LineageLocale, LineageOnboardingCopy> = { en: EN, de: DE };
