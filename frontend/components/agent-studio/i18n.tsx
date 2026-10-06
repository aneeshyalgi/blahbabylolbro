"use client";

/**
 * Language support scoped to the Create AI Agents studio (English / German).
 * Independent from the app-wide next-intl locale on purpose: the studio has its own selector.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ToolInfo } from "./types";

export type StudioLocale = "en" | "de";

const STORAGE_KEY = "dataflow_agent_studio_locale";

const EN = {
  "common.cancel": "Cancel",
  "common.discard": "Discard",
  "common.untitledAgent": "Untitled agent",
  "common.agent": "Agent",
  "common.loading": "Loading",
  "common.language": "Language",

  "studio.toast.loadAgentsFailed": "Could not load agents",
  "studio.toast.designed": "Agent designed",
  "studio.toast.designedDesc": "Review the procedure and tools, then test it on the right.",
  "studio.toast.designFailed": "Could not design the agent",
  "studio.toast.refined": "Agent updated",
  "studio.toast.refinedDesc": "Changes applied. Undo is available until you refine again.",
  "studio.toast.refineFailed": "Could not apply the change",
  "studio.toast.nameRequired": "Name and instructions are required",
  "studio.toast.changesSaved": "Changes saved",
  "studio.toast.saved": "Agent saved",
  "studio.toast.savedDesc": "{name} is ready to run.",
  "studio.toast.saveFailed": "Could not save",
  "studio.toast.duplicated": "Agent duplicated",
  "studio.toast.duplicateFailed": "Could not duplicate",
  "studio.toast.deleted": "Agent deleted",
  "studio.toast.deleteFailed": "Could not delete",
  "studio.copySuffix": "(copy)",
  "studio.status.draft": "Draft · not saved yet",
  "studio.status.unsaved": "Unsaved changes",
  "studio.status.saved": "All changes saved",
  "studio.saveChanges": "Save changes",
  "studio.saveAgent": "Save agent",
  "studio.testBench": "Test bench",
  "studio.testBenchHint": "Runs the configuration on the left, unsaved edits included",
  "studio.badge.draft": "Draft",
  "studio.badge.edited": "Edited",
  "studio.describePlaceholder": "Describe what this agent does",
  "studio.updated": "updated {time}",
  "studio.tab.run": "Run",
  "studio.tab.configure": "Configure",
  "studio.duplicate": "Duplicate agent",
  "studio.delete": "Delete agent",
  "studio.savedVersionNotice": "Runs here use the saved version. Save your configuration changes to use them in conversations.",
  "studio.loadingAgent": "Loading agent",
  "studio.discardTitle": "Discard unsaved changes?",
  "studio.discardDraft": "This draft agent has not been saved. Leaving will discard it.",
  "studio.discardEdits": "Your configuration edits have not been saved. Leaving will discard them.",
  "studio.keepEditing": "Keep editing",
  "studio.deleteTitle": "Delete {name}?",
  "studio.deleteDesc.one": "This permanently deletes the agent and its {count} saved conversation. This cannot be undone.",
  "studio.deleteDesc.other": "This permanently deletes the agent and its {count} saved conversations. This cannot be undone.",
  "studio.deleting": "Deleting…",

  "library.search": "Search agents",
  "library.yourAgents": "Your agents",
  "library.backHome": "Back to studio home",
  "library.newAgent": "New agent",
  "library.empty": "No agents yet. Design one from a prompt or start from a template.",
  "library.noMatch": "No agents match “{query}”.",
  "library.noDescription": "No description",
  "library.conversations.one": "{count} conversation · {time}",
  "library.conversations.other": "{count} conversations · {time}",
  "library.neverRun": "{count} tools · never run",
  "library.tour": "Guided tour",
  "library.tourHint": "Learn it step by step · 8 min",

  "home.badge": "Agent Studio",
  "home.title": "Build an analyst that works on your real regulatory data.",
  "home.subtitle": "Agents query datasets, compare executions, trace lineage through your code and search release notes with real tools, showing every step they take.",
  "home.placeholder": "Describe what your agent should do…",
  "home.shortcut": "Ctrl + Enter to design",
  "home.designing": "Designing agent…",
  "home.design": "Design agent",
  "home.idea1": "Explain why Carrying Amount moved between two runs and link it to Jira tickets",
  "home.idea2": "Audit a dataset for missing values and outliers before we run the calculation",
  "home.idea3": "Write a management summary of the latest execution with breakdowns by category",
  "home.idea4": "Review our calculation code for silent default fills and hard-coded constants",
  "home.shortcut2": "Ctrl + Enter to continue",
  "home.emptyEditor": "or open an empty editor",
  "home.stageFoundation": "Choose a foundation",
  "home.stageFoundationHint": "Start from a proven template or from a blank canvas. Selecting a card loads its blueprint below.",
  "home.stageBrief": "Describe your agent",
  "home.stageBriefScratch": "Describe the job in your own words. The designer writes the procedure and selects the tools.",
  "home.stageBriefTemplate": "Tailor “{name}” to your case, or use it exactly as it is.",
  "home.stageTest": "Test & refine",
  "home.scratchTitle": "Blank canvas",
  "home.scratchText": "Describe any job and the designer builds a tool-using agent from your brief.",
  "home.scratchCta": "Start from your own brief",
  "home.placeholderTemplate": "Describe how to adapt {name}, e.g. focus only on RWA and answer in German…",
  "home.tailor": "Tailor with AI",
  "home.tailoring": "Tailoring…",
  "home.useAsIs": "Use as-is",
  "home.blueprint": "Blueprint",
  "home.blueprintScratchTitle": "Your agent, designed from your brief",
  "home.blueprintScratch1": "A numbered operating procedure",
  "home.blueprintScratch2": "The tools that procedure needs",
  "home.blueprintScratch3": "Guardrails and conversation starters",
  "home.moreSteps": "+{count} more steps",
  "home.selected": "Selected",
  "home.toolCount": "{count} tools",
  "home.stepCount": "{count} steps",
  "home.tailorIdea1": "Focus only on the RWA column",
  "home.tailorIdea2": "Always end with a risk rating",
  "home.tailorIdea3": "Keep answers under 200 words",
  "home.tailorIdea4": "Add a section with recommended next checks",
  "home.toolsTitle": "What agents can do here",
  "home.toolsSubtitle": "Every tool is read-only and works on the same data you see across the app.",

  "editor.identity": "Identity",
  "editor.namePlaceholder": "Agent name",
  "editor.descriptionPlaceholder": "One-sentence description shown in the library",
  "editor.icon": "Icon {name}",
  "editor.color": "Color {name}",
  "editor.refineTitle": "Refine with AI",
  "editor.refineHint": "Describe a change in plain language. The designer rewrites the specification and keeps what still fits.",
  "editor.undo": "Undo",
  "editor.refinePlaceholder": "e.g. Always end with a risk rating",
  "editor.rewriting": "Rewriting",
  "editor.apply": "Apply",
  "editor.instructions": "Instructions",
  "editor.instructionsHint": "What the agent is for, and the step-by-step procedure it follows on every run.",
  "editor.purpose": "Purpose",
  "editor.purposeHint": "One sentence: the outcome it is responsible for",
  "editor.purposePlaceholder": "e.g. Explain material B - A movements between two executions with verifiable evidence.",
  "editor.tools": "Tools · {count} of {total}",
  "editor.toolsHint": "Real, read-only capabilities. The agent decides when to call them; every call is shown in the run trace.",
  "editor.all": "All",
  "editor.none": "None",
  "editor.starters": "Conversation starters",
  "editor.startersHint": "Shown as one-click prompts when a conversation is empty.",
  "editor.startersAdd": "Add a starter prompt",
  "editor.guardrails": "Guardrails",
  "editor.guardrailsHint": "Rules the agent must follow on every answer.",
  "editor.guardrailsAdd": "Add a guardrail",
  "editor.answerFormat": "Answer format",
  "editor.answerFormatPlaceholder": "e.g. Summary paragraph, then a driver table, then next checks",
  "editor.advanced": "Advanced",
  "editor.maxSteps": "Max tool rounds",
  "editor.maxStepsHint": "How many rounds of tool calls before it must answer.",
  "editor.temperature": "Temperature",
  "editor.precise": "Precise",
  "editor.creative": "Creative",
  "editor.removeItem": "Remove item",
  "editor.addItem": "Add item",

  "procedure.title": "Procedure",
  "procedure.steps": "Steps",
  "procedure.text": "Plain text",
  "procedure.textPlaceholder": "1. Find the executions to compare\n2. Compare them with compare_executions\n3. …",
  "procedure.textHint": "One step per line, numbered “1.”, “2.”, … Text before the first step is kept as context.",
  "procedure.context": "Context before the steps",
  "procedure.split": "Split into steps",
  "procedure.splitTitle": "Turn each sentence or line into its own step",
  "procedure.firstPlaceholder": "e.g. Compare the two pinned executions with compare_executions",
  "procedure.nextPlaceholder": "Next step",
  "procedure.add": "Add step",
  "procedure.addFirst": "Add the first step",
  "procedure.keys": "Enter adds the next step · Shift+Enter for a line break · Backspace on an empty step removes it",
  "procedure.insertTool": "Insert tool:",
  "procedure.toolStepPrefix": "Use {tool} to ",
  "procedure.moveUp": "Move step {n} up",
  "procedure.moveDown": "Move step {n} down",
  "procedure.delete": "Delete step {n}",

  "chat.starter1": "Give me an overview of what is in the workspace.",
  "chat.starter2": "What changed between the two most recent executions?",
  "chat.needNameInstructions": "Give the agent a name and instructions first",
  "chat.openFailed": "Could not open conversation",
  "chat.deleteFailed": "Could not delete conversation",
  "chat.runFailed": "The run failed.",
  "chat.conversations": "Conversations",
  "chat.hideConversations": "Hide conversations",
  "chat.newConversation": "New conversation",
  "chat.emptyHistory": "Runs are saved here so you can pick up where you left off.",
  "chat.turns.one": "{time} · {count} turn",
  "chat.turns.other": "{time} · {count} turns",
  "chat.deleteConversation": "Delete conversation",
  "chat.history": "History",
  "chat.new": "New",
  "chat.testNotSaved": "Test conversation · not saved",
  "chat.reset": "Reset",
  "chat.loadingConversation": "Loading conversation",
  "chat.noTools": "This agent has no tools enabled, so it can only reason over the conversation.",
  "chat.tip": "Tip: pin executions or datasets below so the agent starts with the right ids.",
  "chat.placeholder": "Ask {name} to investigate…",
  "chat.theAgent": "the agent",
  "chat.sendHint": "Enter to send · Shift+Enter for a new line",
  "chat.stop": "Stop the agent",
  "chat.send": "Send",
  "chat.messageLabel": "Message the agent",
  "chat.stopped": "Stopped",

  "message.error": "Error",
  "message.result": "Result returned to the agent",
  "message.working": "Working",
  "message.worked": "Worked",
  "message.workedFor": "Worked for {duration}",
  "message.toolCalls.one": "{count} tool call",
  "message.toolCalls.other": "{count} tool calls",
  "message.failed": "{count} failed",
  "message.planning": "Planning the approach…",
  "message.stopped": "Stopped",
  "message.copy": "Copy",
  "message.copied": "Copied",
  "message.markdown": "Markdown",
  "chip.cluster": "Cluster",
  "chip.execution": "Run",
  "chip.dataset": "Data",
  "chip.remove": "Remove {label}",

  "context.pin": "Pin context",
  "context.title": "Pin context for this conversation",
  "context.desc": "The agent gets these ids up front. For comparisons, pin the base execution first (A), then the compared one (B).",
  "context.useGlobal": "Use global base vs. comparison clusters (latest runs)",
  "context.executions": "Executions",
  "context.clusters": "Clusters",
  "context.datasets": "Datasets",
  "context.loading": "Loading workspace",
  "context.loadFailed": "Could not load workspace context.",
  "context.values": "{count} values",
  "context.noExecutions": "No executions yet. Run a cluster in the Results tab first.",
  "context.reference": "reference",
  "context.noClusters": "No clusters yet.",
  "context.noDatasets": "No datasets yet.",
  "context.pinned": "{count} pinned",
  "context.clearAll": "Clear all",

  "time.justNow": "just now",
  "time.minutes": "{n}m ago",
  "time.hours": "{n}h ago",
  "time.days": "{n}d ago",
} as const;

export type StudioTextKey = keyof typeof EN;

const DE: Record<StudioTextKey, string> = {
  "common.cancel": "Abbrechen",
  "common.discard": "Verwerfen",
  "common.untitledAgent": "Unbenannter Agent",
  "common.agent": "Agent",
  "common.loading": "Wird geladen",
  "common.language": "Sprache",

  "studio.toast.loadAgentsFailed": "Agenten konnten nicht geladen werden",
  "studio.toast.designed": "Agent entworfen",
  "studio.toast.designedDesc": "Prüfen Sie Ablauf und Tools und testen Sie den Agenten rechts.",
  "studio.toast.designFailed": "Agent konnte nicht entworfen werden",
  "studio.toast.refined": "Agent aktualisiert",
  "studio.toast.refinedDesc": "Änderungen übernommen. Rückgängig ist bis zur nächsten Überarbeitung möglich.",
  "studio.toast.refineFailed": "Änderung konnte nicht übernommen werden",
  "studio.toast.nameRequired": "Name und Anweisungen sind erforderlich",
  "studio.toast.changesSaved": "Änderungen gespeichert",
  "studio.toast.saved": "Agent gespeichert",
  "studio.toast.savedDesc": "{name} ist einsatzbereit.",
  "studio.toast.saveFailed": "Speichern fehlgeschlagen",
  "studio.toast.duplicated": "Agent dupliziert",
  "studio.toast.duplicateFailed": "Duplizieren fehlgeschlagen",
  "studio.toast.deleted": "Agent gelöscht",
  "studio.toast.deleteFailed": "Löschen fehlgeschlagen",
  "studio.copySuffix": "(Kopie)",
  "studio.status.draft": "Entwurf · noch nicht gespeichert",
  "studio.status.unsaved": "Nicht gespeicherte Änderungen",
  "studio.status.saved": "Alle Änderungen gespeichert",
  "studio.saveChanges": "Änderungen speichern",
  "studio.saveAgent": "Agent speichern",
  "studio.testBench": "Testumgebung",
  "studio.testBenchHint": "Führt die Konfiguration links aus, inklusive nicht gespeicherter Änderungen",
  "studio.badge.draft": "Entwurf",
  "studio.badge.edited": "Bearbeitet",
  "studio.describePlaceholder": "Beschreiben Sie, was dieser Agent tut",
  "studio.updated": "aktualisiert {time}",
  "studio.tab.run": "Ausführen",
  "studio.tab.configure": "Konfigurieren",
  "studio.duplicate": "Agent duplizieren",
  "studio.delete": "Agent löschen",
  "studio.savedVersionNotice": "Hier wird die gespeicherte Version ausgeführt. Speichern Sie Ihre Konfigurationsänderungen, um sie in Unterhaltungen zu nutzen.",
  "studio.loadingAgent": "Agent wird geladen",
  "studio.discardTitle": "Nicht gespeicherte Änderungen verwerfen?",
  "studio.discardDraft": "Dieser Entwurf wurde noch nicht gespeichert. Wenn Sie fortfahren, geht er verloren.",
  "studio.discardEdits": "Ihre Konfigurationsänderungen wurden nicht gespeichert. Wenn Sie fortfahren, gehen sie verloren.",
  "studio.keepEditing": "Weiter bearbeiten",
  "studio.deleteTitle": "{name} löschen?",
  "studio.deleteDesc.one": "Damit werden der Agent und seine {count} gespeicherte Unterhaltung endgültig gelöscht. Dies kann nicht rückgängig gemacht werden.",
  "studio.deleteDesc.other": "Damit werden der Agent und seine {count} gespeicherten Unterhaltungen endgültig gelöscht. Dies kann nicht rückgängig gemacht werden.",
  "studio.deleting": "Wird gelöscht…",

  "library.search": "Agenten suchen",
  "library.yourAgents": "Ihre Agenten",
  "library.backHome": "Zurück zur Studio-Startseite",
  "library.newAgent": "Neuer Agent",
  "library.empty": "Noch keine Agenten. Entwerfen Sie einen per Beschreibung oder starten Sie mit einer Vorlage.",
  "library.noMatch": "Keine Agenten zu „{query}“.",
  "library.noDescription": "Keine Beschreibung",
  "library.conversations.one": "{count} Unterhaltung · {time}",
  "library.conversations.other": "{count} Unterhaltungen · {time}",
  "library.neverRun": "{count} Tools · noch nie ausgeführt",
  "library.tour": "Einführung",
  "library.tourHint": "Schritt für Schritt · 8 Min.",

  "home.badge": "Agent Studio",
  "home.title": "Entwickeln Sie einen Analysten, der mit Ihren echten regulatorischen Daten arbeitet.",
  "home.subtitle": "Agenten durchsuchen Datensätze, vergleichen Ausführungen, verfolgen die Lineage durch Ihren Code und durchsuchen Release Notes – mit echten Tools und jedem Schritt nachvollziehbar.",
  "home.placeholder": "Beschreiben Sie, was Ihr Agent tun soll…",
  "home.shortcut": "Strg + Enter zum Entwerfen",
  "home.designing": "Agent wird entworfen…",
  "home.design": "Agent entwerfen",
  "home.idea1": "Erkläre, warum sich der Carrying Amount zwischen zwei Läufen verändert hat, und verknüpfe es mit Jira-Tickets",
  "home.idea2": "Prüfe einen Datensatz vor der Berechnung auf fehlende Werte und Ausreißer",
  "home.idea3": "Erstelle eine Management-Zusammenfassung der letzten Ausführung mit Aufschlüsselung nach Kategorien",
  "home.idea4": "Prüfe unseren Berechnungscode auf stille Standardbefüllungen und fest codierte Konstanten",
  "home.shortcut2": "Strg + Enter zum Fortfahren",
  "home.emptyEditor": "oder einen leeren Editor öffnen",
  "home.stageFoundation": "Grundlage wählen",
  "home.stageFoundationHint": "Starten Sie mit einer bewährten Vorlage oder einer leeren Arbeitsfläche. Die Auswahl lädt den Bauplan darunter.",
  "home.stageBrief": "Agent beschreiben",
  "home.stageBriefScratch": "Beschreiben Sie die Aufgabe in eigenen Worten. Der Designer schreibt den Ablauf und wählt die Tools.",
  "home.stageBriefTemplate": "Passen Sie „{name}“ an Ihren Fall an oder verwenden Sie die Vorlage unverändert.",
  "home.stageTest": "Testen & verfeinern",
  "home.scratchTitle": "Leere Arbeitsfläche",
  "home.scratchText": "Beschreiben Sie eine beliebige Aufgabe, und der Designer erstellt daraus einen Agenten mit passenden Tools.",
  "home.scratchCta": "Mit eigener Beschreibung starten",
  "home.placeholderTemplate": "Beschreiben Sie, wie {name} angepasst werden soll, z. B. nur auf RWA konzentrieren…",
  "home.tailor": "Mit KI anpassen",
  "home.tailoring": "Wird angepasst…",
  "home.useAsIs": "Unverändert verwenden",
  "home.blueprint": "Bauplan",
  "home.blueprintScratchTitle": "Ihr Agent, entworfen aus Ihrer Beschreibung",
  "home.blueprintScratch1": "Ein nummerierter Arbeitsablauf",
  "home.blueprintScratch2": "Die Tools, die dieser Ablauf benötigt",
  "home.blueprintScratch3": "Leitplanken und Gesprächseinstiege",
  "home.moreSteps": "+{count} weitere Schritte",
  "home.selected": "Ausgewählt",
  "home.toolCount": "{count} Tools",
  "home.stepCount": "{count} Schritte",
  "home.tailorIdea1": "Nur auf die Spalte RWA konzentrieren",
  "home.tailorIdea2": "Immer mit einer Risikoeinstufung abschließen",
  "home.tailorIdea3": "Antworten unter 200 Wörtern halten",
  "home.tailorIdea4": "Einen Abschnitt mit empfohlenen nächsten Prüfschritten ergänzen",
  "home.toolsTitle": "Was Agenten hier können",
  "home.toolsSubtitle": "Alle Tools sind schreibgeschützt und arbeiten mit denselben Daten, die Sie in der gesamten Anwendung sehen.",

  "editor.identity": "Identität",
  "editor.namePlaceholder": "Name des Agenten",
  "editor.descriptionPlaceholder": "Kurzbeschreibung in einem Satz (wird in der Bibliothek angezeigt)",
  "editor.icon": "Symbol {name}",
  "editor.color": "Farbe {name}",
  "editor.refineTitle": "Mit KI überarbeiten",
  "editor.refineHint": "Beschreiben Sie eine Änderung in eigenen Worten. Der Designer überarbeitet die Spezifikation und behält bei, was weiterhin passt.",
  "editor.undo": "Rückgängig",
  "editor.refinePlaceholder": "z. B. Immer mit einer Risikoeinstufung abschließen",
  "editor.rewriting": "Wird überarbeitet",
  "editor.apply": "Anwenden",
  "editor.instructions": "Anweisungen",
  "editor.instructionsHint": "Wofür der Agent da ist und welchen Ablauf er bei jeder Ausführung Schritt für Schritt befolgt.",
  "editor.purpose": "Zweck",
  "editor.purposeHint": "Ein Satz: das Ergebnis, für das er verantwortlich ist",
  "editor.purposePlaceholder": "z. B. Wesentliche B - A Veränderungen zwischen zwei Ausführungen mit belastbaren Nachweisen erklären.",
  "editor.tools": "Tools · {count} von {total}",
  "editor.toolsHint": "Echte, schreibgeschützte Funktionen. Der Agent entscheidet, wann er sie aufruft; jeder Aufruf erscheint im Ausführungsprotokoll.",
  "editor.all": "Alle",
  "editor.none": "Keine",
  "editor.starters": "Gesprächseinstiege",
  "editor.startersHint": "Werden als Ein-Klick-Vorschläge angezeigt, wenn eine Unterhaltung leer ist.",
  "editor.startersAdd": "Einstieg hinzufügen",
  "editor.guardrails": "Leitplanken",
  "editor.guardrailsHint": "Regeln, die der Agent bei jeder Antwort einhalten muss.",
  "editor.guardrailsAdd": "Leitplanke hinzufügen",
  "editor.answerFormat": "Antwortformat",
  "editor.answerFormatPlaceholder": "z. B. Zusammenfassung, dann Treibertabelle, dann nächste Prüfschritte",
  "editor.advanced": "Erweitert",
  "editor.maxSteps": "Max. Tool-Runden",
  "editor.maxStepsHint": "Wie viele Runden von Tool-Aufrufen erlaubt sind, bevor geantwortet werden muss.",
  "editor.temperature": "Temperatur",
  "editor.precise": "Präzise",
  "editor.creative": "Kreativ",
  "editor.removeItem": "Eintrag entfernen",
  "editor.addItem": "Eintrag hinzufügen",

  "procedure.title": "Ablauf",
  "procedure.steps": "Schritte",
  "procedure.text": "Freitext",
  "procedure.textPlaceholder": "1. Zu vergleichende Ausführungen ermitteln\n2. Mit compare_executions vergleichen\n3. …",
  "procedure.textHint": "Ein Schritt pro Zeile, nummeriert „1.“, „2.“, … Text vor dem ersten Schritt bleibt als Kontext erhalten.",
  "procedure.context": "Kontext vor den Schritten",
  "procedure.split": "In Schritte aufteilen",
  "procedure.splitTitle": "Jeden Satz bzw. jede Zeile in einen eigenen Schritt umwandeln",
  "procedure.firstPlaceholder": "z. B. Die beiden fixierten Ausführungen mit compare_executions vergleichen",
  "procedure.nextPlaceholder": "Nächster Schritt",
  "procedure.add": "Schritt hinzufügen",
  "procedure.addFirst": "Ersten Schritt hinzufügen",
  "procedure.keys": "Enter fügt den nächsten Schritt hinzu · Umschalt+Enter für einen Zeilenumbruch · Rücktaste in einem leeren Schritt entfernt ihn",
  "procedure.insertTool": "Tool einfügen:",
  "procedure.toolStepPrefix": "Mit {tool} ",
  "procedure.moveUp": "Schritt {n} nach oben",
  "procedure.moveDown": "Schritt {n} nach unten",
  "procedure.delete": "Schritt {n} löschen",

  "chat.starter1": "Welche Datensätze, Codedateien und Cluster gibt es im Arbeitsbereich?",
  "chat.starter2": "Was hat sich zwischen den beiden letzten Ausführungen geändert?",
  "chat.needNameInstructions": "Bitte zuerst Name und Anweisungen des Agenten festlegen",
  "chat.openFailed": "Unterhaltung konnte nicht geöffnet werden",
  "chat.deleteFailed": "Unterhaltung konnte nicht gelöscht werden",
  "chat.runFailed": "Die Ausführung ist fehlgeschlagen.",
  "chat.conversations": "Unterhaltungen",
  "chat.hideConversations": "Unterhaltungen ausblenden",
  "chat.newConversation": "Neue Unterhaltung",
  "chat.emptyHistory": "Ausführungen werden hier gespeichert, damit Sie später nahtlos weitermachen können.",
  "chat.turns.one": "{time} · {count} Runde",
  "chat.turns.other": "{time} · {count} Runden",
  "chat.deleteConversation": "Unterhaltung löschen",
  "chat.history": "Verlauf",
  "chat.new": "Neu",
  "chat.testNotSaved": "Testunterhaltung · nicht gespeichert",
  "chat.reset": "Zurücksetzen",
  "chat.loadingConversation": "Unterhaltung wird geladen",
  "chat.noTools": "Für diesen Agenten sind keine Tools aktiviert; er kann nur auf Basis der Unterhaltung antworten.",
  "chat.tip": "Tipp: Fixieren Sie unten Ausführungen oder Datensätze, damit der Agent mit den richtigen IDs startet.",
  "chat.placeholder": "Beauftragen Sie {name} mit einer Analyse…",
  "chat.theAgent": "den Agenten",
  "chat.sendHint": "Enter zum Senden · Umschalt+Enter für neue Zeile",
  "chat.stop": "Agent anhalten",
  "chat.send": "Senden",
  "chat.messageLabel": "Nachricht an den Agenten",
  "chat.stopped": "Angehalten",

  "message.error": "Fehler",
  "message.result": "An den Agenten zurückgegebenes Ergebnis",
  "message.working": "Arbeitet",
  "message.worked": "Abgeschlossen",
  "message.workedFor": "{duration} gearbeitet",
  "message.toolCalls.one": "{count} Tool-Aufruf",
  "message.toolCalls.other": "{count} Tool-Aufrufe",
  "message.failed": "{count} fehlgeschlagen",
  "message.planning": "Vorgehen wird geplant…",
  "message.stopped": "Angehalten",
  "message.copy": "Kopieren",
  "message.copied": "Kopiert",
  "message.markdown": "Markdown",
  "chip.cluster": "Cluster",
  "chip.execution": "Lauf",
  "chip.dataset": "Daten",
  "chip.remove": "{label} entfernen",

  "context.pin": "Kontext fixieren",
  "context.title": "Kontext für diese Unterhaltung fixieren",
  "context.desc": "Der Agent erhält diese IDs vorab. Fixieren Sie für Vergleiche zuerst die Basisausführung (A), dann die Vergleichsausführung (B).",
  "context.useGlobal": "Globale Basis- und Vergleichscluster verwenden (letzte Läufe)",
  "context.executions": "Ausführungen",
  "context.clusters": "Cluster",
  "context.datasets": "Datensätze",
  "context.loading": "Arbeitsbereich wird geladen",
  "context.loadFailed": "Kontext des Arbeitsbereichs konnte nicht geladen werden.",
  "context.values": "{count} Werte",
  "context.noExecutions": "Noch keine Ausführungen. Führen Sie zuerst einen Cluster im Tab „Results“ aus.",
  "context.reference": "Referenz",
  "context.noClusters": "Noch keine Cluster.",
  "context.noDatasets": "Noch keine Datensätze.",
  "context.pinned": "{count} fixiert",
  "context.clearAll": "Alle entfernen",

  "time.justNow": "gerade eben",
  "time.minutes": "vor {n} Min.",
  "time.hours": "vor {n} Std.",
  "time.days": "vor {n} Tg.",
};

const MESSAGES: Record<StudioLocale, Record<StudioTextKey, string>> = { en: EN, de: DE };

const TOOL_TEXT_DE: Record<string, { label: string; description: string }> = {
  workspace_overview: {
    label: "Arbeitsbereich-Überblick",
    description: "Listet Datensätze (mit Tabellen und Spalten), Codedateien, Cluster mit ihrer letzten Ausführung und Release-Note-Arbeitsmappen auf. Zuerst aufrufen, um IDs zu ermitteln.",
  },
  list_executions: {
    label: "Ausführungen auflisten",
    description: "Listet berechnete Ausführungs-Snapshots (optional für einen Cluster) mit Datensatz, Codeversion und Kennzahlen auf.",
  },
  query_data: {
    label: "Zeilen abfragen",
    description: "Liest Zeilen aus einer Datensatztabelle oder einem Ausführungsergebnis – mit Filtern, Spaltenauswahl, Sortierung und Paging.",
  },
  profile_data: {
    label: "Datenqualität profilieren",
    description: "Profiliert jede Spalte: fehlende Werte, Ausprägungen, Wertebereiche, Nullen, negative Werte, Ausreißer, häufigste Kategorien, Duplikate und Schlüsselkandidaten.",
  },
  aggregate_data: {
    label: "Aggregieren",
    description: "Berechnet Summe, Mittelwert, Median, Minimum, Maximum, Anzahl oder eindeutige Werte – optional gruppiert und gefiltert.",
  },
  compare_executions: {
    label: "Ausführungen vergleichen",
    description: "Vergleicht zwei Ausführungs-Snapshots zeilenweise (über ID/Key/Position) mit Spaltenstatistik und den größten Abweichungen. Differenzen immer als B - A.",
  },
  inspect_code: {
    label: "Code lesen",
    description: "Liest eine Transformations-Codedatei mit Zeilennummern sowie die zugewiesenen Spalten und ihre Eingaben.",
  },
  trace_lineage: {
    label: "Lineage verfolgen",
    description: "Verfolgt, wie eine Spalte berechnet wird: direkte Eingaben, vollständige Herkunftskette, abhängige Spalten und die genauen Zuweisungszeilen.",
  },
  search_release_notes: {
    label: "Release Notes durchsuchen",
    description: "Durchsucht hochgeladene Release-Note-Arbeitsmappen nach Feld, Position, Thema oder Jira-ID und liefert Jira-ID, Problem- und Lösungsbeschreibung.",
  },
  calculator: {
    label: "Rechner",
    description: "Berechnet arithmetische Ausdrücke exakt. Für jede nicht triviale Rechnung statt Kopfrechnen.",
  },
};

const CATEGORY_DE: Record<string, string> = {
  Workspace: "Arbeitsbereich",
  Data: "Daten",
  Analysis: "Analyse",
  "Code & lineage": "Code & Lineage",
  Evidence: "Nachweise",
  Utilities: "Hilfsmittel",
};

type Vars = Record<string, string | number>;

function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (vars[key] !== undefined ? String(vars[key]) : match));
}

type StudioLanguageValue = {
  locale: StudioLocale;
  setLocale: (locale: StudioLocale) => void;
  t: (key: StudioTextKey, vars?: Vars) => string;
  /** Pick the ".one" or ".other" variant of a key based on count. */
  plural: (base: string, count: number, vars?: Vars) => string;
  toolLabel: (tool: Pick<ToolInfo, "name" | "label">) => string;
  toolDescription: (tool: Pick<ToolInfo, "name" | "description">) => string;
  category: (name: string) => string;
  relativeTime: (value?: string | null) => string;
  formatDateTime: (value: string) => string;
};

