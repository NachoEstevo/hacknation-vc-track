import { createHash } from "node:crypto";
import { ApiError } from "./errors.js";
import type { ApiRepository, ApiServices, FounderEvidenceInput, SearchEngine } from "./types.js";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function evidenceHash(companyId: string, founderId: string, input: FounderEvidenceInput): string {
  return createHash("sha256").update(canonicalJson({ companyId, founderId, ...input })).digest("hex");
}

export function createServices(repository: ApiRepository, searchEngine: SearchEngine): ApiServices {
  return {
    async searchCompanies(userId, input) {
      const bundles = await repository.listSearchBundles();
      const { thesis, ranked } = await searchEngine.search(input.query, bundles);
      const selected = ranked.slice(0, input.limit);
      const searchId = await repository.persistSearch(userId, input.query, thesis, selected);
      return {
        searchId,
        thesis,
        results: selected.map(({ evaluation, ...ranking }) => ({
          companyId: evaluation.companyId,
          companyName: evaluation.companyName,
          recommendation: evaluation.recommendation,
          thesisFit: evaluation.thesisFit,
          evidenceCoverage: evaluation.evidenceCoverage,
          ...ranking,
        })),
      };
    },

    async getCompanyBrief(userId, companyId, searchId) {
      const brief = await repository.getBrief(userId, companyId, searchId);
      if (!brief) throw new ApiError(404, "not_found", "Company brief was not found in this search.");
      return brief;
    },

    async saveWatchlist(userId, companyId, input) {
      if (!await repository.companyExists(companyId)) throw new ApiError(404, "not_found", "Company was not found.");
      return repository.upsertWatchlist(userId, companyId, input);
    },

    async registerFounderEvidence(userId, companyId, input) {
      const membership = await repository.findVerifiedFounderMembership(userId, companyId);
      if (!membership) throw new ApiError(403, "forbidden", "Verified founder access is required for this company.");
      return repository.insertFounderEvidence(userId, companyId, membership.founderId, {
        ...input,
        contentHash: evidenceHash(companyId, membership.founderId, input),
        verificationState: "unverified",
      });
    },
  };
}
