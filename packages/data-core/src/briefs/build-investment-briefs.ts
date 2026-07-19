import type { CompanyEnrichmentResult } from "../enrichment/types.js";
import type { StableCompanySeed } from "../types.js";
import { buildEvidenceIndex } from "./build-evidence-index.js";
import { canonicalizeFundThesis } from "./canonicalize-thesis.js";
import { evaluateCompany } from "./evaluate-company.js";
import type { GenerationMetadataRecord } from "./generation-metadata.js";
import { rankCompanies, type RankedCompany } from "./rank-companies.js";
import type {
  ClaimCandidate,
  CompanyEvaluation,
  CompanyEvidenceBundle,
  FundThesis,
  InvestmentBrief,
} from "./types.js";
import { validateBriefCitations } from "./validate-brief-citations.js";
import { validateFundThesis } from "./validate-thesis.js";

const MAX_COMPANY_CONCURRENCY = 4;
const DEFAULT_TOP = 3;

export interface BuildInvestmentBriefsInput {
  companies: StableCompanySeed[];
  enrichments: CompanyEnrichmentResult[];
  thesis: string | FundThesis;
  thesisConfirmed: boolean;
  top?: number;
  requestedCompanyIds?: string[];
}

export interface BuildInvestmentBriefsDependencies {
  parseThesis(query: string): Promise<FundThesis>;
  extractClaimCandidates(bundle: CompanyEvidenceBundle, thesis: FundThesis): Promise<ClaimCandidate[]>;
  draftInvestmentBrief(input: {
    bundle: CompanyEvidenceBundle;
    thesis: FundThesis;
    evaluation: CompanyEvaluation;
  }): Promise<InvestmentBrief>;
  now?: () => Date;
  getGenerationMetadata?: () => GenerationMetadataRecord[];
}

export interface InvestmentBriefFailure {
  companyId: string | null;
  stage: string;
  message: string;
}

export interface InvestmentBriefRun {
  status: "awaiting_thesis_confirmation" | "completed" | "partial";
  generatedAt: string;
  thesis: FundThesis;
  evidence: CompanyEvidenceBundle[];
  evaluations: CompanyEvaluation[];
  ranking: RankedCompany[];
  briefs: InvestmentBrief[];
  failures: InvestmentBriefFailure[];
  generationMetadata: GenerationMetadataRecord[];
}

export class InvestmentBriefInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvestmentBriefInputError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runWorkers(length: number, task: (index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < length) {
      const index = cursor++;
      await task(index);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(MAX_COMPANY_CONCURRENCY, length) },
    () => worker(),
  ));
}

function selectedEvaluations(
  ranking: RankedCompany[],
  top: number,
  requestedCompanyIds: string[],
): { evaluations: CompanyEvaluation[]; missingIds: string[] } {
  const byId = new Map(ranking.map(({ evaluation }) => [evaluation.companyId, evaluation]));
  const selected = ranking.slice(0, top).map(({ evaluation }) => evaluation);
  const selectedIds = new Set(selected.map((evaluation) => evaluation.companyId));
  const uniqueRequestedIds = [...new Set(requestedCompanyIds)];

  for (const companyId of uniqueRequestedIds) {
    const evaluation = byId.get(companyId);
    if (evaluation && !selectedIds.has(companyId)) {
      selected.push(evaluation);
      selectedIds.add(companyId);
    }
  }

  return {
    evaluations: selected,
    missingIds: uniqueRequestedIds.filter((companyId) => !byId.has(companyId)),
  };
}

export async function buildInvestmentBriefs(
  input: BuildInvestmentBriefsInput,
  dependencies: BuildInvestmentBriefsDependencies,
): Promise<InvestmentBriefRun> {
  const top = input.top ?? DEFAULT_TOP;
  if (!Number.isInteger(top) || top < 1) throw new RangeError("top must be an integer greater than zero");
  if (input.companies.length === 0) {
    throw new InvestmentBriefInputError("No accepted companies were found in --companies input");
  }

  const evidence = buildEvidenceIndex(input.companies, input.enrichments);
  const thesis = canonicalizeFundThesis(typeof input.thesis === "string"
    ? await dependencies.parseThesis(input.thesis)
    : validateFundThesis(input.thesis));
  const generatedAt = (dependencies.now ?? (() => new Date()))().toISOString();

  if (!input.thesisConfirmed) {
    return {
      status: "awaiting_thesis_confirmation",
      generatedAt,
      thesis,
      evidence,
      evaluations: [],
      ranking: [],
      briefs: [],
      failures: [],
      generationMetadata: dependencies.getGenerationMetadata?.() ?? [],
    };
  }

  const evaluations: CompanyEvaluation[] = new Array(evidence.length);
  const extractionFailures: Array<InvestmentBriefFailure | undefined> = new Array(evidence.length);
  await runWorkers(evidence.length, async (index) => {
    const bundle = evidence[index]!;
    let claims: ClaimCandidate[] = [];
    try {
      claims = await dependencies.extractClaimCandidates(bundle, thesis);
    } catch (error) {
      extractionFailures[index] = {
        companyId: bundle.companyId,
        stage: "extract_claim_candidates",
        message: errorMessage(error),
      };
    }
    evaluations[index] = evaluateCompany(thesis, bundle, claims);
  });

  const ranking = rankCompanies(evaluations);
  const selected = selectedEvaluations(ranking, top, input.requestedCompanyIds ?? []);
  const selectionFailures = selected.missingIds.map((companyId): InvestmentBriefFailure => ({
    companyId,
    stage: "select_company",
    message: "Requested company was not evaluated",
  }));
  const bundlesById = new Map(evidence.map((bundle) => [bundle.companyId, bundle]));
  const briefs: Array<InvestmentBrief | undefined> = new Array(selected.evaluations.length);
  const briefFailures: Array<InvestmentBriefFailure | undefined> = new Array(selected.evaluations.length);

  await runWorkers(selected.evaluations.length, async (index) => {
    const evaluation = selected.evaluations[index]!;
    const bundle = bundlesById.get(evaluation.companyId)!;
    const publicBundle = {
      ...bundle,
      evidence: bundle.evidence.filter(({ visibility }) => visibility === "public"),
    };
    try {
      const brief = await dependencies.draftInvestmentBrief({ bundle: publicBundle, thesis, evaluation });
      const validation = validateBriefCitations(brief, publicBundle.evidence);
      if (!validation.valid) {
        briefFailures[index] = {
          companyId: evaluation.companyId,
          stage: "validate_brief_citations",
          message: validation.errors
            .map(({ code, section, statementIndex }) => `${code}:${section}:${statementIndex}`)
            .join(","),
        };
        return;
      }
      briefs[index] = brief;
    } catch (error) {
      briefFailures[index] = {
        companyId: evaluation.companyId,
        stage: "draft_investment_brief",
        message: errorMessage(error),
      };
    }
  });

  const failures = [
    ...extractionFailures.filter((failure): failure is InvestmentBriefFailure => failure !== undefined),
    ...selectionFailures,
    ...briefFailures.filter((failure): failure is InvestmentBriefFailure => failure !== undefined),
  ];
  return {
    status: failures.length === 0 ? "completed" : "partial",
    generatedAt,
    thesis,
    evidence,
    evaluations,
    ranking,
    briefs: briefs.filter((brief): brief is InvestmentBrief => brief !== undefined),
    failures,
    generationMetadata: dependencies.getGenerationMetadata?.() ?? [],
  };
}
