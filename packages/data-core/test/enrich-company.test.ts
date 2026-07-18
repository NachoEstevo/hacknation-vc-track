import { describe, expect, it } from "vitest";
import { enrichCompany } from "../src/enrichment/enrich-company.js";
import type { StableCompanySeed } from "../src/types.js";

const company = { stableId: "abc", name: "Acme", domain: "acme.test" } as StableCompanySeed;

describe("enrichCompany", () => {
  it("keeps successful evidence when a discovered page fails", async () => {
    const result = await enrichCompany(company, {
      fetchPage: async (url) => url.toString().endsWith("/team")
        ? { failure: { url: url.toString(), reason: "http_500" } }
        : { page: { url: url.toString(), status: 200, html: '<title>Acme</title><a href="/team">Team</a>' } },
      enrichGitHub: async () => { throw new Error("not expected"); },
      now: () => "2026-07-18T00:00:00.000Z",
    });
    expect(result.status).toBe("partial");
    expect(result.pages).toHaveLength(1);
    expect(result.failures[0]?.reason).toBe("http_500");
  });
});
