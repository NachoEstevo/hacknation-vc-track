import { assessCompany } from "./assess-company.js";
import { recommendCompany } from "./recommend-company.js";
import type { ClaimCandidate, CompanyEvaluation, CompanyEvidenceBundle, CriterionEvaluation, FundThesis, ThesisCriterion } from "./types.js";

interface CandidateValue {
  value: string | number | boolean;
  evidenceIds: string[];
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function fieldValues(bundle: CompanyEvidenceBundle, criterion: ThesisCriterion): CandidateValue[] {
  const company = bundle.normalizedCompany;
  const clayEvidenceIds = bundle.evidence.filter((record) => record.sourceType === "clay_csv").map((record) => record.evidenceId);
  if (clayEvidenceIds.length === 0) return [];
  if (isSoftwareCriterion(criterion)) return softwareProductValues(bundle);
  if (isVisibleExecutionCriterion(criterion)) return visibleExecutionValues(bundle);
  const values: Array<string | boolean | null> = criterion.category === "geography"
    ? [company.countryCode ?? company.location]
    : criterion.category === "industry"
      ? industryValues(company.primaryIndustry, criterion)
      : criterion.category === "company_size"
        ? []
        : criterion.category === "product" || criterion.category === "market"
          ? [company.description]
          : [];
  return values.filter((value): value is string | boolean => value !== null).map((value) => ({ value, evidenceIds: clayEvidenceIds }));
}

function industryValues(primaryIndustry: string | null, criterion: ThesisCriterion): Array<string | boolean | null> {
  if (!primaryIndustry) return [];
  if (typeof criterion.expectedValue !== "string") return [];
  return normalized(primaryIndustry) === normalized(criterion.expectedValue) ? [primaryIndustry] : [];
}

function isSoftwareCriterion(criterion: ThesisCriterion): boolean {
  return criterion.category === "industry" && criterion.expectedValue === true
    && (criterion.criterionId.endsWith("-software") || /\bsoftware\b/iu.test(criterion.label));
}

function isVisibleExecutionCriterion(criterion: ThesisCriterion): boolean {
  return criterion.category === "traction" && criterion.operator === "exists" && criterion.expectedValue === true
    && /\bvisible execution\b/iu.test(criterion.label);
}

const SOFTWARE_OWNERSHIP_EVIDENCE = [
  /\b(?:we|the company)\s+(?:develops?|builds?|owns?|offers?|provides?|operates?|creates?)\b.{0,80}\b(?:saas|software|api|app|application|erp)\b/iu,
  /\bour\s+(?:[\p{L}\d-]+\s+){0,3}(?:saas|software|api|app|application|erp)\b/iu,
];
const SOFTWARE_PRODUCT_EVIDENCE = [
  /\b(?:saas|software)\s+(?:product|platform|application|app|suite|tool|solution|system)\b/iu,
  /\b(?:mobile[- ]first\s+)?erp\s+(?:suite|platform|system|product)\b/iu,
  /\bapi\s+(?:product|platform|service|solution|access)\b/iu,
  /\b(?:white[- ]label|developer|public)\s+api\b/iu,
  /\b(?:mobile|web|desktop)\s+app(?:lication)?\b/iu,
];
const SOFTWARE_NEGATIVE_EVIDENCE = [
  /\bnot\s+(?:a|an)\s+(?:tech|technology|software)\s+company\b/iu,
  /\bdo(?:es)?\s+not\s+(?:develop|build|own|offer|provide|sell)\s+(?:any\s+)?(?:proprietary\s+)?(?:software|saas|api|app|application|erp)\b/iu,
  /\bno\s+(?:proprietary|in[- ]house|owned)\s+(?:software|product|platform|api|app|application|erp)\b/iu,
];

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(stringValues);
  return [];
}

function softwareProductValues(bundle: CompanyEvidenceBundle): CandidateValue[] {
  const positiveEvidenceIds: string[] = [];
  const negativeEvidenceIds: string[] = [];
  for (const evidence of bundle.evidence) {
    const text = [evidence.excerpt ?? "", ...stringValues(evidence.payload)].join(" ");
    if (SOFTWARE_NEGATIVE_EVIDENCE.some((pattern) => pattern.test(text))) negativeEvidenceIds.push(evidence.evidenceId);
    else {
      const ownershipEvidence = SOFTWARE_OWNERSHIP_EVIDENCE.some((pattern) => pattern.test(text));
      const thirdPartyMarketplace = /\b(?:marketplace|community|directory)\b/iu.test(text)
        && /\b(?:third[- ]party|partner|vendor)\b/iu.test(text);
      if (ownershipEvidence || (!thirdPartyMarketplace && SOFTWARE_PRODUCT_EVIDENCE.some((pattern) => pattern.test(text)))) {
        positiveEvidenceIds.push(evidence.evidenceId);
      }
    }
  }
  if (negativeEvidenceIds.length > 0) return [{ value: false, evidenceIds: negativeEvidenceIds }];
  return positiveEvidenceIds.length > 0 ? [{ value: true, evidenceIds: positiveEvidenceIds }] : [];
}

function visibleExecutionValues(bundle: CompanyEvidenceBundle): CandidateValue[] {
  const evidenceIds = bundle.evidence.filter((evidence) => {
    if (evidence.sourceType === "github_public") return true;
    const signalLinks = evidence.payload?.signalLinks;
    return signalLinks !== null && typeof signalLinks === "object"
      && Object.values(signalLinks as Record<string, unknown>).some((links) => Array.isArray(links) && links.length > 0);
  }).map(({ evidenceId }) => evidenceId);
  return evidenceIds.length > 0 ? [{ value: true, evidenceIds }] : [];
}

