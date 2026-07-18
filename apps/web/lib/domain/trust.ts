import type { ClaimTrust } from "./types";

export interface ClaimTrustInput {
  sourceReliability: number;
  directness: number;
  corroboration: number;
  recency: number;
}

const COMPONENT_LIMITS = {
  sourceReliability: 40,
  directness: 25,
  corroboration: 20,
  recency: 15,
} as const;

export function calculateClaimTrust(input: ClaimTrustInput): ClaimTrust {
  for (const [component, maximum] of Object.entries(COMPONENT_LIMITS)) {
    const value = input[component as keyof ClaimTrustInput];
    if (!Number.isFinite(value) || value < 0 || value > maximum) {
      throw new RangeError(`${component} must be between 0 and ${maximum}`);
    }
  }

  return {
    ...input,
    score:
      input.sourceReliability
      + input.directness
      + input.corroboration
      + input.recency,
  };
}
