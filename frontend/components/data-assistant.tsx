"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "What would you like to know about your DataFlow workspace?",
};

export function DataAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || loading) return;

    const history = messages.filter((message) => message !== INITIAL_MESSAGE);
    setMessages((current) => [...current, { role: "user", content: question }]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(API_ENDPOINTS.chat, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || "The assistant could not answer.");
      }
      setMessages((current) => [
        ...current,
        { role: "assistant", content: payload.answer || "No answer was returned." },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The assistant could not answer.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <section
          className="flex h-[min(520px,calc(100vh-96px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border bg-background shadow-2xl"
          aria-label="Data assistant"
        >
          <header className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#FFD700] text-black shadow-md">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Data assistant</h2>
                <p className="text-xs text-muted-foreground">Workspace context</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close data assistant">
              <X className="h-4 w-4" />
            </Button>
          </header>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 p-4">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[85%] rounded-md bg-[#FFD700] text-black px-3 py-2 text-sm font-semibold shadow-md"
                        : "max-w-[90%] text-sm leading-6 text-foreground"
                    }
                  >
                    {message.role === "assistant" ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ node: _node, ...props }) => <h1 className="mb-2 text-base font-semibold" {...props} />,
                          h2: ({ node: _node, ...props }) => <h2 className="mb-2 text-sm font-semibold" {...props} />,
                          h3: ({ node: _node, ...props }) => <h3 className="mb-1 text-sm font-semibold" {...props} />,
                          p: ({ node: _node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                          strong: ({ node: _node, ...props }) => <strong className="font-semibold" {...props} />,
                          ul: ({ node: _node, ...props }) => <ul className="my-2 list-disc space-y-1 pl-5" {...props} />,
                          ol: ({ node: _node, ...props }) => <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />,
                          pre: ({ node: _node, ...props }) => <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-xs" {...props} />,
                          code: ({ node: _node, ...props }) => <code className="font-mono text-xs" {...props} />,
                          table: ({ node: _node, ...props }) => <table className="my-2 w-full border-collapse text-xs" {...props} />,
                          th: ({ node: _node, ...props }) => <th className="border px-2 py-1 text-left font-semibold" {...props} />,
                          td: ({ node: _node, ...props }) => <td className="border px-2 py-1 align-top" {...props} />,
                          a: ({ node: _node, ...props }) => <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    ) : (
                      message.content
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          <form onSubmit={handleSubmit} className="border-t bg-background p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your data"
                className="max-h-28 min-h-10 resize-none"
                disabled={loading}
                aria-label="Message"
              />
              <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!input.trim() || loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="sr-only">Send</span>
              </Button>
            </div>
          </form>
        </section>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              className="h-12 w-12 rounded-full shadow-lg"
              aria-label={open ? "Close data assistant" : "Open data assistant"}
              aria-expanded={open}
              onClick={() => setOpen((current) => !current)}
            >
              {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{open ? "Close assistant" : "Data assistant"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}