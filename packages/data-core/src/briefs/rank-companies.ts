import type { CompanyEvaluation } from "./types";

export type SearchTier = "strong_match" | "promising" | "needs_evidence" | "excluded";

export interface SearchSignals {
  matchedCriteria: string[];
  partialCriteria: string[];
  missingCriteria: string[];
  conflictingCriteria: string[];
}

export interface RankedCompany {
  rank: number;
  evaluation: CompanyEvaluation;
  score: number;
  confidenceAdjustedFit: number;
  tier: SearchTier;
  signals: SearchSignals;
}

const NEUTRAL_SCORE = 50;

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function confidenceAdjusted(value: number | null, coverage: number): number {
  const score = value ?? NEUTRAL_SCORE;
  const confidence = clampPercent(coverage) / 100;
  return NEUTRAL_SCORE + (score - NEUTRAL_SCORE) * confidence;
}

function axisAdjustedScore(
  evaluation: CompanyEvaluation,
  axisName: "founder" | "product_execution",
): number {
  const axis = evaluation.axes.find(({ axis }) => axis === axisName);
  return confidenceAdjusted(axis?.score ?? null, axis?.coverage ?? 0);
}

function hasBlockingConflict(evaluation: CompanyEvaluation): boolean {
  return evaluation.criteria.some(({ state, requirement }) =>
    state === "conflict" && (requirement === "required" || requirement === "excluded"));
}

function searchScore(evaluation: CompanyEvaluation): {
  score: number;
  confidenceAdjustedFit: number;
} {
  const adjustedFit = confidenceAdjusted(evaluation.thesisFit, evaluation.evidenceCoverage);
  const score = adjustedFit * 0.65
    + clampPercent(evaluation.evidenceCoverage) * 0.15
    + axisAdjustedScore(evaluation, "product_execution") * 0.1
    + axisAdjustedScore(evaluation, "founder") * 0.1;
  return {
    score: Number(score.toFixed(6)),
    confidenceAdjustedFit: Number(adjustedFit.toFixed(6)),
  };
}

function tier(evaluation: CompanyEvaluation): SearchTier {
  if (hasBlockingConflict(evaluation)) return "excluded";
  if (evaluation.recommendation === "investigate") return "strong_match";
  if (evaluation.recommendation === "needs_evidence") return "needs_evidence";
  return "promising";
}

function signals(evaluation: CompanyEvaluation): SearchSignals {
  const byState = (state: CompanyEvaluation["criteria"][number]["state"]) =>
    evaluation.criteria.filter((criterion) => criterion.state === state).map(({ criterionId }) => criterionId);
  return {
    matchedCriteria: byState("match"),
    partialCriteria: byState("partial"),
    missingCriteria: byState("missing"),
    conflictingCriteria: byState("conflict"),
  };
}

function enrichEvaluation(evaluation: CompanyEvaluation): Omit<RankedCompany, "rank"> {
  return {
    evaluation,
    ...searchScore(evaluation),
    tier: tier(evaluation),
    signals: signals(evaluation),
  };
}

function productExecutionScore(evaluation: CompanyEvaluation): number {
  return evaluation.axes.find((axis) => axis.axis === "product_execution")?.score ?? -1;
}

function compareRanked(
  left: Omit<RankedCompany, "rank">,
  right: Omit<RankedCompany, "rank">,
): number {
  return Number(left.tier === "excluded") - Number(right.tier === "excluded")
    || right.score - left.score
    || right.evaluation.evidenceCoverage - left.evaluation.evidenceCoverage
    || productExecutionScore(right.evaluation) - productExecutionScore(left.evaluation)
    || left.evaluation.companyId.localeCompare(right.evaluation.companyId, "en-US");
}

export function rankCompanies(evaluations: CompanyEvaluation[]): RankedCompany[] {
  return evaluations
    .map(enrichEvaluation)
    .sort(compareRanked)
    .map((result, index) => ({ ...result, rank: index + 1 }));
}
