export type CatalogCountryCode = "US" | "GB";

export type CatalogSourceType = "clay_csv";

export type CatalogVerification = "unverified";

/**
 * A normalized company from the checked-in Clay CSV.
 *
 * Nullable fields are unknown in the source. They must not be interpreted as
 * negative evidence or replaced with inferred values.
 */
export interface ClayCatalogCompany {
  stableId: string;
  dedupeKey: string;
  name: string;
  description: string | null;
  primaryIndustry: string | null;
  sizeBand: string | null;
  organizationType: string | null;
  location: string | null;
  countryCode: CatalogCountryCode | null;
  domain: string | null;
  linkedInUrl: string | null;
  sourceType: CatalogSourceType;
  verification: CatalogVerification;
  sourceRow: number;
}

export interface ClayCatalogSummary {
  totalRows: number;
  acceptedCompanies: number;
  quarantinedRows: number;
  duplicateRows: number;
  missingDomains: number;
  countryDistribution: Readonly<Record<string, number>>;
  fieldCoverage: Readonly<Record<string, number>>;
}

export interface ClayCatalog {
  summary: Readonly<ClayCatalogSummary>;
  companies: readonly Readonly<ClayCatalogCompany>[];
}

export interface ClayCatalogSearchInput {
  /** Free text matched against known source fields only. */
  text?: string | null;
  /** Case- and accent-insensitive filter against primaryIndustry. */
  sector?: string | null;
  /** Exact normalized country filter. */
  country?: CatalogCountryCode | null;
  /** Defaults to 50 and is clamped between 1 and 50. */
  limit?: number;
}

export type ClayCatalogMatchedField =
  | "name"
  | "description"
  | "primaryIndustry"
  | "location"
  | "domain";

export interface ClayCatalogSearchResult extends ClayCatalogCompany {
  matchScore: number;
  matchedFields: readonly ClayCatalogMatchedField[];
}
