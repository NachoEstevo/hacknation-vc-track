import {
  createOpenAIResponse,
  evaluateCompany,
  loadOpenAIConfig,
  parseThesis,
  rankCompanies,
  type CompanyEvidenceBundle,
  type OpenAIStructuredTaskDependencies,
} from "@hacknation/data-core";
import type { SearchEngine } from "./types.js";

export function createSearchEngine(dependencies: OpenAIStructuredTaskDependencies): SearchEngine {
  return {
    async search(query: string, bundles: CompanyEvidenceBundle[]) {
      const thesis = await parseThesis(query, dependencies);
      const evaluations = bundles.map((bundle) => evaluateCompany(thesis, bundle, []));
      return { thesis, ranked: rankCompanies(evaluations) };
    },
  };
}

export function createOpenAISearchEngine(env: Record<string, string | undefined>): SearchEngine {
  const config = loadOpenAIConfig(env);
  return createSearchEngine({ config, createResponse: createOpenAIResponse(config) });
}
