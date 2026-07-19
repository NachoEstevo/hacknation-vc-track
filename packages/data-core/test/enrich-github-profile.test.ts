import { describe, expect, it, vi } from "vitest";
import { enrichGitHubProfile } from "../src/enrichment/enrich-github-profile";

describe("enrichGitHubProfile", () => {
  it("returns public organization and repository activity", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/orgs/acme")) return new Response(JSON.stringify({ login: "acme", public_repos: 2, followers: 5, created_at: "2024-01-01T00:00:00Z" }), { status: 200 });
      if (url.includes("/orgs/acme/repos")) return new Response(JSON.stringify([{ html_url: "https://github.com/acme/app", pushed_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-02T00:00:00Z", stargazers_count: 7, fork: false }]), { status: 200 });
      return new Response("not found", { status: 404 });
    });
    const result = await enrichGitHubProfile("https://github.com/acme", { fetcher });
    expect(result).toMatchObject({ status: "ok", accountType: "organization", login: "acme", publicRepos: 2 });
    expect(result.latestPushAt).toBe("2026-07-01T00:00:00Z");
  });
});
