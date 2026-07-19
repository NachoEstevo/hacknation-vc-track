import { describe, expect, it } from "vitest";
import type { GenerationMetadataRecord } from "../src/briefs/generation-metadata";
import {
  createThesisProposal,
  parseThesisProposal,
} from "../src/briefs/thesis-proposal";
import type { FundThesis } from "../src/briefs/types";

const generatedAt = "2026-07-18T22:00:00.000Z";
const thesis: FundThesis = {
  thesisId: "thesis-1",
  originalQuery: "US software",
  generatedAt,
  promptVersion: "briefs-v1",
  criteria: [{
    criterionId: "country",
    category: "geography",
    label: "US",
    requirement: "required",
    weight: 5,
    operator: "equals",
    expectedValue: "US",
  }],
};
const parseMetadata: GenerationMetadataRecord = {
  task: "parse_thesis",
  companyId: null,
  thesisId: null,
  model: "actual-model",
  requestedModel: "requested-model",
  responseId: "resp-1",
  tokenUsage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
  promptVersion: "briefs-v1",
  generatedAt,
};

describe("thesis proposal envelope", () => {
  it("round-trips a safe proposal with parse metadata", () => {
    const proposal = createThesisProposal(thesis, [parseMetadata]);

    expect(proposal).toEqual({
      format: "investment_brief_thesis_proposal_v1",
      thesis,
      generationMetadata: [parseMetadata],
    });
    expect(parseThesisProposal(proposal)).toEqual({
      thesis,
      generationMetadata: [parseMetadata],
      legacyBareThesis: false,
    });
  });

  it("accepts a legacy bare thesis without fabricating parse metadata", () => {
    expect(parseThesisProposal(thesis)).toEqual({
      thesis,
      generationMetadata: [],
      legacyBareThesis: true,
    });
  });

  it("rejects proposal metadata containing unexpected prompt payload fields", () => {
    expect(() => parseThesisProposal({
      format: "investment_brief_thesis_proposal_v1",
      thesis,
      generationMetadata: [{ ...parseMetadata, rawPrompt: "secret prompt" }],
    })).toThrow(/generationMetadata/u);
  });

});
