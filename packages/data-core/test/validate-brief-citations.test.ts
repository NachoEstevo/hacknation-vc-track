import { describe, expect, it } from "vitest";
import { validateBriefCitations } from "../src/briefs/validate-brief-citations.js";
import type { EvidenceRecord, InvestmentBrief } from "../src/briefs/types.js";

const evidence: EvidenceRecord[] = [{
  evidenceId: "stripe",
  companyId: "acme",
  sourceType: "stripe_private",
  sourceUrl: null,
  snapshotPath: null,
  capturedAt: "2026-07-18T00:00:00.000Z",
  excerpt: "Annual recurring revenue is $2.5M across 120 customers.",
  payload: { arr: "$2.5M", customers: 120, growthPercent: 35 },
  verificationState: "verified",
  visibility: "investor_private",
}];

function brief(overrides: Partial<InvestmentBrief> = {}): InvestmentBrief {
  return {
    companyId: "acme",
    thesisId: "thesis-1",
    recommendation: "investigate",
    thesisFit: 80,
    evidenceCoverage: 75,
    axes: [],
    summary: [],
    strengths: [],
    risks: [],
    evidenceGaps: [{ field: "founder identity", reason: "No named founder evidence." }],
    diligenceQuestions: [],
    generatedAt: "2026-07-18T00:00:00.000Z",
    promptVersion: "v1",
    ...overrides,
  };
}

describe("validateBriefCitations", () => {
  it("accepts cited facts and analysis whose numeric tokens appear in cited evidence", () => {
    const result = validateBriefCitations(brief({
      summary: [{ text: "The company has 120 customers.", statementKind: "fact", evidenceIds: ["stripe"] }],
      strengths: [{
        text: "$2.5M ARR across 120 customers suggests 35% growth.",
        statementKind: "analysis",
        evidenceIds: ["stripe"],
      }],
    }), evidence);

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects an evidence ID that does not exist", () => {
    expect(validateBriefCitations(brief({
      summary: [{ text: "Acme has revenue.", statementKind: "fact", evidenceIds: ["missing"] }],
    }), evidence)).toEqual({
      valid: false,
      errors: [{ code: "unknown_evidence_id", section: "summary", statementIndex: 0 }],
    });
  });

  it("rejects an uncited fact", () => {
    expect(validateBriefCitations(brief({
      summary: [{ text: "Acme has revenue.", statementKind: "fact", evidenceIds: [] }],
    }), evidence)).toEqual({
      valid: false,
      errors: [{ code: "fact_missing_citation", section: "summary", statementIndex: 0 }],
    });
  });

  it("rejects analysis without a citation", () => {
    expect(validateBriefCitations(brief({
      strengths: [{ text: "Growth appears durable.", statementKind: "analysis", evidenceIds: [] }],
    }), evidence)).toEqual({
      valid: false,
      errors: [{ code: "analysis_missing_citation", section: "strengths", statementIndex: 0 }],
    });
  });

  it("rejects a numeric value introduced by analysis but absent from cited evidence", () => {
    expect(validateBriefCitations(brief({
      risks: [{
        text: "Revenue may be only $5M.",
        statementKind: "analysis",
        evidenceIds: ["stripe"],
      }],
    }), evidence)).toEqual({
      valid: false,
      errors: [{ code: "unsupported_numeric_value", section: "risks", statementIndex: 0 }],
    });
  });

  it("allows uncited uncertainty when it names a declared missing field", () => {
    expect(validateBriefCitations(brief({
      risks: [{
        text: "Founder identity is missing from the available evidence.",
        statementKind: "uncertainty",
        evidenceIds: [],
      }],
    }), evidence)).toEqual({ valid: true, errors: [] });
  });

  it("rejects uncited uncertainty that does not name a declared missing field", () => {
    expect(validateBriefCitations(brief({
      risks: [{
        text: "More diligence is needed.",
        statementKind: "uncertainty",
        evidenceIds: [],
      }],
    }), evidence)).toEqual({
      valid: false,
      errors: [{ code: "analysis_missing_citation", section: "risks", statementIndex: 0 }],
    });
  });

  it("returns every validation error and leaves the brief unchanged", () => {
    const input = brief({
      summary: [{ text: "Uncited fact.", statementKind: "fact", evidenceIds: [] }],
      strengths: [{ text: "Unsupported $9M analysis.", statementKind: "analysis", evidenceIds: ["missing"] }],
      risks: [{ text: "Another uncited fact.", statementKind: "fact", evidenceIds: [] }],
    });
    const before = structuredClone(input);

    expect(validateBriefCitations(input, evidence)).toEqual({
      valid: false,
      errors: [
        { code: "fact_missing_citation", section: "summary", statementIndex: 0 },
        { code: "unknown_evidence_id", section: "strengths", statementIndex: 0 },
        { code: "unsupported_numeric_value", section: "strengths", statementIndex: 0 },
        { code: "fact_missing_citation", section: "risks", statementIndex: 0 },
      ],
    });
    expect(input).toEqual(before);
  });
});
