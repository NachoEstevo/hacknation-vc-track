import { describe, expect, it } from "vitest";
import { OpenAIConfigError, loadOpenAIConfig } from "../src/briefs/openai-config.js";
import {
  OpenAIStructuredTaskError,
  draftInvestmentBrief,
  extractClaimCandidates,
  parseThesis,
  type OpenAIStructuredTaskDependencies,
} from "../src/briefs/openai-structured-tasks.js";
import type { CompanyEvaluation, CompanyEvidenceBundle, FundThesis } from "../src/briefs/types.js";
import type { StableCompanySeed } from "../src/types.js";

describe("loadOpenAIConfig", () => {
  it("requires an API key without exposing its value", () => {
    expect(() => loadOpenAIConfig({})).toThrow(OpenAIConfigError);
  });

  it("uses the approved models and reasoning defaults", () => {
    expect(loadOpenAIConfig({ OPENAI_API_KEY: "test" })).toMatchObject({
      extractionModel: "gpt-5.6-luna",
      briefModel: "gpt-5.6-sol",
      extractionReasoning: "none",
      briefReasoning: "low",
    });
  });

  it("allows model overrides", () => {
    expect(loadOpenAIConfig({
      OPENAI_API_KEY: "test",
      OPENAI_EXTRACTION_MODEL: "extract-model",
      OPENAI_BRIEF_MODEL: "brief-model",
    })).toMatchObject({ extractionModel: "extract-model", briefModel: "brief-model" });
  });
});

const company: StableCompanySeed = {
  stableId: "acme", name: "Acme", description: "Workflow software", primaryIndustry: "Software", sizeBand: "1-10",
  organizationType: "Private", location: "New York", countryCode: "US", domain: "acme.test",
  linkedInUrl: null, dedupeKey: "acme.test", source: { sourceType: "clay_csv", rowNumber: 2, verification: "unverified", raw: {} },
};

const bundle: CompanyEvidenceBundle = {
  companyId: "acme",
  companyName: "Acme",
  normalizedCompany: company,
  evidence: [{
    evidenceId: "evidence-website", companyId: "acme", sourceType: "company_website", sourceUrl: "https://acme.test",
    snapshotPath: null, capturedAt: "2026-07-18T00:00:00.000Z", excerpt: "Acme has 10 active teams.", payload: null,
    verificationState: "verified", visibility: "public",
  }],
};

const thesis: FundThesis = {
  thesisId: "thesis-1", originalQuery: "B2B workflow software", generatedAt: "2026-07-18T00:00:00.000Z", promptVersion: "briefs-v1",
  criteria: [{ criterionId: "industry", category: "industry", label: "Software", requirement: "required", weight: 5, operator: "equals", expectedValue: "Software" }],
};

const evaluation: CompanyEvaluation = {
  companyId: "acme", companyName: "Acme", thesisFit: 100, evidenceCoverage: 100, axes: [], recommendation: "investigate",
  criteria: [{ criterionId: "industry", requirement: "required", state: "match", weight: 5, reason: "Matches", evidenceIds: ["evidence-website"] }],
};

function dependencies(outputs: string[]): OpenAIStructuredTaskDependencies & { requests: unknown[] } {
  const requests: unknown[] = [];
  return {
    config: loadOpenAIConfig({ OPENAI_API_KEY: "test" }),
    requests,
    createResponse: async (request) => {
      requests.push(request);
      const output = outputs.shift();
      if (output === undefined) throw new Error("No fake response configured");
      return { output_text: output };
    },
  };
}

describe("structured OpenAI tasks", () => {
  it("parses a thesis with the extraction contract and strict JSON schema", async () => {
    const fake = dependencies([JSON.stringify(thesis)]);

    await expect(parseThesis(thesis.originalQuery, fake)).resolves.toEqual(thesis);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({
      model: "gpt-5.6-luna",
      reasoning: { effort: "none" },
      text: { format: { type: "json_schema", name: "fund_thesis", strict: true } },
    });
    expect(JSON.stringify(fake.requests[0])).toContain("PROMPT_VERSION: briefs-v1");
  });

  it("retries one invalid schema response before returning deterministically trusted claims", async () => {
    const fake = dependencies([
      "{not json}",
      JSON.stringify([{ claimId: "claim-1", subject: "Acme", predicate: "active teams", value: 10, unit: null,
        claimKind: "observed_fact", evidenceIndexes: [0], directness: "direct_measurement",
        independentSupportingEvidenceIndexes: [], hasConflict: false }]),
    ]);

    const claims = await extractClaimCandidates(bundle, fake);

    expect(fake.requests).toHaveLength(2);
    expect(claims).toMatchObject([{ evidenceIds: ["evidence-website"], trust: { total: 70, state: "supported" }, state: "supported" }]);
  });

  it("fails with a typed error after an invalid structured retry", async () => {
    const fake = dependencies(["{}", "{}"]);

    await expect(parseThesis("B2B software", fake)).rejects.toMatchObject({
      name: "OpenAIStructuredTaskError", task: "parse_thesis", code: "invalid_schema",
    } satisfies Partial<OpenAIStructuredTaskError>);
    expect(fake.requests).toHaveLength(2);
  });

  it("drafts cited prose while retaining deterministic evaluation fields", async () => {
    const fake = dependencies([JSON.stringify({
      summary: [{ text: "Acme has 10 active teams.", statementKind: "fact", evidenceIndexes: [0] }],
      strengths: [], risks: [], evidenceGaps: [], diligenceQuestions: ["Which teams are active?"],
    })]);

    const brief = await draftInvestmentBrief({ bundle, thesis, evaluation }, fake);

    expect(brief).toMatchObject({
      companyId: "acme", thesisId: "thesis-1", recommendation: "investigate", thesisFit: 100, evidenceCoverage: 100,
      summary: [{ evidenceIds: ["evidence-website"] }], promptVersion: "briefs-v1",
    });
    expect(fake.requests[0]).toMatchObject({
      model: "gpt-5.6-sol",
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "investment_brief", strict: true } },
    });
  });

  it("retries one invalid brief draft before applying the citation gate", async () => {
    const fake = dependencies([
      JSON.stringify({ summary: [{ text: "Missing statement kind", evidenceIndexes: [0] }], strengths: [], risks: [], evidenceGaps: [], diligenceQuestions: [] }),
      JSON.stringify({ summary: [], strengths: [], risks: [], evidenceGaps: [], diligenceQuestions: [] }),
    ]);

    await expect(draftInvestmentBrief({ bundle, thesis, evaluation }, fake)).resolves.toMatchObject({ summary: [] });
    expect(fake.requests).toHaveLength(2);
  });
});
