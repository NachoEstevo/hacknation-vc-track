import { describe, expect, it } from "vitest";
import { ThesisValidationError, validateFundThesis } from "../src/briefs/validate-thesis.js";
import type { FundThesis } from "../src/briefs/types.js";

const thesis: FundThesis = {
  thesisId: "seed-thesis",
  originalQuery: "Early B2B software",
  generatedAt: "2026-07-18T00:00:00.000Z",
  promptVersion: "v1",
  criteria: [{
    criterionId: "country",
    category: "geography",
    label: "US companies",
    requirement: "required",
    weight: 5,
    operator: "one_of",
    expectedValue: ["US", "GB"],
  }],
};

function issuesFor(value: unknown): string[] {
  try {
    validateFundThesis(value);
    throw new Error("Expected thesis validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ThesisValidationError);
    return (error as ThesisValidationError).issues;
  }
}

describe("validateFundThesis", () => {
  it("accepts the approved thesis and criterion unions", () => {
    const accepted: FundThesis = {
      ...thesis,
      criteria: [
        { ...thesis.criteria[0]!, category: "geography", operator: "equals", expectedValue: "US" },
        { ...thesis.criteria[0]!, criterionId: "industry", category: "industry", operator: "one_of", expectedValue: ["Software"] },
        { ...thesis.criteria[0]!, criterionId: "size", category: "company_size", operator: "contains", expectedValue: "1-10" },
        { ...thesis.criteria[0]!, criterionId: "stage", category: "stage", operator: "gte", expectedValue: 2 },
        { ...thesis.criteria[0]!, criterionId: "founder", category: "founder", operator: "lte", expectedValue: 5 },
        { ...thesis.criteria[0]!, criterionId: "market", category: "market", operator: "exists", expectedValue: true },
        { ...thesis.criteria[0]!, criterionId: "product", category: "product", operator: "not_exists", expectedValue: false },
        { ...thesis.criteria[0]!, criterionId: "traction", category: "traction", requirement: "preferred", weight: 4, operator: "equals", expectedValue: true },
        { ...thesis.criteria[0]!, criterionId: "exclusion", category: "exclusion", requirement: "excluded", weight: 3, operator: "equals", expectedValue: false },
        { ...thesis.criteria[0]!, criterionId: "custom", category: "custom", weight: 2, operator: "equals", expectedValue: false },
      ],
    };

    expect(validateFundThesis(accepted)).toEqual(accepted);
  });

  it.each([
    ["criteria", { ...thesis, criteria: [] }],
    ["criteria[0].weight", { ...thesis, criteria: [{ ...thesis.criteria[0]!, weight: 6 }] }],
    ["criteria[0].operator", { ...thesis, criteria: [{ ...thesis.criteria[0]!, operator: "matches" }] }],
    ["criteria[0].expectedValue", { ...thesis, criteria: [{ ...thesis.criteria[0]!, expectedValue: [] }] }],
    ["criteria[0].expectedValue", { ...thesis, criteria: [{ ...thesis.criteria[0]!, operator: "gte", expectedValue: "10" }] }],
    ["criteria[1].criterionId", { ...thesis, criteria: [...thesis.criteria, { ...thesis.criteria[0]! }] }],
  ])("rejects invalid data at %s", (path, invalidThesis) => {
    expect(issuesFor(invalidThesis)).toContain(path);
  });

  it.each([
    ["exists with false", { operator: "exists", expectedValue: false }],
    ["not_exists with true", { operator: "not_exists", expectedValue: true }],
    ["empty equals", { operator: "equals", expectedValue: "   " }],
    ["empty contains", { operator: "contains", expectedValue: "   " }],
  ])("rejects %s at the scalar value path", (_case, invalidCriterion) => {
    expect(issuesFor({
      ...thesis,
      criteria: [{ ...thesis.criteria[0]!, ...invalidCriterion }],
    })).toContain("criteria[0].expectedValue");
  });
});
