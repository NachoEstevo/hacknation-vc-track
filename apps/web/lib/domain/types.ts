export const SYNTHETIC_DEMO_LABEL = "synthetic_demo" as const;

export type DataLabel = typeof SYNTHETIC_DEMO_LABEL;

export type SourceType =
  | "deck"
  | "founder_submission"
  | "github"
  | "hackathon"
  | "public_registry"
  | "website";

export type ClaimState =
  | "unverified"
  | "supported"
  | "partially_supported"
  | "contradicted"
  | "stale";

export type EvidenceRelation = "supports" | "contradicts" | "context";

export type ClaimPredicate =
  | "project.sector"
  | "project.region"
  | "project.country"
  | "project.stage"
  | "project.team_size"
  | "project.institutional_funding"
  | "project.raising"
  | "project.working_demo"
  | "project.hackathon_origin"
  | "project.problem"
  | "project.product"
  | "project.traction"
  | "founder.technical";

export type ClaimValue = boolean | number | string | string[];

export interface ClaimTrust {
  sourceReliability: number;
  directness: number;
  corroboration: number;
  recency: number;
  score: number;
}

export interface EvidenceRecord {
  id: string;
  dataLabel: DataLabel;
  sourceType: SourceType;
  sourceName: string;
  sourceUrl: string | null;
  capturedAt: string;
  excerpt: string;
  contentHash: string;
}

export interface ClaimEvidenceLink {
  evidenceId: string;
  relation: EvidenceRelation;
}

export interface ClaimRecord {
  id: string;
  dataLabel: DataLabel;
  subjectId: string;
  predicate: ClaimPredicate;
  statement: string;
  value: ClaimValue;
  state: ClaimState;
  trust: ClaimTrust;
  evidence: ClaimEvidenceLink[];
  observedAt: string;
}

export interface ContradictionRecord {
  id: string;
  dataLabel: DataLabel;
  claimId: string;
  evidenceIds: string[];
  summary: string;
  state: "open" | "resolved";
}

export interface CompanyProfile {
  id: string;
  name: string;
  domain: string;
  countryCode: string;
  city: string;
}

export interface ProjectProfile {
  id: string;
  name: string;
  tagline: string;
  summary: string;
  problem: string;
  product: string;
  stage: string;
  sectorTags: string[];
  teamSize: number;
}

export interface FounderProfile {
  id: string;
  name: string;
  role: string;
  location: string;
}

export interface FounderScoreFactor {
  id: string;
  label: string;
  weight: number;
  evidenceStrength: number;
  state: ClaimState | "missing";
  claimId: string | null;
  evidenceIds: string[];
}

export interface FounderScoreRecord {
  founderId: string;
  score: number | null;
  evidenceCoverage: number;
  confidence: "low" | "medium" | "high";
  trend: "baseline";
  calculatedAt: string;
  factors: FounderScoreFactor[];
  missingFactors: string[];
  interpretation: string;
}

export interface OpportunityDetail {
  id: string;
  dataLabel: DataLabel;
  company: CompanyProfile;
  project: ProjectProfile;
  founders: FounderProfile[];
  founderScore: FounderScoreRecord | null;
  claims: ClaimRecord[];
  evidence: EvidenceRecord[];
  contradictions: ContradictionRecord[];
  updatedAt: string;
}

export const CRITERION_FIELDS = [
  "sector",
  "geography",
  "stage",
  "team_size",
  "technical_founder",
  "check_size",
  "acceptable_risk",
  "team_preferences",
  "valued_signal_types",
  "institutional_funding",
  "raising",
  "working_demo",
  "hackathon_origin",
  "traction",
] as const;

export const CRITERION_OPERATORS = [
  "equals",
  "includes_any",
  "contains_all",
  "lte",
  "gte",
  "between",
] as const;

export const CRITERION_PRIORITIES = ["required", "preferred", "exclude"] as const;

export type CriterionField = (typeof CRITERION_FIELDS)[number];
export type CriterionOperator = (typeof CRITERION_OPERATORS)[number];
export type CriterionPriority = (typeof CRITERION_PRIORITIES)[number];
export type CriterionValue = boolean | number | string | string[] | number[];

export interface SearchCriterion {
  id: string;
  field: CriterionField;
  operator: CriterionOperator;
  value: CriterionValue;
  priority: CriterionPriority;
  label: string;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCriterionValue(value: unknown): value is CriterionValue {
  return typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
    || typeof value === "string"
    || (Array.isArray(value)
      && value.length > 0
      && (value.every((item) => typeof item === "string")
        || value.every((item) => typeof item === "number" && Number.isFinite(item))));
}

/** Runtime boundary for local storage and future database adapters. */
export function isSearchCriterion(value: unknown): value is SearchCriterion {
  if (!isRecordValue(value)) return false;
  if (typeof value.id !== "string" || !value.id.trim()) return false;
  if (typeof value.label !== "string" || !value.label.trim()) return false;
  if (!CRITERION_FIELDS.includes(value.field as CriterionField)) return false;
  if (!CRITERION_OPERATORS.includes(value.operator as CriterionOperator)) return false;
  if (!CRITERION_PRIORITIES.includes(value.priority as CriterionPriority)) return false;
  if (!isCriterionValue(value.value)) return false;

  if (value.operator === "lte" || value.operator === "gte") {
    return typeof value.value === "number";
  }
  if (value.operator === "between") {
    return Array.isArray(value.value)
      && value.value.length === 2
      && value.value.every((item) => typeof item === "number" && Number.isFinite(item))
      && value.value[0] <= value.value[1];
  }
  if (value.operator === "includes_any" || value.operator === "contains_all") {
    return Array.isArray(value.value) && value.value.length > 0;
  }
  return true;
}

export interface SearchIntent {
  query: string;
  criteria: SearchCriterion[];
  sourceScope: "internal" | "internal_then_public";
}

export type CriterionMatchState = "match" | "partial" | "missing" | "conflict";

export interface CriterionEvaluation {
  criterion: SearchCriterion;
  state: CriterionMatchState;
  explanation: string;
  evidenceIds: string[];
}

export interface OpportunityMatch {
  opportunity: OpportunityDetail;
  thesisMatch: number;
  evidenceCoverage: number;
  evaluations: CriterionEvaluation[];
  strongestEvidenceIds: string[];
  nextDiligenceAction: string;
}
