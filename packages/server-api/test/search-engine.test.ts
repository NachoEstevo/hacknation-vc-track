import { describe, expect, it } from "vitest";
import { createSearchEngine } from "../src/search-engine.js";
import type { CompanyEvidenceBundle, OpenAIStructuredTaskDependencies } from "@hacknation/data-core";

const dependencies: OpenAIStructuredTaskDependencies = {
  config: { apiKey: "test", extractionModel: "gpt-test", briefModel: "gpt-test", extractionReasoning: "none", briefReasoning: "low" },
  now: () => new Date("2026-07-19T00:00:00Z"),
  createResponse: async () => ({
    output_text: JSON.stringify({ criteria: [{
      criterionId: "geo-us", category: "geography", label: "United States", requirement: "required",
      weight: 5, operator: "equals", expectedValue: "US",
    }] }),
  }),
};

function bundle(id: string, countryCode: "US" | "GB"): CompanyEvidenceBundle {
  return {
    companyId: id,
    companyName: id,
    normalizedCompany: {
      stableId: id, name: id, description: "B2B software", primaryIndustry: "Software", sizeBand: "2-10",
      organizationType: "Private", location: countryCode, countryCode, domain: `${id}.com`, linkedInUrl: null,
      dedupeKey: id, source: { sourceType: "clay_csv", rowNumber: 1, verification: "unverified", raw: {} },
    },
    evidence: [{
      evidenceId: `${id}-source`, companyId: id, sourceType: "clay_csv", sourceUrl: null, snapshotPath: null,
      capturedAt: "2026-07-19T00:00:00Z", excerpt: null, payload: {}, verificationState: "unverified", visibility: "public",
    }],
  };
}

describe("search engine", () => {
  it("parses the query once and deterministically ranks every company", async () => {
    const result = await createSearchEngine(dependencies).search("US companies", [bundle("us-co", "US"), bundle("uk-co", "GB")]);
    expect(result.ranked.map(({ evaluation }) => evaluation.companyId)).toEqual(["us-co", "uk-co"]);
    expect(result.ranked[1]?.tier).toBe("excluded");
  });
});
