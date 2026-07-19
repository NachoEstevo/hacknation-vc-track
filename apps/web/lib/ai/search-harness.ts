import { generateObject } from "ai";
import type { ZodType } from "zod";
import { resolveModel } from "./model";
import {
  QueryPlanSchema,
  SearchSynthesisSchema,
  type QueryPlanOutput,
  type SearchSynthesisOutput,
} from "./search-harness-schema";
import {
  searchRegisteredFounders,
  type RegisteredFounderCandidate,
} from "../search/registered-founders.server";
import { searchClayCatalogRows } from "../catalog/search-catalog";
import type { ClayCatalogCompany, ClayCatalogSearchResult } from "../catalog/types";
import { searchGitHubRepositories, type GitHubSearchRepository } from "../connectors/github/github-search.server";
import { enrichGitHubPublicAccount } from "../connectors/github/github-public.server";
import { searchArxiv, type ArxivPaper } from "../connectors/arxiv/arxiv-search.server";
import type { SearchIntent } from "../domain";

// See parse-search-intent-ai.ts — generateObject's generic inference blows up
// TypeScript's checker on deeply nested Zod schemas. Runtime validation is
// unaffected; this only simplifies what the type checker sees.
const synthesisSchema = SearchSynthesisSchema as ZodType<SearchSynthesisOutput>;
const queryPlanSchema = QueryPlanSchema as ZodType<QueryPlanOutput>;

export type SourceCategory = "registered" | "internal_base" | "external_unconfirmed";
export type ExternalSourceKey = "github" | "arxiv";

export interface SearchCandidate {
  id: string;
  sourceCategory: SourceCategory;
  founderName: string;
  projectName: string;
  founderSubline: string;
  description: string;
  stageLabel: string;
  tags: string[];
  score: number;
  scoreIsEstimate: boolean;
  sources: { type: "github" | "web" | "registry"; label: string; count: number }[];
  whyMatch: string;
  confidenceLevel: "high" | "medium" | "low";
  unknownNote: string | null;
  websiteUrl: string | null;
  githubUrl: string | null;
}

export interface SearchProgressEvent {
  source: ExternalSourceKey | "registered" | "catalog";
  label: string;
  completed: number;
  total: number;
  isExternal: boolean;
}

export interface RunSearchInput {
  query: string;
  intent: SearchIntent;
  catalogRows: readonly Readonly<ClayCatalogCompany>[];
  onProgress?: (event: SearchProgressEvent) => void;
}

export interface RunSearchOutput {
  assistantMessage: string;
  candidates: SearchCandidate[];
  usedAi: boolean;
  externalStepsCompleted: number;
  externalStepsTotal: number;
  registeredCount: number;
  internalBaseCount: number;
  externalCount: number;
}

function keywordsFromCriteria(intent: SearchIntent, query: string): string[] {
  const labels = intent.criteria
    .filter((criterion) => criterion.priority !== "exclude")
    .map((criterion) => criterion.label);
  if (labels.length > 0) return labels;
  return query.split(/\s+/).filter((word) => word.length >= 4).slice(0, 4);
}

// GitHub/arXiv full-text search ANDs every term literally — investor concepts
// like "Pre-seed" or "Latin America" almost never appear in repo READMEs or
// paper abstracts, so joining every criterion label collapses results to
// zero. Prefer the technology-flavored criteria only; without AI query
// planning, this is the best deterministic proxy for "what would actually
// show up in the text".
const TOPIC_FRIENDLY_FIELDS = new Set(["sector", "valued_signal_types"]);

function topicQueryFromCriteria(intent: SearchIntent, fallbackKeywords: string[]): string {
  const topicLabels = intent.criteria
    .filter((criterion) => criterion.priority !== "exclude" && TOPIC_FRIENDLY_FIELDS.has(criterion.field))
    .map((criterion) => criterion.label);
  // GitHub ANDs every term literally — one topic label already narrows hard.
  if (topicLabels.length > 0) return topicLabels[0];
  return fallbackKeywords.slice(0, 1).join(" ");
}

function stageLabelFromCriteria(intent: SearchIntent): string {
  const stage = intent.criteria.find((criterion) => criterion.field === "stage");
  if (stage && typeof stage.value === "string") return stage.value;
  return "Stage unknown";
}

// ---------- Deterministic scoring — never touches the model ----------

function clampScore(value: number): number {
  return Math.max(1, Math.min(99, Math.round(value)));
}

