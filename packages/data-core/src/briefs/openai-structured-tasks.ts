import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses.js";
import { calculateClaimTrust, type ClaimDirectness } from "./calculate-claim-trust.js";
import type { OpenAIConfig } from "./openai-config.js";
import { claimCandidatesSchema, fundThesisSchema, investmentBriefSchema } from "./openai-schemas.js";
import { validateBriefCitations } from "./validate-brief-citations.js";
import { validateFundThesis } from "./validate-thesis.js";
import type {
  ClaimCandidate,
  CitedStatement,
  CompanyEvaluation,
  CompanyEvidenceBundle,
  FundThesis,
  InvestmentBrief,
} from "./types.js";

const PROMPT_VERSION = "briefs-v1";
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface OpenAIResponseResult {
  output_text: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string }> }>;
}

export interface OpenAIStructuredTaskDependencies {
  config: OpenAIConfig;
  createResponse(request: ResponseCreateParamsNonStreaming): Promise<OpenAIResponseResult>;
}

export interface DraftInvestmentBriefInput {
  bundle: CompanyEvidenceBundle;
  thesis: FundThesis;
  evaluation: CompanyEvaluation;
}

export class OpenAIStructuredTaskError extends Error {
  constructor(
    readonly task: "parse_thesis" | "extract_claim_candidates" | "draft_investment_brief",
    readonly code: "invalid_schema" | "request_failed" | "citation_validation" | "refusal",
    cause?: unknown,
  ) {
    super(`OpenAI structured task ${task} failed: ${code}`, { cause });
    this.name = "OpenAIStructuredTaskError";
  }
}

export function createOpenAIResponse(config: OpenAIConfig): OpenAIStructuredTaskDependencies["createResponse"] {
  const client = new OpenAI({ apiKey: config.apiKey });
  return async (request) => client.responses.create(request);
}

function stableInstructions(outcome: string): string {
  return [
    `PROMPT_VERSION: ${PROMPT_VERSION}`,
    `OUTCOME: ${outcome}`,
    "Use only the supplied evidence. Do not invent facts, scores, recommendations, verification states, or evidence IDs.",
    "Cite every factual or analytical statement with the supplied evidence indexes. Stop when the supplied evidence is insufficient and name the gap instead.",
    "Return only JSON that satisfies the provided schema.",
  ].join("\n");
}

function hasRefusal(response: OpenAIResponseResult): boolean {
  return response.output?.some((item) => item.type === "message" && item.content?.some((part) => part.type === "refusal")) ?? false;
}

function responseStatus(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestStructured<T>(
  task: OpenAIStructuredTaskError["task"],
  request: ResponseCreateParamsNonStreaming,
  dependencies: OpenAIStructuredTaskDependencies,
  parse: (value: unknown) => T,
): Promise<T> {
  let schemaFailures = 0;
  let transientFailures = 0;

  while (true) {
    let response: OpenAIResponseResult;
    try {
      response = await dependencies.createResponse(request);
    } catch (error) {
      const status = responseStatus(error);
      if (status !== undefined && RETRYABLE_STATUSES.has(status) && transientFailures < 2) {
        await sleep(transientFailures === 0 ? 500 : 1500);
        transientFailures += 1;
        continue;
      }
      throw new OpenAIStructuredTaskError(task, "request_failed", error);
    }

    if (hasRefusal(response)) throw new OpenAIStructuredTaskError(task, "refusal");
    try {
      return parse(JSON.parse(response.output_text));
    } catch (error) {
      if (schemaFailures < 1) {
        schemaFailures += 1;
        continue;
      }
      throw new OpenAIStructuredTaskError(task, "invalid_schema", error);
    }
  }
}

function evidenceInput(bundle: CompanyEvidenceBundle): Array<Record<string, unknown>> {
  return bundle.evidence.map((record, index) => ({
    index,
    sourceType: record.sourceType,
    sourceUrl: record.sourceUrl,
    capturedAt: record.capturedAt,
    excerpt: record.excerpt,
    payload: record.payload,
    verificationState: record.verificationState,
  }));
}

function evaluationTime(bundle: CompanyEvidenceBundle): string {
  return bundle.evidence.reduce((latest, record) => Date.parse(record.capturedAt) > Date.parse(latest) ? record.capturedAt : latest, "1970-01-01T00:00:00.000Z");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validIndexes(value: unknown, records: CompanyEvidenceBundle["evidence"]): number[] {
  if (!Array.isArray(value) || !value.every((index) => Number.isInteger(index) && index >= 0 && index < records.length)) {
    throw new Error("Invalid evidence indexes");
  }
  return [...new Set(value as number[])];
}

function claimCandidates(value: unknown, bundle: CompanyEvidenceBundle): ClaimCandidate[] {
  if (!Array.isArray(value)) throw new Error("Claim candidates must be an array");
  const ids = new Set<string>();
  return value.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.claimId !== "string" || candidate.claimId.trim() === "" || ids.has(candidate.claimId)
      || typeof candidate.subject !== "string" || typeof candidate.predicate !== "string"
      || !["string", "number", "boolean"].includes(typeof candidate.value)
      || (candidate.unit !== null && typeof candidate.unit !== "string")
      || !["observed_fact", "first_party_claim", "analysis"].includes(candidate.claimKind as string)
      || !["direct_measurement", "primary_document", "first_party_statement", "proxy_signal", "inference_only"].includes(candidate.directness as string)
      || typeof candidate.hasConflict !== "boolean") throw new Error("Invalid claim candidate");
    ids.add(candidate.claimId);
    const indexes = validIndexes(candidate.evidenceIndexes, bundle.evidence);
    if (indexes.length === 0) throw new Error("Claims require evidence");
    const supportingIndexes = validIndexes(candidate.independentSupportingEvidenceIndexes, bundle.evidence);
    const evidence = indexes.map((index) => bundle.evidence[index]!);
    const trust = calculateClaimTrust({
      evidence,
      directness: candidate.directness as ClaimDirectness,
      independentSupportingEvidenceIds: supportingIndexes.map((index) => bundle.evidence[index]!.evidenceId),
      evaluatedAt: evaluationTime(bundle),
      hasConflict: candidate.hasConflict,
    });
    return {
      claimId: candidate.claimId, companyId: bundle.companyId, subject: candidate.subject, predicate: candidate.predicate,
      value: candidate.value as string | number | boolean, unit: candidate.unit as string | null,
      claimKind: candidate.claimKind as ClaimCandidate["claimKind"], evidenceIds: indexes.map((index) => bundle.evidence[index]!.evidenceId), trust, state: trust.state,
    };
  });
}

