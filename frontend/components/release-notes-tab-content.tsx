"use client";

import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function PatchNotesTabContent() {
  const t = useTranslations("releaseNotes");
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-4">
            {t("intro")}
          </p>
          <ul className="list-disc pl-4 space-y-2 text-sm">
            <li>
              <strong>Regulatory Framework Updates:</strong> Full support for DPM 4.2 across modules such as FinRep, ESG Disclosure, IRRBB, Resolution Planning, IFR, and Supervisory Benchmarking Portfolios. 
            </li>
            <li>
              <strong>Own Funds & Credit Risk:</strong> Allocation logic corrected for IRB/SA exposures, new data fields like CRE133, VAD275, and VAL531, Output Floor enhancements, collateral logic fixes, and improvements in templates C08, C09, C10, C34. 
            </li>
            <li>
              <strong>ESG EU Taxonomy:</strong> Adoption of NACE Rev. 2.1, fixes for GAR KPI denominators, support for nuclear & gas activities, new instrument fields for non‑material and non‑assessed exposures, and exclusion of artificial zero‑value allocations. 
            </li>
            <li>
              <strong>AnaCredit Enhancements:</strong> Bulgaria and Croatia added as reporting countries, new XSD schemas (Germany v2.8, Luxembourg v1.0.13), updated national identifiers, address logic corrections, KPI corrections, and improved XML export stability. 
            </li>
            <li>
              <strong>Liquidity (LCR/NSFR/AMM/AE):</strong> Corrected reporting of non‑HQLA collaterals, fixed weighting logic in C75.01, corrected sign handling for operating expenses, plus resolution of GUI execution errors for liquidity processes. 
            </li>
            <li>
              <strong>Large Exposure & Leverage Ratio:</strong> Czech Republic enabled as reporting country, new exception rules, correct handling of securitisation tranches, and improved SME classification logic. 
            </li>
            <li>
              <strong>Resolution Reporting (SRB MBDT):</strong> Bail‑in logic corrected for structured products, intragroup liabilities included, improved liability descriptions, and corrected handling of carrying amounts and close‑out valuations. 
            </li>
            <li>
              <strong>FinRep IFRS/nGAAP:</strong> IAS32‑aligned derivatives offsetting, updated country code (x01 → 7B), logic corrections for profit/loss accounts, and updated cross‑module validations. 
            </li>
            <li>
              <strong>National Reporting:</strong> Updates across Germany (BiSta, WiFSta, SHS), Netherlands (RRE/CRE), Finland (TOL25, LTC report), Ireland (RS3/MR1), UK (PRA 3.1 deviations), Canada (BCAR), and Australia (APRA). 
            </li>
            <li>
              <strong>Technical Improvements:</strong> Performance optimizations, enhanced security (OpenID, secure cookies), adapter mapping fixes, UI enhancements, and database performance improvements across clusters. 
            </li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("fileDownloads")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>
              <a
                href={"/Abacus360_preReleasenotes_R7.18.0.00.xlsm"}
                target="_blank"
                className="text-blue-600 underline"
              >
                {t("abacusReleaseNotes")}
              </a>
          </p>
        </CardContent>
        </Card>
    </div>
  );
}
