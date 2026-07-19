import { describe, expect, it } from "vitest";
import {
  canPublishProject,
  computeCompletionPercent,
  computePublishChecklist,
  computeSectionSummaries,
  countSectionsNeedingInput,
  missingPublishRequirements,
} from "./completeness";
import type { FounderClaimEvidenceLinkRow, FounderClaimRow, FounderEvidenceRow } from "./types";

function claim(overrides: Partial<FounderClaimRow> & { predicate: string }): FounderClaimRow {
  return {
    id: overrides.id ?? `claim-${overrides.predicate}`,
    project_id: "project-1",
    statement: "Statement",
    value: "Statement",
    state: "unverified",
    visibility: "private",
    observed_at: "2026-07-01T00:00:00.000Z",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function evidenceRow(overrides: Partial<FounderEvidenceRow> & { evidence_type: string; id: string }): FounderEvidenceRow {
  return {
    project_id: "project-1",
    source_url: null,
    private_object_path: null,
    excerpt: null,
    structured_payload: null,
    visibility: "founder_private",
    captured_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeSectionSummaries", () => {
  it("marks every section missing for a brand new project", () => {
    const summaries = computeSectionSummaries([], [], []);
    expect(summaries).toHaveLength(10);
    expect(summaries.every((section) => section.status === "missing")).toBe(true);
    expect(countSectionsNeedingInput(summaries)).toBe(10);
    expect(computeCompletionPercent(summaries)).toBe(0);
  });

  it("turns a non-evidence-sensitive section green as soon as its claim exists", () => {
    const summaries = computeSectionSummaries(
      [claim({ predicate: "project.problem" })],
      [],
      [],
    );
    const problem = summaries.find((section) => section.key === "problem");
    expect(problem?.status).toBe("complete");
  });

  it("keeps an evidence-sensitive section amber until a claim has linked evidence", () => {
    const productClaim = claim({ id: "claim-1", predicate: "project.product_status" });
    const summariesWithoutEvidence = computeSectionSummaries([productClaim], [], []);
    expect(summariesWithoutEvidence.find((s) => s.key === "product_status")?.status).toBe("needs_evidence");

    const links: FounderClaimEvidenceLinkRow[] = [
      { claim_id: "claim-1", evidence_id: "evidence-1", relation: "supports", note: null },
    ];
    const summariesWithEvidence = computeSectionSummaries([productClaim], [], links);
    expect(summariesWithEvidence.find((s) => s.key === "product_status")?.status).toBe("complete");
  });

  it("resolves the links section from evidence rows, not claims", () => {
    const summaries = computeSectionSummaries(
      [],
      [evidenceRow({ id: "e1", evidence_type: "website", source_url: "https://example.com" })],
      [],
    );
    expect(summaries.find((s) => s.key === "links")?.status).toBe("complete");
    expect(summaries.find((s) => s.key === "evidence")?.status).toBe("complete");
  });

  it("computes completion percent counting needs_evidence as filled", () => {
    const summaries = computeSectionSummaries(
      [claim({ id: "c1", predicate: "project.product_status" })],
      [],
      [],
    );
    // 1 of 10 sections filled (amber still counts as filled).
    expect(computeCompletionPercent(summaries)).toBe(10);
  });
});

describe("publish checklist", () => {
  it("blocks publishing when core sections are missing", () => {
    const checklist = computePublishChecklist([], [], []);
    expect(canPublishProject(checklist)).toBe(false);
    expect(missingPublishRequirements(checklist).map((item) => item.key)).toEqual([
      "problem_and_solution",
      "product_status",
      "team",
      "deck_or_demo",
    ]);
  });

  it("allows publishing with traction missing but every other requirement met", () => {
    const claims = [
      claim({ id: "p", predicate: "project.problem" }),
      claim({ id: "s", predicate: "project.solution" }),
      claim({ id: "ps", predicate: "project.product_status" }),
      claim({ id: "t", predicate: "project.team" }),
    ];
    const evidence = [evidenceRow({ id: "e1", evidence_type: "demo_link", source_url: "https://demo.example.com" })];
    const checklist = computePublishChecklist(claims, evidence, []);

    expect(checklist.find((item) => item.key === "traction_evidence")?.status).toBe("missing");
    expect(canPublishProject(checklist)).toBe(true);
  });

  it("marks traction needing evidence rather than blocking when a claim exists unsupported", () => {
    const claims = [
      claim({ id: "p", predicate: "project.problem" }),
      claim({ id: "s", predicate: "project.solution" }),
      claim({ id: "ps", predicate: "project.product_status" }),
      claim({ id: "t", predicate: "project.team" }),
      claim({ id: "tr", predicate: "project.traction" }),
    ];
    const evidence = [evidenceRow({ id: "e1", evidence_type: "deck", private_object_path: "u/p/deck.pdf" })];
    const checklist = computePublishChecklist(claims, evidence, []);

    expect(checklist.find((item) => item.key === "traction_evidence")?.status).toBe("needs_evidence");
    expect(canPublishProject(checklist)).toBe(true);
  });
});
