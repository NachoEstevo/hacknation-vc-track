import type { SupabaseClient } from "@supabase/supabase-js";
import type { FounderClaimEvidenceLinkRow, FounderClaimRow, FounderEvidenceRow } from "./types";

export interface FounderProjectRow {
  id: string;
  created_by: string | null;
  claimed_by_user_id: string | null;
  name: string;
  slug: string | null;
  tagline: string | null;
  summary: string | null;
  stage: string | null;
  sector_tags: string[];
  team_size: number | null;
  location: string | null;
  country_code: string | null;
  data_label: string;
  status: string;
  visibility: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface FounderProjectBundle {
  project: FounderProjectRow;
  claims: FounderClaimRow[];
  evidence: FounderEvidenceRow[];
  claimEvidenceLinks: FounderClaimEvidenceLinkRow[];
}

const PROJECT_COLUMNS =
  "id, created_by, claimed_by_user_id, name, slug, tagline, summary, stage, sector_tags, team_size, location, country_code, data_label, status, visibility, created_at, updated_at, published_at";

/**
 * Fetches a project by id. RLS (`projects_select_accessible`) already scopes
 * this to rows the signed-in user owns, has claimed, or that are published —
 * so a `null` result here means either the project does not exist or this
 * user cannot see it, and callers should treat both the same way (404).
 */
export async function fetchFounderProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<FounderProjectRow | null> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", projectId)
    .maybeSingle();

  if (error || !data) return null;
  return data as FounderProjectRow;
}

export async function fetchProjectClaims(
  supabase: SupabaseClient,
  projectId: string,
): Promise<FounderClaimRow[]> {
  const { data, error } = await supabase
    .from("claims")
    .select("id, project_id, predicate, statement, value, state, visibility, observed_at, created_at, updated_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as FounderClaimRow[];
}

export async function fetchProjectEvidence(
  supabase: SupabaseClient,
  projectId: string,
): Promise<FounderEvidenceRow[]> {
  const { data, error } = await supabase
    .from("evidence")
    .select("id, project_id, evidence_type, source_url, private_object_path, excerpt, structured_payload, visibility, captured_at")
    .eq("project_id", projectId)
    .order("captured_at", { ascending: false });

  if (error || !data) return [];
  return data as FounderEvidenceRow[];
}

export async function fetchClaimEvidenceLinks(
  supabase: SupabaseClient,
  claimIds: readonly string[],
): Promise<FounderClaimEvidenceLinkRow[]> {
  if (claimIds.length === 0) return [];

  const { data, error } = await supabase
    .from("claim_evidence")
    .select("claim_id, evidence_id, relation, note")
    .in("claim_id", claimIds as string[]);

  if (error || !data) return [];
  return data as FounderClaimEvidenceLinkRow[];
}

/** Loads everything the editor and preview screens need for one project in a single round trip shape. */
export async function fetchFounderProjectBundle(
  supabase: SupabaseClient,
  projectId: string,
): Promise<FounderProjectBundle | null> {
  const project = await fetchFounderProject(supabase, projectId);
  if (!project) return null;

  const [claims, evidence] = await Promise.all([
    fetchProjectClaims(supabase, projectId),
    fetchProjectEvidence(supabase, projectId),
  ]);
  const claimEvidenceLinks = await fetchClaimEvidenceLinks(supabase, claims.map((claim) => claim.id));

  return { project, claims, evidence, claimEvidenceLinks };
}

/**
 * Mirrors the transition the invitation-acceptance trigger already applies
 * elsewhere in the schema (`draft`/`ai_structured` -> `founder_review` once a
 * founder is actively working the project). Called once when the editor first
 * loads for a project still in its drafted state.
 */
export async function ensureFounderReviewStatus(
  supabase: SupabaseClient,
  project: FounderProjectRow,
): Promise<FounderProjectRow> {
  if (project.status !== "draft" && project.status !== "ai_structured") return project;

  const { data, error } = await supabase
    .from("projects")
    .update({ status: "founder_review" })
    .eq("id", project.id)
    .select(PROJECT_COLUMNS)
    .maybeSingle();

  if (error || !data) return project;
  return data as FounderProjectRow;
}
