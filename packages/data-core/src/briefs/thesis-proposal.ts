import type { GenerationMetadataRecord, GenerationTokenUsage } from "./generation-metadata";
import type { FundThesis } from "./types";
import { validateFundThesis } from "./validate-thesis";

export const THESIS_PROPOSAL_FORMAT = "investment_brief_thesis_proposal_v1" as const;

export interface ThesisProposalEnvelope {
  format: typeof THESIS_PROPOSAL_FORMAT;
  thesis: FundThesis;
  generationMetadata: GenerationMetadataRecord[];
}

export interface ParsedThesisProposal {
  thesis: FundThesis;
  generationMetadata: GenerationMetadataRecord[];
  legacyBareThesis: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safeText(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && !/OPENAI_API_KEY|PROMPT_VERSION:|\bsk-[A-Za-z0-9_-]{10,}\b/u.test(value);
}

function validTokenUsage(value: unknown): value is GenerationTokenUsage {
  if (!isRecord(value) || !hasExactKeys(value, ["inputTokens", "outputTokens", "totalTokens"])) return false;
  return [value.inputTokens, value.outputTokens, value.totalTokens]
    .every((count) => typeof count === "number" && Number.isInteger(count) && count >= 0);
}

function parseMetadataRecord(value: unknown, thesisId: string): GenerationMetadataRecord {
  const keys = [
    "task", "companyId", "thesisId", "model", "requestedModel", "responseId",
    "tokenUsage", "promptVersion", "generatedAt",
  ];
  if (!isRecord(value) || !hasExactKeys(value, keys)) throw new Error("Invalid thesis proposal generationMetadata");
  if (value.task !== "parse_thesis" || value.companyId !== null) {
    throw new Error("Invalid thesis proposal generationMetadata task");
  }
  if (value.thesisId !== null && value.thesisId !== thesisId) {
    throw new Error("Invalid thesis proposal generationMetadata thesisId");
  }
  if (!safeText(value.model) || !safeText(value.requestedModel) || !safeText(value.promptVersion)) {
    throw new Error("Invalid thesis proposal generationMetadata model");
  }
  if (value.responseId !== null && !safeText(value.responseId)) {
    throw new Error("Invalid thesis proposal generationMetadata responseId");
  }
  if (value.tokenUsage !== null && !validTokenUsage(value.tokenUsage)) {
    throw new Error("Invalid thesis proposal generationMetadata tokenUsage");
  }
  if (!safeText(value.generatedAt) || Number.isNaN(Date.parse(value.generatedAt))) {
    throw new Error("Invalid thesis proposal generationMetadata generatedAt");
  }
  return structuredClone(value) as unknown as GenerationMetadataRecord;
}

function safeThesis(value: unknown): FundThesis {
  const thesis = validateFundThesis(value);
  return {
    thesisId: thesis.thesisId,
    originalQuery: thesis.originalQuery,
    criteria: thesis.criteria.map((criterion) => ({
      criterionId: criterion.criterionId,
      category: criterion.category,
      label: criterion.label,
      requirement: criterion.requirement,
      weight: criterion.weight,
      operator: criterion.operator,
      expectedValue: Array.isArray(criterion.expectedValue)
        ? [...criterion.expectedValue]
        : criterion.expectedValue,
    })),
    generatedAt: thesis.generatedAt,
    promptVersion: thesis.promptVersion,
  };
}

export function createThesisProposal(
  value: unknown,
  metadata: GenerationMetadataRecord[],
): ThesisProposalEnvelope {
  const thesis = safeThesis(value);
  return {
    format: THESIS_PROPOSAL_FORMAT,
    thesis,
    generationMetadata: metadata.map((record) => parseMetadataRecord(record, thesis.thesisId)),
  };
}

export function parseThesisProposal(value: unknown): ParsedThesisProposal {
  if (!isRecord(value) || value.format !== THESIS_PROPOSAL_FORMAT) {
    return { thesis: safeThesis(value), generationMetadata: [], legacyBareThesis: true };
  }
  if (!hasExactKeys(value, ["format", "thesis", "generationMetadata"]) || !Array.isArray(value.generationMetadata)) {
    throw new Error("Invalid thesis proposal envelope");
  }
  const proposal = createThesisProposal(value.thesis, value.generationMetadata as GenerationMetadataRecord[]);
  return { thesis: proposal.thesis, generationMetadata: proposal.generationMetadata, legacyBareThesis: false };
}
