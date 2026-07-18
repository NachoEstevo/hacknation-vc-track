import { describe, expect, it } from "vitest";
import { validateBriefCitations } from "../src/briefs/validate-brief-citations.js";
import type { EvidenceRecord, InvestmentBrief } from "../src/briefs/types.js";

function evidenceWithValue(value: string): EvidenceRecord[] {
  return [{
    evidenceId: "evidence-1",
    companyId: "acme",
    sourceType: "stripe_private",
    sourceUrl: null,
    snapshotPath: null,
    capturedAt: "2026-07-18T00:00:00.000Z",
    excerpt: `Reported values: ${value}.`,
    payload: null,
    verificationState: "verified",
    visibility: "investor_private",
  }];
}

function analysisBrief(value: string): InvestmentBrief {
  return {
    companyId: "acme",
    thesisId: "thesis-1",
    recommendation: "investigate",
    thesisFit: 80,
    evidenceCoverage: 75,
    axes: [],
    summary: [],
    strengths: [{
      text: `The relevant values are ${value}.`,
      statementKind: "analysis",
      evidenceIds: ["evidence-1"],
    }],
    risks: [],
    evidenceGaps: [],
    diligenceQuestions: [],
    generatedAt: "2026-07-18T00:00:00.000Z",
    promptVersion: "v1",
  };
}

function invalidNumericResult() {
  return {
    valid: false,
    errors: [{ code: "unsupported_numeric_value", section: "strengths", statementIndex: 0 }],
  };
}

describe("validateBriefCitations numeric canonicalization", () => {
  it("does not partial-match .5% as 5%", () => {
    expect(validateBriefCitations(
      analysisBrief(".5%"),
      evidenceWithValue("5%"),
    )).toEqual(invalidNumericResult());
  });

  it.each([
    ["0.5%", ".5%"],
    [".500%", "0.5%"],
  ])("accepts equivalent leading-decimal percentages", (citedValue, analysisValue) => {
    expect(validateBriefCitations(
      analysisBrief(analysisValue),
      evidenceWithValue(citedValue),
    )).toEqual({ valid: true, errors: [] });
  });

  it.each([
    ["35%", "35-40%"],
    ["35", "35-40%"],
  ])("rejects a range unless both percentage endpoints are grounded", (citedValue, analysisValue) => {
    expect(validateBriefCitations(
      analysisBrief(analysisValue),
      evidenceWithValue(citedValue),
    )).toEqual(invalidNumericResult());
  });

  it.each([
    ["35% and 40%", "35-40%"],
    ["35-40%", "35% to 40%"],
  ])("accepts a range when both percentage endpoints are grounded", (citedValue, analysisValue) => {
    expect(validateBriefCitations(
      analysisBrief(analysisValue),
      evidenceWithValue(citedValue),
    )).toEqual({ valid: true, errors: [] });
  });

  it.each([
    ["9007199254740992", "9007199254740993"],
    ["9007199254740992.1", "9007199254740992.2"],
  ])("does not collapse distinct high-precision values", (citedValue, analysisValue) => {
    expect(validateBriefCitations(
      analysisBrief(analysisValue),
      evidenceWithValue(citedValue),
    )).toEqual(invalidNumericResult());
  });

  it.each([
    ["9,007,199,254,740,992", "9007199254740992"],
    ["9007199254740992", "9.007199254740992e15"],
    ["9007199254740992", "9007199.254740992B"],
  ])("preserves exact equivalence across supported numeric formats", (citedValue, analysisValue) => {
    expect(validateBriefCitations(
      analysisBrief(analysisValue),
      evidenceWithValue(citedValue),
    )).toEqual({ valid: true, errors: [] });
  });

  it.each([
    ["35", "35-40"],
    ["$35", "$35-$40"],
    ["2026", "2026-07-18"],
  ])("rejects partially grounded hyphenated expressions", (citedValue, analysisValue) => {
    expect(validateBriefCitations(
      analysisBrief(analysisValue),
      evidenceWithValue(citedValue),
    )).toEqual(invalidNumericResult());
  });

  it.each([
    ["35 and 40", "35-40"],
    ["35-40", "35 and 40"],
    ["$35 and $40", "$35-$40"],
    ["$35-$40", "$35 and $40"],
    ["2026, 07, 18", "2026-07-18"],
    ["2026-07-18", "2026, 07, 18"],
  ])("accepts fully grounded hyphenated expressions", (citedValue, analysisValue) => {
    expect(validateBriefCitations(
      analysisBrief(analysisValue),
      evidenceWithValue(citedValue),
    )).toEqual({ valid: true, errors: [] });
  });

  it.each([
    ["-35", "35"],
    ["35", "-35"],
    ["-$35", "$35"],
    ["$35", "-$35"],
  ])("preserves unary negative signs as part of the value", (citedValue, analysisValue) => {
    expect(validateBriefCitations(
      analysisBrief(analysisValue),
      evidenceWithValue(citedValue),
    )).toEqual(invalidNumericResult());
  });

  it.each([
    ["-35", "-35"],
    ["-$35", "-$35"],
  ])("accepts equivalently grounded unary negative values", (citedValue, analysisValue) => {
    expect(validateBriefCitations(
      analysisBrief(analysisValue),
      evidenceWithValue(citedValue),
    )).toEqual({ valid: true, errors: [] });
  });
});
