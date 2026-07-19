import { describe, expect, it } from "vitest";
import { buildProductStatusSourceNote, buildProductStatusStatement } from "./product-status";

describe("buildProductStatusStatement", () => {
  it("includes every real fact the connector returned", () => {
    const statement = buildProductStatusStatement({
      fullName: "acme/relay",
      description: "A relay network",
      starCount: 12,
      openIssueCount: 3,
      pushedAt: "2026-07-10T00:00:00.000Z",
      primaryLanguage: "TypeScript",
    });

    expect(statement).toBe(
      "Repository acme/relay — A relay network (built in TypeScript, 12 GitHub stars, 3 open issues, last pushed Jul 10, 2026).",
    );
  });

  it("degrades gracefully when the connector returned few fields, without inventing any", () => {
    const statement = buildProductStatusStatement({
      fullName: "acme/relay",
      description: null,
      starCount: null,
      openIssueCount: null,
      pushedAt: null,
      primaryLanguage: null,
    });

    expect(statement).toBe("Repository acme/relay.");
  });

  it("uses singular star/issue wording at exactly one", () => {
    const statement = buildProductStatusStatement({
      fullName: "acme/relay",
      description: null,
      starCount: 1,
      openIssueCount: 1,
      pushedAt: null,
      primaryLanguage: null,
    });

    expect(statement).toContain("1 GitHub star,");
    expect(statement).toContain("1 open issue)");
  });
});

describe("buildProductStatusSourceNote", () => {
  it("cites real stars and push date", () => {
    expect(
      buildProductStatusSourceNote({
        fullName: "acme/relay",
        description: null,
        starCount: 5,
        openIssueCount: null,
        pushedAt: "2026-07-10T00:00:00.000Z",
        primaryLanguage: null,
      }),
    ).toBe("Drafted from repo activity · 5 stars · pushed Jul 10, 2026");
  });

  it("falls back to a bare note when no repo facts are available", () => {
    expect(
      buildProductStatusSourceNote({
        fullName: "acme/relay",
        description: null,
        starCount: null,
        openIssueCount: null,
        pushedAt: null,
        primaryLanguage: null,
      }),
    ).toBe("Drafted from repo activity");
  });
});
