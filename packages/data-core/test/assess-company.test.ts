import { describe, expect, it } from "vitest";
import { assessCompany } from "../src/briefs/assess-company";
import type { ClaimCandidate, CompanyEvidenceBundle, EvidenceRecord } from "../src/briefs/types";

function evidence(
  evidenceId: string,
  sourceType: EvidenceRecord["sourceType"],
  payload: Record<string, unknown> | null = null,
): EvidenceRecord {
  return {
    evidenceId,
    companyId: "acme",
    sourceType,
    sourceUrl: "https://acme.test",
    snapshotPath: null,
    capturedAt: "2026-07-18T00:00:00.000Z",
    excerpt: null,
    payload,
    verificationState: "verified",
    visibility: "public",
  };
}

function bundle(evidenceRecords: EvidenceRecord[]): CompanyEvidenceBundle {
  return {
    companyId: "acme",
    companyName: "Acme",
    normalizedCompany: {
      stableId: "acme",
      name: "Acme",
      description: null,
      primaryIndustry: null,
      sizeBand: null,
      organizationType: null,
      location: null,
      countryCode: null,
      domain: "acme.test",
      linkedInUrl: null,
      dedupeKey: "acme.test",
      source: { sourceType: "clay_csv", rowNumber: 2, verification: "unverified", raw: {} },
    },
    evidence: evidenceRecords,
  };
}

function claim(predicate: string, value: string | number | boolean, evidenceIds: string[]): ClaimCandidate {
  return {
    claimId: predicate,
    companyId: "acme",
    subject: "Acme",
    predicate,
    value,
    unit: null,
    claimKind: "observed_fact",
    evidenceIds,
    trust: { sourceReliability: 40, directness: 25, corroboration: 0, recency: 15, total: 80, state: "supported" },
    state: "supported",
  };
}

describe("assessCompany", () => {
  it("returns the four assessment axes in a stable order with dimension evidence", () => {
    const result = assessCompany(bundle([
      evidence("founder", "company_website", { founderCandidates: [{ name: "Ada", role: "CEO" }] }),
      evidence("website", "company_website", { signalLinks: { pricing: ["https://acme.test/pricing"] } }),
      evidence("github", "github_public", { latestPushAt: "2026-07-10T00:00:00.000Z" }),
    ]), [claim("customers", 12, ["website"]), claim("arr", 100_000, ["website"])]);

    expect(result.map((axis) => axis.axis)).toEqual(["founder", "market", "product_execution", "traction"]);
    for (const axis of result) {
      for (const dimension of axis.dimensions) {
        expect(dimension).toHaveProperty("points");
        expect(dimension).toHaveProperty("possiblePoints");
        expect(dimension).toHaveProperty("evidenceIds");
        expect(dimension).toHaveProperty("reason");
      }
    }
    expect(result[0]!.score).not.toBeNull();
    expect(result[2]!.score).not.toBeNull();
    expect(result[3]!.score).not.toBeNull();
  });

  it("leaves absent traction unknown instead of treating it as zero-quality evidence", () => {
    const traction = assessCompany(bundle([]), []).find((axis) => axis.axis === "traction")!;

    expect(traction.score).toBeNull();
    expect(traction.coverage).toBe(0);
    expect(traction.dimensions.every((dimension) => dimension.known === false && dimension.points === 0)).toBe(true);
  });

  it("does not emit material known dimensions from uncited normalized fields", () => {
    const uncitedBundle = bundle([]);
    uncitedBundle.normalizedCompany.description = "Populated but uncited description";
    uncitedBundle.normalizedCompany.primaryIndustry = "Software";

    const axes = assessCompany(uncitedBundle, []);

    expect(axes.every((axis) => axis.coverage === 0 && axis.score === null)).toBe(true);
    expect(axes.flatMap((axis) => axis.dimensions).every((dimension) => dimension.known === false)).toBe(true);
  });

  it("ignores supported claims from another company", () => {
    const validEvidence = evidence("valid", "founder_document");
    const foreignClaim = { ...claim("revenue", 1_000, ["valid"]), companyId: "other-company" };

    const traction = assessCompany(bundle([validEvidence]), [foreignClaim]).find((axis) => axis.axis === "traction")!;

    expect(traction.coverage).toBe(0);
    expect(traction.score).toBeNull();
  });

  it("keeps zero traction values known with coverage but awards zero quality points", () => {
    const validEvidence = evidence("valid", "founder_document");
    const traction = assessCompany(bundle([validEvidence]), [
      claim("customers", 0, ["valid"]),
      claim("revenue", 0, ["valid"]),
    ]).find((axis) => axis.axis === "traction")!;

    expect(traction.coverage).toBe(80);
    expect(traction.score).toBe(0);
    expect(traction.dimensions.slice(0, 2).map((dimension) => ({ known: dimension.known, points: dimension.points }))).toEqual([
      { known: true, points: 0 },
      { known: true, points: 0 },
    ]);
  });

  it("intersects assessment claim evidence IDs with the bundle", () => {
    const validEvidence = evidence("valid", "founder_document");
    const traction = assessCompany(bundle([validEvidence]), [
      claim("revenue", 10, ["valid", "ghost"]),
    ]).find((axis) => axis.axis === "traction")!;

    expect(traction.dimensions.find((dimension) => dimension.dimensionId === "revenue_evidence")!.evidenceIds).toEqual(["valid"]);
  });
});