function scoreRegistered(candidate: RegisteredFounderCandidate): number {
  let score = 38;
  if (candidate.hasWorkingDemo) score += 20;
  if (candidate.tractionSummary) score += 12;
  if (candidate.hackathonOrigin) score += 8;
  score += Math.min(20, candidate.claimCount * 5);
  return clampScore(score);
}

function scoreCatalog(company: ClayCatalogSearchResult): number {
  let score = 24;
  if (company.description) score += 8;
  if (company.primaryIndustry) score += 6;
  if (company.domain) score += 6;
  if (company.location) score += 4;
  return clampScore(Math.min(score, 58));
}

function scoreGitHub(repo: GitHubSearchRepository, followerCount: number | null): number {
  let score = 30;
  score += Math.min(20, Math.round(Math.log2(repo.starCount + 1) * 4));
  score += Math.min(10, Math.round(Math.log2(repo.forkCount + 1) * 3));
  if (repo.pushedAt) {
    const daysSincePush = (Date.now() - new Date(repo.pushedAt).getTime()) / 86_400_000;
    if (daysSincePush <= 30) score += 12;
    else if (daysSincePush <= 90) score += 6;
  }
  if (followerCount) score += Math.min(8, Math.round(Math.log2(followerCount + 1) * 2));
  return clampScore(Math.min(score, 74));
}

// ---------- Retrieval (real network/DB calls) ----------

interface RetrievalContext {
  catalogRows: readonly Readonly<ClayCatalogCompany>[];
  fallbackKeywords: string[];
  registered: RegisteredFounderCandidate[];
  catalog: ClayCatalogSearchResult[];
  github: GitHubSearchRepository[];
  githubOwnerLocations: Map<string, string | null>;
  arxiv: ArxivPaper[];
  progress: {
    completed: number;
    total: number;
    emit: (source: ExternalSourceKey | "registered" | "catalog", label: string, isExternal: boolean) => void;
  };
}

/** The model's one real decision in this harness: a focused query per source, grounded in nothing but the brief. */
async function planQueries(input: RunSearchInput, fallbackKeywords: string[]): Promise<QueryPlanOutput | null> {
  const model = resolveModel();
  if (!model) return null;

  try {
    const generate = generateObject as (options: unknown) => Promise<{ object: unknown }>;
    const result = await generate({
      model,
      schema: queryPlanSchema,
      system:
        "You compose short, focused search queries for four real, independent sources based on an investor's sourcing brief. registeredKeyword and catalogTerm are plain keywords. githubQuery is a GitHub repository-search query (keywords plus optional language:/topic:/pushed:>YYYY-MM-DD qualifiers — never use location:, it isn't supported for repository search). arxivQuery is a plain-keyword arXiv query for related technical research.",
      prompt: `Brief: "${input.query}"\nCriteria: ${input.intent.criteria.map((c) => c.label).join(", ") || fallbackKeywords.join(", ") || "none"}`,
      abortSignal: AbortSignal.timeout(10_000),
    });
    return result.object as QueryPlanOutput;
  } catch {
    return null;
  }
}

async function runRetrieval(
  input: RunSearchInput,
  ctx: RetrievalContext,
  allowExternal: boolean,
): Promise<{ usedAi: boolean }> {
  const plan = await planQueries(input, ctx.fallbackKeywords);
  const topicFallback = topicQueryFromCriteria(input.intent, ctx.fallbackKeywords) || input.query;
  const registeredKeyword = plan?.registeredKeyword ?? ctx.fallbackKeywords[0] ?? input.query;
  const catalogTerm = plan?.catalogTerm ?? ctx.fallbackKeywords[0] ?? input.query;
  const githubQuery = plan?.githubQuery ?? topicFallback;
  const arxivQuery = plan?.arxivQuery ?? topicFallback;

  await Promise.all([
    searchRegisteredFounders([registeredKeyword, ...ctx.fallbackKeywords], 8).then((results) => {
      ctx.registered.push(...results);
      ctx.progress.emit("registered", "Registered founders", false);
    }),
    Promise.resolve(searchClayCatalogRows(ctx.catalogRows, catalogTerm, 6)).then(({ results }) => {
      ctx.catalog.push(...results);
      ctx.progress.emit("catalog", "Internal catalog", false);
    }),
    ...(allowExternal
      ? [
          searchGitHubRepositories(githubQuery, { token: process.env.GITHUB_TOKEN, limit: 5 }).then(
            async (result) => {
              ctx.github.push(...result.repositories);
              await Promise.all(
                result.repositories.slice(0, 2).map(async (repo) => {
                  if (ctx.githubOwnerLocations.has(repo.ownerLogin)) return;
                  try {
                    const account = await enrichGitHubPublicAccount(repo.ownerLogin, { maxRepositories: 0 });
                    ctx.githubOwnerLocations.set(repo.ownerLogin, account.account.locationText);
                  } catch {
                    ctx.githubOwnerLocations.set(repo.ownerLogin, null);
                  }
                }),
              );
              ctx.progress.emit("github", "GitHub", true);
            },
          ),
          searchArxiv(arxivQuery, { limit: 4 }).then((result) => {
            ctx.arxiv.push(...result.papers);
            ctx.progress.emit("arxiv", "arXiv", true);
          }),
        ]
      : []),
  ]);

  return { usedAi: plan !== null };
}