interface NumericRange {
  minimum: number;
  maximum: number;
}

function teamSizeRange(value: string | null): NumericRange | null {
  if (!value) return null;
  if (/^self-employed$/iu.test(value.trim())) return { minimum: 1, maximum: 1 };
  const match = value.match(/(\d+)\s*[-–]\s*(\d+)/u);
  if (!match) return null;
  return { minimum: Number(match[1]), maximum: Number(match[2]) };
}

function companySizeEvaluation(bundle: CompanyEvidenceBundle, criterion: ThesisCriterion): CriterionEvaluation | null {
  if (criterion.category !== "company_size" || (criterion.operator !== "lte" && criterion.operator !== "gte")
    || typeof criterion.expectedValue !== "number") return null;
  const evidenceIds = bundle.evidence.filter(({ sourceType }) => sourceType === "clay_csv").map(({ evidenceId }) => evidenceId);
  const range = evidenceIds.length > 0 ? teamSizeRange(bundle.normalizedCompany.sizeBand) : null;
  if (!range) return { criterionId: criterion.criterionId, requirement: criterion.requirement, state: "missing", weight: criterion.weight, reason: "No comparable team-size range is available.", evidenceIds: [] };
  const relation = criterion.operator === "lte"
    ? range.maximum <= criterion.expectedValue ? "match" : range.minimum <= criterion.expectedValue ? "partial" : "nonmatch"
    : range.minimum >= criterion.expectedValue ? "match" : range.maximum >= criterion.expectedValue ? "partial" : "nonmatch";
  const state = relation === "match"
    ? criterion.requirement === "excluded" ? "conflict" : "match"
    : relation === "partial" ? "partial"
      : criterion.requirement === "required" ? "conflict" : criterion.requirement === "excluded" ? "match" : "partial";
  return { criterionId: criterion.criterionId, requirement: criterion.requirement, state, weight: criterion.weight, reason: relation === "partial" ? "The reported team-size range overlaps the criterion boundary." : state === "match" ? "The reported team-size range matches this criterion." : "The reported team-size range does not match this criterion.", evidenceIds };
}

function relevantClaim(claim: ClaimCandidate, criterion: ThesisCriterion): boolean {
  const predicate = normalized(claim.predicate);
  return [criterion.criterionId, criterion.category, criterion.label].some((value) => predicate === normalized(value));
}

function claimValues(bundle: CompanyEvidenceBundle, criterion: ThesisCriterion, claims: ClaimCandidate[]): CandidateValue[] {
  const knownEvidenceIds = new Set(bundle.evidence.map((record) => record.evidenceId));
  return claims
    .filter((claim) => claim.companyId === bundle.companyId && claim.state === "supported" && relevantClaim(claim, criterion) && claim.evidenceIds.some((id) => knownEvidenceIds.has(id)))
    .map((claim) => ({
      value: claim.value,
      evidenceIds: claim.evidenceIds.filter((id) => knownEvidenceIds.has(id)),
    }));
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

function comparable(operator: ThesisCriterion["operator"], expectedValue: ThesisCriterion["expectedValue"], candidate: CandidateValue): boolean {
  if (operator === "one_of") return Array.isArray(expectedValue) && typeof candidate.value === "string";
  if (operator === "gte" || operator === "lte") return typeof expectedValue === "number" && typeof candidate.value === "number";
  if (operator === "contains") return typeof expectedValue === "string" && typeof candidate.value === "string";
  if (operator === "exists" || operator === "not_exists") return true;
  return !Array.isArray(expectedValue) && (typeof expectedValue === typeof candidate.value);
}

function evaluateCriterion(bundle: CompanyEvidenceBundle, criterion: ThesisCriterion, claims: ClaimCandidate[]): CriterionEvaluation {
  const sizeEvaluation = companySizeEvaluation(bundle, criterion);
  if (sizeEvaluation) return sizeEvaluation;
  const normalizedCandidates = fieldValues(bundle, criterion);
  const isAuthoritative = criterion.category === "geography" || criterion.category === "industry";
  const allowClaims = !isSoftwareCriterion(criterion) && !isVisibleExecutionCriterion(criterion)
    && !(isAuthoritative && normalizedCandidates.length > 0);
  const candidates = [
    ...normalizedCandidates,
    ...(allowClaims ? claimValues(bundle, criterion, claims) : []),
  ]
    .filter((candidate) => comparable(criterion.operator, criterion.expectedValue, candidate));
  const evidenceIds = [...new Set(candidates.flatMap((candidate) => candidate.evidenceIds))];
  const hasMatch = candidates.some((candidate) => matches(criterion.operator, criterion.expectedValue, candidate));
  const hasNonMatch = candidates.some((candidate) => !matches(criterion.operator, criterion.expectedValue, candidate));
  const hasConflict = hasMatch && hasNonMatch;
  const state = candidates.length === 0 ? "missing"
    : hasConflict ? "conflict"
      : criterion.requirement === "excluded" ? hasMatch ? "conflict" : "match"
        : hasMatch ? "match"
          : criterion.requirement === "required" ? "conflict" : "partial";
  const reason = state === "missing"
    ? "No cited company value is available for this criterion."
    : state === "conflict"
      ? criterion.requirement === "excluded" && hasMatch
        ? "Evidence satisfies an excluded condition."
        : criterion.requirement === "required" && !hasMatch
          ? "Cited company evidence conflicts with a required criterion."
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
