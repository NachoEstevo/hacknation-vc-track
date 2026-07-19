import { describe, expect, it, vi } from "vitest";
import { createApi, type ApiServices } from "../src/index.js";

const user = { userId: "11111111-1111-4111-8111-111111111111" };
const companyId = "22222222-2222-4222-8222-222222222222";
const searchId = "33333333-3333-4333-8333-333333333333";

function services(): ApiServices {
  return {
    searchCompanies: vi.fn(async () => ({
      searchId,
      thesis: { thesisId: "thesis-1", originalQuery: "query", criteria: [], generatedAt: "2026-07-19T00:00:00Z", promptVersion: "v2" },
      results: [],
    })),
    getCompanyBrief: vi.fn(async () => ({ company: { id: companyId }, founders: [], evidence: [] })),
    saveWatchlist: vi.fn(async () => ({ companyId, status: "watching", note: null })),
    registerFounderEvidence: vi.fn(async () => ({ id: "evidence-1", verificationState: "unverified" })),
  };
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`https://undr.test${path}`, {
    ...init,
    headers: { authorization: "Bearer valid-token", "content-type": "application/json", ...init.headers },
  });
}

describe("UNDR server API", () => {
  it("rejects requests without a valid Supabase user", async () => {
    const api = createApi({ authenticate: async () => null, services: services() });
    const response = await api(new Request("https://undr.test/v1/search", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "unauthorized", message: "Authentication required." } });
  });

  it("searches and ranks companies with bounded input", async () => {
    const implementation = services();
    const api = createApi({ authenticate: async () => user, services: implementation });
    const response = await api(request("/v1/search", { method: "POST", body: JSON.stringify({ query: "US B2B AI companies with small teams", limit: 12 }) }));
    expect(response.status).toBe(200);
    expect(implementation.searchCompanies).toHaveBeenCalledWith(user.userId, { query: "US B2B AI companies with small teams", limit: 12 });
  });

  it("opens a brief only in an owned search context", async () => {
    const implementation = services();
    const api = createApi({ authenticate: async () => user, services: implementation });
    const response = await api(request(`/v1/companies/${companyId}/brief?searchId=${searchId}`));
    expect(response.status).toBe(200);
    expect(implementation.getCompanyBrief).toHaveBeenCalledWith(user.userId, companyId, searchId);
  });

  it("upserts a watchlist entry using the authenticated user", async () => {
    const implementation = services();
    const api = createApi({ authenticate: async () => user, services: implementation });
    const response = await api(request(`/v1/watchlist/${companyId}`, { method: "PUT", body: JSON.stringify({ status: "contacted", note: "Ask about retention" }) }));
    expect(response.status).toBe(200);
    expect(implementation.saveWatchlist).toHaveBeenCalledWith(user.userId, companyId, { status: "contacted", note: "Ask about retention" });
  });

  it("registers founder evidence without accepting verification state", async () => {
    const implementation = services();
    const api = createApi({ authenticate: async () => user, services: implementation });
    const response = await api(request(`/v1/companies/${companyId}/founder-evidence`, {
      method: "POST",
      body: JSON.stringify({ evidenceType: "stripe_metrics", excerpt: "Current customer snapshot", structuredPayload: { uniquePayingCustomers: 55 }, visibility: "investor_private", verificationState: "verified" }),
    }));
    expect(response.status).toBe(400);
    expect(implementation.registerFounderEvidence).not.toHaveBeenCalled();
  });

  it.each([
    [{ query: "" }, "invalid_request"],
    [{ query: "x".repeat(2001) }, "invalid_request"],
    [{ query: "valid", limit: 51 }, "invalid_request"],
  ])("rejects invalid search input", async (body, code) => {
    const api = createApi({ authenticate: async () => user, services: services() });
    const response = await api(request("/v1/search", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(code);
  });
});
