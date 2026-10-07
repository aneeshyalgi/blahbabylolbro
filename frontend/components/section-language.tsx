"use client";

/**
 * English / German for a single tab, independent of the app-wide language: the tab gets its own next-intl provider,
 * so every `useTranslations` / `useLocale` inside it follows the tab's switch. Until the user picks a language in the
 * tab, it follows the app language (German stays German, every other language shows English).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-provider";
import en from "@/messages/en.json";
import de from "@/messages/de.json";

export type SectionLanguage = "en" | "de";

const MESSAGES = { en, de } as const;
const OPTIONS: { value: SectionLanguage; label: string; name: string }[] = [
  { value: "en", label: "EN", name: "English" },
  { value: "de", label: "DE", name: "Deutsch" },
];
const COPY: Record<SectionLanguage, { label: string; hint: string }> = {
  en: { label: "Language of this tab", hint: "Language of this tab: labels, AI-written texts, logs and exports" },
  de: { label: "Sprache dieses Tabs", hint: "Sprache dieses Tabs: Beschriftungen, KI-Texte, Protokolle und Exporte" },
};

type SectionLanguageValue = { language: SectionLanguage; setLanguage: (language: SectionLanguage) => void };

const SectionLanguageContext = createContext<SectionLanguageValue | null>(null);

export function SectionLanguageProvider({ storageKey, children }: { storageKey: string; children: ReactNode }) {
  const { locale: appLocale } = useLocale();
  const [chosen, setChosen] = useState<SectionLanguage | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "en" || stored === "de") setChosen(stored);
    } catch {
      // Storage unavailable: the tab follows the app language.
    }
  }, [storageKey]);

  const setLanguage = useCallback(
    (next: SectionLanguage) => {
      setChosen(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // Storage unavailable; the choice lasts for this session only.
      }
    },
    [storageKey],
  );

  const language: SectionLanguage = chosen ?? (appLocale === "de" ? "de" : "en");
  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);

  return (
    <SectionLanguageContext.Provider value={value}>
      <NextIntlClientProvider locale={language} messages={MESSAGES[language]} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </SectionLanguageContext.Provider>
  );
}

export function useSectionLanguage(): SectionLanguageValue {
  const context = useContext(SectionLanguageContext);
  if (!context) throw new Error("useSectionLanguage must be used within SectionLanguageProvider");
  return context;
}

/** The EN | DE switch for a tab's header. */
export function SectionLanguageSwitch({ tourId, className }: { tourId?: string; className?: string }) {
  const { language, setLanguage } = useSectionLanguage();
  const copy = COPY[language];
  return (
    <div
      data-tour={tourId}
      role="group"
      aria-label={copy.label}
      title={copy.hint}
      className={cn("flex h-8 items-center gap-1 rounded-md border border-[#2c3440] bg-[#0f141b] pl-2 pr-[3px]", className)}
    >
      <Languages className="h-3.5 w-3.5 text-[#687386]" aria-hidden="true" />
      {OPTIONS.map((option) => {
        const selected = option.value === language;
        return (
          <button
            key={option.value}
            type="button"
            lang={option.value}
            aria-pressed={selected}
            aria-label={option.name}
            title={option.name}
            onClick={() => setLanguage(option.value)}
            className={cn(
              "h-[26px] rounded px-2 text-[11px] font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5c400]/60",
              selected ? "bg-[#f5c400] text-[#0b0f15]" : "text-[#8c96a8] hover:bg-[#151b23] hover:text-white",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
