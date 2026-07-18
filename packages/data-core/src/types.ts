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

export interface StableCompanySeed extends CompanySeed {
  stableId: string;
}

export interface DuplicateCompanyRow {
  dedupeKey: string;
  canonicalStableId: string;
  duplicateName: string;
  duplicateRowNumber: number;
}

export interface ImportSummary {
  totalRows: number;
  acceptedCompanies: number;
  quarantinedRows: number;
  duplicateRows: number;
  missingDomains: number;
  countryDistribution: Record<string, number>;
  fieldCoverage: Record<string, number>;
}

export interface ImportBatch {
  companies: StableCompanySeed[];
  quarantined: QuarantinedRow[];
  duplicates: DuplicateCompanyRow[];
  summary: ImportSummary;
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

export interface ClayContact {
  name: string;
  profileId: string;
  latestExperienceCompany: string | null;
  latestExperienceTitle: string | null;
  domain: string | null;
  linkedInUrl: string | null;
}

export type FounderResolutionReason =
  | "exact_domain_and_founder_title"
  | "company_name_and_founder_title"
  | "domain_mismatch"
  | "non_founder_title"
  | "missing_linkedin_url"
  | "insufficient_company_match";

export interface FounderResolution {
  state: "accepted_candidate" | "needs_review" | "rejected";
  confidence: number;
  reason: FounderResolutionReason;
  contact: ClayContact;
}
