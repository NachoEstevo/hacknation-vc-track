import type {
  ClaimOrigin,
  ClaimOriginInfo,
  FounderClaimEvidenceLinkRow,
} from "./types";

const ORIGIN_TAG_PREFIX = "origin:";
const CONFIRMED_TAG = "confirmed";
const TAGGED_ORIGINS = new Set<ClaimOrigin>(["ai_structured", "external"]);

/**
 * `claim_evidence.note` is a free-text annotation column with no schema
 * constraint. The founder flow uses it as the single, honest place to record
 * *why* a claim currently reads the way it does, since `public.claims` has no
 * `origin` column and RLS never lets a founder mark their own claims
 * `state = 'supported'` or `visibility = 'published'` (that promotion is a
 * verification-pipeline concern outside this flow). Format:
 *   "origin:<ai_structured|external>|<human-readable source note>[|confirmed]"
 * A claim with no such link at all is founder-provided by definition: nothing
 * structured or external stands behind it, so it must have been typed directly.
 */
export function encodeOriginNote(
  origin: "ai_structured" | "external",
  sourceNote: string,
  confirmed = false,
): string {
  const base = `${ORIGIN_TAG_PREFIX}${origin}|${sourceNote}`;
  return confirmed ? `${base}|${CONFIRMED_TAG}` : base;
}

export function decodeOriginNote(note: string | null): ClaimOriginInfo | null {
  if (!note || !note.startsWith(ORIGIN_TAG_PREFIX)) {
    return null;
  }

  const [originSegment, sourceNote, maybeConfirmed] = note.split("|");
  const origin = originSegment.slice(ORIGIN_TAG_PREFIX.length);

  if (!TAGGED_ORIGINS.has(origin as ClaimOrigin)) {
    return null;
  }

  return {
    origin: origin as ClaimOrigin,
    sourceNote: sourceNote ?? null,
    confirmed: maybeConfirmed === CONFIRMED_TAG,
  };
}

export function markOriginNoteConfirmed(note: string): string {
  const decoded = decodeOriginNote(note);
  if (!decoded) return note;
  return encodeOriginNote(decoded.origin as "ai_structured" | "external", decoded.sourceNote ?? "", true);
}

/**
 * Derives a claim's real origin from the provenance links attached to it. A
 * claim can have more than one evidence link (e.g. a supporting source plus
 * context); the first link carrying an `origin:` tag wins. No tagged link
 * means the founder wrote the statement directly.
 */
export function deriveClaimOrigin(
  links: Pick<FounderClaimEvidenceLinkRow, "note">[],
): ClaimOriginInfo {
  for (const link of links) {
    const decoded = decodeOriginNote(link.note);
    if (decoded) return decoded;
  }

  return { origin: "founder_provided", sourceNote: null, confirmed: true };
}