const StudioLanguageContext = createContext<StudioLanguageValue | null>(null);

export function StudioLanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<StudioLocale>("en");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "de") setLocaleState(stored);
    } catch {
      // Storage unavailable; keep the default.
    }
  }, []);

  const setLocale = useCallback((next: StudioLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable; the choice lasts for this session only.
    }
  }, []);

  const value = useMemo<StudioLanguageValue>(() => {
    const messages = MESSAGES[locale];
    const t = (key: StudioTextKey, vars?: Vars) => format(messages[key] ?? EN[key], vars);
    const dateLocale = locale === "de" ? "de-DE" : "en-GB";
    return {
      locale,
      setLocale,
      t,
      plural: (base, count, vars) => t(`${base}.${count === 1 ? "one" : "other"}` as StudioTextKey, { count, ...vars }),
      toolLabel: (tool) => (locale === "de" ? TOOL_TEXT_DE[tool.name]?.label : undefined) ?? tool.label,
      toolDescription: (tool) => (locale === "de" ? TOOL_TEXT_DE[tool.name]?.description : undefined) ?? tool.description,
      category: (name) => (locale === "de" ? CATEGORY_DE[name] : undefined) ?? name,
      relativeTime: (value) => {
        if (!value) return "";
        const then = new Date(value).getTime();
        if (Number.isNaN(then)) return "";
        const seconds = Math.round((Date.now() - then) / 1000);
        if (seconds < 45) return t("time.justNow");
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return t("time.minutes", { n: minutes });
        const hours = Math.round(minutes / 60);
        if (hours < 24) return t("time.hours", { n: hours });
        const days = Math.round(hours / 24);
        if (days < 30) return t("time.days", { n: days });
        return new Date(value).toLocaleDateString(dateLocale);
      },
      formatDateTime: (value) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" });
      },
    };
  }, [locale, setLocale]);

  return <StudioLanguageContext.Provider value={value}>{children}</StudioLanguageContext.Provider>;
}

export function useStudioText(): StudioLanguageValue {
  const context = useContext(StudioLanguageContext);
  if (!context) throw new Error("useStudioText must be used within StudioLanguageProvider");
  return context;
}
