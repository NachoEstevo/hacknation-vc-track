import type {
  ClayCatalogCompany,
  ClayCatalogMatchedField,
  ClayCatalogSearchResult,
} from "./types";

const KNOWN_SOURCE_TERMS = [
  "artificial intelligence",
  "developer",
  "security",
  "climate",
  "health",
  "fintech",
  "finance",
  "software",
  "infrastructure",
  "ai",
] as const;

function normalizeTextKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function tokens(value: string): string[] {
  return normalizeTextKey(value).split("-").filter(Boolean);
}

function fieldContainsEveryToken(field: string | null, searchTokens: readonly string[]): boolean {
  if (!field || searchTokens.length === 0) return false;
  const normalized = normalizeTextKey(field);
  return searchTokens.every((token) => normalized.includes(token));
}

export function catalogTermForQuery(query: string): string {
  const normalized = query.toLocaleLowerCase();
  const known = KNOWN_SOURCE_TERMS.find((term) =>
    new RegExp(`(^|[^a-z])${term.replaceAll(" ", "\\s+")}([^a-z]|$)`).test(normalized));
  if (known) return known;

  const words = query.trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 4 ? query.trim() : "";
}

function matchCompany(
  company: Readonly<ClayCatalogCompany>,
  term: string,
): ClayCatalogSearchResult | null {
  const normalizedTerm = normalizeTextKey(term);
  const searchTokens = tokens(term);
  if (!normalizedTerm || searchTokens.length === 0) return null;

  const fields: Array<{ key: ClayCatalogMatchedField; value: string | null; weight: number }> = [
    { key: "name", value: company.name, weight: 60 },
    { key: "domain", value: company.domain, weight: 45 },
    { key: "primaryIndustry", value: company.primaryIndustry, weight: 30 },
    { key: "location", value: company.location, weight: 15 },
    { key: "description", value: company.description, weight: 10 },
  ];
  const matchedFields = fields
    .filter((field) => fieldContainsEveryToken(field.value, searchTokens))
    .map((field) => field.key);
  const sourceText = fields
    .map((field) => field.value ? normalizeTextKey(field.value) : "")
    .filter(Boolean)
    .join("-");
  if (!searchTokens.every((token) => sourceText.includes(token))) return null;

  const normalizedName = normalizeTextKey(company.name);
  let matchScore = fields.reduce(
    (total, field) => total + (matchedFields.includes(field.key) ? field.weight : 0),
    0,
  );
  if (normalizedName === normalizedTerm) matchScore += 200;
  else if (normalizedName.startsWith(normalizedTerm)) matchScore += 100;
  else if (normalizedName.includes(normalizedTerm)) matchScore += 50;

  return { ...company, matchScore, matchedFields };
}

/** Deterministic client-side lookup over explicit source fields only. */
export function searchClayCatalogRows(
  companies: readonly Readonly<ClayCatalogCompany>[],
  query: string,
  limit = 6,
): { term: string; results: ClayCatalogSearchResult[] } {
  const term = catalogTermForQuery(query);
  if (!term) return { term: "", results: [] };

  const results = companies
    .flatMap((company) => {
      const match = matchCompany(company, term);
      return match ? [match] : [];
    })
    .sort((left, right) =>
      right.matchScore - left.matchScore
      || normalizeTextKey(left.name).localeCompare(normalizeTextKey(right.name))
      || left.stableId.localeCompare(right.stableId))
    .slice(0, Math.min(6, Math.max(1, Math.trunc(limit))));

  return { term, results };
}
