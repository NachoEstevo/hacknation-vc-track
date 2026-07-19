import { softwareProductSignals } from "./software-product-evidence";
import type { CompanyEvidenceBundle, CriterionEvaluation, ThesisCriterion } from "./types";

const B2B_POSITIVE = [
  /\bb2b\b/iu,
  /\bbusiness[- ]to[- ]business\b/iu,
  /\bfor\s+(?:[\p{L}\d-]+\s+){0,3}(?:businesses|companies|enterprises|teams)\b/iu,
  /\b(?:business|enterprise)\s+customers?\b/iu,
];
const B2B_NEGATIVE = [
  /\b(?:not|isn['’]t)\s+(?:a\s+)?b2b\b/iu,
  /\bb2c\b/iu,
  /\bconsumer(?:-only|\s+(?:service|product|app|business))\b/iu,
  /\bfor\s+(?:individual\s+)?consumers\b/iu,
];

export function isCompositeB2BSoftwareCriterion(criterion: ThesisCriterion): boolean {
  return criterion.category === "industry" && criterion.operator === "equals" && criterion.expectedValue === true
    && /\bb2b\b/iu.test(criterion.label) && /\bsoftware\b/iu.test(criterion.label);
}

function b2bSignals(bundle: CompanyEvidenceBundle) {
  const positiveEvidenceIds: string[] = [];
  const negativeEvidenceIds: string[] = [];
  for (const evidence of bundle.evidence) {
    const text = `${evidence.excerpt ?? ""} ${evidence.payload === null ? "" : JSON.stringify(evidence.payload)}`;
    if (B2B_NEGATIVE.some((pattern) => pattern.test(text))) negativeEvidenceIds.push(evidence.evidenceId);
    else if (B2B_POSITIVE.some((pattern) => pattern.test(text))) positiveEvidenceIds.push(evidence.evidenceId);
  }
  return { positiveEvidenceIds, negativeEvidenceIds };
}

export function evaluateCompositeB2BSoftware(
  bundle: CompanyEvidenceBundle,
  criterion: ThesisCriterion,
): CriterionEvaluation {
  const b2b = b2bSignals(bundle);
  const software = softwareProductSignals(bundle);
  const negativeEvidenceIds = [...new Set([...b2b.negativeEvidenceIds, ...software.negativeEvidenceIds])];
  const positiveEvidenceIds = [...new Set([...b2b.positiveEvidenceIds, ...software.positiveEvidenceIds])];
  const bothSupported = b2b.positiveEvidenceIds.length > 0 && software.positiveEvidenceIds.length > 0;
  const oneSupported = b2b.positiveEvidenceIds.length > 0 || software.positiveEvidenceIds.length > 0;
  const state = negativeEvidenceIds.length > 0
    ? "conflict"
    : bothSupported ? criterion.requirement === "excluded" ? "conflict" : "match"
      : oneSupported ? "partial" : "missing";
  const reason = state === "match"
    ? "Cited evidence supports both a B2B model and an owned software product."
    : state === "partial"
      ? "Cited evidence supports only one side of the B2B software criterion."
      : state === "conflict"
        ? "Cited evidence explicitly conflicts with the B2B software criterion."
        : "No cited B2B or owned-software evidence is available.";
  return {
    criterionId: criterion.criterionId,
    requirement: criterion.requirement,
    state,
    weight: criterion.weight,
    reason,
    evidenceIds: state === "conflict" ? negativeEvidenceIds : positiveEvidenceIds,
  };
}
