import { describe, expect, it, vi } from "vitest";
import { ApiError, createServices, type ApiRepository, type SearchEngine } from "../src/index.js";

const userId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const searchId = "33333333-3333-4333-8333-333333333333";

function repository(overrides: Partial<ApiRepository> = {}): ApiRepository {
  return {
    listSearchBundles: vi.fn(async () => []),
    persistSearch: vi.fn(async () => searchId),
    getBrief: vi.fn(async () => null),
    companyExists: vi.fn(async () => true),
    upsertWatchlist: vi.fn(async (_user, company, input) => ({ companyId: company, ...input, note: input.note ?? null })),
    findVerifiedFounderMembership: vi.fn(async () => ({ founderId: "founder-1" })),
    insertFounderEvidence: vi.fn(async (_user, company, founder, input) => ({
      id: "evidence-1", companyId: company, founderId: founder, verificationState: "unverified", ...input,
    })),
    ...overrides,
  };
}

const engine: SearchEngine = {
  search: vi.fn(async () => ({
    thesis: { thesisId: "thesis-1", originalQuery: "query", criteria: [], generatedAt: "2026-07-19T00:00:00Z", promptVersion: "v2" },
    ranked: [],
  })),
};

describe("server services", () => {
  it("persists a search before returning it", async () => {
    const repo = repository();
    const service = createServices(repo, engine);
    const result = await service.searchCompanies(userId, { query: "query", limit: 10 });
    expect(repo.persistSearch).toHaveBeenCalledOnce();
    expect(result.searchId).toBe(searchId);
  });

  it("does not reveal a brief outside the user's search", async () => {
    const service = createServices(repository({ getBrief: vi.fn(async () => null) }), engine);
    await expect(service.getCompanyBrief(userId, companyId, searchId))
      .rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("rejects watchlisting an unknown company", async () => {
    const service = createServices(repository({ companyExists: vi.fn(async () => false) }), engine);
    await expect(service.saveWatchlist(userId, companyId, { status: "watching", note: null }))
      .rejects.toMatchObject({ status: 404 });
  });

  it("requires a verified founder membership to submit evidence", async () => {
    const service = createServices(repository({ findVerifiedFounderMembership: vi.fn(async () => null) }), engine);
    await expect(service.registerFounderEvidence(userId, companyId, {
      evidenceType: "stripe_metrics", sourceUrl: null, excerpt: "Metrics", structuredPayload: { customers: 55 }, visibility: "investor_private",
    })).rejects.toBeInstanceOf(ApiError);
  });

  it("forces new founder evidence to remain unverified", async () => {
    const repo = repository();
    const service = createServices(repo, engine);
    await service.registerFounderEvidence(userId, companyId, {
      evidenceType: "stripe_metrics", sourceUrl: null, excerpt: "Metrics", structuredPayload: { customers: 55 }, visibility: "investor_private",
    });
    expect(repo.insertFounderEvidence).toHaveBeenCalledWith(userId, companyId, "founder-1", expect.objectContaining({
      verificationState: "unverified",
    }));
  });
});
