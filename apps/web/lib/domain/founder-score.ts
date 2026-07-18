import type {
  ClaimPredicate,
  ClaimRecord,
  FounderProfile,
  FounderScoreFactor,
  FounderScoreRecord,
} from "./types";

interface FounderScoreInput {
  founders: FounderProfile[];
  claims: ClaimRecord[];
  calculatedAt: string;
}

const FACTORS = [
  {
    id: "technical-execution",
    label: "Technical execution",
    predicate: "founder.technical",
    weight: 40,
  },
  {
    id: "shipped-product",
    label: "Shipped product",
    predicate: "project.working_demo",
    weight: 30,
  },
  {
    id: "observed-use",
    label: "Observed use or traction",
    predicate: "project.traction",
    weight: 20,
  },
  {
    id: "public-building",
    label: "Public building signal",
    predicate: "project.hackathon_origin",
    weight: 10,
  },
] as const satisfies readonly {
  id: string;
  label: string;
  predicate: ClaimPredicate;
  weight: number;
}[];

function stateMultiplier(claim: ClaimRecord): number {
  switch (claim.state) {
    case "supported":
      return 1;
    case "partially_supported":
      return 0.65;
    case "unverified":
      return 0.35;
    case "stale":
      return 0.4;
    case "contradicted":
      return 0;
  }
}

/**
 * Summarizes the strength of available founder execution evidence. Missing
 * factors reduce coverage, not the score itself. This is not a prediction of
 * company success and must always be rendered with factors and coverage.
 */
export function calculateFounderScore(input: FounderScoreInput): FounderScoreRecord | null {
  const founder = input.founders[0];
  if (!founder) return null;

  let assessedWeight = 0;
  let weightedStrength = 0;

  const factors: FounderScoreFactor[] = FACTORS.map((definition) => {
    const claim = input.claims.find((candidate) => candidate.predicate === definition.predicate);
    if (!claim) {
      return {
        id: definition.id,
        label: definition.label,
        weight: definition.weight,
        evidenceStrength: 0,
        state: "missing",
        claimId: null,
        evidenceIds: [],
      };
    }

    const evidenceStrength = Math.round(claim.trust.score * stateMultiplier(claim));
    assessedWeight += definition.weight;
    weightedStrength += definition.weight * evidenceStrength;

    return {
      id: definition.id,
      label: definition.label,
      weight: definition.weight,
      evidenceStrength,
      state: claim.state,
      claimId: claim.id,
      evidenceIds: claim.evidence.map((link) => link.evidenceId),
    };
  });

  const totalWeight = FACTORS.reduce((sum, factor) => sum + factor.weight, 0);
  const evidenceCoverage = Math.round((assessedWeight / totalWeight) * 100);
  const score = assessedWeight === 0
    ? null
    : Math.round(weightedStrength / assessedWeight);

  return {
    founderId: founder.id,
    score,
    evidenceCoverage,
    confidence: evidenceCoverage >= 75 ? "high" : evidenceCoverage >= 45 ? "medium" : "low",
    trend: "baseline",
    calculatedAt: input.calculatedAt,
    factors,
    missingFactors: factors
      .filter((factor) => factor.state === "missing")
      .map((factor) => factor.label),
    interpretation:
      "Evidence strength across observed execution signals; not a prediction of founder or company success.",
  };
}
