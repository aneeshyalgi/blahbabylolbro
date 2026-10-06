"use client";

import { KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, History, Loader2, MessageSquarePlus, PanelLeftClose, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS } from "@/lib/api-config";
import { cn } from "@/lib/utils";
import { requestJson, streamAgentRun, type RunRequest } from "./api";
import { AgentMessage, ContextChipView } from "./agent-message";
import { ContextPicker } from "./context-picker";
import { useStudioText } from "./i18n";
import type {
  AgentDefinition,
  ChatMessage,
  ContextChip,
  ContextOptions,
  Conversation,
  ConversationSummary,
  RunEvent,
  SavedAgent,
  ToolInfo,
} from "./types";
import { AgentAvatar, ToolIcon, accentStyles } from "./visuals";

type AgentChatProps = {
  definition: AgentDefinition;
  /** Saved agent: runs are persisted to its history. Without it (or in test mode) the definition is sent inline. */
  agent?: SavedAgent | null;
  testMode?: boolean;
  tools: ToolInfo[];
  contextOptions: ContextOptions | null;
  contextLoading: boolean;
  loadContextOptions: () => void;
  onRunFinished?: () => void;
};

export function AgentChat({
  definition,
  agent,
  testMode = false,
  tools,
  contextOptions,
  contextLoading,
  loadContextOptions,
  onRunFinished,
}: AgentChatProps) {
  const { toast } = useToast();
  const { t, plural, locale, relativeTime, toolLabel } = useStudioText();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [input, setInput] = useState("");
  const [pinned, setPinned] = useState<ContextChip[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const persistent = Boolean(agent) && !testMode;
  const agentId = agent?.id ?? null;
  const toolsByName = useMemo(() => new Map(tools.map((tool) => [tool.name, tool])), [tools]);

  const refreshConversations = useCallback(async () => {
    if (!persistent || !agentId) return;
    try {
      const payload = await requestJson<{ conversations: ConversationSummary[] }>(API_ENDPOINTS.agentConversations(agentId));
      setConversations(payload.conversations);
    } catch {
      setConversations([]);
    }
  }, [persistent, agentId]);

  const resetChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setPinned([]);
    setInput("");
  }, []);

  useEffect(() => {
    resetChat();
    void refreshConversations();
  }, [agentId, testMode, resetChat, refreshConversations]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 140;
  };

  const updateAssistant = (update: (message: ChatMessage) => ChatMessage) => {
    setMessages((current) => current.map((message) => (message.id === assistantIdRef.current ? update(message) : message)));
  };

  const handleEvent = (event: RunEvent, localUserId: string) => {
    switch (event.type) {
      case "start": {
        setConversationId(event.conversation_id);
        const previousAssistantId = assistantIdRef.current;
        assistantIdRef.current = event.assistant_message_id;
        setMessages((current) =>
          current.map((message) =>
            message.id === localUserId
              ? event.user_message
              : message.id === previousAssistantId
                ? { ...message, id: event.assistant_message_id }
                : message,
          ),
        );
        break;
      }
      case "token":
        updateAssistant((message) => ({ ...message, content: message.content + event.text }));
        break;
      case "step_start":
        updateAssistant((message) => {
          const timeline = [...(message.timeline || [])];
          if (message.content.trim()) timeline.push({ kind: "note", text: message.content.trim() });
          timeline.push(event.step);
          return { ...message, content: "", timeline };
        });
        break;
      case "step_end":
        updateAssistant((message) => ({
          ...message,
          timeline: (message.timeline || []).map((item) => (item.kind === "tool" && item.id === event.step.id ? event.step : item)),
        }));
        break;
      case "done":
        updateAssistant(() => event.message);
        break;
    }
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || running) return;
    if (!definition.name.trim() || !definition.instructions.trim()) {
      toast({ title: t("chat.needNameInstructions"), variant: "destructive" });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const stamp = Date.now();
    const localUserId = `local-user-${stamp}`;
    assistantIdRef.current = `local-assistant-${stamp}`;
    stickToBottom.current = true;
    setMessages((current) => [
      ...current,
      { id: localUserId, role: "user", content: message, context: pinned },
      { id: assistantIdRef.current as string, role: "assistant", content: "", timeline: [], status: "running" },
    ]);
    setInput("");
    setRunning(true);

    const payload: RunRequest = {
      message,
      language: locale,
      conversation_id: conversationId,
      context: {
        cluster_ids: pinned.filter((chip) => chip.type === "cluster").map((chip) => chip.id),
        execution_ids: pinned.filter((chip) => chip.type === "execution").map((chip) => chip.id),
        dataset_ids: pinned.filter((chip) => chip.type === "dataset").map((chip) => chip.id),
      },
    };
    if (persistent && agentId) payload.agent_id = agentId;
    else payload.definition = definition;

    let finished = false;
    try {
      await streamAgentRun(
        payload,
        (event) => {
          if (event.type === "done") finished = true;
          handleEvent(event, localUserId);
        },
        controller.signal,
      );
      if (!finished) updateAssistant((current) => ({ ...current, status: "stopped" }));
    } catch (error) {
      const aborted = controller.signal.aborted;
      updateAssistant((current) => ({
        ...current,
        status: aborted ? "stopped" : "error",
        error: aborted ? undefined : error instanceof Error ? error.message : t("chat.runFailed"),
        timeline: (current.timeline || []).map((item) =>
          item.kind === "tool" && item.status === "running" ? { ...item, status: "error", summary: t("chat.stopped") } : item,
        ),
      }));
    } finally {
      setRunning(false);
      abortRef.current = null;
      onRunFinished?.();
      void refreshConversations();
    }
  };

  const openConversation = async (id: string) => {
    if (running || id === conversationId) return;
    setLoadingConversation(true);
    try {
      const conversation = await requestJson<Conversation>(API_ENDPOINTS.agentConversation(id));
      setMessages(conversation.messages);
      setConversationId(conversation.id);
      const lastUser = [...conversation.messages].reverse().find((message) => message.role === "user");
      setPinned(lastUser?.context ?? []);
      stickToBottom.current = true;
    } catch (error) {
      toast({ title: t("chat.openFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoadingConversation(false);
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      await requestJson(API_ENDPOINTS.agentConversation(id), { method: "DELETE" });
      if (id === conversationId) resetChat();
      void refreshConversations();
      onRunFinished?.();
    } catch (error) {
      toast({ title: t("chat.deleteFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(input);
    }
  };

  const enabledTools = definition.tools.map((name) => toolsByName.get(name)).filter(Boolean) as ToolInfo[];
  const starters = definition.starters.length ? definition.starters : [t("chat.starter1"), t("chat.starter2")];

  return (
    <div className="flex h-full min-h-0">
      {persistent && historyOpen ? (
        <aside className="flex w-60 shrink-0 flex-col border-r border-[#1c222b] bg-[#080c12]">
          <div className="flex items-center justify-between px-3 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">{t("chat.conversations")}</span>
            <button type="button" onClick={() => setHistoryOpen(false)} className="text-[#687386] hover:text-white" aria-label={t("chat.hideConversations")}>
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          <div className="px-2">
            <button
              type="button"
              onClick={resetChat}
              disabled={running}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-[#303845] px-2.5 py-2 text-xs text-[#aeb8c7] hover:border-[#f5c400]/50 hover:text-white disabled:opacity-50"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> {t("chat.newConversation")}
            </button>
          </div>
          <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {conversations.length === 0 ? (
              <p className="px-2 py-4 text-xs text-[#687386]">{t("chat.emptyHistory")}</p>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={cn(
                    "group flex items-start gap-1 rounded-md px-2 py-2 text-left",
                    conversation.id === conversationId ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
                  )}
                >
                  <button type="button" onClick={() => void openConversation(conversation.id)} className="min-w-0 flex-1 text-left" disabled={running}>
                    <span className="block truncate text-xs text-[#e5e9ef]">{conversation.title}</span>
                    <span className="block text-[10.5px] text-[#687386]">
                      {plural("chat.turns", Math.ceil(conversation.message_count / 2), { time: relativeTime(conversation.updated_date) })}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteConversation(conversation.id)}
                    className="mt-0.5 text-[#687386] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    aria-label={t("chat.deleteConversation")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {persistent && !historyOpen ? (
          <div className="flex items-center gap-2 px-4 pt-3">
            <button type="button" onClick={() => setHistoryOpen(true)} className="inline-flex items-center gap-1.5 text-xs text-[#8c96a8] hover:text-white">
              <History className="h-3.5 w-3.5" /> {t("chat.history")}
            </button>
            <button type="button" onClick={resetChat} disabled={running} className="inline-flex items-center gap-1.5 text-xs text-[#8c96a8] hover:text-white disabled:opacity-50">
              <MessageSquarePlus className="h-3.5 w-3.5" /> {t("chat.new")}
            </button>
          </div>
        ) : null}
        {!persistent && messages.length ? (
          <div className="flex items-center justify-between px-5 pt-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#687386]">{t("chat.testNotSaved")}</span>
            <button type="button" onClick={resetChat} disabled={running} className="inline-flex items-center gap-1.5 text-xs text-[#8c96a8] hover:text-white disabled:opacity-50">
              <MessageSquarePlus className="h-3.5 w-3.5" /> {t("chat.reset")}
            </button>
          </div>
        ) : null}

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          {loadingConversation ? (
            <div className="flex h-full items-center justify-center text-sm text-[#8c96a8]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("chat.loadingConversation")}
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-6 py-10 text-center">
              <AgentAvatar icon={definition.icon} color={definition.color} size="xl" />
              <h3 className="mt-4 text-xl font-semibold text-white">{definition.name || t("common.untitledAgent")}</h3>
              {definition.description ? <p className="mt-1.5 max-w-md text-sm leading-6 text-[#aeb8c7]">{definition.description}</p> : null}
              {enabledTools.length ? (
                <div className="mt-4 flex max-w-lg flex-wrap justify-center gap-1.5">
                  {enabledTools.map((tool) => (
                    <span key={tool.name} className="inline-flex items-center gap-1 rounded-full border border-[#252a33] bg-[#0d131b] px-2 py-0.5 text-[11px] text-[#8c96a8]">
                      <ToolIcon icon={tool.icon} className="h-3 w-3" /> {toolLabel(tool)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-xs text-amber-300">{t("chat.noTools")}</p>
              )}
              <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
                {starters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void send(starter)}
                    className="rounded-lg border border-[#252a33] bg-[#0d131b] px-3.5 py-3 text-left text-sm leading-5 text-[#c2cad5] transition-all hover:-translate-y-0.5 hover:border-[#f5c400]/40 hover:bg-[#111820] hover:text-white"
                  >
                    {starter}
                  </button>
                ))}
              </div>
              <p className="mt-6 text-xs text-[#687386]">{t("chat.tip")}</p>
            </div>
          ) : (
            <div data-tour="messages" className="mx-auto max-w-3xl space-y-7 px-5 py-6">
              {messages.map((message) => (
                <AgentMessage
                  key={message.id}
                  message={message}
                  agentName={definition.name || t("common.agent")}
                  agentIcon={definition.icon}
                  agentColor={definition.color}
                  toolsByName={toolsByName}
                />
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-[#1c222b] bg-[#080c12]/80 px-5 pb-4 pt-3 pr-20 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            {pinned.length ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {pinned.map((chip) => (
                  <ContextChipView key={`${chip.type}-${chip.id}`} chip={chip} onRemove={running ? undefined : () => setPinned((current) => current.filter((item) => item !== chip))} />
                ))}
              </div>
            ) : null}
            <div data-tour="composer" className="rounded-xl border border-[#303845] bg-[#0d131b] p-2 transition-colors focus-within:border-[#f5c400]/50">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t("chat.placeholder", { name: definition.name || t("chat.theAgent") })}
                className="max-h-40 min-h-11 resize-none border-0 bg-transparent px-2 py-1.5 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
                maxLength={8000}
                aria-label={t("chat.messageLabel")}
              />
              <div className="mt-1 flex items-center justify-between gap-2 px-1">
                <span data-tour="pin-context" className="inline-flex">
                  <ContextPicker
                    options={contextOptions}
                    loading={contextLoading}
                    selected={pinned}
                    onOpen={loadContextOptions}
                    onChange={setPinned}
                    disabled={running}
                  />
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] text-[#687386]">{t("chat.sendHint")}</span>
                  {running ? (
                    <Button type="button" size="icon-sm" variant="outline" onClick={() => abortRef.current?.abort()} aria-label={t("chat.stop")}>
                      <Square className="h-3.5 w-3.5 fill-current" />
                    </Button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void send(input)}
                      disabled={!input.trim()}
                      className="flex h-8 w-8 items-center justify-center rounded-md border transition-opacity disabled:opacity-40"
                      style={accentStyles(definition.color, "strong")}
                      aria-label={t("chat.send")}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
