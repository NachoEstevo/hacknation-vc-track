import type { InvestmentBriefArtifact } from "./investment-brief-artifact.js";

export interface InvestmentBriefSummaryInput {
  modelNames: { extraction: string; brief: string };
  requestedBriefs: number;
  rankingSeed: string;
  publishedEvidence: string;
}

export function createInvestmentBriefSummary(
  artifact: InvestmentBriefArtifact,
  input: InvestmentBriefSummaryInput,
) {
  const evidence = artifact.evidence.flatMap((bundle) => bundle.evidence);
  const failedBriefs = artifact.failures.filter(({ stage }) =>
    stage === "draft_investment_brief" || stage === "validate_brief_citations").length;
  const briefsByCompany = new Map(artifact.briefs.map((brief) => [brief.companyId, brief]));
  return {
    status: artifact.status,
    generatedAt: artifact.generatedAt,
    thesisGeneratedAt: artifact.thesis.generatedAt,
    thesisId: artifact.thesis.thesisId,
    promptVersion: artifact.thesis.promptVersion,
    models: {
      thesisAndClaimExtraction: input.modelNames.extraction,
      briefDrafting: input.modelNames.brief,
    },
    counts: {
      evaluatedCompanies: artifact.evaluations.length,
      rankedCompanies: artifact.ranking.length,
      requestedBriefs: input.requestedBriefs,
      validBriefs: artifact.briefs.length,
      failedBriefs,
      totalFailures: artifact.failures.length,
    },
    evidenceCounts: {
      companyWebsite: evidence.filter(({ sourceType }) => sourceType === "company_website").length,
      githubPublic: evidence.filter(({ sourceType }) => sourceType === "github_public").length,
      publicVisibility: evidence.filter(({ visibility }) => visibility === "public").length,
      investorPrivateVisibility: evidence.filter(({ visibility }) => visibility === "investor_private").length,
    },
    topCompanies: artifact.ranking.slice(0, input.requestedBriefs).map(({ rank, evaluation }) => {
      const brief = briefsByCompany.get(evaluation.companyId);
      return {
        rank,
        companyId: evaluation.companyId,
        companyName: evaluation.companyName,
        recommendation: evaluation.recommendation,
        thesisFit: evaluation.thesisFit,
        evidenceCoverage: evaluation.evidenceCoverage,
        briefGenerated: brief !== undefined,
        briefGeneratedAt: brief?.generatedAt ?? null,
      };
    }),
    failures: artifact.failures,
    provenance: {
      rankingSeed: input.rankingSeed,
      rankingSeedHandling: "owner_provided_internal_not_published",
      publishedEvidence: input.publishedEvidence,
      publishedVisibility: "public_only",
    },
  };
}
