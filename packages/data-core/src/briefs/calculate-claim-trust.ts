import type { ClaimTrustBreakdown, EvidenceRecord } from "./types.js";

const SOURCE_POINTS: Record<EvidenceRecord["sourceType"], number> = {
  stripe_private: 40,
  founder_document: 40,
  company_website: 30,
  github_public: 30,
  clay_csv: 20,
  founder_assertion: 20,
};

const DIRECTNESS_POINTS = {
  direct_measurement: 25,
  primary_document: 25,
  first_party_statement: 18,
  proxy_signal: 8,
  inference_only: 0,
} as const;

export type ClaimDirectness = keyof typeof DIRECTNESS_POINTS;

export interface CalculateClaimTrustInput {
  evidence: EvidenceRecord[];
  directness: ClaimDirectness;
  independentSupportingEvidenceIds: string[];
  evaluatedAt: string;
  hasConflict: boolean;
}

function calculateRecency(capturedAt: string, evaluatedAt: string): number {
  const ageInDays = (Date.parse(evaluatedAt) - Date.parse(capturedAt)) / 86_400_000;
  if (!Number.isFinite(ageInDays)) return 0;
  if (ageInDays <= 30) return 15;
  if (ageInDays <= 180) return 10;
  if (ageInDays <= 365) return 5;
  return 0;
}

export function calculateClaimTrust(input: CalculateClaimTrustInput): ClaimTrustBreakdown {
  const sourceReliability = Math.max(0, ...input.evidence.map((item) => SOURCE_POINTS[item.sourceType]));
  const directness = DIRECTNESS_POINTS[input.directness];
  const supportingEvidenceCount = new Set(input.independentSupportingEvidenceIds).size;
  const corroboration = supportingEvidenceCount >= 2 ? 20 : supportingEvidenceCount === 1 ? 10 : 0;
  const recency = Math.max(
    0,
    ...input.evidence.map((item) => calculateRecency(item.capturedAt, input.evaluatedAt)),
  );
  const total = sourceReliability + directness + corroboration + recency;
  const state = input.hasConflict ? "conflicted" : total >= 70 ? "supported" : "unverified";

  return { sourceReliability, directness, corroboration, recency, total, state };
}
