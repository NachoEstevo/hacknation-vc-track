import { describe, expect, it, vi } from "vitest";
import { OpenAIConfigError, loadOpenAIConfig } from "../src/briefs/openai-config.js";
import {
  OpenAIStructuredTaskError,
  createOpenAIResponse,
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
  it("disables SDK retries when constructing the official client", () => {
    const options: unknown[] = [];
    createOpenAIResponse(loadOpenAIConfig({ OPENAI_API_KEY: "test" }), (clientOptions) => {
      options.push(clientOptions);
      return { responses: { create: async () => ({ output_text: "{}" }) } };
    });

    expect(options).toEqual([{ apiKey: "test", maxRetries: 0 }]);
  });

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

  it("treats the thesis query as source text without evidence-index instructions", async () => {
    const fake = dependencies([JSON.stringify(thesis)]);

    await parseThesis(thesis.originalQuery, fake);
    const prompt = (fake.requests[0] as { input: string }).input;

    expect(prompt).toContain("The query is the source text");
    expect(prompt).not.toContain("evidence indexes");
    expect(prompt).not.toContain("Stop when the supplied evidence is insufficient");
  });

  it("retries one invalid schema response before returning deterministically trusted claims", async () => {
    const fake = dependencies([
      "{not json}",
      JSON.stringify({ candidates: [{ claimId: "claim-1", subject: "Acme", predicate: "active teams", value: 10, unit: null,
        claimKind: "observed_fact", evidenceIndexes: [0], directness: "direct_measurement",
        independentSupportingEvidenceIndexes: [], hasConflict: false }] }),
    ]);

    const claims = await extractClaimCandidates(bundle, fake);

    expect(fake.requests).toHaveLength(2);
    expect(claims).toMatchObject([{ evidenceIds: ["evidence-website"], trust: { total: 70, state: "supported" }, state: "supported" }]);
  });

  it("requests claim candidates through a strict root object schema", async () => {
    const fake = dependencies([JSON.stringify({ candidates: [] })]);

    await extractClaimCandidates(bundle, fake);

    expect(fake.requests[0]).toMatchObject({
      text: { format: { type: "json_schema", name: "claim_candidates", strict: true, schema: {
        type: "object",
        additionalProperties: false,
        required: ["candidates"],
        properties: { candidates: { type: "array" } },
      } } },
    });
  });

  it("validates the strict claim root before unwrapping candidates", async () => {
    const invalid = JSON.stringify({ candidates: [], unexpected: true });
    const fake = dependencies([invalid, invalid]);

    await expect(extractClaimCandidates(bundle, fake)).rejects.toMatchObject({ code: "invalid_schema" });
    expect(fake.requests).toHaveLength(2);
  });

  it("fails with a typed error after an invalid structured retry", async () => {
    const fake = dependencies(["{}", "{}"]);

    await expect(parseThesis("B2B software", fake)).rejects.toMatchObject({
      name: "OpenAIStructuredTaskError", task: "parse_thesis", code: "invalid_schema",
    } satisfies Partial<OpenAIStructuredTaskError>);
    expect(fake.requests).toHaveLength(2);
  });

  it.each([429, 500, 502, 503, 504])("retries transient status %i at most twice", async (status) => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const fake = dependencies([]);
      fake.createResponse = async () => {
        attempts += 1;
        throw Object.assign(new Error("transient"), { status });
      };

      const pending = parseThesis("B2B software", fake);
      const rejection = expect(pending).rejects.toMatchObject({ code: "request_failed" });
      await vi.runAllTimersAsync();

      await rejection;
      expect(attempts).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses only the bounded 500ms and 1500ms transient delays", async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const fake = dependencies([JSON.stringify(thesis)]);
      const success = fake.createResponse;
      fake.createResponse = async (request) => {
        attempts += 1;
        if (attempts < 3) throw Object.assign(new Error("transient"), { status: 503 });
        return success(request);
      };

      const pending = parseThesis(thesis.originalQuery, fake);
      expect(attempts).toBe(1);
      await vi.advanceTimersByTimeAsync(499);
      expect(attempts).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(attempts).toBe(2);
      await vi.advanceTimersByTimeAsync(1499);
      expect(attempts).toBe(2);
      await vi.advanceTimersByTimeAsync(1);

      await expect(pending).resolves.toEqual(thesis);
      expect(attempts).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([401, 403, 422])("does not retry non-transient status %i", async (status) => {
    let attempts = 0;
    const fake = dependencies([]);
    fake.createResponse = async () => {
      attempts += 1;
      throw Object.assign(new Error("permanent"), { status });
    };

    await expect(parseThesis("B2B software", fake)).rejects.toMatchObject({ code: "request_failed" });
    expect(attempts).toBe(1);
  });

  it("does not retry refusals", async () => {
    let attempts = 0;
    const fake = dependencies([]);
    fake.createResponse = async () => {
      attempts += 1;
      return { output_text: "", output: [{ type: "message", content: [{ type: "refusal" }] }] };
    };

    await expect(parseThesis("B2B software", fake)).rejects.toMatchObject({ code: "refusal" });
    expect(attempts).toBe(1);
  });

  it("does not retry citation validation failures", async () => {
    const uncited = JSON.stringify({
      summary: [{ text: "Acme has 10 active teams.", statementKind: "fact", evidenceIndexes: [] }],
      strengths: [], risks: [], evidenceGaps: [], diligenceQuestions: [],
    });
    const fake = dependencies([uncited, JSON.stringify({ summary: [], strengths: [], risks: [], evidenceGaps: [], diligenceQuestions: [] })]);

    await expect(draftInvestmentBrief({ bundle, thesis, evaluation }, fake)).rejects.toMatchObject({ code: "citation_validation" });
    expect(fake.requests).toHaveLength(1);
  });

  it.each(["", "{bad json"])("retries malformed structured output once without a transient delay", async (output) => {
    vi.useFakeTimers();
    try {
      const fake = dependencies([output, output]);
      const pending = parseThesis("B2B software", fake);

      await expect(pending).rejects.toMatchObject({ code: "invalid_schema" });
      expect(fake.requests).toHaveLength(2);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
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

  it("rejects an evaluation for a different company before drafting", async () => {
    const fake = dependencies([JSON.stringify({ summary: [], strengths: [], risks: [], evidenceGaps: [], diligenceQuestions: [] })]);

    await expect(draftInvestmentBrief({ bundle, thesis, evaluation: { ...evaluation, companyId: "other-company" } }, fake))
      .rejects.toMatchObject({ code: "invalid_input" });
    expect(fake.requests).toHaveLength(0);
  });

  it("rejects cross-company evidence before drafting", async () => {
    const crossCompanyBundle: CompanyEvidenceBundle = {
      ...bundle,
      evidence: [{ ...bundle.evidence[0]!, companyId: "other-company" }],
    };
    const fake = dependencies([JSON.stringify({ summary: [], strengths: [], risks: [], evidenceGaps: [], diligenceQuestions: [] })]);

    await expect(draftInvestmentBrief({ bundle: crossCompanyBundle, thesis, evaluation }, fake))
      .rejects.toMatchObject({ code: "invalid_input" });
    expect(fake.requests).toHaveLength(0);
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
