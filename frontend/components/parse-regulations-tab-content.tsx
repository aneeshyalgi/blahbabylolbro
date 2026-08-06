"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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

export function ParseRegulationsTabContent() {
  const t = useTranslations("regulations");
  const tCommon = useTranslations("common");
  const [selectedRow, setSelectedRow] = useState<RegulationRow | null>(null);

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
    </div>
  );
}
