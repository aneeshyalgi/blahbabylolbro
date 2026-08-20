"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Moon, Sun, ListOrdered, Languages, LogOut } from "lucide-react";
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
  const { setTheme, resolvedTheme } = useTheme();
  const router = useRouter();
  const [reorderOpen, setReorderOpen] = useState(false);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  const themeButtonContent = !mounted ? (
    <Moon className="h-[1.15rem] w-[1.15rem]" aria-hidden />
  ) : isDark ? (
    <Sun className="h-[1.15rem] w-[1.15rem] transition-transform hover:rotate-12" />
  ) : (
    <Moon className="h-[1.15rem] w-[1.15rem] transition-transform hover:-rotate-12" />
  );
  const themeAriaLabel = !mounted ? t("theme") : isDark ? t("switchToLight") : t("switchToDark");
  const themeTooltip = !mounted ? t("theme") : isDark ? t("lightMode") : t("darkMode");

  return (
    <>
      <header className="border-b border-border bg-card px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-foreground">RegData Xplainer (RDX)</h1>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent"
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
                    className="rounded-full h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent"
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
                    onClick={toggleTheme}
                    className="shrink-0 rounded-full h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent"
                    aria-label={themeAriaLabel}
                  >
                    {themeButtonContent}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{themeTooltip}</p>
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
                    className="shrink-0 rounded-full h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent"
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
