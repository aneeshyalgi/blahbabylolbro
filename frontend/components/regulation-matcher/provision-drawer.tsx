"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Highlighted, RegulationChip, shortHeading } from "./atoms";
import type { Provision, ProvisionTarget } from "./types";

export function ProvisionDrawer({ target, onClose }: { target: ProvisionTarget | null; onClose: () => void }) {
  const t = useTranslations("matcher.drawer");
  const [provision, setProvision] = useState<Provision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const focus = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProvision(null);
    fetch(API_ENDPOINTS.regulationMatcherProvision(target.regulationId, target.unit))
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || t("error"));
        if (!cancelled) setProvision(payload);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(requestError instanceof Error ? requestError.message : t("error"));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [target, t]);

  useEffect(() => {
    if (provision && focus.current) focus.current.scrollIntoView({ block: "center" });
  }, [provision]);

  const body = provision?.passages.filter((passage) => passage.kind !== "footnote") ?? [];
  const footnotes = provision?.passages.filter((passage) => passage.kind === "footnote") ?? [];
  let focused = false;

  return (
    <Sheet open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 border-[#252a33] bg-[#0b0f15] p-0 sm:max-w-[780px]">
        <SheetHeader className="border-b border-[#1f252e] bg-[linear-gradient(120deg,rgba(245,196,0,0.08),transparent_60%)] px-6 py-5">
          <div className="flex items-center gap-2 pr-8">
            {provision?.regulation && <RegulationChip name={provision.regulation} />}
            <SheetTitle className="font-mono text-lg text-white">{provision?.label ?? target?.reference}</SheetTitle>
            {provision?.title && <span className="truncate text-sm text-[#c9d1dd]">{provision.title}</span>}
          </div>
          <SheetDescription className="text-[11px] text-[#687386]">
            {provision ? (
              <>
                {provision.path.map(shortHeading).join(" › ")}
                {provision.page_start ? ` · ${t("pages", { from: provision.page_start, to: provision.page_end ?? provision.page_start })}` : ""}
              </>
            ) : (
              t("loading")
            )}
          </SheetDescription>
          {provision && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {target?.reference && (
                <span className="rounded-full border border-[#f5c400]/30 bg-[#f5c400]/10 px-2.5 py-0.5 text-[11px] text-[#f5c400]">{t("linked", { reference: target.reference })}</span>
              )}
              <a
                hidden={!provision.regulation_file}
                href={`${API_ENDPOINTS.regulationDocumentView(provision.regulation_id)}#page=${target?.page ?? provision.page_start ?? 1}`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto flex items-center gap-1.5 rounded-md border border-[#2c3440] px-2.5 py-1 text-xs text-[#e5e9f0] hover:border-[#f5c400]/50 hover:text-[#f5c400]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("openPdf", { file: provision.regulation_file })}
              </a>
            </div>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <p className="flex items-center gap-2 text-sm text-[#8c96a8]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("loading")}
            </p>
          )}
          {error && <p className="rounded-md border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
          <div className="space-y-2">
            {body.map((passage, index) => {
              const isTarget = Boolean(target?.paragraph) && passage.paragraph === target?.paragraph;
              const hasQuote = (target?.highlights ?? []).some((highlight) => highlight && passage.text.includes(highlight.slice(0, 40)));
              const marked = isTarget || hasQuote;
              const attach = marked && !focused;
              if (attach) focused = true;
              return (
                <div
                  key={index}
                  ref={attach ? focus : undefined}
                  className={cn(
                    "rounded-md border px-4 py-3 text-[13.5px] leading-[1.75] text-[#c9d1dd]",
                    marked ? "border-[#f5c400]/35 bg-[#f5c400]/[0.05] shadow-[inset_3px_0_0_#f5c400]" : "border-transparent",
                  )}
                >
                  <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[#4b5563]">
                    {passage.paragraph && <span className="font-mono text-[#8c96a8]">¶ {passage.paragraph}</span>}
                    {passage.points.length > 0 && <span className="font-mono">({passage.points[0]}){passage.points.length > 1 ? `–(${passage.points[passage.points.length - 1]})` : ""}</span>}
                    <span>{t("page", { page: passage.page_end && passage.page_end !== passage.page ? `${passage.page}–${passage.page_end}` : passage.page })}</span>
                    {passage.kind === "table" && <span className="rounded border border-[#2c3440] px-1">{t("table")}</span>}
                  </div>
                  {passage.formula && <p className="mb-1 text-[11px] text-amber-300">{t("formula")}</p>}
                  {passage.context && <p className="mb-1 text-[11px] italic text-[#687386]">{passage.context}</p>}
                  <Highlighted text={passage.text} highlights={target?.highlights ?? []} />
                </div>
              );
            })}
          </div>
          {footnotes.length > 0 && (
            <div className="mt-6 border-t border-[#1f252e] pt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{t("footnotes")}</p>
              {footnotes.map((passage, index) => (
                <p key={index} className="mb-1.5 text-[11px] leading-relaxed text-[#8c96a8]">
                  <span className="mr-1 font-mono text-[#687386]">({passage.footnote})</span>
                  {passage.text}
                </p>
              ))}
            </div>
          )}
          {provision && provision.references.length > 0 && (
            <div className="mt-6 border-t border-[#1f252e] pt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687386]">{t("references")}</p>
              <div className="flex flex-wrap gap-1.5">
                {provision.references.map((reference) => (
                  <span key={reference} className="rounded border border-[#252a33] bg-[#0f141b] px-1.5 py-px font-mono text-[11px] text-[#aab3c2]">
                    {reference}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
