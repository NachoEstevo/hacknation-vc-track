import { describe, expect, it } from "vitest";
import { calculateClaimTrust } from "../src/briefs/calculate-claim-trust.js";
import type { EvidenceRecord } from "../src/briefs/types.js";

const EVALUATED_AT = "2026-07-18T00:00:00.000Z";

function evidence(
  evidenceId: string,
  sourceType: EvidenceRecord["sourceType"],
  capturedAt = EVALUATED_AT,
): EvidenceRecord {
  return {
    evidenceId,
    companyId: "acme",
    sourceType,
    sourceUrl: null,
    snapshotPath: null,
    capturedAt,
    excerpt: null,
    payload: null,
    verificationState: "verified",
    visibility: "public",
  };
}

describe("calculateClaimTrust", () => {
  it.each([
    ["stripe_private", "direct_measurement", 40, 25],
    ["founder_document", "primary_document", 40, 25],
    ["company_website", "first_party_statement", 30, 18],
    ["github_public", "proxy_signal", 30, 8],
    ["clay_csv", "inference_only", 20, 0],
    ["founder_assertion", "first_party_statement", 20, 18],
  ] as const)(
    "scores %s evidence with %s directness",
    (sourceType, directness, sourceReliability, directnessPoints) => {
      expect(calculateClaimTrust({
        evidence: [evidence("primary", sourceType)],
        directness,
        independentSupportingEvidenceIds: [],
        evaluatedAt: EVALUATED_AT,
        hasConflict: false,
      })).toMatchObject({ sourceReliability, directness: directnessPoints });
    },
  );

  it("returns the approved direct Stripe score", () => {
    expect(calculateClaimTrust({
      evidence: [evidence("stripe", "stripe_private")],
      directness: "direct_measurement",
      independentSupportingEvidenceIds: [],
      evaluatedAt: EVALUATED_AT,
      hasConflict: false,
    })).toEqual({
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

    expect(calculateClaimTrust({
      evidence: [evidence("primary", "stripe_private", capturedAt)],
      directness: "direct_measurement",
      independentSupportingEvidenceIds: [],
      evaluatedAt: EVALUATED_AT,
      hasConflict: false,
    }).recency).toBe(recency);
  });

  it.each([
    [[], 0],
    [["support-1"], 10],
    [["support-1", "support-2", "support-3"], 20],
  ])("scores independent corroboration from supporting evidence IDs", (ids, corroboration) => {
    expect(calculateClaimTrust({
      evidence: [
        evidence("primary", "stripe_private"),
        evidence("support-1", "company_website"),
        evidence("support-2", "github_public"),
        evidence("support-3", "clay_csv"),
      ],
      directness: "direct_measurement",
      independentSupportingEvidenceIds: ids,
      evaluatedAt: EVALUATED_AT,
      hasConflict: false,
    }).corroboration).toBe(corroboration);
  });

  it("lets a conflict override an otherwise supported total", () => {
    const result = calculateClaimTrust({
      evidence: [evidence("stripe", "stripe_private")],
      directness: "direct_measurement",
      independentSupportingEvidenceIds: ["website"],
      evaluatedAt: EVALUATED_AT,
      hasConflict: true,
    });

    expect(result.total).toBeGreaterThan(70);
    expect(result.state).toBe("conflicted");
  });
});
