import { describe, expect, it } from "vitest";
import { getOpportunity } from "../../../../lib/demo";
import {
  getDiligenceAxes,
  getEvidenceCoverage,
  getStrongClaims,
  getUnknowns,
} from "./diligence";

function fixture(id: string) {
  const opportunity = getOpportunity(id);
  if (!opportunity) throw new Error(`Missing demo fixture ${id}`);
  return opportunity;
}

describe("diligence view model", () => {
  it("keeps founder, market, and idea-market evidence as independent axes", () => {
    const axes = getDiligenceAxes(fixture("quanta-forge"));
    expect(axes.map((axis) => axis.name)).toEqual([
      "Founder",
      "Market",
      "Idea vs. market",
    ]);
    expect(axes).not.toHaveProperty("average");
  });

  it("counts expected evidence fields without turning missing fields into a negative score", () => {
    const coverage = getEvidenceCoverage(fixture("patch-pilot"));
    expect(coverage.coveredFields).toBeLessThan(coverage.expectedFields);
    expect(coverage.percent).toBeGreaterThan(0);
    expect(getUnknowns(fixture("patch-pilot")).some((item) => item.reason === "missing"))
      .toBe(true);
  });

  it("only elevates supported high-trust claims as strong evidence", () => {
    const claims = getStrongClaims(fixture("quanta-forge"));
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((claim) => claim.state === "supported" && claim.trust.score >= 75))
      .toBe(true);
  });

  it("surfaces contradictory evidence as unresolved", () => {
    const unknowns = getUnknowns(fixture("relay-mesh"));
    expect(unknowns.some((item) => item.reason === "contradicted")).toBe(true);
  });
});
