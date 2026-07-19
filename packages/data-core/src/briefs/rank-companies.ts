import type { CompanyEvaluation } from "./types.js";

export interface RankedCompany {
  rank: number;
  evaluation: CompanyEvaluation;
}

function productExecutionScore(evaluation: CompanyEvaluation): number {
  return evaluation.axes.find((axis) => axis.axis === "product_execution")?.score ?? -1;
}

function compareEvaluations(left: CompanyEvaluation, right: CompanyEvaluation): number {
  return (right.thesisFit ?? -1) - (left.thesisFit ?? -1)
    || right.evidenceCoverage - left.evidenceCoverage
    || productExecutionScore(right) - productExecutionScore(left)
    || left.companyId.localeCompare(right.companyId, "en-US");
}

export function rankCompanies(evaluations: CompanyEvaluation[]): RankedCompany[] {
  return [...evaluations]
    .sort(compareEvaluations)
    .map((evaluation, index) => ({ rank: index + 1, evaluation }));
}
