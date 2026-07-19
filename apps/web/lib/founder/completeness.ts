import { SECTION_DEFINITIONS, FOUNDER_LINK_EVIDENCE_TYPES_FOR_SECTION, type SectionKey } from "./sections";
import type { FounderClaimEvidenceLinkRow, FounderClaimRow, FounderEvidenceRow } from "./types";

export type SectionStatus = "complete" | "needs_evidence" | "missing";

export interface SectionSummary {
  key: SectionKey;
  label: string;
  status: SectionStatus;
  /** Claims currently filed under this section, most recent first. Empty for evidence-only sections. */
  claims: FounderClaimRow[];
}

function claimsForPredicate(claims: readonly FounderClaimRow[], predicate: string): FounderClaimRow[] {
  return claims
    .filter((claim) => claim.predicate === predicate)
    .slice()
    .sort((a, b) => (a.observed_at < b.observed_at ? 1 : -1));
}

function claimHasEvidence(claimId: string, links: readonly FounderClaimEvidenceLinkRow[]): boolean {
  return links.some((link) => link.claim_id === claimId);
}

/**
 * Computes the real fill/verification state of every editor section from the
 * founder's actual claim and evidence rows — never from a static mock. A
 * section only turns green once a claim exists for it, and (for evidence
 * sensitive sections such as Traction and Product status) only stays green
 * once at least one of those claims has a linked `evidence` row.
 */
export function computeSectionSummaries(
  claims: readonly FounderClaimRow[],
  evidence: readonly FounderEvidenceRow[],
  claimEvidenceLinks: readonly FounderClaimEvidenceLinkRow[],
): SectionSummary[] {
  return SECTION_DEFINITIONS.map((definition) => {
    if (definition.kind === "evidence_links") {
      const hasLink = evidence.some((row) =>
        FOUNDER_LINK_EVIDENCE_TYPES_FOR_SECTION.includes(
          row.evidence_type as (typeof FOUNDER_LINK_EVIDENCE_TYPES_FOR_SECTION)[number],
        ),
      );
      return { key: definition.key, label: definition.label, status: hasLink ? "complete" : "missing", claims: [] };
    }

    if (definition.kind === "evidence_all") {
      return {
        key: definition.key,
        label: definition.label,
        status: evidence.length > 0 ? "complete" : "missing",
        claims: [],
      };
    }

    const sectionClaims = claimsForPredicate(claims, definition.predicate!);
    if (sectionClaims.length === 0) {
      return { key: definition.key, label: definition.label, status: "missing", claims: [] };
    }

    if (!definition.evidenceSensitive) {
      return { key: definition.key, label: definition.label, status: "complete", claims: sectionClaims };
    }

    const anyEvidenced = sectionClaims.some((claim) => claimHasEvidence(claim.id, claimEvidenceLinks));
    return {
      key: definition.key,
      label: definition.label,
      status: anyEvidenced ? "complete" : "needs_evidence",
      claims: sectionClaims,
    };
  });
}

/** Both "complete" and "needs_evidence" count as filled in — only "missing" still needs founder input. */
export function computeCompletionPercent(summaries: readonly SectionSummary[]): number {
  if (summaries.length === 0) return 0;
  const filled = summaries.filter((section) => section.status !== "missing").length;
  return Math.round((filled / summaries.length) * 100);
}

export function countSectionsNeedingInput(summaries: readonly SectionSummary[]): number {
  return summaries.filter((section) => section.status === "missing").length;
}

export type PublishChecklistKey =
  | "problem_and_solution"
  | "product_status"
  | "team"
  | "traction_evidence"
  | "deck_or_demo";

export interface PublishChecklistItem {
  key: PublishChecklistKey;
  label: string;
  status: SectionStatus;
}

const DECK_OR_DEMO_EVIDENCE_TYPES = new Set(["deck", "demo_link"]);

/**
 * The "Before you publish" checklist shown on the preview screen. Traction
 * evidence is informational only — the product is evidence-first, not a
 * gatekeeper, so a hackathon-stage project with no traction yet can still
 * publish; investors simply see that claim marked unverified.
 */
export function computePublishChecklist(
  claims: readonly FounderClaimRow[],
  evidence: readonly FounderEvidenceRow[],
  claimEvidenceLinks: readonly FounderClaimEvidenceLinkRow[],
): PublishChecklistItem[] {
  const problem = claimsForPredicate(claims, "project.problem");
  const solution = claimsForPredicate(claims, "project.solution");
  const productStatus = claimsForPredicate(claims, "project.product_status");
  const team = claimsForPredicate(claims, "project.team");
  const traction = claimsForPredicate(claims, "project.traction");
  const hasDeckOrDemo = evidence.some((row) => DECK_OR_DEMO_EVIDENCE_TYPES.has(row.evidence_type));

  const tractionStatus: SectionStatus =
    traction.length === 0
      ? "missing"
      : traction.some((claim) => claimHasEvidence(claim.id, claimEvidenceLinks))
        ? "complete"
        : "needs_evidence";

  return [
    {
      key: "problem_and_solution",
      label: "Problem & solution",
      status: problem.length > 0 && solution.length > 0 ? "complete" : "missing",
    },
    {
      key: "product_status",
      label: "Product status",
      status: productStatus.length > 0 ? "complete" : "missing",
    },
    { key: "team", label: "Team", status: team.length > 0 ? "complete" : "missing" },
    { key: "traction_evidence", label: "Traction evidence", status: tractionStatus },
    {
      key: "deck_or_demo",
      label: "Deck or demo link",
      status: hasDeckOrDemo ? "complete" : "missing",
    },
  ];
}

const PUBLISH_BLOCKING_KEYS: readonly PublishChecklistKey[] = [
  "problem_and_solution",
  "product_status",
  "team",
  "deck_or_demo",
];

/**
 * A project can publish once its founder-authored core (problem, solution,
 * product status, team) and a deck-or-demo link are in place. Traction never
 * blocks publishing — see `computePublishChecklist`.
 */
export function canPublishProject(checklist: readonly PublishChecklistItem[]): boolean {
  return PUBLISH_BLOCKING_KEYS.every((key) => {
    const item = checklist.find((candidate) => candidate.key === key);
    return item !== undefined && item.status !== "missing";
  });
}

export function missingPublishRequirements(checklist: readonly PublishChecklistItem[]): PublishChecklistItem[] {
  return checklist.filter(
    (item) => PUBLISH_BLOCKING_KEYS.includes(item.key) && item.status === "missing",
  );
}
