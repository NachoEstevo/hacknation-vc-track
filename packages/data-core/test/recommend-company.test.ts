import { describe, expect, it } from "vitest";
import { recommendCompany } from "../src/briefs/recommend-company";
import type { CompanyEvaluation } from "../src/briefs/types";

function evaluation(overrides: Partial<CompanyEvaluation> = {}): CompanyEvaluation {
  return {
    companyId: "acme", companyName: "Acme", thesisFit: 80, evidenceCoverage: 70, criteria: [], axes: [], recommendation: "watch",
    ...overrides,
  };
}

describe("recommendCompany", () => {
  it("passes a company when a required criterion conflicts", () => {
    expect(recommendCompany(evaluation({ criteria: [{ criterionId: "geo", requirement: "required", state: "conflict", weight: 5, reason: "Conflict", evidenceIds: ["e1"] }] }), [])).toBe("pass_for_thesis");
  });

  it("passes a company when evidence satisfies an excluded criterion", () => {
    expect(recommendCompany(evaluation({ criteria: [{ criterionId: "exclude", requirement: "excluded", state: "conflict", weight: 5, reason: "Excluded", evidenceIds: ["e1"] }] }), [])).toBe("pass_for_thesis");
  });

  it.each([
    evaluation({ evidenceCoverage: 29 }),
    evaluation({ thesisFit: null, evidenceCoverage: 70 }),
  ])("requests evidence before scoring an insufficiently known company", (input) => {
    expect(recommendCompany(input, [])).toBe("needs_evidence");
  });

  it("recommends investigation only at the fit and coverage thresholds", () => {
    expect(recommendCompany(evaluation({ thesisFit: 70, evidenceCoverage: 60 }), [])).toBe("investigate");
  });

  it("watches evaluated companies outside the investigate thresholds", () => {
    expect(recommendCompany(evaluation({ thesisFit: 69, evidenceCoverage: 60 }), [])).toBe("watch");
  });
});
