"use client";

import { memo, useMemo, useRef, type KeyboardEvent } from "react";
import { PythonLine } from "@/components/lineage-agent/atoms";
import { cn } from "@/lib/utils";

const INDENT = "    ";
// The coloured text and the textarea over it must share exactly these metrics.
const TEXT = "font-mono text-[12.5px] leading-[21px]";

const CodeLine = memo(function CodeLine({ code, columns, error }: { code: string; columns?: Set<string>; error: boolean }) {
  return (
    <div className={cn(error && "-mx-4 bg-rose-500/[0.12] px-4 shadow-[inset_2px_0_0_rgb(251,113,133)]")}>
      {code ? <PythonLine code={code} columns={columns} /> : "​"}
    </div>
  );
});

/**
 * Python source with line numbers and the syntax colours of the Technical Lineage script view. When editable, a
 * transparent textarea lies exactly over the coloured text, so typing, selection, copy and undo are the browser's own.
 * Tab indents (Shift+Tab outdents, also several selected lines), Enter keeps the indentation (one level more after a
 * colon), Ctrl/Cmd+S saves and Esc leaves the editor so the keyboard can move on.
 */
export function CodeEditor({ value, onChange, readOnly = false, errorLine, onSave, label, maxHeight = "560px", columns }: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  /** A line to mark, e.g. where the server found a syntax error (1-based). */
  errorLine?: number | null;
  onSave?: () => void;
  /** The accessible name of the editor. */
  label: string;
  maxHeight?: string;
  /** Dataset columns, coloured where the code names them. */
  columns?: Set<string>;
}) {
  const lines = useMemo(() => value.split("\n"), [value]);
  const area = useRef<HTMLTextAreaElement | null>(null);

  /** Replaces [start, end) with text through the browser, so Ctrl+Z still undoes it, then selects [from, to). */
  const replace = (start: number, end: number, text: string, from: number, to: number) => {
    const element = area.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(start, end);
    const inserted = typeof document.execCommand === "function" && document.execCommand("insertText", false, text);
    if (!inserted) onChange?.(value.slice(0, start) + text + value.slice(end));
    window.requestAnimationFrame(() => area.current?.setSelectionRange(from, to));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const { selectionStart: start, selectionEnd: end } = event.currentTarget;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      onSave?.();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      if (!event.shiftKey && !value.slice(start, end).includes("\n")) {
        replace(start, end, INDENT, start + INDENT.length, start + INDENT.length);
        return;
      }
      // A selection that ends right after a line break does not include the next line.
      const last = end > start && value[end - 1] === "\n" ? end - 1 : end;
      const lineEnd = value.indexOf("\n", last);
      const blockEnd = lineEnd === -1 ? value.length : lineEnd;
      const block = value.slice(lineStart, blockEnd);
      const changed = block
        .split("\n")
        .map((line) => (event.shiftKey ? line.replace(/^( {1,4}|\t)/, "") : INDENT + line))
        .join("\n");
      if (changed !== block) replace(lineStart, blockEnd, changed, lineStart, lineStart + changed.length);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const before = value.slice(lineStart, start);
      const indent = before.match(/^[ \t]*/)?.[0] ?? "";
      const text = `\n${indent}${/:\s*(#.*)?$/.test(before) ? INDENT : ""}`;
      replace(start, end, text, start + text.length, start + text.length);
    }
  };

  return (
    <div className="overflow-auto rounded-lg border border-[#1f252e] bg-[#080b10]" style={{ maxHeight }}>
      <div className="flex w-max min-w-full">
        <div aria-hidden="true" className={cn("sticky left-0 z-[2] select-none border-r border-[#151b23] bg-[#080b10] py-3 pl-3 pr-3 text-right tabular-nums text-[#3f4957]", TEXT)}>
          {lines.map((_, index) => (
            <div key={index} className={cn(errorLine === index + 1 && "font-semibold text-rose-400")}>{index + 1}</div>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <pre aria-hidden={readOnly ? undefined : true} aria-label={readOnly ? label : undefined} className={cn("m-0 whitespace-pre py-3 pl-4 pr-10 text-[#d6deeb]", TEXT)}>
            {lines.map((line, index) => (
              <CodeLine key={index} code={line} columns={columns} error={errorLine === index + 1} />
            ))}
          </pre>
          {readOnly ? null : (
            <textarea
              ref={area}
              aria-label={label}
              value={value}
              onChange={(event) => onChange?.(event.target.value)}
              onKeyDown={onKeyDown}
              onScroll={(event) => {
                // The outer box scrolls; the textarea always shows its whole text.
                event.currentTarget.scrollTop = 0;
                event.currentTarget.scrollLeft = 0;
              }}
              wrap="off"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              data-gramm="false"
              className={cn(
                "absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre border-0 bg-transparent py-3 pl-4 pr-10 text-transparent caret-[#f5c400] outline-none selection:bg-[#f5c400]/25 selection:text-transparent",
                TEXT,
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
