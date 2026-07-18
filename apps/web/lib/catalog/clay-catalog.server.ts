import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildImportBatch,
  normalizeTextKey,
  parseClayCsv,
  type ImportSummary,
  type StableCompanySeed,
} from "@hacknation/data-core";

import type {
  ClayCatalog,
  ClayCatalogCompany,
  ClayCatalogMatchedField,
  ClayCatalogSearchInput,
  ClayCatalogSearchResult,
  ClayCatalogSummary,
} from "./types";

const CATALOG_PATH = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "..",
  "..",
  "data",
  "source",
  "clay-companies.csv",
);
const MAX_RESULTS = 50;

let catalogPromise: Promise<ClayCatalog> | undefined;

function freezeRecord(record: Record<string, number>): Readonly<Record<string, number>> {
  return Object.freeze({ ...record });
}

function toSummary(summary: ImportSummary): Readonly<ClayCatalogSummary> {
  return Object.freeze({
    totalRows: summary.totalRows,
    acceptedCompanies: summary.acceptedCompanies,
    quarantinedRows: summary.quarantinedRows,
    duplicateRows: summary.duplicateRows,
    missingDomains: summary.missingDomains,
    countryDistribution: freezeRecord(summary.countryDistribution),
    fieldCoverage: freezeRecord(summary.fieldCoverage),
  });
}

function toCatalogCompany(company: StableCompanySeed): Readonly<ClayCatalogCompany> {
  return Object.freeze({
    stableId: company.stableId,
    dedupeKey: company.dedupeKey,
    name: company.name,
    description: company.description,
    primaryIndustry: company.primaryIndustry,
    sizeBand: company.sizeBand,
    organizationType: company.organizationType,
    location: company.location,
    countryCode: company.countryCode,
    domain: company.domain,
    linkedInUrl: company.linkedInUrl,
    sourceType: company.source.sourceType,
    verification: company.source.verification,
    sourceRow: company.source.rowNumber,
  });
}

async function readCatalog(): Promise<ClayCatalog> {
  let csv: string;
  try {
    csv = await readFile(CATALOG_PATH, "utf8");
  } catch (cause) {
    throw new Error(`Clay catalog not found at ${CATALOG_PATH}.`, { cause });
  }
  const batch = buildImportBatch(parseClayCsv(csv));
  const companies = Object.freeze(batch.companies.map(toCatalogCompany));

  return Object.freeze({
    summary: toSummary(batch.summary),
    companies,
  });
}

/**
 * Loads and normalizes the checked-in Clay catalog once per server process.
 * This module imports Node filesystem APIs and must only be imported by Server
 * Components, server actions, route handlers, or other server-only modules.
 */
export function loadClayCatalog(): Promise<ClayCatalog> {
  catalogPromise ??= readCatalog();
  return catalogPromise;
}

export async function getClayCatalogSummary(): Promise<Readonly<ClayCatalogSummary>> {
  return (await loadClayCatalog()).summary;
}

export async function listClayCatalogCompanies(): Promise<
  readonly Readonly<ClayCatalogCompany>[]
> {
  return (await loadClayCatalog()).companies;
}

export async function getClayCatalogCompany(
  stableId: string,
): Promise<Readonly<ClayCatalogCompany> | null> {
  const companies = await listClayCatalogCompanies();
  return companies.find((company) => company.stableId === stableId) ?? null;
}

function normalizeSearchValue(value: string | null | undefined): string {
  return value ? normalizeTextKey(value) : "";
}

function textTokens(value: string): string[] {
  return value.split("-").filter(Boolean);
}

function fieldContainsEveryToken(field: string | null, tokens: readonly string[]): boolean {
  if (!field || tokens.length === 0) return false;
  const normalized = normalizeSearchValue(field);
  return tokens.every((token) => normalized.includes(token));
}

function matchText(
  company: Readonly<ClayCatalogCompany>,
  normalizedText: string,
): { score: number; matchedFields: ClayCatalogMatchedField[] } | null {
  if (!normalizedText) return { score: 0, matchedFields: [] };

  const tokens = textTokens(normalizedText);
  const fields: Array<{
    key: ClayCatalogMatchedField;
    value: string | null;
    weight: number;
  }> = [
    { key: "name", value: company.name, weight: 60 },
    { key: "domain", value: company.domain, weight: 45 },
    { key: "primaryIndustry", value: company.primaryIndustry, weight: 30 },
    { key: "location", value: company.location, weight: 15 },
    { key: "description", value: company.description, weight: 10 },
  ];
  const matchedFields = fields
    .filter((field) => fieldContainsEveryToken(field.value, tokens))
    .map((field) => field.key);
  const searchableText = fields
    .map((field) => normalizeSearchValue(field.value))
    .filter(Boolean)
    .join("-");

  if (!tokens.every((token) => searchableText.includes(token))) return null;

  const normalizedName = normalizeSearchValue(company.name);
  let score = fields.reduce(
    (total, field) =>
      total + (matchedFields.includes(field.key) ? field.weight : 0),
    0,
  );

  if (normalizedName === normalizedText) score += 200;
  else if (normalizedName.startsWith(normalizedText)) score += 100;
  else if (normalizedName.includes(normalizedText)) score += 50;

  return { score, matchedFields };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return MAX_RESULTS;
  return Math.min(MAX_RESULTS, Math.max(1, Math.trunc(limit)));
}

function compareResults(
  left: ClayCatalogSearchResult,
  right: ClayCatalogSearchResult,
): number {
  if (left.matchScore !== right.matchScore) return right.matchScore - left.matchScore;

  const leftName = normalizeSearchValue(left.name);
  const rightName = normalizeSearchValue(right.name);
  if (leftName !== rightName) return leftName < rightName ? -1 : 1;
  return left.stableId < right.stableId ? -1 : left.stableId > right.stableId ? 1 : 0;
}

/**
 * Searches normalized source fields without enriching or inferring missing data.
 * Ranking is deterministic: match score, normalized company name, then stable ID.
 */
export async function searchClayCatalog(
  input: ClayCatalogSearchInput = {},
): Promise<readonly Readonly<ClayCatalogSearchResult>[]> {
  const catalog = await loadClayCatalog();
  const normalizedText = normalizeSearchValue(input.text);
  const normalizedSector = normalizeSearchValue(input.sector);
  const sectorTokens = textTokens(normalizedSector);
  const limit = normalizeLimit(input.limit);

  const results = catalog.companies.flatMap((company) => {
    if (input.country && company.countryCode !== input.country) return [];
    if (
      normalizedSector &&
      !fieldContainsEveryToken(company.primaryIndustry, sectorTokens)
    ) {
      return [];
    }

    const match = matchText(company, normalizedText);
    if (!match) return [];

    return [
      Object.freeze({
        ...company,
        matchScore: match.score,
        matchedFields: Object.freeze(match.matchedFields),
      }),
    ];
  });

  return Object.freeze(results.sort(compareResults).slice(0, limit));
}
