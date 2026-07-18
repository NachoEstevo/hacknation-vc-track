import { describe, expect, it } from "vitest";
import { makeSyntheticOpportunity, DEMO_TRUST } from "../demo/fixture-builder";

describe("founder score", () => {
  it("keeps missing factors in coverage instead of treating them as negative", () => {
    const opportunity = makeSyntheticOpportunity({
      id: "founder-score-fixture",
      name: "Score Fixture",
      domain: "score.example",
      countryCode: "AR",
      city: "Buenos Aires",
      tagline: "A test fixture.",
      summary: "A test fixture for an evidence score.",
      problem: "A documented test problem.",
      product: "A documented test product.",
      stage: "pre_seed",
      sectorTags: ["developer_tools"],
      teamSize: 1,
      founders: [{ id: "founder-one", name: "Founder One", role: "Founder", location: "AR" }],
      facts: [{
        key: "technical",
        predicate: "founder.technical",
        statement: "The founder has direct technical evidence.",
        value: true,
        state: "supported",
        sourceType: "github",
        sourceName: "Repository snapshot",
        excerpt: "Direct commits are present.",
        trust: DEMO_TRUST.strong,
      }],
    });

    expect(opportunity.founderScore?.score).toBe(87);
    expect(opportunity.founderScore?.evidenceCoverage).toBe(40);
    expect(opportunity.founderScore?.missingFactors).toHaveLength(3);
  });
});
