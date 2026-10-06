/**
 * Copy and step definitions for the Agent Studio onboarding (English / German).
 * Tool names stay in English in both languages because agents call them by these exact names.
 */
import type { StudioLocale } from "../i18n";

export const TOUR_TEMPLATE_ID = "release-note-matcher";

export type DeckScreen = "language" | "welcome" | "how" | "anatomy" | "tools" | "trust" | "ready";
export const DECK_SCREENS: DeckScreen[] = ["language", "welcome", "how", "anatomy", "tools", "trust", "ready"];

export type TourView = "home" | "workbench";

export type TourStepId =
  | "library"
  | "language"
  | "stepper"
  | "foundation"
  | "selectTemplate"
  | "blueprint"
  | "brief"
  | "useAsIs"
  | "header"
  | "editor"
  | "refine"
  | "procedure"
  | "tools"
  | "sources"
  | "saveBar"
  | "testBench"
  | "pinContext"
  | "composer"
  | "trace";

export type TourStepDef = {
  id: TourStepId;
  view: TourView;
  /** data-tour attribute of the element to spotlight. */
  target: string;
  /** Used when the primary target is not on screen (e.g. no messages yet). */
  fallbackTarget?: string;
  /** "required" steps wait for the user to act (or press "Do it for me"); "optional" ones can be skipped with Next. */
  action?: "selectTemplate" | "useTemplate" | "askQuestion";
};

export const TOUR_STEPS: TourStepDef[] = [
  { id: "library", view: "home", target: "library" },
  { id: "language", view: "home", target: "language" },
  { id: "stepper", view: "home", target: "stepper" },
  { id: "foundation", view: "home", target: "foundation" },
  { id: "selectTemplate", view: "home", target: `template-${TOUR_TEMPLATE_ID}`, action: "selectTemplate" },
  { id: "blueprint", view: "home", target: "blueprint" },
  { id: "brief", view: "home", target: "brief" },
  { id: "useAsIs", view: "home", target: "use-as-is", action: "useTemplate" },
  { id: "header", view: "workbench", target: "agent-header" },
  { id: "editor", view: "workbench", target: "editor" },
  { id: "refine", view: "workbench", target: "refine" },
  { id: "procedure", view: "workbench", target: "procedure" },
  { id: "tools", view: "workbench", target: "tools" },
  { id: "sources", view: "workbench", target: "sources" },
  { id: "saveBar", view: "workbench", target: "save-bar" },
  { id: "testBench", view: "workbench", target: "test-bench" },
  { id: "pinContext", view: "workbench", target: "pin-context" },
  { id: "composer", view: "workbench", target: "composer", action: "askQuestion" },
  { id: "trace", view: "workbench", target: "messages", fallbackTarget: "test-bench" },
];

type TourText = { chapter: string; title: string; body: string[]; action?: string };

export type OnboardingCopy = {
  ui: {
    skipIntro: string;
    skipTour: string;
    back: string;
    next: string;
    begin: string;
    continue: string;
    startTour: string;
    finish: string;
    doItForMe: string;
    yourTurn: string;
    optional: string;
    wellDone: string;
    stepOf: string;
    keyboard: string;
    chapters: string[];
    minutes: string;
  };
  language: { title: string; subtitle: string; hint: string; defaultBadge: string; options: Record<StudioLocale, { name: string; native: string }> };
  welcome: { eyebrow: string; title: string; body: string[]; learnTitle: string; learn: string[] };
  how: {
    eyebrow: string;
    title: string;
    intro: string;
    nodes: { key: string; title: string; text: string; example: string }[];
    play: string;
    pause: string;
    footnote: string;
  };
  anatomy: { eyebrow: string; title: string; intro: string; exampleLabel: string; parts: { key: string; title: string; text: string; example: string }[] };
  tools: { eyebrow: string; title: string; intro: string; exampleLabel: string; items: Record<string, { text: string; call: string; result: string }> };
  trust: { eyebrow: string; title: string; intro: string; rules: { title: string; text: string }[]; note: string };
  ready: { eyebrow: string; title: string; body: string[]; checklistTitle: string; checklist: string[] };
  tour: Record<TourStepId, TourText>;
  complete: { title: string; body: string; tipsTitle: string; tips: string[] };
};

