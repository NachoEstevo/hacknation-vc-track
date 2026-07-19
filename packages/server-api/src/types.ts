import type { CompanyEvaluation, CompanyEvidenceBundle, FundThesis, RankedCompany } from "@hacknation/data-core";

export interface AuthenticatedUser { userId: string; }
export type Authenticate = (request: Request) => Promise<AuthenticatedUser | null>;
export interface SearchInput { query: string; limit: number; }
export interface WatchlistInput { status: "watching" | "contacted" | "passed"; note: string | null; }
export interface FounderEvidenceInput {
  evidenceType: string;
  sourceUrl: string | null;
  excerpt: string | null;
  structuredPayload: Record<string, unknown> | null;
  visibility: "founder_private" | "investor_private";
}
export interface StoredFounderEvidenceInput extends FounderEvidenceInput {
  contentHash: string;
  verificationState: "unverified";
}
export interface SearchEngine {
  search(query: string, bundles: CompanyEvidenceBundle[]): Promise<{ thesis: FundThesis; ranked: RankedCompany[] }>;
}
export interface ApiRepository {
  listSearchBundles(): Promise<CompanyEvidenceBundle[]>;
  persistSearch(userId: string, query: string, thesis: FundThesis, ranked: RankedCompany[]): Promise<string>;
  getBrief(userId: string, companyId: string, searchId: string): Promise<unknown | null>;
  companyExists(companyId: string): Promise<boolean>;
  upsertWatchlist(userId: string, companyId: string, input: WatchlistInput): Promise<unknown>;
  findVerifiedFounderMembership(userId: string, companyId: string): Promise<{ founderId: string } | null>;
  insertFounderEvidence(userId: string, companyId: string, founderId: string, input: StoredFounderEvidenceInput): Promise<unknown>;
}
export interface SearchResponse {
  searchId: string;
  thesis: FundThesis;
  results: Array<{
    companyId: string;
    companyName: string;
    recommendation: CompanyEvaluation["recommendation"];
    thesisFit: number | null;
    evidenceCoverage: number;
    rank: number;
    score: number;
    confidenceAdjustedFit: number;
    tier: RankedCompany["tier"];
    signals: RankedCompany["signals"];
  }>;
}
export interface ApiServices {
  searchCompanies(userId: string, input: SearchInput): Promise<SearchResponse>;
  getCompanyBrief(userId: string, companyId: string, searchId: string): Promise<unknown>;
  saveWatchlist(userId: string, companyId: string, input: WatchlistInput): Promise<unknown>;
  registerFounderEvidence(userId: string, companyId: string, input: FounderEvidenceInput): Promise<unknown>;
}
export interface PersistedSearchResult {
  evaluation: CompanyEvaluation;
  rank: number;
  score: number;
  confidenceAdjustedFit: number;
  tier: string;
  signals: RankedCompany["signals"];
}
