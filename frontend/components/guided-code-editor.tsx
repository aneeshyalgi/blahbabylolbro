"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  humanizeIdentifier,
  parseGuidedCode,
  updateGuidedMapping,
  updateGuidedRule,
  type GuidedMappingEntry,
} from "@/lib/guided-code";

type GuidedCodeEditorProps = {
  source: string;
  onChange: (source: string) => void;
  disabled?: boolean;
};

export function GuidedCodeEditor({ source, onChange, disabled = false }: GuidedCodeEditorProps) {
  const document = parseGuidedCode(source);
  const hasGuidedFields = document.mappings.length > 0 || document.rules.length > 0;

  if (!hasGuidedFields) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-md border border-dashed p-8 text-center">
        <div className="max-w-sm">
          <p className="font-medium text-foreground">No guided fields found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This file uses advanced Python that must be edited in Python mode.
          </p>
        </div>
      </div>
    );
  }

  const changeMapping = (
    mappingIndex: number,
    entryIndex: number,
    field: keyof GuidedMappingEntry,
    value: string,
  ) => {
    const mapping = document.mappings[mappingIndex];
    const entries = mapping.entries.map((entry, index) =>
      index === entryIndex ? { ...entry, [field]: value } : entry,
    );
    onChange(updateGuidedMapping(source, mapping, entries));
  };

  return (
    <div className="max-h-[500px] space-y-6 overflow-auto pr-1">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Guided editor</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Edit mappings and formulas below. Advanced Python and comments remain unchanged.
        </p>
      </div>

      {document.mappings.length > 0 && (
        <section className="space-y-4">
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Mappings</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose the value to use when an input matches each category.
            </p>
          </div>
          {document.mappings.map((mapping, mappingIndex) => (
            <div key={mapping.id} className="space-y-3 border-t pt-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm">{humanizeIdentifier(mapping.variable)}</Label>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onChange(
                        updateGuidedMapping(source, mapping, [
                          ...mapping.entries,
                          { key: "New category", value: "0" },
                        ]),
                      )
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] gap-2 text-xs text-muted-foreground">
                <span>When category is</span>
                <span>Use value</span>
                <span />
              </div>
              {mapping.entries.map((entry, entryIndex) => (
                <div key={`${mapping.id}-${entryIndex}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] gap-2">
                  <Input
                    value={entry.key}
                    disabled={disabled}
                    onChange={(event) => changeMapping(mappingIndex, entryIndex, "key", event.target.value)}
                  />
                  <Input
                    value={entry.value}
                    disabled={disabled}
                    onChange={(event) => changeMapping(mappingIndex, entryIndex, "value", event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-8 text-muted-foreground hover:text-destructive"
                    disabled={disabled || mapping.entries.length === 1}
                    onClick={() =>
                      onChange(
                        updateGuidedMapping(
                          source,
                          mapping,
                          mapping.entries.filter((_item, index) => index !== entryIndex),
                        ),
                      )
                    }
                    aria-label="Remove mapping"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {document.rules.length > 0 && (
        <section className="space-y-3">
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Rules and formulas</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Reference a column as [Column Name]. Use * for multiplication and / for division.
            </p>
          </div>
          {document.rules.map((rule) => (
            <div key={rule.id} className="space-y-1.5 border-t pt-3">
              <Label htmlFor={rule.id} className="text-sm">
                {rule.fillMissing ? `Fill missing ${rule.target}` : `Set ${rule.target}`}
              </Label>
              <Input
                id={rule.id}
                value={rule.expression}
                disabled={disabled}
                onChange={(event) => onChange(updateGuidedRule(source, rule, event.target.value))}
              />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}