const EN: OnboardingCopy = {
  ui: {
    skipIntro: "Skip introduction",
    skipTour: "Skip tour",
    back: "Back",
    next: "Next",
    begin: "Begin",
    continue: "Continue",
    startTour: "Start hands-on tour",
    finish: "Finish",
    doItForMe: "Do it for me",
    yourTurn: "Your turn",
    optional: "Optional",
    wellDone: "Well done — continuing…",
    stepOf: "Step {n} of {total}",
    keyboard: "← → to navigate · Esc to leave",
    chapters: ["Language", "Welcome", "How it works", "Building blocks", "The ten tools", "Trust & safety", "Hands-on"],
    minutes: "About 8 minutes",
  },
  language: {
    title: "Choose your language",
    subtitle: "Wählen Sie Ihre Sprache",
    hint: "The introduction, the tour and the entire Agent Studio will use this language. You can change it later at the bottom of the agent list.",
    defaultBadge: "Default",
    options: {
      en: { name: "English", native: "Continue in English" },
      de: { name: "Deutsch", native: "Auf Deutsch fortfahren" },
    },
  },
  welcome: {
    eyebrow: "Guided introduction",
    title: "Welcome to Agent Studio",
    body: [
      "Agent Studio lets you build your own AI analysts. An agent is a reusable assistant with a fixed job description: it follows a procedure you define, uses real tools to read the data in this workspace, and answers with evidence you can verify.",
      "First you will learn the concepts. Then we walk through the real screens together, one control at a time. Nothing you do during the tour changes your data — every tool an agent can use is read-only.",
    ],
    learnTitle: "What you will learn",
    learn: [
      "How an agent works, from your question to its answer",
      "The eight building blocks every agent is made of",
      "The ten tools agents can use, and what each one does",
      "The safety rules every agent follows",
      "Hands-on: create, test and save your first agent",
    ],
  },
  how: {
    eyebrow: "Chapter 1 · Concept",
    title: "How an agent works",
    intro: "Every run follows the same five-stage loop. Watch it play through, or select a stage to read exactly what happens there.",
    nodes: [
      {
        key: "ask",
        title: "You ask",
        text: "You type a question or task in plain language. You can pin executions, clusters or datasets so the agent knows exactly which data you mean before it starts.",
        example: "“Why did Carrying Amount change between the two pinned runs?”",
      },
      {
        key: "plan",
        title: "It plans",
        text: "The agent reads its own instructions — the numbered procedure you wrote or chose — and decides which evidence it needs first. It does not guess; it plans what to collect.",
        example: "Step 1: compare the runs · Step 2: trace the formula · Step 3: check inputs",
      },
      {
        key: "tools",
        title: "It uses tools",
        text: "It calls real tools: it reads rows, compares two executions, traces how a column is calculated in the code, or searches release notes. Independent calls run in the same step, and every call is shown to you live.",
        example: "compare_executions → trace_lineage → query_data → search_release_notes",
      },
      {
        key: "verify",
        title: "It checks the evidence",
        text: "Every result comes back to the agent as data. It recalculates differences with the calculator, cross-checks fields between runs and repeats a step when something does not add up. If evidence is missing, it says so.",
        example: "20,200 − 1,000 = 19,200 ✓  matches Carrying Amount in run B",
      },
      {
        key: "answer",
        title: "It answers",
        text: "It writes a structured answer: a summary, tables with exact values, the positions, columns, code lines and Jira IDs it relied on, and what is still uncertain. Saved agents keep the conversation for follow-up questions.",
        example: "Darlehen_1 · Carrying Amount 20,000 → 19,200 (B − A = −800) · Jira 113873",
      },
    ],
    play: "Play",
    pause: "Pause",
    footnote: "A run is limited to a configurable number of tool rounds, so an agent always finishes with an answer.",
  },
  anatomy: {
    eyebrow: "Chapter 2 · Building blocks",
    title: "What an agent is made of",
    intro: "An agent is a specification with eight parts. You can start from a template, let the designer write it from your description, or write it yourself. Select a part to learn what it does.",
    exampleLabel: "Example",
    parts: [
      {
        key: "identity",
        title: "Identity",
        text: "Name, one-sentence description, icon and colour. They help you and your colleagues recognise the agent in the library. They do not change how the agent behaves.",
        example: "Deviation Investigator\nFinds and explains the drivers behind result deviations between two executions.",
      },
      {
        key: "purpose",
        title: "Purpose",
        text: "One sentence describing the outcome the agent is responsible for. When a question is ambiguous, the purpose keeps the agent focused on its job.",
        example: "Explain material B − A movements between two execution snapshots with verifiable evidence.",
      },
      {
        key: "procedure",
        title: "Procedure",
        text: "The heart of every agent: numbered steps that say which tools to use, in which order, and which evidence to gather. Specific steps produce reliable, repeatable agents; vague steps produce vague answers.",
        example: "1. Compare the two executions with compare_executions.\n2. Trace the changed output with trace_lineage.\n3. Check the source fields with query_data.\n4. Search release notes for the changed fields.",
      },
      {
        key: "tools",
        title: "Tools",
        text: "The capabilities the agent may use. It can only call tools that are switched on, so you decide exactly what it is allowed to look at. Every tool named in the procedure must be switched on.",
        example: "compare_executions · trace_lineage · query_data · search_release_notes · calculator",
      },
      {
        key: "guardrails",
        title: "Guardrails",
        text: "Rules the agent must respect in every answer, for example how it must cite sources or what it must never claim. They come on top of the built-in safety rules.",
        example: "Never claim a release note caused a change based on a name match alone.\nAlways state differences as B − A with exact values.",
      },
      {
        key: "starters",
        title: "Conversation starters",
        text: "Ready-made questions shown when a conversation is empty, so anyone can start with one click and see what the agent is good at.",
        example: "Explain the biggest RWA deviations between the two pinned executions.",
      },
      {
        key: "format",
        title: "Answer format",
        text: "How the final answer should be structured: which sections, which tables and how long. A clear format makes answers easy to compare across runs.",
        example: "Summary paragraph, then a driver table (position, field, A, B, B − A, cause), then next checks.",
      },
      {
        key: "advanced",
        title: "Advanced settings",
        text: "Max tool rounds (1–12) limits how many rounds of tool calls are allowed before the agent must answer. Temperature (0–1) controls wording: low values are precise and repeatable, high values more varied.",
        example: "Max tool rounds: 10\nTemperature: 0.10 (precise)",
      },
    ],
  },
  tools: {
    eyebrow: "Chapter 3 · Tools",
    title: "The ten tools",
    intro: "Tools are how an agent sees your workspace. All of them are read-only: they can read and calculate, but never change, delete or upload anything. Select a tool to see an example call.",
    exampleLabel: "Example call",
    items: {
      workspace_overview: {
        text: "Lists everything that exists: datasets with their tables and columns, code files, clusters with their latest run, and uploaded release-note workbooks. Agents call it first to find the right IDs.",
        call: "workspace_overview()",
        result: "2 datasets, 2 code files, 2 clusters, 1 release-note workbook",
      },
      list_executions: {
        text: "Lists computed runs, optionally for one cluster, with run date, dataset, code version and how many values the code computed.",
        call: "list_executions(cluster: \"test_1\")",
        result: "1 execution found",
      },
      query_data: {
        text: "Reads rows from an input dataset or a computed result. It can filter (for example Asset Class = Corporate, RWA > 1,000), sort, choose columns and page through large tables.",
        call: "query_data(execution B, filters: {Position: \"Darlehen_1\"})",
        result: "1 of 4 rows matched",
      },
      profile_data: {
        text: "Checks data quality column by column: missing values, value ranges, zeros, negatives, outliers, most frequent categories, duplicate rows and possible key columns.",
        call: "profile_data(dataset: \"IReF-Kalkulator_1\")",
        result: "11 columns × 4 rows; 3 columns with missing values",
      },
      aggregate_data: {
        text: "Calculates sums, averages, medians, minimum, maximum and counts, optionally grouped by one or more columns — for example RWA by Asset Class.",
        call: "aggregate_data(sum of RWA, group by Asset Class)",
        result: "5 groups over 1,240 rows",
      },
      compare_executions: {
        text: "Compares two runs row by row, matched on the ID, key or position column. It reports which columns changed, by how much, and the largest differences — always as B − A.",
        call: "compare_executions(A, B)",
        result: "4 positions changed across 4 columns",
      },
      inspect_code: {
        text: "Reads a transformation code file with line numbers and lists which columns it calculates from which inputs.",
        call: "inspect_code(\"code_4_iref_kalkulator_2.py\")",
        result: "28 lines, 2 assigned columns",
      },
      trace_lineage: {
        text: "Follows how one column is calculated: its direct inputs, the full chain back to source fields, which columns depend on it, and the exact code lines that assign it.",
        call: "trace_lineage(column: \"Carrying Amount\")",
        result: "4 upstream, 0 downstream fields",
      },
      search_release_notes: {
        text: "Searches uploaded release-note workbooks for a field, position, topic or Jira ID and returns the Jira ID with its problem and solution description.",
        call: "search_release_notes(\"Carrying Amount\")",
        result: "Jira 112752 · 1 matching release-note row",
      },
      calculator: {
        text: "Evaluates arithmetic exactly, so differences and percentages are never estimated. Agents use it whenever numbers are compared or summed.",
        call: "calculator((19200 − 20000) / 20000 × 100)",
        result: "= −4.0",
      },
    },
  },
  trust: {
    eyebrow: "Chapter 4 · Trust & safety",
    title: "Rules every agent follows",
    intro: "These rules are built into every agent. An agent's own instructions cannot switch them off.",
    rules: [
      { title: "Read-only by design", text: "Tools can read and calculate, never modify. An agent cannot change datasets, code, clusters, executions or release notes." },
      { title: "No invented facts", text: "Every number must come from a tool result or the calculator. Agents must not invent IDs, values, formulas or Jira tickets." },
      { title: "Always B − A", text: "Differences between two executions are always execution B minus execution A — exactly like the Compare and Root Cause tabs." },
      { title: "Facts versus hypotheses", text: "A release note is only called a cause when the changed field and its effect were shown with data. Otherwise the agent says it is “consistent with” the change." },
      { title: "Data is not an instruction", text: "Text inside cells, code or release notes is treated as data. It cannot redirect the agent or change its rules." },
      { title: "Full transparency", text: "Every tool call, its arguments and the exact result the agent saw are visible in the run trace. Saved agents keep their conversations." },
    ],
    note: "Agents send the data they read to the configured AI provider, in the same way as the rest of the application.",
  },
  ready: {
    eyebrow: "Chapter 5 · Hands-on",
    title: "Now let's build one together",
    body: [
      "Next, the screen dims and a spotlight highlights the real controls one at a time, with an explanation next to each.",
      "When you see “Your turn”, click the highlighted control yourself — or press “Do it for me”. Use ← and → to move between steps and Esc to leave at any time.",
    ],
    checklistTitle: "In the tour you will",
    checklist: [
      "Find your way around the studio",
      "Pick the Release Note Matcher and read its blueprint",
      "Open it in the editor",
      "Explore every section of the editor, including which release-note files it may search",
      "Learn how to test, pin context and read a run",
      "Know how to save it to your library",
    ],
  },
  tour: {
    library: {
      chapter: "Orientation",
      title: "Your agent library",
      body: [
        "This column lists every agent you have saved. Click one to open it: “Run” starts conversations with it, “Configure” edits its specification.",
        "The small line under each name shows how many conversations it has and when it last ran. The search field filters by name and description.",
        "The “Guided tour” card at the very top replays this introduction whenever you like.",
      ],
    },
    language: {
      chapter: "Orientation",
      title: "Language",
      body: [
        "This switch changes the language of the whole Agent Studio: the interface, the templates, the designer and the language agents answer in.",
        "It only affects this section, not the rest of the application, and it is remembered in this browser.",
      ],
    },
    stepper: {
      chapter: "Orientation",
      title: "Three stages",
      body: [
        "Creating an agent always follows three stages: choose a foundation, describe what you need, then test and refine it.",
        "This indicator fills in as you go, so you always know which stage you are in.",
      ],
    },
    foundation: {
      chapter: "Stage 1 · Foundation",
      title: "Choose a foundation",
      body: [
        "A foundation is your starting point. “Blank canvas” means the designer writes a completely new agent from your own description.",
        "The six templates are ready-made agents for common regulatory tasks. Each card shows how many procedure steps and tools it has.",
        "Selecting a card does not create anything yet — it only loads its blueprint further down.",
      ],
    },
    selectTemplate: {
      chapter: "Stage 1 · Foundation",
      title: "Select a template",
      body: [
        "We will use the Release Note Matcher. It checks which changes between two runs are documented in your uploaded release notes — Excel workbooks or PDFs — and flags the changes no release announced.",
      ],
      action: "Click the highlighted Release Note Matcher card.",
    },
    blueprint: {
      chapter: "Stage 2 · Brief",
      title: "Read the blueprint",
      body: [
        "The blueprint previews exactly what the template contains: its purpose, its numbered procedure and the tools it is allowed to use.",
        "The Release Note Matcher works in four steps: find what changed with compare_executions, search the release notes for every changed field with search_release_notes, grade each candidate as supporting, partially supporting or unrelated, and list the unexpected changes.",
      ],
    },
    brief: {
      chapter: "Stage 2 · Brief",
      title: "Describe or tailor",
      body: [
        "With a template selected you have two options. “Use as-is” opens the template unchanged.",
        "“Tailor with AI” rewrites the template around what you type here — for example “Only grade changes to Carrying Amount and answer in German”. The suggestions under the box are ready-made tailoring ideas.",
        "With Blank canvas selected, this same box is where you describe a completely new agent.",
      ],
    },
    useAsIs: {
      chapter: "Stage 2 · Brief",
      title: "Open the template",
      body: [
        "Nothing is saved yet: the template opens as a draft in the editor, where you can inspect and change every part of it.",
      ],
      action: "Click “Use as-is”.",
    },
    header: {
      chapter: "Stage 3 · Test & refine",
      title: "Your draft",
      body: [
        "The header shows the agent's name and description — here, the Release Note Matcher. The “Draft” badge means it is not saved yet — it only exists in this browser tab until you press “Save agent”.",
        "Once saved, this area also shows the “Run” and “Configure” tabs and buttons to duplicate or delete the agent.",
      ],
    },
    editor: {
      chapter: "Stage 3 · Test & refine",
      title: "The editor",
      body: [
        "The left half is the agent's complete specification, section by section: identity, refine with AI, instructions, tools, release-note sources, starters, guardrails, answer format and advanced settings.",
        "Every change you make here is used immediately by the test bench on the right — even before you save.",
      ],
    },
    refine: {
      chapter: "Stage 3 · Test & refine",
      title: "Refine with AI",
      body: [
        "Describe a change in your own words, for example “Mark changes above 5% without a release note as high priority”, and press Apply. The designer rewrites the specification and keeps everything that still fits — including your release-note file selection.",
        "If you do not like the result, “Undo” restores the previous version.",
      ],
    },
    procedure: {
      chapter: "Stage 3 · Test & refine",
      title: "Purpose and procedure",
      body: [
        "Purpose is one sentence describing the agent's job. Below it, each numbered card is one step of the procedure the agent follows. In the Release Note Matcher, step 2 is where it calls search_release_notes once per changed field, and again with the position context.",
        "Press Enter inside a step to split it into a new step, Shift+Enter for a line break, and Backspace in an empty step to delete it. Hover a step to move it up or down.",
        "The “Insert tool” chips put a tool's exact name at your cursor, so a step always refers to a tool the agent can call. “Plain text” lets you edit all steps as one text.",
      ],
    },
    tools: {
      chapter: "Stage 3 · Test & refine",
      title: "Tools",
      body: [
        "Each card is one tool. Cards with a coloured border and a check are switched on; faded cards are off. Click a card to switch it.",
        "The agent can only use tools that are switched on. Fewer tools make a more focused agent — but every tool named in the procedure must be on.",
        "The Release Note Matcher uses five: workspace_overview and list_executions to find the runs, compare_executions to see what changed, search_release_notes to find the documentation, and query_data to check values on individual rows.",
      ],
    },
    sources: {
      chapter: "Stage 3 · Test & refine",
      title: "Release-note sources",
      body: [
        "Because search_release_notes is switched on, this section appears. It decides which uploaded release notes — Excel workbooks or PDFs from the Release notes tab — the agent may search.",
        "All files are ticked by default, so the agent searches every file — including ones uploaded later. Untick the files it should ignore, for example to keep only the notes of the release you are checking, and it can no longer read them: the search tool enforces the limit, the agent cannot widen it. “Use all files” ticks everything again.",
        "During a conversation you can still narrow a single question further, e.g. “only check the R7.18 PDF”. If a selected file is later deleted, it is flagged here in red.",
      ],
    },
    saveBar: {
      chapter: "Stage 3 · Test & refine",
      title: "Saving",
      body: [
        "This bar shows the save state. A draft must be saved before it appears in your library and before it keeps conversation history. The release-note file selection is saved with the agent.",
        "For saved agents, “Discard” restores the last saved version and “Save changes” stores your edits.",
      ],
    },
    testBench: {
      chapter: "Stage 3 · Test & refine",
      title: "The test bench",
      body: [
        "The right half is a live test environment. It runs exactly the configuration on the left — unsaved edits included — against your real data.",
        "Test conversations are not saved, so you can experiment freely. “Reset” starts over.",
      ],
    },
    pinContext: {
      chapter: "Stage 3 · Test & refine",
      title: "Pin context",
      body: [
        "“Pin context” tells the agent exactly which data you mean before it starts. You can pin executions, clusters and datasets.",
        "The Release Note Matcher compares two runs, so pin the base execution first — it becomes A — and the compared execution second — it becomes B. Differences are always B − A.",
        "If you chose base and comparison clusters on the Cluster tab, one click pins their latest runs.",
      ],
    },
    composer: {
      chapter: "Stage 3 · Test & refine",
      title: "Ask your first question",
      body: [
        "Type a question and press Enter, or click one of the starter questions above — for example “Which of the changes between the pinned executions are documented in release notes?”. Shift+Enter adds a new line.",
        "While the agent works, the square button stops it. The run uses your real data and the AI provider, so it can take a few seconds.",
      ],
      action: "Try it now if you like — or press Next to continue.",
    },
    trace: {
      chapter: "Stage 3 · Test & refine",
      title: "Reading a run",
      body: [
        "Above each answer, “Worked for … · N tool calls” summarises the run. Click it to open the trace.",
        "Each row is one tool call: the tool, a short result, the arguments it used and how long it took. Click a row to see the exact data that was returned to the agent.",
        "For the Release Note Matcher, open the search_release_notes rows: they list which files were searched and the matching Jira IDs with their solution descriptions, so you can check every grade in the answer.",
        "Under a finished answer you can copy it or download it as a Markdown file. When you are happy with the agent, press “Save agent” on the left.",
      ],
    },
  },
  complete: {
    title: "You're ready",
    body: "You now know how agents work, what they are made of, which tools they use, the rules they follow and how to build, test and save one.",
    tipsTitle: "Good to know",
    tips: [
      "Specific, numbered steps produce the most reliable agents.",
      "Pin two executions — base first — for any comparison question.",
      "Use “Release-note sources” to keep an agent on the release notes that matter.",
      "Open the run trace whenever you want to verify a number.",
      "Replay this tour any time with the “Guided tour” card at the top of the agent list.",
    ],
  },
};

