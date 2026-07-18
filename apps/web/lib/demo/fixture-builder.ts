import {
  calculateFounderScore,
  calculateClaimTrust,
  SYNTHETIC_DEMO_LABEL,
  type ClaimPredicate,
  type ClaimState,
  type ClaimTrustInput,
  type ClaimValue,
  type FounderProfile,
  type OpportunityDetail,
  type SourceType,
} from "../domain";

const DEMO_CAPTURED_AT = "2026-07-18T12:00:00.000Z";

export interface DemoFactDefinition {
  key: string;
  predicate: ClaimPredicate;
  statement: string;
  value: ClaimValue;
  state: ClaimState;
  sourceType: SourceType;
  sourceName: string;
  excerpt: string;
  trust: ClaimTrustInput;
  contradiction?: {
    sourceType: SourceType;
    sourceName: string;
    excerpt: string;
    summary: string;
  };
}

export interface DemoOpportunityDefinition {
  id: string;
  name: string;
  domain: string;
  countryCode: string;
  city: string;
  tagline: string;
  summary: string;
  problem: string;
  product: string;
  stage: string;
  sectorTags: string[];
  teamSize: number;
  founders: FounderProfile[];
  facts: DemoFactDefinition[];
}

export const DEMO_TRUST = {
  strong: { sourceReliability: 34, directness: 23, corroboration: 16, recency: 14 },
  medium: { sourceReliability: 25, directness: 19, corroboration: 8, recency: 13 },
  assertion: { sourceReliability: 18, directness: 18, corroboration: 0, recency: 13 },
} satisfies Record<string, ClaimTrustInput>;

export function makeSyntheticOpportunity(
  definition: DemoOpportunityDefinition,
): OpportunityDetail {
  const projectId = `project-${definition.id}`;
  const evidence: OpportunityDetail["evidence"] = [];
  const contradictions: OpportunityDetail["contradictions"] = [];

  const narrativeFacts: DemoFactDefinition[] = [
    {
      key: "problem",
      predicate: "project.problem",
      statement: definition.problem,
      value: definition.problem,
      state: "partially_supported",
      sourceType: "website",
      sourceName: "Product profile",
      excerpt: definition.problem,
      trust: DEMO_TRUST.medium,
    },
    {
      key: "product",
      predicate: "project.product",
      statement: definition.product,
      value: definition.product,
      state: "partially_supported",
      sourceType: "website",
      sourceName: "Product profile",
      excerpt: definition.product,
      trust: DEMO_TRUST.medium,
    },
  ];

  const claims = [...narrativeFacts, ...definition.facts].map((fact) => {
    const claimId = `claim-${definition.id}-${fact.key}`;
    const supportingEvidenceId = `evidence-${definition.id}-${fact.key}-support`;

    evidence.push({
      id: supportingEvidenceId,
      dataLabel: SYNTHETIC_DEMO_LABEL,
      sourceType: fact.sourceType,
      sourceName: `${fact.sourceName} · synthetic fixture`,
      sourceUrl: null,
      capturedAt: DEMO_CAPTURED_AT,
      excerpt: fact.excerpt,
      contentHash: `synthetic:${definition.id}:${fact.key}:support`,
    });

    const evidenceLinks: OpportunityDetail["claims"][number]["evidence"] = [
      { evidenceId: supportingEvidenceId, relation: "supports" },
    ];

    if (fact.contradiction) {
      const contraryEvidenceId = `evidence-${definition.id}-${fact.key}-contrary`;
      evidence.push({
        id: contraryEvidenceId,
        dataLabel: SYNTHETIC_DEMO_LABEL,
        sourceType: fact.contradiction.sourceType,
        sourceName: `${fact.contradiction.sourceName} · synthetic fixture`,
        sourceUrl: null,
        capturedAt: DEMO_CAPTURED_AT,
        excerpt: fact.contradiction.excerpt,
        contentHash: `synthetic:${definition.id}:${fact.key}:contrary`,
      });
      evidenceLinks.push({ evidenceId: contraryEvidenceId, relation: "contradicts" });
      contradictions.push({
        id: `contradiction-${definition.id}-${fact.key}`,
        dataLabel: SYNTHETIC_DEMO_LABEL,
        claimId,
        evidenceIds: [supportingEvidenceId, contraryEvidenceId],
        summary: fact.contradiction.summary,
        state: "open",
      });
    }

    return {
      id: claimId,
      dataLabel: SYNTHETIC_DEMO_LABEL,
      subjectId: fact.predicate.startsWith("founder.")
        ? definition.founders[0]?.id ?? projectId
        : projectId,
      predicate: fact.predicate,
      statement: fact.statement,
      value: fact.value,
      state: fact.state,
      trust: calculateClaimTrust(fact.trust),
      evidence: evidenceLinks,
      observedAt: DEMO_CAPTURED_AT,
    };
  });

  const baseOpportunity = {
    id: definition.id,
    dataLabel: SYNTHETIC_DEMO_LABEL,
    company: {
      id: `company-${definition.id}`,
      name: definition.name,
      domain: definition.domain,
      countryCode: definition.countryCode,
      city: definition.city,
    },
    project: {
      id: projectId,
      name: definition.name,
      tagline: definition.tagline,
      summary: definition.summary,
      problem: definition.problem,
      product: definition.product,
      stage: definition.stage,
      sectorTags: definition.sectorTags,
      teamSize: definition.teamSize,
    },
    founders: definition.founders,
    claims,
    evidence,
    contradictions,
    updatedAt: DEMO_CAPTURED_AT,
  };

  return {
    ...baseOpportunity,
    founderScore: calculateFounderScore({
      founders: definition.founders,
      claims,
      calculatedAt: DEMO_CAPTURED_AT,
    }),
  };
}
