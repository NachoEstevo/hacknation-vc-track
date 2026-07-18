export interface ClayCompanyRow {
  "Small Companies, Software & IT, US & UK"?: string;
  Name?: string;
  Description?: string;
  "Primary Industry"?: string;
  Size?: string;
  Type?: string;
  Location?: string;
  Country?: string;
  Domain?: string;
  "LinkedIn URL"?: string;
  [key: string]: string | undefined;
}

export interface SourceMetadata {
  sourceType: "clay_csv";
  rowNumber: number;
  verification: "unverified";
  raw: ClayCompanyRow;
}

export interface CompanySeed {
  name: string;
  description: string | null;
  primaryIndustry: string | null;
  sizeBand: string | null;
  organizationType: string | null;
  location: string | null;
  countryCode: "US" | "GB" | null;
  domain: string | null;
  linkedInUrl: string | null;
  dedupeKey: string;
  source: SourceMetadata;
}

export interface QuarantinedRow {
  kind: "quarantined";
  rowNumber: number;
  reason: "missing_name" | "missing_identity";
  raw: ClayCompanyRow;
}

export type NormalizedCompanyResult =
  | { kind: "company"; company: CompanySeed }
  | QuarantinedRow;

