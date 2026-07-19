import { describe, expect, it } from "vitest";
import { calculateClaimTrust } from "../src/briefs/calculate-claim-trust";
import type { EvidenceRecord } from "../src/briefs/types";

const EVALUATED_AT = "2026-07-18T00:00:00.000Z";

function evidence(
  evidenceId: string,
  sourceType: EvidenceRecord["sourceType"],
  capturedAt = EVALUATED_AT,
  sourceUrl: string | null = null,
  excerpt = `${evidenceId} distinct evidence`,
): EvidenceRecord {
  return {
    evidenceId,
    companyId: "acme",
    sourceType,
    sourceUrl,
    snapshotPath: null,
    capturedAt,
    excerpt,
    payload: null,
    verificationState: "verified",
    visibility: "public",
  };
}

function trust(
  supportingEvidence: EvidenceRecord[],
  contradictingEvidence: EvidenceRecord[] = [],
  evaluatedAt = EVALUATED_AT,
) {
  return calculateClaimTrust({ supportingEvidence, contradictingEvidence, evaluatedAt });
}

describe("calculateClaimTrust", () => {
  it.each([
    ["stripe_private", 40, 25],
    ["founder_document", 40, 25],
    ["company_website", 30, 18],
    ["github_public", 30, 8],
    ["clay_csv", 20, 8],
    ["founder_assertion", 20, 18],
  ] as const)("derives %s reliability and directness from provenance", (sourceType, sourceReliability, directness) => {
    expect(trust([evidence("primary", sourceType)])).toMatchObject({ sourceReliability, directness });
  });

  it("returns the approved direct Stripe score without a model directness input", () => {
    expect(trust([evidence("stripe", "stripe_private")])).toEqual({
      sourceReliability: 40,
      directness: 25,
      corroboration: 0,
      recency: 15,
      total: 80,
      state: "supported",
    });
  });

  it.each([
    [30, 15],
    [31, 10],
    [180, 10],
    [181, 5],
    [365, 5],
    [366, 0],
  ])("scores evidence captured %i days ago with %i recency points", (daysAgo, recency) => {
    const capturedAt = new Date(Date.parse(EVALUATED_AT) - daysAgo * 86_400_000).toISOString();
    expect(trust([evidence("primary", "stripe_private", capturedAt)]).recency).toBe(recency);
  });

  it("awards corroboration only for distinct source authorities", () => {
    expect(trust([
      evidence("website", "company_website", EVALUATED_AT, "https://acme.test/about"),
      evidence("github", "github_public", EVALUATED_AT, "https://github.com/acme/product"),
    ]).corroboration).toBe(10);
  });

  it("does not let multiple pages from one authority self-corroborate", () => {
    expect(trust([
      evidence("about", "company_website", EVALUATED_AT, "https://acme.test/about"),
      evidence("pricing", "company_website", EVALUATED_AT, "https://www.acme.test/pricing"),
    ]).corroboration).toBe(0);
  });

  it("does not award corroboration to duplicated content from another source", () => {
    const duplicate = "Acme has 10 active teams.";
    expect(trust([
      evidence("website", "company_website", EVALUATED_AT, "https://acme.test", duplicate),
      evidence("github", "github_public", EVALUATED_AT, "https://github.com/acme/product", duplicate),
    ]).corroboration).toBe(0);
  });

  it("awards the maximum only for three genuinely distinct grounded authorities", () => {
    expect(trust([
      evidence("stripe", "stripe_private", EVALUATED_AT, null, "10 paid accounts"),
      evidence("website", "company_website", EVALUATED_AT, "https://acme.test", "10 customer teams"),
      evidence("github", "github_public", EVALUATED_AT, "https://github.com/acme/product", "10 active installations"),
    ]).corroboration).toBe(20);
  });

  it("derives conflict from grounded contradictory evidence", () => {
    const result = trust(
      [evidence("positive", "stripe_private", EVALUATED_AT, null, "10 paid accounts")],
      [evidence("negative", "founder_document", EVALUATED_AT, null, "No paid accounts")],
    );

    expect(result.total).toBeGreaterThan(70);
    expect(result.state).toBe("conflicted");
  });
});
