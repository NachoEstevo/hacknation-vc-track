import type { StableCompanySeed } from "../types.js";
import type { InvestmentBriefRun, InvestmentBriefFailure } from "./build-investment-briefs.js";
import type {
  CompanyEvaluation,
  EvidenceRecord,
  FundThesis,
  InvestmentBrief,
} from "./types.js";
import type { RankedCompany } from "./rank-companies.js";

export interface ArtifactCompanySource {
  sourceType: "clay_csv";
  rowNumber: number;
  verification: "unverified";
}

export interface ArtifactCompany extends Omit<StableCompanySeed, "source"> {
  source: ArtifactCompanySource;
}

export interface ArtifactEvidenceBundle {
  companyId: string;
  companyName: string;
  normalizedCompany: ArtifactCompany;
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
}

function artifactCompany(company: StableCompanySeed): ArtifactCompany {
  return {
    stableId: company.stableId,
    name: company.name,
    description: company.description,
    primaryIndustry: company.primaryIndustry,
    sizeBand: company.sizeBand,
    organizationType: company.organizationType,
    location: company.location,
    countryCode: company.countryCode,
    domain: company.domain,
    linkedInUrl: company.linkedInUrl,
    dedupeKey: company.dedupeKey,
    source: {
      sourceType: company.source.sourceType,
      rowNumber: company.source.rowNumber,
      verification: company.source.verification,
    },
  };
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
  return {
    status: run.status,
    generatedAt: run.generatedAt,
    thesis: run.thesis,
    evidence: run.evidence.map((bundle) => ({
      companyId: bundle.companyId,
      companyName: bundle.companyName,
      normalizedCompany: artifactCompany(bundle.normalizedCompany),
      evidence: bundle.evidence.map(artifactEvidence),
    })),
    evaluations: run.evaluations,
    ranking: run.ranking,
    briefs: run.briefs,
    failures: run.failures.map((failure) => ({
      companyId: failure.companyId,
      stage: failure.stage,
      message: safeFailureMessage(failure),
    })),
  };
}
