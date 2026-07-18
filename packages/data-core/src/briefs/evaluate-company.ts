import { assessCompany } from "./assess-company.js";
import { recommendCompany } from "./recommend-company.js";
import type { ClaimCandidate, CompanyEvaluation, CompanyEvidenceBundle, CriterionEvaluation, FundThesis, ThesisCriterion } from "./types.js";

interface CandidateValue {
  value: string | number | boolean;
  evidenceIds: string[];
  conflicted: boolean;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function fieldValues(bundle: CompanyEvidenceBundle, criterion: ThesisCriterion): CandidateValue[] {
  const company = bundle.normalizedCompany;
  const clayEvidenceIds = bundle.evidence.filter((record) => record.sourceType === "clay_csv").map((record) => record.evidenceId);
  const values: Array<string | null> = criterion.category === "geography"
    ? [company.countryCode, company.location]
    : criterion.category === "industry"
      ? [company.primaryIndustry]
      : criterion.category === "company_size"
        ? [company.sizeBand]
        : criterion.category === "product" || criterion.category === "market"
          ? [company.description]
          : [];
  return values.filter((value): value is string => value !== null).map((value) => ({ value, evidenceIds: clayEvidenceIds, conflicted: false }));
}

function relevantClaim(claim: ClaimCandidate, criterion: ThesisCriterion): boolean {
  const predicate = normalized(claim.predicate);
  return [criterion.criterionId, criterion.category, criterion.label].some((value) => predicate === normalized(value));
}

function claimValues(bundle: CompanyEvidenceBundle, criterion: ThesisCriterion, claims: ClaimCandidate[]): CandidateValue[] {
  const knownEvidenceIds = new Set(bundle.evidence.map((record) => record.evidenceId));
  return claims
    .filter((claim) => claim.companyId === bundle.companyId && claim.state !== "unverified" && relevantClaim(claim, criterion) && claim.evidenceIds.some((id) => knownEvidenceIds.has(id)))
    .map((claim) => ({ value: claim.value, evidenceIds: claim.evidenceIds, conflicted: claim.state === "conflicted" }));
}

function equals(left: string | number | boolean, right: string | number | boolean): boolean {
  return typeof left === "string" && typeof right === "string" ? normalized(left) === normalized(right) : left === right;
}

function matches(operator: ThesisCriterion["operator"], expectedValue: ThesisCriterion["expectedValue"], candidate: CandidateValue): boolean {
  if (operator === "equals") return !Array.isArray(expectedValue) && equals(candidate.value, expectedValue);
  if (operator === "one_of") return Array.isArray(expectedValue) && expectedValue.some((value) => equals(candidate.value, value));
  if (operator === "contains") return typeof candidate.value === "string" && typeof expectedValue === "string" && normalized(candidate.value).includes(normalized(expectedValue));
  if (operator === "gte") return typeof candidate.value === "number" && typeof expectedValue === "number" && candidate.value >= expectedValue;
  if (operator === "lte") return typeof candidate.value === "number" && typeof expectedValue === "number" && candidate.value <= expectedValue;
  if (operator === "exists") return expectedValue === true && candidate.value !== null;
  return expectedValue === false && candidate.value === false;
}

function evaluateCriterion(bundle: CompanyEvidenceBundle, criterion: ThesisCriterion, claims: ClaimCandidate[]): CriterionEvaluation {
  const candidates = [...fieldValues(bundle, criterion), ...claimValues(bundle, criterion, claims)];
  const evidenceIds = [...new Set(candidates.flatMap((candidate) => candidate.evidenceIds))];
  const hasMatch = candidates.some((candidate) => matches(criterion.operator, criterion.expectedValue, candidate));
  const hasConflict = candidates.some((candidate) => candidate.conflicted);
  const state = candidates.length === 0
    ? "missing"
    : hasConflict || (criterion.requirement === "excluded" && hasMatch)
      ? "conflict"
      : hasMatch
        ? "match"
        : "partial";
  const reason = state === "missing"
    ? "No cited company value is available for this criterion."
    : state === "conflict"
      ? criterion.requirement === "excluded" && hasMatch
        ? "Evidence satisfies an excluded condition."
        : "Cited evidence is conflicted."
      : state === "match"
        ? "Cited company evidence matches this criterion."
        : "Cited company evidence is present but does not fully match this criterion.";

  return { criterionId: criterion.criterionId, requirement: criterion.requirement, state, weight: criterion.weight, reason, evidenceIds };
}

export function evaluateCompany(
  thesis: FundThesis,
  bundle: CompanyEvidenceBundle,
  claims: ClaimCandidate[],
): CompanyEvaluation {
  const criteria = thesis.criteria.map((criterion) => evaluateCriterion(bundle, criterion, claims));
  const known = criteria.filter((criterion) => criterion.state !== "missing");
  const totalWeight = criteria.reduce((total, criterion) => total + criterion.weight, 0);
  const knownWeight = known.reduce((total, criterion) => total + criterion.weight, 0);
  const fitPoints = known.reduce((total, criterion) => total + criterion.weight * (criterion.state === "match" ? 1 : criterion.state === "partial" ? 0.5 : 0), 0);

  const axes = assessCompany(bundle, claims);
  const evaluation: CompanyEvaluation = {
    companyId: bundle.companyId,
    companyName: bundle.companyName,
    thesisFit: knownWeight === 0 ? null : fitPoints / knownWeight * 100,
    evidenceCoverage: totalWeight === 0 ? 0 : knownWeight / totalWeight * 100,
    criteria,
    axes,
    recommendation: "watch",
  };
  return { ...evaluation, recommendation: recommendCompany(evaluation, axes) };
}
