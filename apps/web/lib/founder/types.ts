/**
 * Founder-flow domain types. These map directly to the real `public.projects`,
 * `public.claims`, `public.evidence`, and `public.claim_evidence` tables defined
 * in `supabase/migrations/20260718203859_product_platform_core.sql`. Nothing
 * here is synthetic — every row this module describes is written and read
 * through Supabase with RLS enforced by the signed-in founder's session.
 */

export const FOUNDER_CLAIM_PREDICATES = [
  "project.problem",
  "project.solution",
  "project.users",
  "project.market",
  "project.product_status",
  "project.team",
  "project.traction",
  "project.milestone",
] as const;

export type FounderClaimPredicate = (typeof FOUNDER_CLAIM_PREDICATES)[number];

/** Evidence rows the founder flow writes that are not tied to a single claim. */
export const FOUNDER_LINK_EVIDENCE_TYPES = [
  "website",
  "github_repo",
  "demo_link",
  "deck",
] as const;

export type FounderLinkEvidenceType = (typeof FOUNDER_LINK_EVIDENCE_TYPES)[number];

/** Evidence rows the founder flow writes to justify how a claim was drafted. */
export const FOUNDER_STRUCTURING_EVIDENCE_TYPE = "ai_structuring";

/**
 * Where a claim's current text came from. There is no `origin` column on
 * `public.claims` — this is derived from the `claim_evidence.note` tag left by
 * whichever writer created or last confirmed the claim. See `lib/founder/origin.ts`.
 */
export type ClaimOrigin = "founder_provided" | "ai_structured" | "external";

export interface FounderClaimRow {
  id: string;
  project_id: string;
  predicate: string;
  statement: string;
  value: string | number | boolean | string[];
  state: string;
  visibility: string;
  observed_at: string;
  created_at: string;
  updated_at: string;
}

export interface FounderEvidenceRow {
  id: string;
  project_id: string | null;
  evidence_type: string;
  source_url: string | null;
  private_object_path: string | null;
  excerpt: string | null;
  structured_payload: Record<string, unknown> | null;
  visibility: string;
  captured_at: string;
}

export interface FounderClaimEvidenceLinkRow {
  claim_id: string;
  evidence_id: string;
  relation: string;
  note: string | null;
}

export interface ClaimOriginInfo {
  origin: ClaimOrigin;
  sourceNote: string | null;
  confirmed: boolean;
}
