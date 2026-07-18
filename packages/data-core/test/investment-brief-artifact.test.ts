import { describe, expect, it } from "vitest";
import { toInvestmentBriefArtifact } from "../src/briefs/investment-brief-artifact.js";
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
  it("allowlists normalized company fields and persists only safe failure messages", async () => {
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
    expect(artifact.evidence[0]!.normalizedCompany).toMatchObject({
      stableId: "company-00",
      name: "Acme",
      source: { sourceType: "clay_csv", rowNumber: 2, verification: "unverified" },
    });
    expect(artifact.evidence[0]!.normalizedCompany.source).not.toHaveProperty("raw");
    expect(artifact.evidence[0]!.evidence[0]!.payload).toEqual({
      name: "Acme",
      description: "Workflow software",
      primaryIndustry: "Software",
      sizeBand: "1-10",
      organizationType: "Private",
      location: "New York",
      countryCode: "US",
      domain: "acme.test",
      linkedInUrl: null,
      sourceRowNumber: 2,
    });
    expect(artifact.failures).toEqual([{
      companyId: "company-00",
      stage: "extract_claim_candidates",
      message: "Company claim extraction failed",
    }]);
  });
});
