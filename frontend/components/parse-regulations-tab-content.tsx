"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, Loader2, RefreshCw, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { API_ENDPOINTS } from "@/lib/api-config";
import { useToast } from "@/hooks/use-toast";

interface RegulationRow {
  regulation_name: string;
  original_url: string;
  pdf_download_url: string | null;
  annex_links: string[];
}

const rows: RegulationRow[] = [
  {
    regulation_name: "CRR III",
    original_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02013R0575-20260101",
    pdf_download_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:02013R0575-20260101",
    annex_links: ["#anx_I", "#anx_II", "#anx_III", "#anx_IV"],
  },
  {
    regulation_name: "CRR ITS",
    original_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02021R0451-20240901",
    pdf_download_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:02021R0451-20240901",
    annex_links: [],
  },
  {
    regulation_name: "Annex 1 (Solvency)",
    original_url: "/Annex 1 (Solvency).xlsx",
    pdf_download_url: "/Annex 1 (Solvency).xlsx",
    annex_links: [],
  },
];

type LiveRegulationResult = {
  original_url: string;
  regulation_name: string;
  updated_version_url: string | null;
  pdf_download_url: string | null;
  annex_links: string[];
  is_large_document: boolean;
};

type ScrapeProgress = {
  index: number;
  total: number;
  url: string | null;
  regulation_name: string | null;
  phase: string;
  detail: string;
};

type RegulationsStatus = {
  running: boolean;
  results: LiveRegulationResult[] | null;
  last_run_at: string | null;
  error: string | null;
  stopped?: boolean;
  progress?: ScrapeProgress;
};

export function ParseRegulationsTabContent() {
  const t = useTranslations("regulations");
  const tCommon = useTranslations("common");
  const [selectedRow, setSelectedRow] = useState<RegulationRow | null>(null);
  const [liveStatus, setLiveStatus] = useState<RegulationsStatus | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [clearing, setClearing] = useState(false);
  const { toast } = useToast();

  const fetchStatus = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.regulations);
      const payload = await response.json();
      if (response.ok) setLiveStatus(payload);
    } catch {
      // Ignore transient polling failures.
    }
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  useEffect(() => {
    if (!liveStatus?.running) return;
    const interval = setInterval(() => void fetchStatus(), 1200);
    return () => clearInterval(interval);
  }, [liveStatus?.running]);

  const handleScrape = async () => {
    setTriggering(true);
    try {
      const response = await fetch(API_ENDPOINTS.regulationsScrape, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Scrape request failed.");
      toast({ title: t("scrapeStarted") });
      await fetchStatus();
    } catch (error) {
      toast({
        title: t("scrapeFailed"),
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    } finally {
      setTriggering(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      const response = await fetch(API_ENDPOINTS.regulationsStop, { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Stop request failed.");
      }
      await fetchStatus();
    } catch (error) {
      toast({
        title: t("scrapeFailed"),
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    } finally {
      setStopping(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      const response = await fetch(API_ENDPOINTS.regulationsClear, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Clear request failed.");
      await fetchStatus();
      toast({ title: t("clearSuccess") });
    } catch (error) {
      toast({
        title: t("clearFailed"),
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    } finally {
      setClearing(false);
    }
  };

  const liveResults = liveStatus?.results ?? [];
  const progress = liveStatus?.progress;
  const progressPercent = progress && progress.total > 0 ? Math.round((progress.index / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("regulation")}</TableHead>
                  <TableHead>{t("pdf")}</TableHead>
                  <TableHead>{t("annexes")}</TableHead>
                  <TableHead>{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow
                    key={index}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell className="font-medium">
                      {row.regulation_name}
                    </TableCell>
                    <TableCell>
                      {row.pdf_download_url ? (
                        <a
                          href={row.pdf_download_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t("documentAvailable")}
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {t("na")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.annex_links.length}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedRow(row)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        {t("view")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {selectedRow && (
            <div className="mt-6 p-4 border rounded-md space-y-2">
              <h3 className="font-semibold text-lg">{t("details")}</h3>
              <p>
                <strong>{t("name")}</strong> {selectedRow.regulation_name}
              </p>
              <p>
                <strong>{t("url")}</strong>{" "}
                <a
                  href={selectedRow.original_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  {selectedRow.original_url}
                </a>
              </p>
              <p>
                <strong>{t("download")}</strong>{" "}
                {selectedRow.pdf_download_url ? (
                  <a
                    href={selectedRow.pdf_download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline"
                  >
                    {t("downloadFile")}
                  </a>
                ) : (
                  t("none")
                )}
              </p>
              <p>
                <strong>{t("annexesLabel")}</strong>{" "}
                {selectedRow.annex_links.length > 0
                  ? selectedRow.annex_links.join(", ")
                  : t("none")}
              </p>
              <Button variant="outline" onClick={() => setSelectedRow(null)}>
                {tCommon("close")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>{t("liveTitle")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("liveDescription")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleScrape} disabled={triggering || liveStatus?.running || liveResults.length > 0}>
                {liveStatus?.running || triggering ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {liveStatus?.running || triggering ? t("scraping") : t("scrapeNow")}
              </Button>
              {liveStatus?.running && (
                <Button variant="destructive" onClick={handleStop} disabled={stopping}>
                  {stopping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
                  {t("stop")}
                </Button>
              )}
              {!liveStatus?.running && liveResults.length > 0 && (
                <Button variant="outline" onClick={handleClear} disabled={clearing}>
                  {clearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  {t("clearResults")}
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {liveStatus?.last_run_at
              ? t("lastRun", { date: new Date(liveStatus.last_run_at).toLocaleString() })
              : t("neverRun")}
          </p>
          {liveStatus?.running && progress && (
            <div className="mt-3 space-y-1.5">
              <Progress value={progressPercent} />
              <p className="text-xs text-muted-foreground">
                {progress.total > 0 ? `${progress.index}/${progress.total} — ` : ""}
                {progress.phase}
                {progress.regulation_name ? ` (${progress.regulation_name})` : ""}
                {progress.detail ? `: ${progress.detail}` : ""}
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {liveStatus?.error && (
            <p className="mb-3 text-sm text-destructive">{liveStatus.error}</p>
          )}
          {liveResults.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noLiveResults")}</p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("regulation")}</TableHead>
                    <TableHead>{t("updatedVersion")}</TableHead>
                    <TableHead>{t("pdf")}</TableHead>
                    <TableHead>{t("annexes")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liveResults.map((row, index) => (
                    <TableRow key={`${row.original_url}-${index}`}>
                      <TableCell className="font-medium">
                        <a
                          href={row.original_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {row.regulation_name}
                        </a>
                      </TableCell>
                      <TableCell>
                        {row.updated_version_url ? (
                          <a
                            href={row.updated_version_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm"
                          >
                            {t("updatedVersion")}
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">{t("na")}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.pdf_download_url ? (
                          <a
                            href={row.pdf_download_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm"
                          >
                            {t("documentAvailable")}
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">{t("na")}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.annex_links.length}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
