import type { InvestmentBriefRun, InvestmentBriefFailure } from "./build-investment-briefs.js";
import type {
  AssessmentAxis,
  CompanyEvaluation,
  EvidenceRecord,
  FundThesis,
  InvestmentBrief,
} from "./types.js";
import type { RankedCompany } from "./rank-companies.js";
import type { GenerationMetadataRecord } from "./generation-metadata.js";

export interface ArtifactEvidenceBundle {
  companyId: string;
  companyName: string;
  evidence: EvidenceRecord[];
}

export interface InvestmentBriefArtifact {
  status: InvestmentBriefRun["status"];
  generatedAt: string;
  thesis: FundThesis;
  evidence: ArtifactEvidenceBundle[];
  evaluations: CompanyEvaluation[];
  ranking: RankedCompany[];
  briefs: InvestmentBrief[];
  failures: InvestmentBriefFailure[];
  generationMetadata: GenerationMetadataRecord[];
}

function artifactEvidence(record: EvidenceRecord): EvidenceRecord {
  return {
    evidenceId: record.evidenceId,
    companyId: record.companyId,
    sourceType: record.sourceType,
    sourceUrl: record.sourceUrl,
    snapshotPath: record.snapshotPath,
    capturedAt: record.capturedAt,
    excerpt: record.excerpt,
    payload: record.payload,
    verificationState: record.verificationState,
    visibility: record.visibility,
  };
}

export class PublicArtifactError extends Error {
  constructor() {
    super("Brief cites private or unknown evidence");
    this.name = "PublicArtifactError";
  }
}

function publicAxes(axes: AssessmentAxis[], publicIds: Set<string>): AssessmentAxis[] {
  return axes.map((axis) => ({
    ...axis,
    dimensions: axis.dimensions.map((dimension) => ({
      ...dimension,
      evidenceIds: dimension.evidenceIds.filter((id) => publicIds.has(id)),
    })),
  }));
}

function publicEvaluation(evaluation: CompanyEvaluation, publicIds: Set<string>): CompanyEvaluation {
  return {
    ...evaluation,
    criteria: evaluation.criteria.map((criterion) => ({
      ...criterion,
      evidenceIds: criterion.evidenceIds.filter((id) => publicIds.has(id)),
    })),
    axes: publicAxes(evaluation.axes, publicIds),
  };
}

function publicBrief(brief: InvestmentBrief, publicIds: Set<string>): InvestmentBrief {
  for (const statement of [...brief.summary, ...brief.strengths, ...brief.risks]) {
    if (statement.evidenceIds.some((id) => !publicIds.has(id))) throw new PublicArtifactError();
  }
  return { ...brief, axes: publicAxes(brief.axes, publicIds) };
}

const CITATION_ERROR = /(fact_missing_citation|analysis_missing_citation|unknown_evidence_id|unsupported_numeric_value):(summary|strengths|risks):(\d+)/g;

function safeFailureMessage(failure: InvestmentBriefFailure): string {
  if (failure.stage === "extract_claim_candidates") return "Company claim extraction failed";
  if (failure.stage === "draft_investment_brief") return "Investment brief drafting failed";
  if (failure.stage === "select_company") return "Requested company was not evaluated";
  if (failure.stage === "validate_brief_citations") {
    const errors = [...failure.message.matchAll(CITATION_ERROR)].map(([match]) => match);
    return errors.length > 0 ? errors.join(",") : "Investment brief citation validation failed";
  }
  return "Company processing failed";
}

export function toInvestmentBriefArtifact(run: InvestmentBriefRun): InvestmentBriefArtifact {
  const publicEvidence = run.evidence.flatMap((bundle) => bundle.evidence.filter(({ visibility }) => visibility === "public"));
  const publicIds = new Set(publicEvidence.map(({ evidenceId }) => evidenceId));
  return {
    status: run.status,
    generatedAt: run.generatedAt,
    thesis: run.thesis,
    evidence: run.evidence.map((bundle) => ({
      companyId: bundle.companyId,
      companyName: bundle.companyName,
      evidence: bundle.evidence.filter(({ visibility }) => visibility === "public").map(artifactEvidence),
    })),
    evaluations: run.evaluations.map((evaluation) => publicEvaluation(evaluation, publicIds)),
    ranking: run.ranking.map((result) => ({
      ...result,
      evaluation: publicEvaluation(result.evaluation, publicIds),
    })),
    briefs: run.briefs.map((brief) => publicBrief(brief, publicIds)),
    failures: run.failures.map((failure) => ({
      companyId: failure.companyId,
      stage: failure.stage,
      message: safeFailureMessage(failure),
    })),
    generationMetadata: run.generationMetadata.map((record) => structuredClone(record)),
  };
}
