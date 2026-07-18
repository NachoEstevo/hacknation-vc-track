import { describe, expect, it } from "vitest";
import { rankCompanies } from "../src/briefs/rank-companies.js";
import type { CompanyEvaluation } from "../src/briefs/types.js";

function evaluation(
  companyId: string,
  thesisFit: number | null,
  evidenceCoverage: number,
  productExecutionScore: number | null,
): CompanyEvaluation {
  return {
    companyId,
    companyName: companyId,
    thesisFit,
    evidenceCoverage,
    criteria: [],
    axes: [{
      axis: "product_execution",
      score: productExecutionScore,
      coverage: productExecutionScore === null ? 0 : 100,
      dimensions: [],
    }],
    recommendation: "watch",
  };
}

describe("rankCompanies", () => {
  it("ranks by known thesis fit, coverage, Product/Execution score, then stable company ID", () => {
    const result = rankCompanies([
      evaluation("missing-fit", null, 100, 100),
      evaluation("lower-fit", 80, 100, 100),
      evaluation("low-coverage", 90, 20, 100),
      evaluation("lower-product", 90, 70, 40),
      evaluation("company-b", 90, 70, 60),
      evaluation("company-a", 90, 70, 60),
    ]);

    expect(result.map(({ rank, evaluation: item }) => [rank, item.companyId])).toEqual([
      [1, "company-a"],
      [2, "company-b"],
      [3, "lower-product"],
      [4, "low-coverage"],
      [5, "lower-fit"],
      [6, "missing-fit"],
    ]);
  });

  it("does not let equal-fit lower coverage outrank higher coverage", () => {
    const result = rankCompanies([
      evaluation("low-coverage", 100, 25, 100),
      evaluation("high-coverage", 100, 75, 0),
    ]);

    expect(result.map(({ evaluation: item }) => item.companyId)).toEqual([
      "high-coverage",
      "low-coverage",
    ]);
  });

  it("does not mutate model or evaluation order", () => {
    const evaluations = [evaluation("b", 50, 50, null), evaluation("a", 50, 50, null)];

    rankCompanies(evaluations);

    expect(evaluations.map((item) => item.companyId)).toEqual(["b", "a"]);
  });
});
