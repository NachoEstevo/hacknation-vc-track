import type { CompanyEvaluation } from "./types.js";

export interface RankedCompany {
  rank: number;
  evaluation: CompanyEvaluation;
}

function productExecutionScore(evaluation: CompanyEvaluation): number {
  return evaluation.axes.find((axis) => axis.axis === "product_execution")?.score ?? -1;
}

function coverageAdjustedFit(evaluation: CompanyEvaluation): number {
  return evaluation.thesisFit === null ? -1 : evaluation.thesisFit * evaluation.evidenceCoverage / 100;
}

function compareEvaluations(left: CompanyEvaluation, right: CompanyEvaluation): number {
  return coverageAdjustedFit(right) - coverageAdjustedFit(left)
    || right.evidenceCoverage - left.evidenceCoverage
    || (right.thesisFit ?? -1) - (left.thesisFit ?? -1)
    || productExecutionScore(right) - productExecutionScore(left)
    || (left.companyId < right.companyId ? -1 : left.companyId > right.companyId ? 1 : 0);
}

export function rankCompanies(evaluations: CompanyEvaluation[]): RankedCompany[] {
  return [...evaluations]
    .sort(compareEvaluations)
    .map((evaluation, index) => ({ rank: index + 1, evaluation }));
}
