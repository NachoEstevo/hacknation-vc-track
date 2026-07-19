import { describe, expect, it } from "vitest";
import {
  resolveProjectDbId,
  syntheticClaimId,
  syntheticEvidenceId,
  syntheticFounderId,
  syntheticProjectId,
} from "./synthetic-demo-catalog";

describe("resolveProjectDbId", () => {
  it("passes a real project uuid through unchanged", () => {
    const realId = "11111111-2222-3333-4444-555555555555";
    expect(resolveProjectDbId(realId)).toBe(realId);
  });

  it("maps a demo fixture slug to its deterministic synthetic project id", () => {
    expect(resolveProjectDbId("quanta-forge")).toBe(syntheticProjectId("quanta-forge"));
  });

  it("is case-insensitive about what counts as a uuid", () => {
    const upper = "11111111-2222-3333-4444-555555555555".toUpperCase();
    expect(resolveProjectDbId(upper)).toBe(upper);
  });
});

describe("synthetic catalog id helpers", () => {
  it("scope claim and evidence ids to their opportunity, so identical fact keys across opportunities never collide", () => {
    const claimA = syntheticClaimId("quanta-forge", "claim-quanta-forge-problem");
    const claimB = syntheticClaimId("patch-pilot", "claim-patch-pilot-problem");
    expect(claimA).not.toBe(claimB);
  });

  it("keeps founder ids independent from project ids for the same fixture id", () => {
    expect(syntheticFounderId("quanta-forge")).not.toBe(syntheticProjectId("quanta-forge"));
  });

  it("is stable across repeated calls (required for idempotent re-seeding)", () => {
    expect(syntheticEvidenceId("quanta-forge", "evidence-quanta-forge-problem-support"))
      .toBe(syntheticEvidenceId("quanta-forge", "evidence-quanta-forge-problem-support"));
  });
});
