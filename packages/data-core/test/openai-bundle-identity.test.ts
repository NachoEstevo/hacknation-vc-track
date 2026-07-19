import { expect, it } from "vitest";
import { loadOpenAIConfig } from "../src/briefs/openai-config";
import { extractClaimCandidates, type OpenAIStructuredTaskDependencies } from "../src/briefs/openai-structured-tasks";
import type { CompanyEvidenceBundle } from "../src/briefs/types";
import type { StableCompanySeed } from "../src/types";

const company: StableCompanySeed = {
  stableId: "acme", name: "Acme", description: "Workflow software", primaryIndustry: "Software", sizeBand: "1-10",
  organizationType: "Private", location: "New York", countryCode: "US", domain: "acme.test",
  linkedInUrl: null, dedupeKey: "acme.test", source: { sourceType: "clay_csv", rowNumber: 2, verification: "unverified", raw: {} },
};

it("rejects cross-company evidence before extracting claims", async () => {
  const bundle: CompanyEvidenceBundle = {
    companyId: "acme",
    companyName: "Acme",
    normalizedCompany: company,
    evidence: [{
      evidenceId: "evidence-other", companyId: "other-company", sourceType: "company_website", sourceUrl: "https://acme.test",
      snapshotPath: null, capturedAt: "2026-07-18T00:00:00.000Z", excerpt: "Acme has 10 active teams.", payload: null,
      verificationState: "verified", visibility: "public",
    }],
  };
  const requests: unknown[] = [];
  const dependencies: OpenAIStructuredTaskDependencies = {
    config: loadOpenAIConfig({ OPENAI_API_KEY: "test" }),
    createResponse: async (request) => {
      requests.push(request);
      return { output_text: JSON.stringify({ candidates: [] }) };
    },
  };

  await expect(extractClaimCandidates(bundle, dependencies)).rejects.toMatchObject({
    task: "extract_claim_candidates",
    code: "invalid_input",
  });
  expect(requests).toHaveLength(0);
});