function fallbackSynthesis(candidates: { id: string; sourceCategory: SourceCategory }[]): SearchSynthesisOutput {
  const registeredCount = candidates.filter((c) => c.sourceCategory === "registered").length;
  const internalCount = candidates.filter((c) => c.sourceCategory === "internal_base").length;
  const externalCount = candidates.filter((c) => c.sourceCategory === "external_unconfirmed").length;
  return {
    assistantMessage:
      candidates.length === 0
        ? "No matches yet across the registered base, internal catalog, or external sources for this brief."
        : `Found ${candidates.length} match${candidates.length === 1 ? "" : "es"} — ${registeredCount} registered, ${internalCount} from the internal base, ${externalCount} external.`,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      whyMatch: "Matched on keyword overlap with the brief.",
      confidenceLevel: candidate.sourceCategory === "registered" ? "medium" : "low",
      tags: [],
      unknownNote: candidate.sourceCategory === "external_unconfirmed" ? "Team & funding unknown" : null,
    })),
  };
}

/**
 * Runs the real, live sourcing harness: an AI-SDK tool-calling agent decides
 * search terms and retrieves from undr's registered base, the internal
 * catalog, and (when the intent allows public enrichment) live GitHub and
 * arXiv APIs — then a second, grounded generateObject call adds narrative
 * framing over the real results only. Every fact shown comes from a tool
 * result; the model can never introduce a candidate that wasn't retrieved.
 */
