"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, FlaskConical, Loader2, MessagesSquare, Save, Settings2, Trash2, Undo2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS } from "@/lib/api-config";
import { cn } from "@/lib/utils";
import { AgentChat } from "@/components/agent-studio/agent-chat";
import { AgentEditor } from "@/components/agent-studio/agent-editor";
import { AgentLibrary } from "@/components/agent-studio/agent-library";
import { StudioHome } from "@/components/agent-studio/studio-home";
import { definitionsEqual, requestJson } from "@/components/agent-studio/api";
import { StudioLanguageProvider, useStudioText } from "@/components/agent-studio/i18n";
import {
  ONBOARDING_STORAGE_KEY,
  StudioOnboarding,
  type OnboardingController,
} from "@/components/agent-studio/onboarding/studio-onboarding";
import { TOUR_TEMPLATE_ID } from "@/components/agent-studio/onboarding/onboarding-content";
import {
  EMPTY_DEFINITION,
  type AgentDefinition,
  type AgentTemplate,
  type ContextOptions,
  type ReleaseNoteFile,
  type SavedAgent,
  type ToolInfo,
} from "@/components/agent-studio/types";
import { AgentAvatar, agentAccent } from "@/components/agent-studio/visuals";

type View =
  | { kind: "home" }
  | { kind: "draft"; sourcePrompt: string }
  | { kind: "agent"; id: string; tab: "chat" | "configure" };

const cloneDefinition = (definition: AgentDefinition): AgentDefinition => JSON.parse(JSON.stringify(definition));

/** The Create AI Agents section has its own English/German setting, independent of the app-wide locale. */
export function CreateAIAgentsTabContent() {
  return (
    <StudioLanguageProvider>
      <AgentStudio />
    </StudioLanguageProvider>
  );
}

