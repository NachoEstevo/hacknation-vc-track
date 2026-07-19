import type {
  ClaimPredicate,
  ClaimRecord,
  ClaimState,
  OpportunityDetail,
  SourceType,
} from "../../../../lib/domain";

export const DILIGENCE_FIELDS = [
  {
    predicate: "founder.technical",
    label: "technical founder evidence",
  },
  {
    predicate: "project.team_size",
    label: "current team size",
  },
  {
    predicate: "project.problem",
    label: "problem definition",
  },
  {
    predicate: "project.product",
    label: "product definition",
  },
  {
    predicate: "project.sector",
    label: "sector classification",
  },
  {
    predicate: "project.region",
    label: "operating region",
  },
  {
    predicate: "project.country",
    label: "operating country",
  },
  {
    predicate: "project.stage",
    label: "company stage",
  },
  {
    predicate: "project.working_demo",
    label: "working product or demo",
  },
  {
    predicate: "project.traction",
    label: "traction or customer usage",
  },
  {
    predicate: "project.institutional_funding",
    label: "institutional funding status",
  },
  {
    predicate: "project.raising",
    label: "current fundraising status",
  },
  {
    predicate: "project.hackathon_origin",
    label: "hackathon provenance",
  },
] as const satisfies readonly { predicate: ClaimPredicate; label: string }[];

export type DiligenceAxisName = "Founder" | "Market" | "Idea vs. market";

interface AxisDefinition {
  name: DiligenceAxisName;
  predicates: ClaimPredicate[];
  description: string;
}

const AXIS_DEFINITIONS: AxisDefinition[] = [
  {
    name: "Founder",
    predicates: ["founder.technical", "project.team_size"],
    description: "Team composition and direct evidence of technical execution.",
  },
  {
    name: "Market",
    predicates: ["project.sector", "project.region", "project.country"],
    description: "Where the company operates and the category it serves.",
  },
  {
    name: "Idea vs. market",
    predicates: ["project.problem", "project.product", "project.working_demo", "project.traction"],
    description: "Evidence that the product exists and is meeting real users.",
  },
];

export type DiligenceConfidenceLevel = "high" | "medium" | "low";

export interface DiligenceAxis {
  name: DiligenceAxisName;
  description: string;
  status: "Well evidenced" | "Partial evidence" | "Open" | "Conflicted";
  covered: number;
  expected: number;
  /** Derived from real coverage/conflict state — never a separate invented signal. */
  confidenceLevel: DiligenceConfidenceLevel;
  /** Count of distinct evidence artifacts linked to this axis's claims. */
  evidenceCount: number;
  supportingClaims: ClaimRecord[];
  note: string;
}

/** Fields shown in the "Current status" snapshot. Every value is read from a real captured claim. */
export const CURRENT_STATUS_FIELDS = [
  { predicate: "project.team_size", label: "Team size" },
  { predicate: "project.working_demo", label: "Working product" },
  { predicate: "project.traction", label: "Traction" },
  { predicate: "project.institutional_funding", label: "Institutional funding" },
  { predicate: "project.raising", label: "Raising" },
  { predicate: "project.hackathon_origin", label: "Hackathon origin" },
] as const satisfies readonly { predicate: ClaimPredicate; label: string }[];

export interface TimelineEntry {
  date: string;
  title: string;
  sourceType: SourceType;
  sourceName: string;
}

export interface EvidenceCoverage {
  coveredFields: number;
  expectedFields: number;
  percent: number;
  supportedClaims: number;
  partialClaims: number;
  unverifiedClaims: number;
  contradictedClaims: number;
  staleClaims: number;
  evidenceArtifacts: number;
}

export interface DiligenceUnknown {
  predicate: ClaimPredicate | "operational.metric";
  label: string;
  reason: "missing" | "unverified" | "contradicted";
}

