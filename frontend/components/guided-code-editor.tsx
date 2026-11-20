"use client";

import { useTranslations } from "next-intl";
import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  humanizeIdentifier,
  parseGuidedCode,
  updateGuidedMapping,
  updateGuidedRule,
  type GuidedMappingEntry,
} from "@/lib/guided-code";
import { EYEBROW } from "@/components/workspace/ui";

type GuidedCodeEditorProps = {
  source: string;
  onChange: (source: string) => void;
  disabled?: boolean;
};

// Read-only fields read as plain values; editable ones as inputs.
const FIELD =
  "h-9 w-full min-w-0 rounded-md border border-[#252a33] bg-[#0f141b] px-3 font-mono text-[12.5px] text-white outline-none transition-colors focus:border-[#f5c400]/50 disabled:cursor-default disabled:border-[#1a2029] disabled:bg-[#0c1016] disabled:text-[#c9d1dc] disabled:opacity-100";

/** Business view of a code file: its lookup tables (category → value) and formulas, edited without touching Python. */
export function GuidedCodeEditor({ source, onChange, disabled = false }: GuidedCodeEditorProps) {
  const t = useTranslations("codeTab");
  const document = parseGuidedCode(source);
  const hasGuidedFields = document.mappings.length > 0 || document.rules.length > 0;

  if (!hasGuidedFields) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-[#2a313c] p-8 text-center">
        <div className="max-w-sm">
          <SlidersHorizontal className="mx-auto h-5 w-5 text-[#687386]" />
          <p className="mt-3 text-[14px] font-semibold text-white">{t("guidedEmptyTitle")}</p>
          <p className="mt-1 text-[12.5px] leading-5 text-[#8c96a8]">{t("guidedEmptyHint")}</p>
        </div>
      </div>
    );
  }

  const changeMapping = (mappingIndex: number, entryIndex: number, field: keyof GuidedMappingEntry, value: string) => {
    const mapping = document.mappings[mappingIndex];
    const entries = mapping.entries.map((entry, index) => (index === entryIndex ? { ...entry, [field]: value } : entry));
    onChange(updateGuidedMapping(source, mapping, entries));
  };

  return (
    <div className="max-h-[600px] space-y-6 overflow-auto pr-1">
      {document.mappings.length > 0 && (
        <section className="space-y-3">
          <div>
            <h4 className={EYEBROW}>{t("guidedMappings")}</h4>
            <p className="mt-1 text-[12px] text-[#8c96a8]">{t("guidedMappingsHint")}</p>
          </div>
          <div className="grid gap-3 2xl:grid-cols-2">
            {document.mappings.map((mapping, mappingIndex) => (
              <div key={mapping.id} className="rounded-lg border border-[#1f252e] bg-[#0d1218] p-3.5">
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-white">{humanizeIdentifier(mapping.variable)}</p>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => onChange(updateGuidedMapping(source, mapping, [...mapping.entries, { key: t("guidedNewCategory"), value: "0" }]))}
                      className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-[#f5c400] transition-colors hover:bg-[#f5c400]/10"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t("guidedAdd")}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] gap-2 pb-1.5 text-[11px] text-[#687386]">
                  <span>{t("guidedWhen")}</span>
                  <span>{t("guidedUse")}</span>
                  <span />
                </div>
                <div className="space-y-1.5">
                  {mapping.entries.map((entry, entryIndex) => (
                    <div key={`${mapping.id}-${entryIndex}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] items-center gap-2">
                      <input className={FIELD} value={entry.key} disabled={disabled} aria-label={t("guidedWhen")} onChange={(event) => changeMapping(mappingIndex, entryIndex, "key", event.target.value)} />
                      <input className={FIELD} value={entry.value} disabled={disabled} aria-label={t("guidedUse")} onChange={(event) => changeMapping(mappingIndex, entryIndex, "value", event.target.value)} />
                      <button
                        type="button"
                        className={cn("flex h-8 w-8 items-center justify-center rounded-md text-[#687386] transition-colors hover:bg-rose-400/10 hover:text-rose-300 disabled:pointer-events-none disabled:opacity-30", disabled && "invisible")}
                        disabled={disabled || mapping.entries.length === 1}
                        onClick={() => onChange(updateGuidedMapping(source, mapping, mapping.entries.filter((_item, index) => index !== entryIndex)))}
                        aria-label={t("guidedRemove")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {document.rules.length > 0 && (
        <section className="space-y-3">
          <div>
            <h4 className={EYEBROW}>{t("guidedRules")}</h4>
            <p className="mt-1 text-[12px] text-[#8c96a8]">{t("guidedRulesHint")}</p>
          </div>
          <div className="space-y-2">
            {document.rules.map((rule) => (
              <div key={rule.id} className="rounded-lg border border-[#1f252e] bg-[#0d1218] p-3.5">
                <label htmlFor={rule.id} className="mb-1.5 block text-[12.5px] font-semibold text-white">
                  {rule.fillMissing ? t("guidedFillMissing", { target: rule.target }) : t("guidedSet", { target: rule.target })}
                </label>
                <input id={rule.id} className={FIELD} value={rule.expression} disabled={disabled} onChange={(event) => onChange(updateGuidedRule(source, rule, event.target.value))} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
