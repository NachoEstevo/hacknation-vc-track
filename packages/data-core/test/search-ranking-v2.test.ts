import { describe, expect, it } from "vitest";
import { rankCompanies } from "../src/briefs/rank-companies.js";
import type { AssessmentAxis, CompanyEvaluation } from "../src/briefs/types.js";

function axis(
  name: AssessmentAxis["axis"],
  score: number | null,
  coverage: number,
): AssessmentAxis {
  return { axis: name, score, coverage, dimensions: [] };
}

function evaluation(options: {
  id: string;
  fit: number | null;
  coverage: number;
  product?: number | null;
  productCoverage?: number;
  founder?: number | null;
  founderCoverage?: number;
  conflict?: boolean;
}): CompanyEvaluation {
  return {
    companyId: options.id,
    companyName: options.id,
    thesisFit: options.fit,
    evidenceCoverage: options.coverage,
    criteria: [{
      criterionId: "required-market",
      requirement: "required",
      state: options.conflict ? "conflict" : "match",
      weight: 5,
      reason: "test",
      evidenceIds: [],
    }],
    axes: [
      axis("product_execution", options.product ?? null, options.productCoverage ?? 0),
      axis("founder", options.founder ?? null, options.founderCoverage ?? 0),
    ],
    recommendation: options.conflict ? "pass_for_thesis" : "watch",
  };
}

describe("confidence-aware company ranking", () => {
  it("puts blocking required conflicts after viable matches", () => {
    const ranked = rankCompanies([
      evaluation({ id: "blocked", fit: 100, coverage: 100, product: 100, productCoverage: 100, conflict: true }),
      evaluation({ id: "viable", fit: 70, coverage: 60, product: 60, productCoverage: 60 }),
    ]);

    expect(ranked.map(({ evaluation: item }) => item.companyId)).toEqual(["viable", "blocked"]);
    expect(ranked[1]).toMatchObject({ tier: "excluded" });
  });

  it("prefers a well-supported strong fit over a perfect fit with sparse evidence", () => {
    const ranked = rankCompanies([
      evaluation({ id: "perfect-sparse", fit: 100, coverage: 35, product: 100, productCoverage: 25 }),
      evaluation({ id: "strong-supported", fit: 84, coverage: 75, product: 80, productCoverage: 75 }),
    ]);

    expect(ranked.map(({ evaluation: item }) => item.companyId)).toEqual([
      "strong-supported",
      "perfect-sparse",
    ]);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it("treats missing founder evidence as neutral instead of a negative founder score", () => {
    const [result] = rankCompanies([
      evaluation({ id: "under-the-radar", fit: 80, coverage: 50, product: 80, productCoverage: 50 }),
    ]);

    expect(result).toMatchObject({
      confidenceAdjustedFit: 65,
      signals: {
        matchedCriteria: ["required-market"],
        missingCriteria: [],
        conflictingCriteria: [],
      },
    });
    expect(result!.score).toBeGreaterThan(50);
  });
});
