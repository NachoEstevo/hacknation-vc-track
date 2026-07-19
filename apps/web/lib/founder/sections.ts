/**
 * The founder project editor's "SECTIONS" sidebar, in display order. Each
 * claims-backed section maps 1:1 to a `public.claims.predicate`. `links` and
 * `evidence` are backed by `public.evidence` rows instead — there is no claim
 * for "the founder's website is https://…", only a piece of evidence.
 */

export type SectionKey =
  | "problem"
  | "solution"
  | "users"
  | "market"
  | "product_status"
  | "team"
  | "traction"
  | "milestones"
  | "links"
  | "evidence";

export interface SectionDefinition {
  key: SectionKey;
  label: string;
  kind: "claim" | "claim_repeatable" | "evidence_links" | "evidence_all";
  /** Populated for `kind: "claim" | "claim_repeatable"` sections. */
  predicate?: string;
  /** A section is amber ("needs evidence") rather than green once filled in. */
  evidenceSensitive?: boolean;
}

export const SECTION_DEFINITIONS: readonly SectionDefinition[] = [
  { key: "problem", label: "Problem", kind: "claim", predicate: "project.problem" },
  { key: "solution", label: "Solution", kind: "claim", predicate: "project.solution" },
  { key: "users", label: "Users", kind: "claim", predicate: "project.users" },
  { key: "market", label: "Market", kind: "claim", predicate: "project.market" },
  {
    key: "product_status",
    label: "Product status",
    kind: "claim",
    predicate: "project.product_status",
    evidenceSensitive: true,
  },
  { key: "team", label: "Team", kind: "claim", predicate: "project.team" },
  {
    key: "traction",
    label: "Traction",
    kind: "claim_repeatable",
    predicate: "project.traction",
    evidenceSensitive: true,
  },
  {
    key: "milestones",
    label: "Milestones",
    kind: "claim_repeatable",
    predicate: "project.milestone",
  },
  { key: "links", label: "Links", kind: "evidence_links" },
  { key: "evidence", label: "Evidence", kind: "evidence_all" },
];

export function sectionDefinition(key: SectionKey): SectionDefinition {
  const definition = SECTION_DEFINITIONS.find((section) => section.key === key);
  if (!definition) throw new Error(`Unknown founder section: ${key}`);
  return definition;
}

export const FOUNDER_LINK_EVIDENCE_TYPES_FOR_SECTION = ["website", "github_repo", "demo_link"] as const;
