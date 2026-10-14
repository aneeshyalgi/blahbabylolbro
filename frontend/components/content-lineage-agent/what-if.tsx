"use client";

import { useTranslations } from "next-intl";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNumbers } from "./atoms";
import type { Model } from "./model";
import type { WhatIf } from "./types";

/** One what-if of the impact test: the record with another value of the selected field, and what the downstream field
 *  would then be. A value the test invented (not in the data) is named as such. */
export function WhatIfLine({ model, column, example, recordId, onRecord, className }: {
  model: Model;
  column: string;
  example: WhatIf & { id?: string | null; label?: string };
  recordId?: string | null;
  onRecord?: () => void;
  className?: string;
}) {
  const t = useTranslations("contentLineageAgent.whatIf");
  const numbers = useNumbers();
  const invented = example.alternative === "shift" && typeof example.x_to === "string";
  const record = recordId ?? example.id ?? (example.label !== undefined ? `#${Number(example.label) + 1}` : null);
  const x = (value: unknown) => numbers.value(value, model.isFactor(model.field));
  const y = (value: unknown) => numbers.value(value, model.isFactor(column));
  return (
    <p className={cn("flex items-start gap-2 rounded-md border border-pink-400/25 bg-pink-400/[0.05] px-2.5 py-2 text-[11.5px] leading-relaxed text-[#f3d9e8]", className)}>
      <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-300" />
      <span>
        {record && (onRecord ? <button type="button" onClick={onRecord} className="mr-1 font-mono text-pink-200 underline-offset-2 hover:underline">{record}</button> : <span className="mr-1 font-mono text-pink-200">{record}</span>)}
        {invented
          ? t("invented", { field: model.termName(model.field), from: x(example.x_from), target: model.termName(column), was: y(example.y_from), would: y(example.y_to) })
          : t("other", { field: model.termName(model.field), from: x(example.x_from), to: x(example.x_to), target: model.termName(column), was: y(example.y_from), would: y(example.y_to) })}
      </span>
    </p>
  );
}
