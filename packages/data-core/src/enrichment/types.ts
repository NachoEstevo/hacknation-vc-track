import type { CapturedPage, PageFailure } from "../web/types";

export interface FounderWebCandidate {
  name: string;
  role: string | null;
  profileUrls: string[];
  evidenceUrl: string;
  extractionMethod: "json_ld";
  state: "candidate_only";
}

export interface ExtractedCompanyProfile {
  name: string | null;
  description: string | null;
  socialLinks: { linkedIn: string[]; github: string[]; x: string[] };
  signalLinks: { pricing: string[]; changelog: string[]; product: string[] };
  founderCandidates: FounderWebCandidate[];
}

export interface GitHubEvidence {
  status: "ok" | "not_found" | "rate_limited" | "error";
  sourceUrl: string;
  accountType?: "organization" | "user";
  login?: string;
  publicRepos?: number;
  followers?: number;
  createdAt?: string;
  latestPushAt?: string | null;
  latestRepositoryUpdateAt?: string | null;
  totalStarsSampled?: number;
  note: string;
}

export interface CompanyEnrichmentResult {
  stableId: string;
  name: string;
  domain: string | null;
  status: "complete" | "partial" | "failed";
  capturedAt: string;
  pages: Array<Omit<CapturedPage, "html">>;
  failures: PageFailure[];
  profile: ExtractedCompanyProfile | null;
  github: GitHubEvidence[];
}