function AgentStudio() {
  const { toast } = useToast();
  const { t, plural, locale, relativeTime } = useStudioText();
  const [agents, setAgents] = useState<SavedAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [view, setView] = useState<View>({ kind: "home" });
  const [working, setWorking] = useState<AgentDefinition | null>(null);
  const [baseline, setBaseline] = useState<AgentDefinition | null>(null);
  const [previousDefinition, setPreviousDefinition] = useState<AgentDefinition | null>(null);
  // The definition a draft was opened with, so the tour can tell an untouched draft from the user's own edits.
  const [draftOrigin, setDraftOrigin] = useState<AgentDefinition | null>(null);
  const [templatesVersion, setTemplatesVersion] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedAgent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [contextOptions, setContextOptions] = useState<ContextOptions | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [releaseNoteFiles, setReleaseNoteFiles] = useState<ReleaseNoteFile[]>([]);
  const [releaseNoteFilesLoading, setReleaseNoteFilesLoading] = useState(true);
  // Changes whenever a different draft or agent is opened so the test bench starts a fresh conversation.
  const [editSession, setEditSession] = useState(0);
  // Foundation selected on the studio home (null = blank canvas); kept here so the guided tour can follow it.
  const [homeTemplateId, setHomeTemplateId] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const tourAutoStarted = useRef(false);
  const contextRequest = useRef(0);
  const loadErrorTitle = useRef(t("studio.toast.loadAgentsFailed"));
  loadErrorTitle.current = t("studio.toast.loadAgentsFailed");

  const loadAgents = useCallback(async () => {
    try {
      const payload = await requestJson<{ agents: SavedAgent[] }>(API_ENDPOINTS.agents);
      setAgents(payload.agents);
    } catch (error) {
      toast({ title: loadErrorTitle.current, description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setAgentsLoading(false);
    }
  }, [toast]);

  const loadReleaseNoteFiles = useCallback(() => {
    setReleaseNoteFilesLoading(true);
    requestJson<{ workbooks: ReleaseNoteFile[] }>(API_ENDPOINTS.releaseNotes)
      .then((payload) => setReleaseNoteFiles(payload.workbooks))
      .catch(() => setReleaseNoteFiles([]))
      .finally(() => setReleaseNoteFilesLoading(false));
  }, []);

  useEffect(() => {
    void loadAgents();
    requestJson<{ tools: ToolInfo[] }>(API_ENDPOINTS.agentTools).then((payload) => setTools(payload.tools)).catch(() => setTools([]));
    loadReleaseNoteFiles();
  }, [loadAgents, loadReleaseNoteFiles]);

  useEffect(() => {
    let cancelled = false;
    requestJson<{ templates: AgentTemplate[] }>(`${API_ENDPOINTS.agentTemplates}?lang=${locale}`)
      .then((payload) => {
        if (!cancelled) setTemplates(payload.templates);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [locale, templatesVersion]);

  const viewKind = useRef(view.kind);
  viewKind.current = view.kind;

  // First visit: start the onboarding once templates are available (the tour opens one of them).
  useEffect(() => {
    if (tourAutoStarted.current || !templates.length) return;
    let seen = false;
    try {
      seen = localStorage.getItem(ONBOARDING_STORAGE_KEY) === "done";
    } catch {
      seen = false;
    }
    if (seen) {
      tourAutoStarted.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      tourAutoStarted.current = true;
      // Never interrupt someone who already started working; they can open the tour from the library.
      if (viewKind.current === "home") setTourOpen(true);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [templates.length]);

  const loadContextOptions = useCallback(() => {
    const requestId = ++contextRequest.current;
    setContextLoading(true);
    requestJson<ContextOptions>(API_ENDPOINTS.agentContextOptions)
      .then((payload) => {
        if (requestId === contextRequest.current) setContextOptions(payload);
      })
      .catch(() => {
        if (requestId === contextRequest.current) setContextOptions(null);
      })
      .finally(() => {
        if (requestId === contextRequest.current) setContextLoading(false);
      });
  }, []);

  const selectedAgent = view.kind === "agent" ? agents.find((agent) => agent.id === view.id) ?? null : null;
  const isDirty = view.kind === "draft"
    ? Boolean(working && (working.name.trim() || working.instructions.trim()))
    : view.kind === "agent" && Boolean(working) && !definitionsEqual(working, baseline);

  const guard = (action: () => void) => {
    if (isDirty) setPendingAction(() => action);
    else action();
  };

  const openAgent = (agent: SavedAgent, tab: "chat" | "configure" = "chat") => {
    setView({ kind: "agent", id: agent.id, tab });
    setWorking(cloneDefinition(agent.definition));
    setBaseline(cloneDefinition(agent.definition));
    setPreviousDefinition(null);
    setEditSession((current) => current + 1);
  };

  const goHome = () => {
    setView({ kind: "home" });
    setWorking(null);
    setBaseline(null);
    setPreviousDefinition(null);
  };

  const startDraft = (definition: AgentDefinition, sourcePrompt: string) => {
    setView({ kind: "draft", sourcePrompt });
    setWorking(cloneDefinition(definition));
    setDraftOrigin(cloneDefinition(definition));
    setBaseline(null);
    setPreviousDefinition(null);
    setEditSession((current) => current + 1);
  };

  /** Design an agent from a brief; with a template, the brief tailors that template instead. */
  const generate = async (prompt: string, template: AgentTemplate | null) => {
    setGenerating(true);
    try {
      const payload = await requestJson<{ definition: AgentDefinition }>(API_ENDPOINTS.generateAgent, {
        method: "POST",
        body: JSON.stringify({ prompt, language: locale, ...(template ? { base_definition: template.definition } : {}) }),
      });
      startDraft(payload.definition, prompt);
      toast({ title: t("studio.toast.designed"), description: t("studio.toast.designedDesc") });
    } catch (error) {
      toast({ title: t("studio.toast.designFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const refine = async (instruction: string): Promise<boolean> => {
    if (!working) return false;
    setRefining(true);
    try {
      const payload = await requestJson<{ definition: AgentDefinition }>(API_ENDPOINTS.generateAgent, {
        method: "POST",
        body: JSON.stringify({ prompt: instruction, base_definition: working, language: locale }),
      });
      setPreviousDefinition(working);
      setWorking(payload.definition);
      toast({ title: t("studio.toast.refined"), description: t("studio.toast.refinedDesc") });
      return true;
    } catch (error) {
      toast({ title: t("studio.toast.refineFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      return false;
    } finally {
      setRefining(false);
    }
  };

  const save = async () => {
    if (!working) return;
    if (!working.name.trim() || !working.instructions.trim()) {
      toast({ title: t("studio.toast.nameRequired"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (view.kind === "agent") {
        const updated = await requestJson<SavedAgent>(API_ENDPOINTS.agentById(view.id), {
          method: "PUT",
          body: JSON.stringify({ definition: working }),
        });
        setAgents((current) => current.map((agent) => (agent.id === updated.id ? updated : agent)));
        setWorking(cloneDefinition(updated.definition));
        setBaseline(cloneDefinition(updated.definition));
        setPreviousDefinition(null);
        toast({ title: t("studio.toast.changesSaved"), description: updated.name });
      } else {
        const created = await requestJson<SavedAgent>(API_ENDPOINTS.agents, {
          method: "POST",
          body: JSON.stringify({ definition: working, source_prompt: view.kind === "draft" ? view.sourcePrompt : "" }),
        });
        setAgents((current) => [created, ...current]);
        // During the guided tour, stay in the editor so the remaining steps can still point at it.
        openAgent(created, tourOpen ? "configure" : "chat");
        toast({ title: t("studio.toast.saved"), description: t("studio.toast.savedDesc", { name: created.name }) });
      }
    } catch (error) {
      toast({ title: t("studio.toast.saveFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async (agent: SavedAgent) => {
    try {
      const created = await requestJson<SavedAgent>(API_ENDPOINTS.agents, {
        method: "POST",
        body: JSON.stringify({
          definition: { ...agent.definition, name: `${agent.definition.name} ${t("studio.copySuffix")}`.slice(0, 80) },
          source_prompt: agent.source_prompt,
        }),
      });
      setAgents((current) => [created, ...current]);
      openAgent(created, "configure");
      toast({ title: t("studio.toast.duplicated"), description: created.name });
    } catch (error) {
      toast({ title: t("studio.toast.duplicateFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await requestJson(API_ENDPOINTS.agentById(deleteTarget.id), { method: "DELETE" });
      setAgents((current) => current.filter((agent) => agent.id !== deleteTarget.id));
      if (view.kind === "agent" && view.id === deleteTarget.id) goHome();
      toast({ title: t("studio.toast.deleted"), description: deleteTarget.name });
      setDeleteTarget(null);
    } catch (error) {
      toast({ title: t("studio.toast.deleteFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const discardChanges = () => {
    if (view.kind === "agent" && baseline) {
      setWorking(cloneDefinition(baseline));
      setPreviousDefinition(null);
    }
  };

  const openTemplate = (template: AgentTemplate) => startDraft(template.definition, `Template: ${template.definition.name}`);

  const startTour = () => {
    if (tourOpen) return;
    // The tour opens a template, so make sure they are loaded even if the first request failed.
    if (!templates.length) setTemplatesVersion((current) => current + 1);
    guard(() => {
      goHome();
      setHomeTemplateId(null);
      setTourOpen(true);
    });
  };

  const headerDefinition = working ?? selectedAgent?.definition ?? null;
  const accent = agentAccent(headerDefinition?.color);
  const showWorkbench = view.kind === "draft" || (view.kind === "agent" && view.tab === "configure");

  /** Leaving the editor during the tour: an untouched draft goes quietly, real edits still ask first. */
  const tourGoHome = () => {
    if (view.kind === "home") return;
    if (view.kind === "draft" && definitionsEqual(working, draftOrigin)) goHome();
    else guard(goHome);
  };

  const tourController: OnboardingController = {
    view: view.kind,
    workbenchVisible: showWorkbench,
    selectedTemplateId: homeTemplateId,
    reset: () => {
      tourGoHome();
      setHomeTemplateId(null);
    },
    goHome: tourGoHome,
    selectTemplate: (id) => {
      tourGoHome();
      setHomeTemplateId(id);
    },
    showWorkbench: () => {
      if (view.kind === "agent") {
        setView({ kind: "agent", id: view.id, tab: "configure" });
        return;
      }
      if (view.kind === "draft") return;
      const template = templates.find((item) => item.id === TOUR_TEMPLATE_ID) ?? templates[0];
      if (template) {
        setHomeTemplateId(template.id);
        openTemplate(template);
      } else {
        startDraft({ ...EMPTY_DEFINITION }, "");
      }
    },
  };

  const workbench = showWorkbench && working ? (
    <div className="flex h-full min-h-0">
      <div className="flex w-[46%] min-w-[440px] max-w-[640px] flex-col border-r border-[#1c222b] bg-[#0a0e14]">
        <div data-tour="editor" className="min-h-0 flex-1 overflow-y-auto">
          <AgentEditor
            definition={working}
            onChange={setWorking}
            tools={tools}
            onRefine={refine}
            refining={refining}
            canUndoRefine={Boolean(previousDefinition)}
            onUndoRefine={() => {
              if (previousDefinition) setWorking(previousDefinition);
              setPreviousDefinition(null);
            }}
            releaseNoteFiles={releaseNoteFiles}
            releaseNoteFilesLoading={releaseNoteFilesLoading}
            onReloadReleaseNoteFiles={loadReleaseNoteFiles}
          />
        </div>
        <div data-tour="save-bar" className="flex shrink-0 items-center justify-between gap-2 border-t border-[#1c222b] bg-[#080c12] px-5 py-3">
          <span className="text-xs text-[#8c96a8]">
            {view.kind === "draft" ? t("studio.status.draft") : isDirty ? t("studio.status.unsaved") : t("studio.status.saved")}
          </span>
          <div className="flex items-center gap-2">
            {view.kind === "agent" && isDirty ? (
              <Button variant="outline" size="sm" onClick={discardChanges} disabled={saving}>
                <Undo2 className="h-3.5 w-3.5" /> {t("common.discard")}
              </Button>
            ) : null}
            <Button size="sm" onClick={() => void save()} disabled={saving || (view.kind === "agent" && !isDirty)}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {view.kind === "agent" ? t("studio.saveChanges") : t("studio.saveAgent")}
            </Button>
          </div>
        </div>
      </div>
      <div data-tour="test-bench" className="flex min-w-0 flex-1 flex-col bg-[#06090d]">
        <div className="flex shrink-0 items-center gap-2 border-b border-[#1c222b] px-5 py-2.5">
          <FlaskConical className="h-4 w-4 text-[#f5c400]" />
          <span className="text-sm font-semibold text-white">{t("studio.testBench")}</span>
          <span className="text-xs text-[#687386]">{t("studio.testBenchHint")}</span>
        </div>
        <div className="min-h-0 flex-1">
          <AgentChat
            key={`test-bench-${editSession}`}
            definition={working}
            testMode
            tools={tools}
            contextOptions={contextOptions}
            contextLoading={contextLoading}
            loadContextOptions={loadContextOptions}
          />
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="agent-studio -m-5 flex h-[calc(100vh-69px)] overflow-hidden bg-[#06090d] sm:-m-6">
      <AgentLibrary
        agents={agents}
        loading={agentsLoading}
        selectedId={view.kind === "agent" ? view.id : null}
        homeActive={view.kind === "home"}
        draftActive={view.kind === "draft"}
        onSelect={(agent) => {
          if (view.kind === "agent" && view.id === agent.id) return;
          guard(() => openAgent(agent));
        }}
        onHome={() => guard(goHome)}
        onStartTour={startTour}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {view.kind === "home" ? (
          <StudioHome
            templates={templates}
            tools={tools}
            generating={generating}
            selectedTemplateId={homeTemplateId}
            onSelectTemplate={setHomeTemplateId}
            onGenerate={(prompt, template) => void generate(prompt, template)}
            onUseTemplate={openTemplate}
            onStartBlank={() => startDraft({ ...EMPTY_DEFINITION }, "")}
          />
        ) : (
          <>
            <header
              data-tour="agent-header"
              className="relative flex shrink-0 items-center gap-3 border-b border-[#1c222b] px-5 py-3"
              style={{ background: `linear-gradient(90deg, ${accent}12, transparent 45%)` }}
            >
              <AgentAvatar icon={headerDefinition?.icon} color={headerDefinition?.color} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-semibold text-white">{headerDefinition?.name || t("common.untitledAgent")}</h2>
                  {view.kind === "draft" ? (
                    <span className="rounded-full border border-[#f5c400]/40 bg-[#f5c400]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f5d766]">{t("studio.badge.draft")}</span>
                  ) : isDirty ? (
                    <span className="rounded-full border border-[#303845] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#aeb8c7]">{t("studio.badge.edited")}</span>
                  ) : null}
                </div>
                <p className="truncate text-xs text-[#8c96a8]">
                  {headerDefinition?.description || t("studio.describePlaceholder")}
                  {selectedAgent?.updated_date ? ` · ${t("studio.updated", { time: relativeTime(selectedAgent.updated_date) })}` : ""}
                </p>
              </div>

              {view.kind === "agent" && selectedAgent ? (
                <div className="flex items-center gap-3">
                  <div className="flex rounded-lg border border-[#252a33] bg-[#0b1017] p-0.5">
                    {([
                      ["chat", t("studio.tab.run"), MessagesSquare],
                      ["configure", t("studio.tab.configure"), Settings2],
                    ] as const).map(([tab, label, Icon]) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setView({ kind: "agent", id: selectedAgent.id, tab })}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                          view.tab === tab ? "bg-[#1a222d] text-white" : "text-[#8c96a8] hover:text-white",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" /> {label}
                        {tab === "configure" && isDirty ? <span className="h-1.5 w-1.5 rounded-full bg-[#f5c400]" /> : null}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => void duplicate(selectedAgent)} className="rounded-md p-2 text-[#8c96a8] hover:bg-white/5 hover:text-white" title={t("studio.duplicate")} aria-label={t("studio.duplicate")}>
                    <Copy className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(selectedAgent)} className="rounded-md p-2 text-[#8c96a8] hover:bg-red-500/10 hover:text-red-400" title={t("studio.delete")} aria-label={t("studio.delete")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </header>

            <div className="min-h-0 flex-1">
              {showWorkbench ? (
                workbench
              ) : selectedAgent ? (
                <div className="h-full">
                  {isDirty ? (
                    <div className="border-b border-[#f5c400]/20 bg-[#f5c400]/5 px-5 py-1.5 text-xs text-[#f5d766]">
                      {t("studio.savedVersionNotice")}
                    </div>
                  ) : null}
                  <div className={cn(isDirty ? "h-[calc(100%-29px)]" : "h-full")}>
                    <AgentChat
                      definition={selectedAgent.definition}
                      agent={selectedAgent}
                      tools={tools}
                      contextOptions={contextOptions}
                      contextLoading={contextLoading}
                      loadContextOptions={loadContextOptions}
                      onRunFinished={() => void loadAgents()}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[#8c96a8]">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("studio.loadingAgent")}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <StudioOnboarding open={tourOpen} controller={tourController} tools={tools} onClose={() => setTourOpen(false)} />

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("studio.discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {view.kind === "draft" ? t("studio.discardDraft") : t("studio.discardEdits")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("studio.keepEditing")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = pendingAction;
                setPendingAction(null);
                action?.();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("studio.deleteTitle", { name: deleteTarget?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {plural("studio.deleteDesc", deleteTarget?.conversation_count ?? 0)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t("studio.deleting") : t("studio.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