export function formatToken(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function findClaim(
  opportunity: OpportunityDetail,
  predicate: ClaimPredicate,
): ClaimRecord | undefined {
  return opportunity.claims.find((claim) => claim.predicate === predicate);
}

export function claimStateLabel(state: ClaimState): string {
  const labels: Record<ClaimState, string> = {
    supported: "Supported",
    partially_supported: "Partially supported",
    unverified: "Unverified",
    contradicted: "Contradicted",
    stale: "Stale",
  };
  return labels[state];
}

export function isStrongClaim(claim: ClaimRecord): boolean {
  return claim.state === "supported" && claim.trust.score >= 75;
}

/** Buckets a claim's provenance Trust Score into the confidence tiers the UI renders. No number is invented. */
export function confidenceLevelFromTrust(score: number): DiligenceConfidenceLevel {
  if (score >= 75) return "high";
  if (score >= 55) return "medium";
  return "low";
}

export function getStrongClaims(opportunity: OpportunityDetail): ClaimRecord[] {
  return opportunity.claims.filter(isStrongClaim);
}

export function getEvidenceCoverage(opportunity: OpportunityDetail): EvidenceCoverage {
  const claimsByPredicate = new Map(
    opportunity.claims.map((claim) => [claim.predicate, claim]),
  );
  const coveredFields = DILIGENCE_FIELDS.filter(({ predicate }) => {
    const claim = claimsByPredicate.get(predicate);
    return Boolean(claim?.evidence.length);
  }).length;

  return {
    coveredFields,
    expectedFields: DILIGENCE_FIELDS.length,
    percent: Math.round((coveredFields / DILIGENCE_FIELDS.length) * 100),
    supportedClaims: opportunity.claims.filter((claim) => claim.state === "supported").length,
    partialClaims: opportunity.claims.filter((claim) => claim.state === "partially_supported").length,
    unverifiedClaims: opportunity.claims.filter((claim) => claim.state === "unverified").length,
    contradictedClaims: opportunity.claims.filter((claim) => claim.state === "contradicted").length,
    staleClaims: opportunity.claims.filter((claim) => claim.state === "stale").length,
    evidenceArtifacts: opportunity.evidence.length,
  };
}

export function getDiligenceAxes(opportunity: OpportunityDetail): DiligenceAxis[] {
  return AXIS_DEFINITIONS.map((axis) => {
    const relevantClaims = axis.predicates.flatMap((predicate) => {
      const claim = findClaim(opportunity, predicate);
      return claim ? [claim] : [];
    });
    const supported = relevantClaims.filter((claim) => claim.state === "supported");
    const partiallySupported = relevantClaims.filter(
      (claim) => claim.state === "partially_supported",
    );
    const conflicted = relevantClaims.some((claim) => claim.state === "contradicted");
    const covered = relevantClaims.filter((claim) => claim.evidence.length > 0).length;

    let status: DiligenceAxis["status"] = "Open";
    if (conflicted) {
      status = "Conflicted";
    } else if (supported.length === axis.predicates.length) {
      status = "Well evidenced";
    } else if (supported.length + partiallySupported.length > 0) {
      status = "Partial evidence";
    }

    let note = `${covered} of ${axis.predicates.length} expected fields have linked evidence.`;
    if (conflicted) {
      note = `${note} At least one claim has contradictory evidence.`;
    } else if (covered < axis.predicates.length) {
      note = `${note} Missing fields remain unknown.`;
    }

    const confidenceLevel: DiligenceConfidenceLevel = conflicted
      ? "low"
      : covered === axis.predicates.length
        ? "high"
        : covered > 0
          ? "medium"
          : "low";

    const evidenceCount = new Set(
      relevantClaims.flatMap((claim) => claim.evidence.map((link) => link.evidenceId)),
    ).size;

    return {
      name: axis.name,
      description: axis.description,
      status,
      covered,
      expected: axis.predicates.length,
      confidenceLevel,
      evidenceCount,
      supportingClaims: [...supported, ...partiallySupported],
      note,
    };
  });
}

/**
 * Recent evidence captures, most recent first. Every entry is a real evidence
 * excerpt — nothing here is a synthesized "milestone" beyond what was captured.
 */
export function getTimeline(opportunity: OpportunityDetail, limit = 6): TimelineEntry[] {
  return [...opportunity.evidence]
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
    .slice(0, limit)
    .map((evidence) => ({
      date: formatDate(evidence.capturedAt),
      title: evidence.excerpt,
      sourceType: evidence.sourceType,
      sourceName: evidence.sourceName,
    }));
}

export function getUnknowns(opportunity: OpportunityDetail): DiligenceUnknown[] {
  const unknowns: DiligenceUnknown[] = [];

  for (const field of DILIGENCE_FIELDS) {
    const claim = findClaim(opportunity, field.predicate);
    if (!claim) {
      unknowns.push({
        predicate: field.predicate,
        label: `No claim captured for ${field.label}.`,
        reason: "missing",
      });
    } else if (claim.state === "unverified" || claim.state === "stale") {
      unknowns.push({
        predicate: field.predicate,
        label: `${field.label} is captured but not verified.`,
        reason: "unverified",
      });
    } else if (claim.state === "contradicted") {
      unknowns.push({
        predicate: field.predicate,
        label: `${field.label} has unresolved contradictory evidence.`,
        reason: "contradicted",
      });
    }
  }

  const operationalUnknowns = [
    "No cohort retention or repeat-usage evidence is captured.",
    "No pricing, contract value, or unit-economics evidence is captured.",
    "No cap table, runway, or ownership evidence is captured.",
  ];

  for (const label of operationalUnknowns) {
    unknowns.push({ predicate: "operational.metric", label, reason: "missing" });
  }

  return unknowns;
}

export function getEvidenceForClaim(
  opportunity: OpportunityDetail,
  claim: ClaimRecord,
) {
  const evidenceById = new Map(opportunity.evidence.map((item) => [item.id, item]));
  return claim.evidence.flatMap((link) => {
    const evidence = evidenceById.get(link.evidenceId);
    return evidence ? [{ ...link, evidence }] : [];
  });
}

export function getClaimSummary(opportunity: OpportunityDetail, predicate: ClaimPredicate) {
  const claim = findClaim(opportunity, predicate);
  if (!claim) {
    return {
      state: "missing" as const,
      label: "No claim captured",
      detail: "Unknown — absence of evidence is not treated as a negative signal.",
    };
  }

  return {
    state: claim.state,
    label: claimStateLabel(claim.state),
    detail: claim.statement,
  };
}

export function getMemoStrengths(opportunity: OpportunityDetail): string[] {
  return getStrongClaims(opportunity).slice(0, 4).map((claim) => claim.statement);
}

export function getMemoWeaknesses(opportunity: OpportunityDetail): string[] {
  const unresolved = opportunity.claims
    .filter((claim) => claim.state !== "supported")
    .slice(0, 3)
    .map((claim) => `${claim.statement} (${claimStateLabel(claim.state).toLowerCase()})`);

  if (unresolved.length > 0) return unresolved;
  return ["The current snapshot does not include independent customer references."];
}
