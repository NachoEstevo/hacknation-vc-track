import type {
  ClaimPredicate,
  ClaimRecord,
  CriterionEvaluation,
  OpportunityDetail,
  OpportunityMatch,
  SearchCriterion,
  SearchIntent,
} from "../domain";

const FIELD_PREDICATES: Record<SearchCriterion["field"], ClaimPredicate[]> = {
  sector: ["project.sector"],
  geography: ["project.region", "project.country"],
  stage: ["project.stage"],
  team_size: ["project.team_size"],
  technical_founder: ["founder.technical"],
  institutional_funding: ["project.institutional_funding"],
  raising: ["project.raising"],
  working_demo: ["project.working_demo"],
  hackathon_origin: ["project.hackathon_origin"],
  traction: ["project.traction"],
  check_size: [],
  acceptable_risk: [],
  team_preferences: [],
  valued_signal_types: [],
};

const CRITERION_WEIGHTS = {
  required: 2,
  preferred: 1,
  exclude: 2,
} as const;

function valuesOverlap(actual: ClaimRecord["value"], expected: SearchCriterion["value"]): boolean {
  const actualValues = Array.isArray(actual) ? actual : [actual];
  const expectedValues = Array.isArray(expected) ? expected : [expected];
  return expectedValues.some((value) => actualValues.includes(value));
}

function containsAll(actual: ClaimRecord["value"], expected: SearchCriterion["value"]): boolean {
  const actualValues = Array.isArray(actual) ? actual : [actual];
  const expectedValues = Array.isArray(expected) ? expected : [expected];
  return expectedValues.every((value) => actualValues.includes(value));
}

function claimMatchesCriterion(claim: ClaimRecord, criterion: SearchCriterion): boolean {
  if (criterion.field === "traction" && criterion.value === true) {
    return claim.value !== false && claim.value !== null && claim.value !== "none";
  }
  switch (criterion.operator) {
    case "equals":
    case "includes_any":
      return valuesOverlap(claim.value, criterion.value);
    case "contains_all":
      return containsAll(claim.value, criterion.value);
    case "lte":
      return typeof claim.value === "number"
        && typeof criterion.value === "number"
        && claim.value <= criterion.value;
    case "gte":
      return typeof claim.value === "number"
        && typeof criterion.value === "number"
        && claim.value >= criterion.value;
    case "between":
      return typeof claim.value === "number"
        && Array.isArray(criterion.value)
        && criterion.value.length === 2
        && typeof criterion.value[0] === "number"
        && typeof criterion.value[1] === "number"
        && claim.value >= criterion.value[0]
        && claim.value <= criterion.value[1];
  }
}

function uniqueEvidenceIds(claims: ClaimRecord[]): string[] {
  return [...new Set(claims.flatMap((claim) => claim.evidence.map((link) => link.evidenceId)))];
}

