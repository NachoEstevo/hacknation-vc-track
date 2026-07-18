import { describe, expect, it } from "vitest";
import { isSearchCriterion, SYNTHETIC_DEMO_LABEL } from "../domain";
import { matchOpportunity, parseSearchIntent } from "../search";
import { DEMO_OPPORTUNITIES, getOpportunity, searchOpportunities } from "./opportunities";

describe("demo opportunity catalog", () => {
  it("contains six clearly labeled opportunities with inspectable evidence", () => {
    expect(DEMO_OPPORTUNITIES).toHaveLength(6);
    for (const opportunity of DEMO_OPPORTUNITIES) {
      const evidenceIds = new Set(opportunity.evidence.map((evidence) => evidence.id));
      expect(opportunity.dataLabel).toBe(SYNTHETIC_DEMO_LABEL);
      expect(opportunity.claims.length).toBeGreaterThan(5);
      expect(opportunity.evidence.length).toBeGreaterThan(5);
      expect(opportunity.claims.every((claim) => claim.dataLabel === SYNTHETIC_DEMO_LABEL)).toBe(true);
      expect(opportunity.evidence.every((evidence) => evidence.sourceUrl === null)).toBe(true);
      for (const claim of opportunity.claims) {
        expect(claim.evidence.every((link) => evidenceIds.has(link.evidenceId))).toBe(true);
        expect(claim.trust.score).toBe(
          claim.trust.sourceReliability
          + claim.trust.directness
          + claim.trust.corroboration
          + claim.trust.recency,
        );
      }
      for (const contradiction of opportunity.contradictions) {
        expect(contradiction.evidenceIds.every((id) => evidenceIds.has(id))).toBe(true);
        expect(opportunity.claims.some((claim) => claim.id === contradiction.claimId)).toBe(true);
      }
    }
  });

  it("returns details by stable fixture id", () => {
    expect(getOpportunity("quanta-forge")?.project.name).toBe("Quanta Forge");
    expect(getOpportunity("does-not-exist")).toBeNull();
  });

  it("ranks a well-supported thesis match before gaps and conflicts", () => {
    const results = searchOpportunities(
      "Technical founders in Latin America building AI infrastructure without institutional funding.",
    );

    expect(results[0]?.opportunity.id).toBe("quanta-forge");
    expect(results.find((result) => result.opportunity.id === "senda-systems")?.evaluations)
      .toContainEqual(expect.objectContaining({
        state: "conflict",
        criterion: expect.objectContaining({ field: "institutional_funding" }),
      }));
  });

  it("keeps missing funding evidence out of thesis match instead of treating it as negative", () => {
    const intent = parseSearchIntent("AI infrastructure without institutional funding");
    const relay = searchOpportunities(intent).find((result) => result.opportunity.id === "relay-mesh");
    const funding = relay?.evaluations.find(
      (evaluation) => evaluation.criterion.field === "institutional_funding",
    );

    expect(funding?.state).toBe("missing");
    expect(relay?.thesisMatch).toBe(100);
    expect(relay?.evidenceCoverage).toBe(50);
  });

  it("describes tentative exclusions without reversing their meaning", () => {
    const quanta = searchOpportunities("AI infrastructure without institutional funding")
      .find((result) => result.opportunity.id === "quanta-forge");
    const funding = quanta?.evaluations.find(
      (evaluation) => evaluation.criterion.field === "institutional_funding",
    );

    expect(funding?.state).toBe("partial");
    expect(funding?.explanation).toBe(
      "Available evidence tentatively indicates that the excluded condition is not present, but it is not fully supported.",
    );
    expect(funding?.explanation).not.toContain("no institutional funding is not present");
  });

  it("surfaces contradictory sources as a conflict", () => {
    const relay = searchOpportunities("AI infrastructure with a working demo")
      .find((result) => result.opportunity.id === "relay-mesh");

    expect(relay?.opportunity.contradictions).toHaveLength(1);
    expect(relay?.evaluations).toContainEqual(expect.objectContaining({
      state: "conflict",
      criterion: expect.objectContaining({ field: "working_demo" }),
    }));
  });

  it("evaluates the persisted operator contract and leaves configuration-only fields unknown", () => {
    const opportunity = getOpportunity("quanta-forge");
    expect(opportunity).not.toBeNull();
    const result = matchOpportunity(opportunity!, {
      query: "contract coverage",
      sourceScope: "internal_then_public",
      criteria: [
        {
          id: "sector-all",
          field: "sector",
          operator: "contains_all",
          value: ["ai_infrastructure", "developer_tools"],
          priority: "required",
          label: "AI infrastructure and developer tools",
        },
        {
          id: "team-min",
          field: "team_size",
          operator: "gte",
          value: 3,
          priority: "required",
          label: "At least three people",
        },
        {
          id: "team-range",
          field: "team_size",
          operator: "between",
          value: [2, 4],
          priority: "required",
          label: "Two to four people",
        },
        {
          id: "risk",
          field: "acceptable_risk",
          operator: "equals",
          value: "frontier",
          priority: "preferred",
          label: "Frontier risk",
        },
      ],
    });

    expect(result.evaluations.map((evaluation) => evaluation.state)).toEqual([
      "match",
      "match",
      "match",
      "missing",
    ]);
    expect(result.evidenceCoverage).toBe(86);
  });

  it("rejects malformed persisted criteria at the runtime boundary", () => {
    expect(isSearchCriterion({
      id: "bad-range",
      field: "team_size",
      operator: "between",
      value: [10, 2],
      priority: "required",
      label: "Bad range",
    })).toBe(false);
    expect(isSearchCriterion({
      id: "unknown-field",
      field: "future_field",
      operator: "equals",
      value: true,
      priority: "required",
      label: "Unknown",
    })).toBe(false);
  });
});
