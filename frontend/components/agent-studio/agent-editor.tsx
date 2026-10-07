"use client";

import { useState, type ReactNode } from "react";
import { Check, FileSpreadsheet, FileText, Loader2, Plus, RefreshCw, Undo2, Wand2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useStudioText } from "./i18n";
import { ProcedureEditor } from "./procedure-editor";
import type { AgentDefinition, SourceFile, ToolInfo } from "./types";
import { AGENT_COLORS, AGENT_ICONS, AgentAvatar, ToolIcon, agentAccent } from "./visuals";
import { VoiceInputButton, appendTranscript } from "./voice-input";

const CATEGORY_ORDER = ["Workspace", "Data", "Analysis", "Code & lineage", "Evidence", "Utilities"];
// Any of these tools reads uploaded regulations, so the agent needs a regulation-source choice.
const REGULATION_TOOLS = new Set(["regulation_outline", "search_regulations", "read_regulation_article", "verify_regulation_quotes"]);

function Section({ title, hint, action, tour, children }: { title: string; hint?: string; action?: ReactNode; tour?: string; children: ReactNode }) {
  return (
    <section data-tour={tour} className="space-y-3 border-b border-[#1c222b] px-5 py-5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#aeb8c7]">{title}</h3>
          {hint ? <p className="mt-1 text-xs leading-5 text-[#687386]">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ListEditor({ values, onChange, placeholder, max }: { values: string[]; onChange: (values: string[]) => void; placeholder: string; max: number }) {
  const { t } = useStudioText();
  const [draft, setDraft] = useState("");
  const add = () => {
    const text = draft.trim();
    if (!text || values.includes(text) || values.length >= max) return;
    onChange([...values, text]);
    setDraft("");
  };
  return (
    <div className="space-y-1.5">
      {values.map((value, index) => (
        <div key={`${index}-${value}`} className="group flex items-start gap-2">
          <Textarea
            value={value}
            onChange={(event) => onChange(values.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
            className="min-h-9 resize-none border-[#252a33] bg-[#0b1017] py-1.5 text-sm"
            rows={1}
          />
          <button
            type="button"
            onClick={() => onChange(values.filter((_item, itemIndex) => itemIndex !== index))}
            className="mt-2 text-[#687386] hover:text-red-400"
            aria-label={t("editor.removeItem")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {values.length < max ? (
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            className="h-9 border-dashed border-[#303845] bg-transparent text-sm"
          />
          <button type="button" onClick={add} disabled={!draft.trim()} className="rounded-md border border-[#303845] p-2 text-[#aeb8c7] hover:text-white disabled:opacity-40" aria-label={t("editor.addItem")}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Which uploaded files (release notes or regulations) an agent's search tools may read. An empty selection
 * means all of them (files uploaded later included), so every file shows as ticked until the user unticks one.
 */
function SourceFilesPicker({
  title,
  hint,
  emptyText,
  tour,
  selected,
  onChange,
  files,
  loading,
  onReload,
  accent,
}: {
  title: string;
  hint: string;
  emptyText: string;
  tour: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  files: SourceFile[];
  loading: boolean;
  onReload: () => void;
  accent: string;
}) {
  const { t, plural, formatDateTime } = useStudioText();
  const known = new Set(files.map((file) => file.id));
  const missing = loading ? [] : selected.filter((id) => !known.has(id));
  const allFiles = selected.length === 0;
  const isChecked = (id: string) => allFiles || selected.includes(id);
  const checkedIds = allFiles ? files.map((file) => file.id) : selected.filter((id) => known.has(id));
  const availableSelected = checkedIds.length;
  // At least one file stays ticked: an agent with the search tool but no files could never find anything.
  const isLastChecked = (id: string) => isChecked(id) && checkedIds.length === 1;
  const toggle = (id: string) => {
    if (isLastChecked(id)) return;
    if (allFiles) {
      onChange(files.map((file) => file.id).filter((item) => item !== id));
      return;
    }
    const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
    // Ticking every file again returns to "all files", which also covers files uploaded later.
    onChange(files.every((file) => next.includes(file.id)) ? [] : next);
  };

  return (
    <Section
      tour={tour}
      title={title}
      hint={hint}
      action={
        <div className="flex items-center gap-3 text-xs">
          {selected.length ? (
            <button type="button" onClick={() => onChange([])} className="text-[#8c96a8] hover:text-white">{t("editor.sourcesUseAll")}</button>
          ) : null}
          <button type="button" onClick={onReload} disabled={loading} className="text-[#8c96a8] hover:text-white disabled:opacity-40" aria-label={t("editor.sourcesRefresh")} title={t("editor.sourcesRefresh")}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      }
    >
      {loading && !files.length ? (
        <p className="flex items-center gap-2 text-xs text-[#8c96a8]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("common.loading")}</p>
      ) : !files.length && !missing.length ? (
        <p className="rounded-lg border border-dashed border-[#303845] px-3 py-3 text-xs leading-5 text-[#8c96a8]">{emptyText}</p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium" style={{ color: allFiles ? "#8c96a8" : accent }}>
            {!allFiles
              ? t("editor.sourcesSome", { count: availableSelected, total: files.length })
              : plural("editor.sourcesAll", files.length)}
          </p>
          {files.map((file) => {
            const checked = isChecked(file.id);
            const locked = isLastChecked(file.id);
            const pdf = file.kind === "pdf";
            const FileIcon = pdf ? FileText : FileSpreadsheet;
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => toggle(file.id)}
                aria-pressed={checked}
                aria-disabled={locked}
                title={locked ? t("editor.sourcesKeepOne") : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                  checked ? "bg-white/[0.04]" : "border-[#252a33] hover:border-[#303845]",
                  locked && "cursor-not-allowed",
                )}
                style={checked ? { borderColor: `${accent}55` } : undefined}
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                  style={checked ? { backgroundColor: accent, borderColor: accent } : { borderColor: "#3a4352" }}
                >
                  {checked ? <Check className="h-3 w-3 text-black" /> : null}
                </span>
                <FileIcon className="h-4 w-4 shrink-0 text-[#8c96a8]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-[#e5e9ef]">{file.filename}</span>
                  <span className="block text-[11px] text-[#687386]">
                    {pdf ? t("editor.sourcesPages", { count: file.page_count ?? 0 }) : t("editor.sourcesSheets", { count: file.sheets?.length ?? 0 })}
                    {" · "}
                    {formatDateTime(file.upload_date)}
                  </span>
                </span>
              </button>
            );
          })}
          {missing.map((id) => (
            <div key={id} className="flex items-center gap-2.5 rounded-lg border border-red-500/30 bg-red-500/5 p-2.5">
              <span className="min-w-0 flex-1 text-xs text-red-300">{t("editor.sourcesMissing")}</span>
              <button type="button" onClick={() => onChange(selected.filter((item) => item !== id))} className="text-[#8c96a8] hover:text-red-400" aria-label={t("editor.removeItem")}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export function AgentEditor({
  definition,
  onChange,
  tools,
  onRefine,
  refining,
  canUndoRefine,
  onUndoRefine,
  releaseNoteFiles,
  releaseNoteFilesLoading,
  onReloadReleaseNoteFiles,
  regulationFiles,
  regulationFilesLoading,
  onReloadRegulationFiles,
}: {
  definition: AgentDefinition;
  onChange: (definition: AgentDefinition) => void;
  tools: ToolInfo[];
  onRefine: (instruction: string) => Promise<boolean>;
  refining: boolean;
  canUndoRefine: boolean;
  onUndoRefine: () => void;
  releaseNoteFiles: SourceFile[];
  releaseNoteFilesLoading: boolean;
  onReloadReleaseNoteFiles: () => void;
  regulationFiles: SourceFile[];
  regulationFilesLoading: boolean;
  onReloadRegulationFiles: () => void;
}) {
  const { t, toolLabel, toolDescription, category: categoryLabel } = useStudioText();
  const [refineText, setRefineText] = useState("");
  const accent = agentAccent(definition.color);
  const set = <K extends keyof AgentDefinition>(key: K, value: AgentDefinition[K]) => onChange({ ...definition, [key]: value });
  const toggleTool = (name: string) =>
    set("tools", definition.tools.includes(name) ? definition.tools.filter((item) => item !== name) : [...definition.tools, name]);

  const categories = CATEGORY_ORDER.filter((category) => tools.some((tool) => tool.category === category)).concat(
    Array.from(new Set(tools.map((tool) => tool.category))).filter((category) => !CATEGORY_ORDER.includes(category)),
  );

  const submitRefine = async () => {
    if (!refineText.trim() || refining) return;
    if (await onRefine(refineText.trim())) setRefineText("");
  };

  return (
    <div>
      <Section title={t("editor.identity")}>
        <div className="flex items-start gap-4">
          <AgentAvatar icon={definition.icon} color={definition.color} size="lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Input
              value={definition.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder={t("editor.namePlaceholder")}
              maxLength={80}
              className="h-10 border-[#252a33] bg-[#0b1017] text-base font-semibold"
            />
            <Input
              value={definition.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder={t("editor.descriptionPlaceholder")}
              maxLength={280}
              className="border-[#252a33] bg-[#0b1017] text-sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <div className="flex flex-wrap gap-1">
            {Object.entries(AGENT_ICONS).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => set("icon", key)}
                className={cn("flex h-7 w-7 items-center justify-center rounded-md border transition-colors", definition.icon === key ? "text-black" : "border-[#252a33] text-[#8c96a8] hover:text-white")}
                style={definition.icon === key ? { backgroundColor: accent, borderColor: accent } : undefined}
                aria-label={t("editor.icon", { name: key })}
                aria-pressed={definition.icon === key}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {Object.entries(AGENT_COLORS).map(([key, hex]) => (
              <button
                key={key}
                type="button"
                onClick={() => set("color", key)}
                className={cn("h-5 w-5 rounded-full border-2 transition-transform hover:scale-110", definition.color === key ? "border-white" : "border-transparent")}
                style={{ backgroundColor: hex }}
                aria-label={t("editor.color", { name: key })}
                aria-pressed={definition.color === key}
              />
            ))}
          </div>
        </div>
      </Section>

      <Section
        tour="refine"
        title={t("editor.refineTitle")}
        hint={t("editor.refineHint")}
        action={canUndoRefine ? (
          <button type="button" onClick={onUndoRefine} className="inline-flex items-center gap-1 text-xs text-[#8c96a8] hover:text-white">
            <Undo2 className="h-3.5 w-3.5" /> {t("editor.undo")}
          </button>
        ) : null}
      >
        <div className="flex items-center gap-2 rounded-lg border border-[#303845] bg-[#0b1017] p-1.5 focus-within:border-[#f5c400]/50">
          <Wand2 className="ml-1.5 h-4 w-4 shrink-0 text-[#f5c400]" />
          <input
            value={refineText}
            onChange={(event) => setRefineText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitRefine();
              }
            }}
            placeholder={t("editor.refinePlaceholder")}
            className="min-w-0 flex-1 bg-transparent px-1 text-sm text-[#e5e9ef] outline-none placeholder:text-[#687386]"
            disabled={refining}
          />
          <VoiceInputButton
            disabled={refining}
            className="h-7 w-7"
            onTranscript={(text) => setRefineText((current) => appendTranscript(current, text))}
          />
          <button
            type="button"
            onClick={() => void submitRefine()}
            disabled={!refineText.trim() || refining}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#f5c400] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
          >
            {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {refining ? t("editor.rewriting") : t("editor.apply")}
          </button>
        </div>
      </Section>

      <Section tour="procedure" title={t("editor.instructions")} hint={t("editor.instructionsHint")}>
        <label className="block space-y-1.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-[#e5e9ef]">{t("editor.purpose")}</span>
            <span className="text-[10.5px] text-[#687386]">{t("editor.purposeHint")}</span>
          </span>
          <Textarea
            value={definition.purpose}
            onChange={(event) => set("purpose", event.target.value)}
            placeholder={t("editor.purposePlaceholder")}
            maxLength={1000}
            rows={2}
            className="min-h-10 resize-none border-[#252a33] bg-[#0b1017] text-sm leading-6"
          />
        </label>
        <ProcedureEditor
          value={definition.instructions}
          onChange={(value) => set("instructions", value)}
          tools={tools.filter((tool) => definition.tools.includes(tool.name))}
          accent={accent}
        />
      </Section>

      <Section
        tour="tools"
        title={t("editor.tools", { count: definition.tools.length, total: tools.length })}
        hint={t("editor.toolsHint")}
        action={
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={() => set("tools", tools.map((tool) => tool.name))} className="text-[#8c96a8] hover:text-white">{t("editor.all")}</button>
            <button type="button" onClick={() => set("tools", [])} className="text-[#8c96a8] hover:text-white">{t("editor.none")}</button>
          </div>
        }
      >
        <div className="space-y-4">
          {categories.map((category) => (
            <div key={category}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#687386]">{categoryLabel(category)}</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {tools.filter((tool) => tool.category === category).map((tool) => {
                  const enabled = definition.tools.includes(tool.name);
                  return (
                    <button
                      key={tool.name}
                      type="button"
                      onClick={() => toggleTool(tool.name)}
                      aria-pressed={enabled}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                        enabled ? "bg-white/[0.04]" : "border-[#252a33] bg-transparent opacity-60 hover:opacity-100",
                      )}
                      style={enabled ? { borderColor: `${accent}55` } : undefined}
                    >
                      <span
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
                        style={enabled ? { color: accent, borderColor: `${accent}55`, backgroundColor: `${accent}14` } : { color: "#8c96a8", borderColor: "#303845" }}
                      >
                        <ToolIcon icon={tool.icon} className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#e5e9ef]">{toolLabel(tool)}</span>
                          {enabled ? <Check className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} /> : null}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-[#8c96a8]">{toolDescription(tool)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {definition.tools.includes("search_release_notes") ? (
        <SourceFilesPicker
          tour="sources"
          title={t("editor.sources")}
          hint={t("editor.sourcesHint")}
          emptyText={t("editor.sourcesEmpty")}
          selected={definition.release_note_sources ?? []}
          onChange={(ids) => set("release_note_sources", ids)}
          files={releaseNoteFiles}
          loading={releaseNoteFilesLoading}
          onReload={onReloadReleaseNoteFiles}
          accent={accent}
        />
      ) : null}

      {definition.tools.some((name) => REGULATION_TOOLS.has(name)) ? (
        <SourceFilesPicker
          tour="regulation-sources"
          title={t("editor.regulationSources")}
          hint={t("editor.regulationSourcesHint")}
          emptyText={t("editor.regulationSourcesEmpty")}
          selected={definition.regulation_sources ?? []}
          onChange={(ids) => set("regulation_sources", ids)}
          files={regulationFiles}
          loading={regulationFilesLoading}
          onReload={onReloadRegulationFiles}
          accent={accent}
        />
      ) : null}

      <Section title={t("editor.starters")} hint={t("editor.startersHint")}>
        <ListEditor values={definition.starters} onChange={(values) => set("starters", values)} placeholder={t("editor.startersAdd")} max={6} />
      </Section>

      <Section title={t("editor.guardrails")} hint={t("editor.guardrailsHint")}>
        <ListEditor values={definition.guardrails} onChange={(values) => set("guardrails", values)} placeholder={t("editor.guardrailsAdd")} max={12} />
      </Section>

      <Section title={t("editor.answerFormat")}>
        <Textarea
          value={definition.output_format}
          onChange={(event) => set("output_format", event.target.value)}
          placeholder={t("editor.answerFormatPlaceholder")}
          maxLength={600}
          className="min-h-14 resize-y border-[#252a33] bg-[#0b1017] text-sm"
        />
      </Section>

      <Section title={t("editor.advanced")}>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="flex justify-between text-xs text-[#aeb8c7]">
              <span>{t("editor.maxSteps")}</span>
              <span className="tabular-nums text-white">{definition.max_steps}</span>
            </span>
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              value={definition.max_steps}
              onChange={(event) => set("max_steps", Number(event.target.value))}
              className="w-full"
              style={{ accentColor: accent }}
            />
            <span className="block text-[10.5px] text-[#687386]">{t("editor.maxStepsHint")}</span>
          </label>
          <label className="space-y-2">
            <span className="flex justify-between text-xs text-[#aeb8c7]">
              <span>{t("editor.temperature")}</span>
              <span className="tabular-nums text-white">{definition.temperature.toFixed(2)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={definition.temperature}
              onChange={(event) => set("temperature", Number(event.target.value))}
              className="w-full"
              style={{ accentColor: accent }}
            />
            <span className="flex justify-between text-[10.5px] text-[#687386]"><span>{t("editor.precise")}</span><span>{t("editor.creative")}</span></span>
          </label>
        </div>
      </Section>
    </div>
  );
}
