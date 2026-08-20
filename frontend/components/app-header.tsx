"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ListOrdered, Languages, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReorderTabsDialog } from "@/components/reorder-tabs-dialog";
import { useLocale } from "@/context/locale-provider";
import type { Locale } from "@/lib/i18n";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { useRouter } from "next/navigation";

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  es: "Español",
};

interface AppHeaderProps {
  title?: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  const t = useTranslations("header");
  const tLang = useTranslations("language");
  const { locale, setLocale } = useLocale();
  const router = useRouter();
  const [reorderOpen, setReorderOpen] = useState(false);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="border-b border-[#252a33] bg-[#0b0f15] px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f5c400]">EY RegData</p>
            <h1 className="truncate text-lg font-semibold text-[#f2f4f7]">RegData Xplainer (RDX)</h1>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full text-muted-foreground hover:bg-[#f5c400]/10 hover:text-[#f5c400]"
                    aria-label={tLang("label")}
                    onClick={() => setLanguageModalOpen(true)}
                  >
                    <Languages className="h-[1.15rem] w-[1.15rem]" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{tLang("label")} ({LOCALE_LABELS[locale]})</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setReorderOpen(true)}
                    className="h-9 w-9 rounded-full text-muted-foreground hover:bg-[#f5c400]/10 hover:text-[#f5c400]"
                    aria-label={t("reorderTabs")}
                  >
                    <ListOrdered className="h-[1.15rem] w-[1.15rem]" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{t("reorderTabsTooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleLogout}
                    className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-[#f5c400]/10 hover:text-[#f5c400]"
                    aria-label="Sign out"
                  >
                    <LogOut className="h-[1.15rem] w-[1.15rem]" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Sign out</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </header>
      <Dialog open={languageModalOpen} onOpenChange={setLanguageModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tLang("label")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {SUPPORTED_LOCALES.map((loc) => (
              <Button
                key={loc}
                variant={locale === loc ? "default" : "outline"}
                className="w-full justify-start"
                onClick={() => {
                  setLocale(loc);
                  setLanguageModalOpen(false);
                }}
              >
                {tLang(loc)}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <ReorderTabsDialog open={reorderOpen} onOpenChange={setReorderOpen} />
    </>
  );
}
