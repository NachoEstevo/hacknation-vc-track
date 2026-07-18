import { createHash } from "node:crypto";
import { normalizeClayCompany } from "./normalize-company";
import type {
  ClayCompanyRow,
  ImportBatch,
  ImportSummary,
  StableCompanySeed,
} from "./types";

function stableId(dedupeKey: string): string {
  return createHash("sha256").update(dedupeKey).digest("hex").slice(0, 24);
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

export function buildImportBatch(rows: ClayCompanyRow[]): ImportBatch {
  const companies: StableCompanySeed[] = [];
  const quarantined: ImportBatch["quarantined"] = [];
  const duplicates: ImportBatch["duplicates"] = [];
  const byKey = new Map<string, StableCompanySeed>();

  for (const [index, row] of rows.entries()) {
    const result = normalizeClayCompany(row, index + 2);
    if (result.kind === "quarantined") {
      quarantined.push(result);
      continue;
    }

    const existing = byKey.get(result.company.dedupeKey);
    if (existing) {
      duplicates.push({
        dedupeKey: result.company.dedupeKey,
        canonicalStableId: existing.stableId,
        duplicateName: result.company.name,
        duplicateRowNumber: result.company.source.rowNumber,
      });
      continue;
    }

    const company = {
      ...result.company,
      stableId: stableId(result.company.dedupeKey),
    };
    byKey.set(company.dedupeKey, company);
    companies.push(company);
  }

  const countryDistribution: Record<string, number> = {};
  const coverageCounts: Record<string, number> = {
    name: 0,
    description: 0,
    primaryIndustry: 0,
    sizeBand: 0,
    organizationType: 0,
    location: 0,
    countryCode: 0,
    domain: 0,
    linkedInUrl: 0,
  };

  for (const company of companies) {
    increment(countryDistribution, company.countryCode ?? "unknown");
    for (const key of Object.keys(coverageCounts)) {
      if (company[key as keyof StableCompanySeed]) increment(coverageCounts, key);
    }
  }

  const denominator = companies.length || 1;
  const fieldCoverage = Object.fromEntries(
    Object.entries(coverageCounts).map(([key, count]) => [
      key,
      Number(((count / denominator) * 100).toFixed(1)),
    ]),
  );

  const summary: ImportSummary = {
    totalRows: rows.length,
    acceptedCompanies: companies.length,
    quarantinedRows: quarantined.length,
    duplicateRows: duplicates.length,
    missingDomains: companies.filter((company) => !company.domain).length,
    countryDistribution,
    fieldCoverage,
  };

  return { companies, quarantined, duplicates, summary };
}
