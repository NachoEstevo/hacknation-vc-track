import type {
  ClayCompanyRow,
  NormalizedCompanyResult,
} from "./types";

const EMPTY_VALUES = new Set(["", "—", "-", "n/a", "null", "undefined"]);

function clean(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return EMPTY_VALUES.has(normalized.toLowerCase()) ? null : normalized;
}

export function normalizeTextKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeDomain(value: string): string | null {
  const candidate = clean(value);
  if (!candidate) return null;

  try {
    const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (!hostname.includes(".") || /\s/.test(hostname)) return null;
    if (!/^[a-z0-9.-]+$/.test(hostname)) return null;
    if (hostname.split(".").some((part) => !part || part.startsWith("-") || part.endsWith("-"))) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

export function normalizeLinkedInCompanyUrl(value: string): string | null {
  const candidate = clean(value);
  if (!candidate) return null;

  try {
    const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/^\/company\/([^/]+)/i);
    if (!match?.[1]) return null;
    return `https://www.linkedin.com/company/${decodeURIComponent(match[1]).toLowerCase()}`;
  } catch {
    return null;
  }
}

function normalizeCountry(value: string | undefined): "US" | "GB" | null {
  const country = clean(value)?.toLowerCase();
  if (!country) return null;
  if (country === "united states" || country === "us" || country === "usa") return "US";
  if (country === "united kingdom of great britain and northern ireland"
    || country === "united kingdom" || country === "uk" || country === "gb") return "GB";
  return null;
}

export function normalizeClayCompany(
  raw: ClayCompanyRow,
  rowNumber: number,
): NormalizedCompanyResult {
  const name = clean(raw.Name);
  if (!name) return { kind: "quarantined", rowNumber, reason: "missing_name", raw };

  const domain = normalizeDomain(raw.Domain ?? "");
  const linkedInUrl = normalizeLinkedInCompanyUrl(raw["LinkedIn URL"] ?? "");
  const countryCode = normalizeCountry(raw.Country);
  const nameKey = normalizeTextKey(name);
  const dedupeKey = domain
    ? `domain:${domain}`
    : linkedInUrl
      ? `linkedin:${linkedInUrl.slice("https://www.linkedin.com/company/".length)}`
      : nameKey && countryCode
        ? `name-country:${nameKey}:${countryCode}`
        : null;

  if (!dedupeKey) {
    return { kind: "quarantined", rowNumber, reason: "missing_identity", raw };
  }

  return {
    kind: "company",
    company: {
      name,
      description: clean(raw.Description),
      primaryIndustry: clean(raw["Primary Industry"]),
      sizeBand: clean(raw.Size),
      organizationType: clean(raw.Type),
      location: clean(raw.Location),
      countryCode,
      domain,
      linkedInUrl,
      dedupeKey,
      source: {
        sourceType: "clay_csv",
        rowNumber,
        verification: "unverified",
        raw,
      },
    },
  };
}