function citedStatements(value: unknown, bundle: CompanyEvidenceBundle): CitedStatement[] {
  if (!Array.isArray(value)) throw new Error("Cited statements must be an array");
  return value.map((statement) => {
    if (!isRecord(statement) || typeof statement.text !== "string" || statement.text.trim() === ""
      || !["fact", "analysis", "uncertainty"].includes(statement.statementKind as string)) throw new Error("Invalid cited statement");
    return {
      text: statement.text,
      statementKind: statement.statementKind as CitedStatement["statementKind"],
      evidenceIds: validIndexes(statement.evidenceIndexes, bundle.evidence).map((index) => bundle.evidence[index]!.evidenceId),
    };
  });
}

interface BriefDraftContent {
  summary: CitedStatement[];
  strengths: CitedStatement[];
  risks: CitedStatement[];
  evidenceGaps: InvestmentBrief["evidenceGaps"];
  diligenceQuestions: string[];
}

function briefDraft(value: unknown, bundle: CompanyEvidenceBundle): BriefDraftContent {
  if (!isRecord(value) || !Array.isArray(value.evidenceGaps) || !Array.isArray(value.diligenceQuestions)
    || !value.evidenceGaps.every((gap) => isRecord(gap) && typeof gap.field === "string" && gap.field.trim() !== "" && typeof gap.reason === "string" && gap.reason.trim() !== "")
    || !value.diligenceQuestions.every((question) => typeof question === "string" && question.trim() !== "")) {
    throw new Error("Invalid investment brief");
  }
  return {
    summary: citedStatements(value.summary, bundle), strengths: citedStatements(value.strengths, bundle), risks: citedStatements(value.risks, bundle),
    evidenceGaps: value.evidenceGaps as InvestmentBrief["evidenceGaps"], diligenceQuestions: value.diligenceQuestions as string[],
  };
}

export async function parseThesis(query: string, dependencies: OpenAIStructuredTaskDependencies): Promise<FundThesis> {
  return requestStructured("parse_thesis", {
    model: dependencies.config.extractionModel,
    reasoning: { effort: dependencies.config.extractionReasoning },
    input: `${stableInstructions("Convert the fund query into an explicit investment thesis.")}\n\nQUERY:\n${query}`,
    text: { format: { type: "json_schema", name: "fund_thesis", strict: true, schema: fundThesisSchema } },
  }, dependencies, validateFundThesis);
}

export async function extractClaimCandidates(bundle: CompanyEvidenceBundle, dependencies: OpenAIStructuredTaskDependencies): Promise<ClaimCandidate[]> {
  return requestStructured("extract_claim_candidates", {
    model: dependencies.config.extractionModel,
    reasoning: { effort: dependencies.config.extractionReasoning },
    input: `${stableInstructions("Extract evidence-backed claim candidates for one company.")}\n\nEVIDENCE:\n${JSON.stringify(evidenceInput(bundle))}`,
    text: { format: { type: "json_schema", name: "claim_candidates", strict: true, schema: claimCandidatesSchema } },
  }, dependencies, (value) => claimCandidates(value, bundle));
}

export async function draftInvestmentBrief(input: DraftInvestmentBriefInput, dependencies: OpenAIStructuredTaskDependencies): Promise<InvestmentBrief> {
  const draft = await requestStructured("draft_investment_brief", {
    model: dependencies.config.briefModel,
    reasoning: { effort: dependencies.config.briefReasoning },
    input: `${stableInstructions("Draft a concise investment brief without changing the deterministic evaluation.")}\n\nTHESIS:\n${JSON.stringify(input.thesis)}\n\nEVALUATION:\n${JSON.stringify(input.evaluation)}\n\nEVIDENCE:\n${JSON.stringify(evidenceInput(input.bundle))}`,
    text: { format: { type: "json_schema", name: "investment_brief", strict: true, schema: investmentBriefSchema } },
  }, dependencies, (value) => briefDraft(value, input.bundle));
  const brief: InvestmentBrief = {
    companyId: input.evaluation.companyId, thesisId: input.thesis.thesisId, recommendation: input.evaluation.recommendation,
    thesisFit: input.evaluation.thesisFit, evidenceCoverage: input.evaluation.evidenceCoverage, axes: input.evaluation.axes,
    summary: draft.summary, strengths: draft.strengths, risks: draft.risks,
    evidenceGaps: draft.evidenceGaps, diligenceQuestions: draft.diligenceQuestions,
    generatedAt: evaluationTime(input.bundle), promptVersion: PROMPT_VERSION,
  };
  if (!validateBriefCitations(brief, input.bundle.evidence).valid) {
    throw new OpenAIStructuredTaskError("draft_investment_brief", "citation_validation");
  }
  return brief;
}