const DE: OnboardingCopy = {
  ui: {
    skipIntro: "Einführung überspringen",
    skipTour: "Tour beenden",
    back: "Zurück",
    next: "Weiter",
    begin: "Los geht's",
    continue: "Weiter",
    startTour: "Praxis-Tour starten",
    finish: "Abschließen",
    doItForMe: "Für mich erledigen",
    yourTurn: "Sie sind dran",
    optional: "Optional",
    wellDone: "Sehr gut — es geht weiter…",
    stepOf: "Schritt {n} von {total}",
    keyboard: "← → zum Navigieren · Esc zum Verlassen",
    chapters: ["Sprache", "Willkommen", "Funktionsweise", "Bausteine", "Die zehn Tools", "Vertrauen & Sicherheit", "Praxis"],
    minutes: "Etwa 8 Minuten",
  },
  language: {
    title: "Wählen Sie Ihre Sprache",
    subtitle: "Choose your language",
    hint: "Die Einführung, die Tour und das gesamte Agent Studio verwenden diese Sprache. Sie können sie später unten in der Agentenliste ändern.",
    defaultBadge: "Standard",
    options: {
      en: { name: "English", native: "Continue in English" },
      de: { name: "Deutsch", native: "Auf Deutsch fortfahren" },
    },
  },
  welcome: {
    eyebrow: "Geführte Einführung",
    title: "Willkommen im Agent Studio",
    body: [
      "Im Agent Studio entwickeln Sie Ihre eigenen KI-Analysten. Ein Agent ist ein wiederverwendbarer Assistent mit einer festen Aufgabenbeschreibung: Er folgt einem von Ihnen festgelegten Ablauf, nutzt echte Tools, um die Daten in diesem Arbeitsbereich zu lesen, und antwortet mit Nachweisen, die Sie überprüfen können.",
      "Zuerst lernen Sie die Konzepte kennen. Danach gehen wir gemeinsam Element für Element durch die echten Bildschirme. Während der Tour verändert nichts Ihre Daten — alle Tools, die ein Agent nutzen kann, sind schreibgeschützt.",
    ],
    learnTitle: "Das lernen Sie",
    learn: [
      "Wie ein Agent arbeitet — von Ihrer Frage bis zu seiner Antwort",
      "Die acht Bausteine, aus denen jeder Agent besteht",
      "Die zehn Tools, die Agenten nutzen können, und was jedes davon tut",
      "Die Sicherheitsregeln, die jeder Agent einhält",
      "Praxis: Ihren ersten Agenten erstellen, testen und speichern",
    ],
  },
  how: {
    eyebrow: "Kapitel 1 · Konzept",
    title: "So arbeitet ein Agent",
    intro: "Jede Ausführung folgt demselben Kreislauf aus fünf Stufen. Sehen Sie ihn durchlaufen oder wählen Sie eine Stufe, um genau zu lesen, was dort passiert.",
    nodes: [
      {
        key: "ask",
        title: "Sie fragen",
        text: "Sie geben eine Frage oder Aufgabe in normaler Sprache ein. Sie können Ausführungen, Cluster oder Datensätze fixieren, damit der Agent vor dem Start genau weiß, welche Daten gemeint sind.",
        example: "„Warum hat sich der Carrying Amount zwischen den beiden fixierten Läufen verändert?“",
      },
      {
        key: "plan",
        title: "Er plant",
        text: "Der Agent liest seine eigenen Anweisungen — den nummerierten Ablauf, den Sie geschrieben oder gewählt haben — und entscheidet, welche Nachweise er zuerst braucht. Er rät nicht, er plant, was er sammeln muss.",
        example: "Schritt 1: Läufe vergleichen · Schritt 2: Formel verfolgen · Schritt 3: Eingaben prüfen",
      },
      {
        key: "tools",
        title: "Er nutzt Tools",
        text: "Er ruft echte Tools auf: Er liest Zeilen, vergleicht zwei Ausführungen, verfolgt, wie eine Spalte im Code berechnet wird, oder durchsucht Release Notes. Unabhängige Aufrufe laufen im selben Schritt, und jeder Aufruf wird Ihnen live angezeigt.",
        example: "compare_executions → trace_lineage → query_data → search_release_notes",
      },
      {
        key: "verify",
        title: "Er prüft die Nachweise",
        text: "Jedes Ergebnis kommt als Daten zum Agenten zurück. Er rechnet Differenzen mit dem Rechner nach, gleicht Felder zwischen Läufen ab und wiederholt einen Schritt, wenn etwas nicht aufgeht. Fehlen Nachweise, sagt er das.",
        example: "20.200 − 1.000 = 19.200 ✓  passt zum Carrying Amount in Lauf B",
      },
      {
        key: "answer",
        title: "Er antwortet",
        text: "Er schreibt eine strukturierte Antwort: eine Zusammenfassung, Tabellen mit exakten Werten, die Positionen, Spalten, Codezeilen und Jira-IDs, auf die er sich stützt, und was noch unsicher ist. Gespeicherte Agenten behalten die Unterhaltung für Rückfragen.",
        example: "Darlehen_1 · Carrying Amount 20.000 → 19.200 (B − A = −800) · Jira 113873",
      },
    ],
    play: "Abspielen",
    pause: "Pause",
    footnote: "Eine Ausführung ist auf eine einstellbare Anzahl von Tool-Runden begrenzt, sodass ein Agent immer mit einer Antwort endet.",
  },
  anatomy: {
    eyebrow: "Kapitel 2 · Bausteine",
    title: "Woraus ein Agent besteht",
    intro: "Ein Agent ist eine Spezifikation aus acht Teilen. Sie können mit einer Vorlage starten, den Designer aus Ihrer Beschreibung schreiben lassen oder ihn selbst verfassen. Wählen Sie einen Teil, um zu erfahren, was er bewirkt.",
    exampleLabel: "Beispiel",
    parts: [
      {
        key: "identity",
        title: "Identität",
        text: "Name, Kurzbeschreibung in einem Satz, Symbol und Farbe. Sie helfen Ihnen und Ihren Kolleginnen und Kollegen, den Agenten in der Bibliothek wiederzuerkennen. Auf sein Verhalten haben sie keinen Einfluss.",
        example: "Abweichungsanalyst\nErmittelt und erklärt die Treiber von Ergebnisabweichungen zwischen zwei Ausführungen.",
      },
      {
        key: "purpose",
        title: "Zweck",
        text: "Ein Satz, der das Ergebnis beschreibt, für das der Agent verantwortlich ist. Bei mehrdeutigen Fragen hält der Zweck den Agenten bei seiner Aufgabe.",
        example: "Wesentliche B − A Veränderungen zwischen zwei Ausführungs-Snapshots mit überprüfbaren Nachweisen erklären.",
      },
      {
        key: "procedure",
        title: "Ablauf",
        text: "Das Herzstück jedes Agenten: nummerierte Schritte, die festlegen, welche Tools in welcher Reihenfolge genutzt und welche Nachweise gesammelt werden. Konkrete Schritte ergeben zuverlässige, wiederholbare Agenten; vage Schritte ergeben vage Antworten.",
        example: "1. Die beiden Ausführungen mit compare_executions vergleichen.\n2. Den geänderten Output mit trace_lineage verfolgen.\n3. Die Quellfelder mit query_data prüfen.\n4. Release Notes nach den geänderten Feldern durchsuchen.",
      },
      {
        key: "tools",
        title: "Tools",
        text: "Die Fähigkeiten, die der Agent nutzen darf. Er kann nur eingeschaltete Tools aufrufen — Sie entscheiden also genau, was er einsehen darf. Jedes im Ablauf genannte Tool muss eingeschaltet sein.",
        example: "compare_executions · trace_lineage · query_data · search_release_notes · calculator",
      },
      {
        key: "guardrails",
        title: "Leitplanken",
        text: "Regeln, die der Agent in jeder Antwort einhalten muss, zum Beispiel wie er Quellen zitiert oder was er niemals behaupten darf. Sie gelten zusätzlich zu den eingebauten Sicherheitsregeln.",
        example: "Niemals behaupten, eine Release Note habe eine Veränderung verursacht, nur weil Namen übereinstimmen.\nDifferenzen immer als B − A mit exakten Werten angeben.",
      },
      {
        key: "starters",
        title: "Gesprächseinstiege",
        text: "Vorgefertigte Fragen, die bei einer leeren Unterhaltung angezeigt werden. So kann jeder mit einem Klick starten und sieht, wofür der Agent gemacht ist.",
        example: "Erkläre die größten RWA-Abweichungen zwischen den beiden fixierten Ausführungen.",
      },
      {
        key: "format",
        title: "Antwortformat",
        text: "Wie die Antwort aufgebaut sein soll: welche Abschnitte, welche Tabellen und wie lang. Ein klares Format macht Antworten über mehrere Läufe hinweg vergleichbar.",
        example: "Zusammenfassung, dann Treibertabelle (Position, Feld, A, B, B − A, Ursache), dann nächste Prüfschritte.",
      },
      {
        key: "advanced",
        title: "Erweiterte Einstellungen",
        text: "Max. Tool-Runden (1–12) begrenzt, wie viele Runden von Tool-Aufrufen erlaubt sind, bevor der Agent antworten muss. Die Temperatur (0–1) steuert die Formulierung: niedrige Werte sind präzise und wiederholbar, hohe Werte abwechslungsreicher.",
        example: "Max. Tool-Runden: 10\nTemperatur: 0,10 (präzise)",
      },
    ],
  },
  tools: {
    eyebrow: "Kapitel 3 · Tools",
    title: "Die zehn Tools",
    intro: "Über Tools sieht ein Agent Ihren Arbeitsbereich. Alle sind schreibgeschützt: Sie können lesen und rechnen, aber niemals etwas ändern, löschen oder hochladen. Wählen Sie ein Tool, um einen Beispielaufruf zu sehen.",
    exampleLabel: "Beispielaufruf",
    items: {
      workspace_overview: {
        text: "Listet alles auf, was existiert: Datensätze mit Tabellen und Spalten, Codedateien, Cluster mit ihrem letzten Lauf und hochgeladene Release-Note-Arbeitsmappen. Agenten rufen es zuerst auf, um die richtigen IDs zu finden.",
        call: "workspace_overview()",
        result: "2 Datensätze, 2 Codedateien, 2 Cluster, 1 Release-Note-Arbeitsmappe",
      },
      list_executions: {
        text: "Listet berechnete Läufe auf, optional für einen Cluster, mit Laufdatum, Datensatz, Codeversion und der Anzahl der vom Code berechneten Werte.",
        call: "list_executions(cluster: \"test_1\")",
        result: "1 Ausführung gefunden",
      },
      query_data: {
        text: "Liest Zeilen aus einem Eingabedatensatz oder einem berechneten Ergebnis. Es kann filtern (zum Beispiel Asset Class = Corporate, RWA > 1.000), sortieren, Spalten auswählen und durch große Tabellen blättern.",
        call: "query_data(Ausführung B, filters: {Position: \"Darlehen_1\"})",
        result: "1 von 4 Zeilen gefunden",
      },
      profile_data: {
        text: "Prüft die Datenqualität Spalte für Spalte: fehlende Werte, Wertebereiche, Nullen, negative Werte, Ausreißer, häufigste Kategorien, doppelte Zeilen und mögliche Schlüsselspalten.",
        call: "profile_data(Datensatz: \"IReF-Kalkulator_1\")",
        result: "11 Spalten × 4 Zeilen; 3 Spalten mit fehlenden Werten",
      },
      aggregate_data: {
        text: "Berechnet Summen, Mittelwerte, Mediane, Minimum, Maximum und Anzahlen, optional gruppiert nach einer oder mehreren Spalten — zum Beispiel RWA nach Asset Class.",
        call: "aggregate_data(Summe RWA, gruppiert nach Asset Class)",
        result: "5 Gruppen über 1.240 Zeilen",
      },
      compare_executions: {
        text: "Vergleicht zwei Läufe Zeile für Zeile, abgeglichen über die ID-, Key- oder Positionsspalte. Es meldet, welche Spalten sich um wie viel geändert haben, und die größten Differenzen — immer als B − A.",
        call: "compare_executions(A, B)",
        result: "4 Positionen in 4 Spalten verändert",
      },
      inspect_code: {
        text: "Liest eine Transformations-Codedatei mit Zeilennummern und listet auf, welche Spalten sie aus welchen Eingaben berechnet.",
        call: "inspect_code(\"code_4_iref_kalkulator_2.py\")",
        result: "28 Zeilen, 2 zugewiesene Spalten",
      },
      trace_lineage: {
        text: "Verfolgt, wie eine Spalte berechnet wird: ihre direkten Eingaben, die vollständige Kette bis zu den Quellfeldern, welche Spalten von ihr abhängen und die genauen Codezeilen der Zuweisung.",
        call: "trace_lineage(Spalte: \"Carrying Amount\")",
        result: "4 vorgelagerte, 0 nachgelagerte Felder",
      },
      search_release_notes: {
        text: "Durchsucht hochgeladene Release-Note-Arbeitsmappen nach Feld, Position, Thema oder Jira-ID und liefert die Jira-ID mit Problem- und Lösungsbeschreibung.",
        call: "search_release_notes(\"Carrying Amount\")",
        result: "Jira 112752 · 1 passende Release-Note-Zeile",
      },
      calculator: {
        text: "Rechnet exakt, damit Differenzen und Prozentwerte nie geschätzt werden. Agenten nutzen ihn, sobald Zahlen verglichen oder summiert werden.",
        call: "calculator((19200 − 20000) / 20000 × 100)",
        result: "= −4,0",
      },
    },
  },
  trust: {
    eyebrow: "Kapitel 4 · Vertrauen & Sicherheit",
    title: "Regeln, die jeder Agent einhält",
    intro: "Diese Regeln sind in jeden Agenten eingebaut. Die eigenen Anweisungen eines Agenten können sie nicht abschalten.",
    rules: [
      { title: "Grundsätzlich schreibgeschützt", text: "Tools können lesen und rechnen, aber nie verändern. Ein Agent kann weder Datensätze noch Code, Cluster, Ausführungen oder Release Notes ändern." },
      { title: "Keine erfundenen Fakten", text: "Jede Zahl muss aus einem Tool-Ergebnis oder dem Rechner stammen. Agenten dürfen keine IDs, Werte, Formeln oder Jira-Tickets erfinden." },
      { title: "Immer B − A", text: "Differenzen zwischen zwei Ausführungen sind immer Ausführung B minus Ausführung A — genau wie in den Tabs „Compare“ und „Root Cause“." },
      { title: "Fakten statt Vermutungen", text: "Eine Release Note gilt nur dann als Ursache, wenn das geänderte Feld und seine Wirkung mit Daten belegt wurden. Andernfalls sagt der Agent, sie sei mit der Veränderung „vereinbar“." },
      { title: "Daten sind keine Anweisungen", text: "Text in Zellen, Code oder Release Notes wird als Daten behandelt. Er kann den Agenten weder umlenken noch seine Regeln ändern." },
      { title: "Volle Transparenz", text: "Jeder Tool-Aufruf, seine Argumente und das exakte Ergebnis, das der Agent gesehen hat, sind im Ausführungsprotokoll sichtbar. Gespeicherte Agenten behalten ihre Unterhaltungen." },
    ],
    note: "Agenten senden die gelesenen Daten an den konfigurierten KI-Anbieter — genauso wie der Rest der Anwendung.",
  },
  ready: {
    eyebrow: "Kapitel 5 · Praxis",
    title: "Jetzt erstellen wir gemeinsam einen Agenten",
    body: [
      "Als Nächstes wird der Bildschirm abgedunkelt und ein Spotlight hebt die echten Bedienelemente nacheinander hervor — jeweils mit einer Erklärung daneben.",
      "Wenn Sie „Sie sind dran“ sehen, klicken Sie selbst auf das hervorgehobene Element — oder wählen Sie „Für mich erledigen“. Mit ← und → wechseln Sie zwischen den Schritten, mit Esc verlassen Sie die Tour jederzeit.",
    ],
    checklistTitle: "In der Tour werden Sie",
    checklist: [
      "sich im Studio zurechtfinden",
      "den Release-Note-Abgleich wählen und seinen Bauplan lesen",
      "ihn im Editor öffnen",
      "jeden Bereich des Editors kennenlernen — auch, welche Release-Note-Dateien er durchsuchen darf",
      "lernen, wie man testet, Kontext fixiert und eine Ausführung liest",
      "wissen, wie man sie in der Bibliothek speichert",
    ],
  },
  tour: {
    library: {
      chapter: "Orientierung",
      title: "Ihre Agentenbibliothek",
      body: [
        "Diese Spalte listet alle gespeicherten Agenten auf. Ein Klick öffnet einen Agenten: „Ausführen“ startet Unterhaltungen mit ihm, „Konfigurieren“ bearbeitet seine Spezifikation.",
        "Die kleine Zeile unter jedem Namen zeigt, wie viele Unterhaltungen er hat und wann er zuletzt lief. Das Suchfeld filtert nach Name und Beschreibung.",
        "Die Karte „Einführung“ ganz oben startet diese Tour jederzeit erneut.",
      ],
    },
    language: {
      chapter: "Orientierung",
      title: "Sprache",
      body: [
        "Dieser Schalter ändert die Sprache des gesamten Agent Studios: die Oberfläche, die Vorlagen, den Designer und die Sprache, in der Agenten antworten.",
        "Er wirkt nur in diesem Bereich, nicht im Rest der Anwendung, und wird in diesem Browser gespeichert.",
      ],
    },
    stepper: {
      chapter: "Orientierung",
      title: "Drei Stufen",
      body: [
        "Das Erstellen eines Agenten folgt immer drei Stufen: Grundlage wählen, beschreiben, was Sie brauchen, dann testen und verfeinern.",
        "Diese Anzeige füllt sich im Verlauf, sodass Sie immer wissen, in welcher Stufe Sie sich befinden.",
      ],
    },
    foundation: {
      chapter: "Stufe 1 · Grundlage",
      title: "Grundlage wählen",
      body: [
        "Die Grundlage ist Ihr Ausgangspunkt. „Leere Arbeitsfläche“ bedeutet, dass der Designer einen völlig neuen Agenten aus Ihrer eigenen Beschreibung schreibt.",
        "Die sechs Vorlagen sind fertige Agenten für typische regulatorische Aufgaben. Jede Karte zeigt, wie viele Ablaufschritte und Tools sie hat.",
        "Eine Karte auszuwählen, erstellt noch nichts — es lädt nur ihren Bauplan weiter unten.",
      ],
    },
    selectTemplate: {
      chapter: "Stufe 1 · Grundlage",
      title: "Eine Vorlage auswählen",
      body: [
        "Wir verwenden den Release-Note-Abgleich. Er prüft, welche Veränderungen zwischen zwei Läufen in Ihren hochgeladenen Release Notes — Excel-Arbeitsmappen oder PDFs — dokumentiert sind, und markiert die Veränderungen, die kein Release angekündigt hat.",
      ],
      action: "Klicken Sie auf die hervorgehobene Karte „Release-Note-Abgleich“.",
    },
    blueprint: {
      chapter: "Stufe 2 · Beschreibung",
      title: "Den Bauplan lesen",
      body: [
        "Der Bauplan zeigt genau, was die Vorlage enthält: ihren Zweck, ihren nummerierten Ablauf und die Tools, die sie nutzen darf.",
        "Der Release-Note-Abgleich arbeitet in vier Schritten: mit compare_executions ermitteln, was sich geändert hat, mit search_release_notes für jedes geänderte Feld die Release Notes durchsuchen, jeden Kandidaten als unterstützt, teilweise unterstützt oder ohne Bezug bewerten und die unerwarteten Veränderungen auflisten.",
      ],
    },
    brief: {
      chapter: "Stufe 2 · Beschreibung",
      title: "Beschreiben oder anpassen",
      body: [
        "Mit einer ausgewählten Vorlage haben Sie zwei Möglichkeiten. „Unverändert verwenden“ öffnet die Vorlage so, wie sie ist.",
        "„Mit KI anpassen“ schreibt die Vorlage anhand Ihrer Eingabe um — zum Beispiel „Nur Veränderungen am Carrying Amount bewerten“. Die Vorschläge unter dem Feld sind fertige Anpassungsideen.",
        "Ist die leere Arbeitsfläche gewählt, beschreiben Sie in genau diesem Feld einen völlig neuen Agenten.",
      ],
    },
    useAsIs: {
      chapter: "Stufe 2 · Beschreibung",
      title: "Die Vorlage öffnen",
      body: [
        "Noch wird nichts gespeichert: Die Vorlage öffnet sich als Entwurf im Editor, wo Sie jeden Teil prüfen und ändern können.",
      ],
      action: "Klicken Sie auf „Unverändert verwenden“.",
    },
    header: {
      chapter: "Stufe 3 · Testen & verfeinern",
      title: "Ihr Entwurf",
      body: [
        "Die Kopfzeile zeigt Name und Beschreibung des Agenten — hier den Release-Note-Abgleich. Das Abzeichen „Entwurf“ bedeutet, dass er noch nicht gespeichert ist — er existiert nur in diesem Browser-Tab, bis Sie „Agent speichern“ wählen.",
        "Nach dem Speichern zeigt dieser Bereich auch die Tabs „Ausführen“ und „Konfigurieren“ sowie Schaltflächen zum Duplizieren und Löschen.",
      ],
    },
    editor: {
      chapter: "Stufe 3 · Testen & verfeinern",
      title: "Der Editor",
      body: [
        "Die linke Hälfte ist die vollständige Spezifikation des Agenten, Abschnitt für Abschnitt: Identität, Überarbeitung mit KI, Anweisungen, Tools, Release-Note-Quellen, Gesprächseinstiege, Leitplanken, Antwortformat und erweiterte Einstellungen.",
        "Jede Änderung hier wird sofort von der Testumgebung rechts verwendet — auch vor dem Speichern.",
      ],
    },
    refine: {
      chapter: "Stufe 3 · Testen & verfeinern",
      title: "Mit KI überarbeiten",
      body: [
        "Beschreiben Sie eine Änderung in eigenen Worten, zum Beispiel „Veränderungen über 5 % ohne Release Note als hohe Priorität markieren“, und wählen Sie „Anwenden“. Der Designer schreibt die Spezifikation um und behält alles bei, was weiterhin passt — auch Ihre Auswahl der Release-Note-Dateien.",
        "Gefällt Ihnen das Ergebnis nicht, stellt „Rückgängig“ die vorherige Version wieder her.",
      ],
    },
    procedure: {
      chapter: "Stufe 3 · Testen & verfeinern",
      title: "Zweck und Ablauf",
      body: [
        "Der Zweck ist ein Satz, der die Aufgabe des Agenten beschreibt. Darunter ist jede nummerierte Karte ein Schritt des Ablaufs, dem der Agent folgt. Beim Release-Note-Abgleich ruft er in Schritt 2 search_release_notes für jedes geänderte Feld auf und anschließend mit dem Positionskontext.",
        "Enter in einem Schritt teilt ihn in einen neuen Schritt, Umschalt+Enter fügt einen Zeilenumbruch ein, und die Rücktaste in einem leeren Schritt löscht ihn. Fahren Sie über einen Schritt, um ihn nach oben oder unten zu verschieben.",
        "Die Chips unter „Tool einfügen“ setzen den exakten Tool-Namen an Ihre Cursorposition, sodass sich ein Schritt immer auf ein aufrufbares Tool bezieht. „Freitext“ bearbeitet alle Schritte als einen Text.",
      ],
    },
    tools: {
      chapter: "Stufe 3 · Testen & verfeinern",
      title: "Tools",
      body: [
        "Jede Karte ist ein Tool. Karten mit farbigem Rand und Haken sind eingeschaltet, blasse Karten sind aus. Ein Klick schaltet um.",
        "Der Agent kann nur eingeschaltete Tools nutzen. Weniger Tools ergeben einen fokussierteren Agenten — aber jedes im Ablauf genannte Tool muss eingeschaltet sein.",
        "Der Release-Note-Abgleich nutzt fünf: workspace_overview und list_executions, um die Läufe zu finden, compare_executions, um Veränderungen zu sehen, search_release_notes, um die Dokumentation zu finden, und query_data, um Werte einzelner Zeilen zu prüfen.",
      ],
    },
    sources: {
      chapter: "Stufe 3 · Testen & verfeinern",
      title: "Release-Note-Quellen",
      body: [
        "Weil search_release_notes eingeschaltet ist, erscheint dieser Abschnitt. Er legt fest, welche hochgeladenen Release Notes — Excel-Arbeitsmappen oder PDFs aus dem Tab „Release Notes“ — der Agent durchsuchen darf.",
        "Standardmäßig sind alle Dateien angehakt, der Agent durchsucht also jede Datei — auch später hochgeladene. Entfernen Sie die Haken bei Dateien, die er ignorieren soll, zum Beispiel um nur die Release Notes des geprüften Releases zu behalten, kann er sie nicht mehr lesen: Das Suchtool setzt die Grenze durch, der Agent kann sie nicht erweitern. „Alle Dateien verwenden“ hakt wieder alles an.",
        "In einer Unterhaltung können Sie eine einzelne Frage weiter eingrenzen, z. B. „nur die PDF zu R7.18 prüfen“. Wird eine ausgewählte Datei später gelöscht, wird sie hier rot markiert.",
      ],
    },
    saveBar: {
      chapter: "Stufe 3 · Testen & verfeinern",
      title: "Speichern",
      body: [
        "Diese Leiste zeigt den Speicherstatus. Ein Entwurf muss gespeichert werden, bevor er in Ihrer Bibliothek erscheint und einen Unterhaltungsverlauf behält. Die Auswahl der Release-Note-Dateien wird mit dem Agenten gespeichert.",
        "Bei gespeicherten Agenten stellt „Verwerfen“ die zuletzt gespeicherte Version wieder her, und „Änderungen speichern“ übernimmt Ihre Bearbeitungen.",
      ],
    },
    testBench: {
      chapter: "Stufe 3 · Testen & verfeinern",
      title: "Die Testumgebung",
      body: [
        "Die rechte Hälfte ist eine Live-Testumgebung. Sie führt genau die Konfiguration links aus — inklusive nicht gespeicherter Änderungen — mit Ihren echten Daten.",
        "Testunterhaltungen werden nicht gespeichert, Sie können also frei experimentieren. „Zurücksetzen“ beginnt von vorn.",
      ],
    },
    pinContext: {
      chapter: "Stufe 3 · Testen & verfeinern",
      title: "Kontext fixieren",
      body: [
        "„Kontext fixieren“ teilt dem Agenten vor dem Start genau mit, welche Daten gemeint sind. Sie können Ausführungen, Cluster und Datensätze fixieren.",
        "Der Release-Note-Abgleich vergleicht zwei Läufe: Fixieren Sie daher zuerst die Basisausführung — sie wird A — und danach die Vergleichsausführung — sie wird B. Differenzen sind immer B − A.",
        "Haben Sie im Tab „Cluster“ Basis- und Vergleichscluster gewählt, fixiert ein Klick deren letzte Läufe.",
      ],
    },
    composer: {
      chapter: "Stufe 3 · Testen & verfeinern",
      title: "Ihre erste Frage stellen",
      body: [
        "Geben Sie eine Frage ein und drücken Sie Enter, oder klicken Sie auf einen der Gesprächseinstiege oben — zum Beispiel „Welche Veränderungen zwischen den fixierten Ausführungen sind in Release Notes dokumentiert?“. Umschalt+Enter fügt eine neue Zeile ein.",
        "Während der Agent arbeitet, hält ihn die quadratische Schaltfläche an. Die Ausführung nutzt Ihre echten Daten und den KI-Anbieter und kann einige Sekunden dauern.",
      ],
      action: "Probieren Sie es gern aus — oder wählen Sie „Weiter“.",
    },
    trace: {
      chapter: "Stufe 3 · Testen & verfeinern",
      title: "Eine Ausführung lesen",
      body: [
        "Über jeder Antwort fasst „… gearbeitet · N Tool-Aufrufe“ die Ausführung zusammen. Ein Klick öffnet das Protokoll.",
        "Jede Zeile ist ein Tool-Aufruf: das Tool, ein kurzes Ergebnis, die verwendeten Argumente und die Dauer. Ein Klick auf eine Zeile zeigt die exakten Daten, die an den Agenten zurückgegeben wurden.",
        "Öffnen Sie beim Release-Note-Abgleich die Zeilen von search_release_notes: Sie zeigen, welche Dateien durchsucht wurden, und die passenden Jira-IDs mit ihren Lösungsbeschreibungen — so können Sie jede Bewertung in der Antwort prüfen.",
        "Unter einer fertigen Antwort können Sie sie kopieren oder als Markdown-Datei herunterladen. Sind Sie mit dem Agenten zufrieden, wählen Sie links „Agent speichern“.",
      ],
    },
  },
  complete: {
    title: "Sie sind startklar",
    body: "Sie wissen jetzt, wie Agenten arbeiten, woraus sie bestehen, welche Tools sie nutzen, welche Regeln sie einhalten und wie Sie einen Agenten erstellen, testen und speichern.",
    tipsTitle: "Gut zu wissen",
    tips: [
      "Konkrete, nummerierte Schritte ergeben die zuverlässigsten Agenten.",
      "Fixieren Sie für Vergleichsfragen zwei Ausführungen — die Basis zuerst.",
      "Mit „Release-Note-Quellen“ beschränken Sie einen Agenten auf die relevanten Release Notes.",
      "Öffnen Sie das Ausführungsprotokoll, wann immer Sie eine Zahl überprüfen möchten.",
      "Diese Tour starten Sie jederzeit erneut über die Karte „Einführung“ oben in der Agentenliste.",
    ],
  },
};

export const ONBOARDING_COPY: Record<StudioLocale, OnboardingCopy> = { en: EN, de: DE };
