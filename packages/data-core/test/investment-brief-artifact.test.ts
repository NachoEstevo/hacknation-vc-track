import { describe, expect, it } from "vitest";
import { toInvestmentBriefArtifact } from "../src/briefs/investment-brief-artifact.js";
import { createInvestmentBriefSummary } from "../src/briefs/investment-brief-summary.js";
import { buildInvestmentBriefs } from "../src/briefs/build-investment-briefs.js";
import type { FundThesis } from "../src/briefs/types.js";
import type { StableCompanySeed } from "../src/types.js";

const rawSecret = "RAW_PRIVATE_SENTINEL";
const providerSecret = "sk-PERSISTED_FAILURE_SENTINEL";
const generatedAt = "2026-07-18T22:00:00.000Z";

const company: StableCompanySeed = {
  stableId: "company-00",
  name: "Acme",
  description: "Workflow software",
  primaryIndustry: "Software",
  sizeBand: "1-10",
  organizationType: "Private",
  location: "New York",
  countryCode: "US",
  domain: "acme.test",
  linkedInUrl: null,
  dedupeKey: "domain:acme.test",
  source: {
    sourceType: "clay_csv",
    rowNumber: 2,
    verification: "unverified",
    raw: { Name: "Acme", "Investor Notes": rawSecret },
  },
};

const thesis: FundThesis = {
  thesisId: "thesis-1",
  originalQuery: "US software",
  criteria: [{
    criterionId: "country",
    category: "geography",
    label: "US",
    requirement: "required",
    weight: 5,
    operator: "equals",
    expectedValue: "US",
  }],
  generatedAt,
  promptVersion: "test-v1",
};

describe("toInvestmentBriefArtifact", () => {
  it("publishes only public evidence and sanitizes private evidence references", async () => {
    const run = await buildInvestmentBriefs({
      companies: [company],
      enrichments: [],
      thesis,
      thesisConfirmed: true,
      top: 1,
    }, {
      now: () => new Date(generatedAt),
      parseThesis: async () => thesis,
      extractClaimCandidates: async () => {
        throw new Error(`provider rejected ${providerSecret}`);
      },
      draftInvestmentBrief: async ({ bundle, evaluation }) => ({
        companyId: bundle.companyId,
        thesisId: thesis.thesisId,
        recommendation: evaluation.recommendation,
        thesisFit: evaluation.thesisFit,
        evidenceCoverage: evaluation.evidenceCoverage,
        axes: evaluation.axes,
        summary: [],
        strengths: [],
        risks: [],
        evidenceGaps: [],
        diligenceQuestions: [],
        generatedAt,
        promptVersion: "test-v1",
      }),
    });

    const artifact = toInvestmentBriefArtifact(run);
    const serialized = JSON.stringify(artifact);

    expect(serialized).not.toContain(rawSecret);
    expect(serialized).not.toContain(providerSecret);
    expect(artifact.evidence[0]).toEqual({
      companyId: "company-00",
      companyName: "Acme",
      evidence: [],
    });
    expect(artifact.evaluations[0]!.criteria[0]!.evidenceIds).toEqual([]);
    expect(artifact.ranking[0]!.evaluation.criteria[0]!.evidenceIds).toEqual([]);
    expect(artifact.failures).toEqual([{
      companyId: "company-00",
      stage: "extract_claim_candidates",
      message: "Company claim extraction failed",
    }]);
  });

  it("rejects publication when a brief cites private evidence", async () => {
    const run = await buildInvestmentBriefs({
      companies: [company], enrichments: [], thesis, thesisConfirmed: true, top: 1,
    }, {
      now: () => new Date(generatedAt),
      parseThesis: async () => thesis,
      extractClaimCandidates: async () => [],
      draftInvestmentBrief: async ({ bundle, evaluation }) => briefFor(bundle.companyId, evaluation),
    });
    run.briefs[0]!.summary = [{
      text: "Acme is in the US.",
      statementKind: "fact",
      evidenceIds: [run.evidence[0]!.evidence[0]!.evidenceId],
    }];

    expect(() => toInvestmentBriefArtifact(run)).toThrow("private or unknown evidence");
  });

  it("persists generation metadata in the public artifact and mechanical summary", async () => {
    const metadata = [{
      task: "draft_investment_brief" as const,
      companyId: "company-00",
      thesisId: thesis.thesisId,
      model: "actual-brief-model",
      requestedModel: "configured-brief-model",
      responseId: "resp_brief_123",
      tokenUsage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
      promptVersion: "briefs-v1",
      generatedAt,
    }];
    const run = await buildInvestmentBriefs({
      companies: [company], enrichments: [], thesis, thesisConfirmed: true, top: 1,
    }, {
      now: () => new Date(generatedAt),
      parseThesis: async () => thesis,
      extractClaimCandidates: async () => [],
      draftInvestmentBrief: async ({ bundle, evaluation }) => briefFor(bundle.companyId, evaluation),
      getGenerationMetadata: () => metadata,
    });

    const artifact = toInvestmentBriefArtifact(run);
    const summary = createInvestmentBriefSummary(artifact, {
      modelNames: { extraction: "configured-extract-model", brief: "configured-brief-model" },
      requestedBriefs: 1,
      rankingSeed: "companies.csv",
      publishedEvidence: "enrichment.json",
    });

    expect(artifact.generationMetadata).toEqual(metadata);
    expect(summary.generationMetadata).toMatchObject({
      count: 1,
      responseIdsPresent: 1,
      tokenUsage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
      records: metadata,
    });
  });
});

function briefFor(companyId: string, evaluation: import("../src/briefs/types.js").CompanyEvaluation) {
  return {
    companyId,
    thesisId: thesis.thesisId,
    recommendation: evaluation.recommendation,
    thesisFit: evaluation.thesisFit,
    evidenceCoverage: evaluation.evidenceCoverage,
    axes: evaluation.axes,
    summary: [], strengths: [], risks: [], evidenceGaps: [], diligenceQuestions: [],
    generatedAt, promptVersion: "test-v1",
  };
}