export async function runSearch(input: RunSearchInput): Promise<RunSearchOutput> {
  const allowExternal = input.intent.sourceScope === "internal_then_public";
  const externalStepsTotal = allowExternal ? 2 : 0;
  let externalStepsCompleted = 0;

  const ctx: RetrievalContext = {
    catalogRows: input.catalogRows,
    fallbackKeywords: keywordsFromCriteria(input.intent, input.query),
    registered: [],
    catalog: [],
    github: [],
    githubOwnerLocations: new Map(),
    arxiv: [],
    progress: {
      completed: 0,
      total: 2 + externalStepsTotal,
      emit(source, label, isExternal) {
        this.completed += 1;
        if (isExternal) externalStepsCompleted += 1;
        input.onProgress?.({
          source,
          label,
          completed: this.completed,
          total: this.total,
          isExternal,
        });
      },
    },
  };

  const { usedAi } = await runRetrieval(input, ctx, allowExternal);

  const stageLabel = stageLabelFromCriteria(input.intent);

  const registeredCandidates: SearchCandidate[] = ctx.registered.map((row) => ({
    id: `registered:${row.projectId}`,
    sourceCategory: "registered",
    founderName: row.founderName ?? row.projectName,
    projectName: row.projectName,
    founderSubline: [row.founderName, row.location].filter(Boolean).join(" · ") || "Location unknown",
    description: row.summary ?? row.tagline ?? "No summary on file.",
    stageLabel: row.stage ?? stageLabel,
    tags: row.sectorTags.slice(0, 2),
    score: scoreRegistered(row),
    scoreIsEstimate: false,
    sources: [{ type: "registry", label: "undr", count: row.claimCount }],
    whyMatch: "",
    confidenceLevel: "medium",
    unknownNote: null,
    websiteUrl: null,
    githubUrl: null,
  }));

  const seenCatalog = new Set<string>();
  const catalogCandidates: SearchCandidate[] = ctx.catalog
    .filter((company) => (seenCatalog.has(company.stableId) ? false : (seenCatalog.add(company.stableId), true)))
    .slice(0, 6)
    .map((company) => ({
      id: `catalog:${company.stableId}`,
      sourceCategory: "internal_base",
      founderName: company.name,
      projectName: company.name,
      founderSubline: [company.location, company.countryCode].filter(Boolean).join(", ") || "Location unknown",
      description: company.description ?? "No description in the source record.",
      stageLabel: "Stage unknown",
      tags: [company.primaryIndustry, company.sizeBand].filter((v): v is string => Boolean(v)).slice(0, 2),
      score: scoreCatalog(company),
      scoreIsEstimate: true,
      sources: [{ type: "web", label: "Clay CSV", count: 1 }],
      whyMatch: "",
      confidenceLevel: "low",
      unknownNote: "Founder & funding unknown",
      websiteUrl: company.domain ? `https://${company.domain}` : null,
      githubUrl: null,
    }));

  const seenRepoOwners = new Set<string>();
  const githubCandidates: SearchCandidate[] = ctx.github
    .filter((repo) => (seenRepoOwners.has(repo.ownerLogin) ? false : (seenRepoOwners.add(repo.ownerLogin), true)))
    .slice(0, 4)
    .map((repo) => {
      const location = ctx.githubOwnerLocations.get(repo.ownerLogin) ?? null;
      return {
        id: repo.stableId,
        sourceCategory: "external_unconfirmed" as const,
        founderName: repo.ownerLogin,
        projectName: repo.name,
        founderSubline: [repo.ownerLogin, location].filter(Boolean).join(" · "),
        description: repo.description ?? "No description on the repository.",
        stageLabel: "Stage unknown",
        tags: [repo.primaryLanguage, repo.topics[0]].filter((v): v is string => Boolean(v)).slice(0, 2),
        score: scoreGitHub(repo, null),
        scoreIsEstimate: true,
        sources: [{ type: "github" as const, label: "GitHub", count: 1 + (repo.topics.length > 0 ? 1 : 0) }],
        whyMatch: "",
        confidenceLevel: "medium" as const,
        unknownNote: "Team & funding unknown",
        websiteUrl: null,
        githubUrl: repo.htmlUrl,
      };
    });

  const allCandidates = [...registeredCandidates, ...catalogCandidates, ...githubCandidates];

  let synthesis: SearchSynthesisOutput;
  const model = resolveModel();
  if (model && allCandidates.length > 0) {
    try {
      const generate = generateObject as (options: unknown) => Promise<{ object: unknown }>;
      const result = await generate({
        model,
        schema: synthesisSchema,
        system:
          "You write grounded, honest sourcing summaries. You are given real candidates retrieved from live sources. For each, write a one-sentence whyMatch grounded ONLY in the fields given (never invent facts), a confidenceLevel, up to 3 short tags drawn from the given fields, and an unknownNote naming what's missing if anything. Then write one assistantMessage (max 40 words) summarizing counts by source category for the chat.",
        prompt: JSON.stringify({
          brief: input.query,
          criteria: input.intent.criteria.map((c) => c.label),
          candidates: allCandidates.map((c) => ({
            id: c.id,
            sourceCategory: c.sourceCategory,
            founderName: c.founderName,
            projectName: c.projectName,
            founderSubline: c.founderSubline,
            description: c.description,
            tags: c.tags,
          })),
          arxivPapers: ctx.arxiv.slice(0, 3).map((p) => p.title),
        }),
        abortSignal: AbortSignal.timeout(15_000),
      });
      synthesis = result.object as SearchSynthesisOutput;
    } catch {
      synthesis = fallbackSynthesis(allCandidates);
    }
  } else {
    synthesis = fallbackSynthesis(allCandidates);
  }

  const synthesisById = new Map(synthesis.candidates.map((c) => [c.id, c]));
  const finalCandidates = allCandidates.map((candidate) => {
    const patch = synthesisById.get(candidate.id);
    if (!patch) return candidate;
    return {
      ...candidate,
      whyMatch: patch.whyMatch,
      confidenceLevel: patch.confidenceLevel,
      tags: patch.tags.length > 0 ? patch.tags : candidate.tags,
      unknownNote: patch.unknownNote ?? candidate.unknownNote,
    };
  });

  return {
    assistantMessage: synthesis.assistantMessage,
    candidates: finalCandidates,
    usedAi,
    externalStepsCompleted,
    externalStepsTotal,
    registeredCount: registeredCandidates.length,
    internalBaseCount: catalogCandidates.length,
    externalCount: githubCandidates.length,
  };
}
