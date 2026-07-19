import type { StableCompanySeed } from "../types";

export interface EvidenceRecord {
  evidenceId: string;
  companyId: string;
  sourceType: "clay_csv" | "company_website" | "github_public" |
    "founder_assertion" | "founder_document" | "stripe_private";
  sourceUrl: string | null;
  snapshotPath: string | null;
  capturedAt: string;
  excerpt: string | null;
  payload: Record<string, unknown> | null;
  verificationState: "unverified" | "candidate_only" | "verified" | "conflicted" | "stale";
  visibility: "public" | "founder_private" | "investor_private";
}

export interface CompanyEvidenceBundle {
  companyId: string;
  companyName: string;
  normalizedCompany: StableCompanySeed;
  evidence: EvidenceRecord[];
}

export interface ThesisCriterion {
  criterionId: string;
  category: "geography" | "industry" | "company_size" | "stage" |
    "founder" | "market" | "product" | "traction" | "exclusion" | "custom";
  label: string;
  requirement: "required" | "preferred" | "excluded";
  weight: 1 | 2 | 3 | 4 | 5;
  operator: "equals" | "one_of" | "contains" | "gte" | "lte" | "exists" | "not_exists";
  expectedValue: string | number | boolean | string[];
}

export interface FundThesis {
  thesisId: string;
  originalQuery: string;
  criteria: ThesisCriterion[];
  generatedAt: string;
  promptVersion: string;
}

export interface ClaimTrustBreakdown {
  sourceReliability: number;
  directness: number;
  corroboration: number;
  recency: number;
  total: number;
  state: "supported" | "unverified" | "conflicted";
}

export interface ClaimCandidate {
  claimId: string;
  companyId: string;
  subject: string;
  predicate: string;
  value: string | number | boolean;
  unit: string | null;
  claimKind: "observed_fact" | "first_party_claim" | "analysis";
  evidenceIds: string[];
  trust: ClaimTrustBreakdown;
  state: "supported" | "unverified" | "conflicted";
}

export interface CriterionEvaluation {
  criterionId: string;
  requirement: ThesisCriterion["requirement"];
  state: "match" | "partial" | "missing" | "conflict";
  weight: number;
  reason: string;
  evidenceIds: string[];
}

export interface AssessmentDimension {
  dimensionId: string;
  points: number;
  possiblePoints: number;
  known: boolean;
  reason: string;
  evidenceIds: string[];
}

export interface AssessmentAxis {
  axis: "founder" | "market" | "product_execution" | "traction";
  score: number | null;
  coverage: number;
  dimensions: AssessmentDimension[];
}

export interface CompanyEvaluation {
  companyId: string;
  companyName: string;
  thesisFit: number | null;
  evidenceCoverage: number;
  criteria: CriterionEvaluation[];
  axes: AssessmentAxis[];
  recommendation: "investigate" | "watch" | "pass_for_thesis" | "needs_evidence";
}

export interface CitedStatement {
  text: string;
  statementKind: "fact" | "analysis" | "uncertainty";
  evidenceIds: string[];
}

export interface InvestmentBrief {
  companyId: string;
  thesisId: string;
  recommendation: CompanyEvaluation["recommendation"];
  thesisFit: number | null;
  evidenceCoverage: number;
  axes: AssessmentAxis[];
  summary: CitedStatement[];
  strengths: CitedStatement[];
  risks: CitedStatement[];
  evidenceGaps: Array<{ field: string; reason: string }>;
  diligenceQuestions: string[];
  generatedAt: string;
  promptVersion: string;
}
