import type { AssessmentAxis, CompanyEvaluation, InvestmentBrief } from "./types";

export function recommendCompany(
  evaluation: CompanyEvaluation,
  _axes: AssessmentAxis[],
): InvestmentBrief["recommendation"] {
  const hasBlockingConflict = evaluation.criteria.some((criterion) =>
    criterion.state === "conflict" && (criterion.requirement === "required" || criterion.requirement === "excluded"),
  );
  if (hasBlockingConflict) return "pass_for_thesis";
  if (evaluation.evidenceCoverage < 30 || evaluation.thesisFit === null) return "needs_evidence";
  if (evaluation.thesisFit >= 70 && evaluation.evidenceCoverage >= 60) return "investigate";
  return "watch";
}