function evaluateCriterion(
  opportunity: OpportunityDetail,
  criterion: SearchCriterion,
): CriterionEvaluation {
  const predicates = FIELD_PREDICATES[criterion.field];
  const claims = opportunity.claims.filter((claim) => predicates.includes(claim.predicate));
  const evidenceIds = uniqueEvidenceIds(claims);

  if (claims.length === 0) {
    return {
      criterion,
      state: "missing",
      explanation: `No evidence is available for ${criterion.label.toLowerCase()}.`,
      evidenceIds: [],
    };
  }

  const contradicted = claims.find((claim) => claim.state === "contradicted");
  if (contradicted) {
    return {
      criterion,
      state: "conflict",
      explanation: `${contradicted.statement} The available sources disagree.`,
      evidenceIds,
    };
  }

  const matching = claims.filter((claim) => claimMatchesCriterion(claim, criterion));
  const nonMatching = claims.filter((claim) => !claimMatchesCriterion(claim, criterion));
  const supportedMatch = matching.find((claim) => claim.state === "supported");
  const tentativeMatch = matching.find((claim) => claim.state !== "supported");
  const supportedOpposite = nonMatching.find((claim) => claim.state === "supported");

  if (criterion.priority === "exclude") {
    if (supportedMatch) {
      return {
        criterion,
        state: "conflict",
        explanation: `${supportedMatch.statement} This conflicts with the exclusion.`,
        evidenceIds,
      };
    }
    if (tentativeMatch) {
      return {
        criterion,
        state: "partial",
        explanation: `${tentativeMatch.statement} The excluded condition is possible but not fully supported.`,
        evidenceIds,
      };
    }
    if (supportedOpposite) {
      return {
        criterion,
        state: "match",
        explanation: supportedOpposite.statement,
        evidenceIds,
      };
    }
    return {
      criterion,
      state: "partial",
      explanation: "Available evidence tentatively indicates that the excluded condition is not present, but it is not fully supported.",
      evidenceIds,
    };
  }

  if (supportedMatch) {
    return {
      criterion,
      state: "match",
      explanation: supportedMatch.statement,
      evidenceIds,
    };
  }
  if (tentativeMatch) {
    return {
      criterion,
      state: "partial",
      explanation: `${tentativeMatch.statement} The evidence is not yet fully supported.`,
      evidenceIds,
    };
  }
  if (supportedOpposite) {
    return {
      criterion,
      state: "conflict",
      explanation: `${supportedOpposite.statement} This does not satisfy ${criterion.label.toLowerCase()}.`,
      evidenceIds,
    };
  }

  return {
    criterion,
    state: "partial",
    explanation: `The available evidence for ${criterion.label.toLowerCase()} is inconclusive.`,
    evidenceIds,
  };
}

function percentage(value: number): number {
  return Number((value * 100).toFixed(0));
}

export function matchOpportunity(
  opportunity: OpportunityDetail,
  intent: SearchIntent,
): OpportunityMatch {
  const evaluations = intent.criteria.map((criterion) => evaluateCriterion(opportunity, criterion));
  let assessedWeight = 0;
  let matchedWeight = 0;
  let totalWeight = 0;

  for (const evaluation of evaluations) {
    const weight = CRITERION_WEIGHTS[evaluation.criterion.priority];
    totalWeight += weight;
    if (evaluation.state === "missing") continue;
    assessedWeight += weight;
    if (evaluation.state === "match") matchedWeight += weight;
    if (evaluation.state === "partial") matchedWeight += weight * 0.5;
  }

  const thesisMatch = assessedWeight === 0 ? 0 : percentage(matchedWeight / assessedWeight);
  const evidenceCoverage = totalWeight === 0 ? 0 : percentage(assessedWeight / totalWeight);
  const strongestEvidenceIds = [
    ...new Set(
      evaluations
        .filter((evaluation) => evaluation.state === "match" || evaluation.state === "partial")
        .flatMap((evaluation) => evaluation.evidenceIds),
    ),
  ].slice(0, 4);
  const firstConflict = evaluations.find((evaluation) => evaluation.state === "conflict");
  const firstMissing = evaluations.find((evaluation) => evaluation.state === "missing");

  return {
    opportunity,
    thesisMatch,
    evidenceCoverage,
    evaluations,
    strongestEvidenceIds,
    nextDiligenceAction: firstConflict
      ? `Resolve conflicting evidence for ${firstConflict.criterion.label.toLowerCase()}.`
      : firstMissing
        ? `Request evidence for ${firstMissing.criterion.label.toLowerCase()}.`
        : "Inspect the strongest evidence and decide whether to contact the founder.",
  };
}

function conflictCount(match: OpportunityMatch): number {
  return match.evaluations.filter((evaluation) => evaluation.state === "conflict").length;
}

export function rankOpportunityMatches(matches: OpportunityMatch[]): OpportunityMatch[] {
  return [...matches].sort((left, right) =>
    conflictCount(left) - conflictCount(right)
    || right.evidenceCoverage - left.evidenceCoverage
    || right.thesisMatch - left.thesisMatch
    || left.opportunity.project.name.localeCompare(right.opportunity.project.name));
}
