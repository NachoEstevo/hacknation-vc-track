"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { decodeOriginNote, encodeOriginNote } from "@/lib/founder/origin";
import {
  fetchClaimEvidenceLinks,
  fetchFounderProject,
  fetchProjectClaims,
  fetchProjectEvidence,
} from "@/lib/founder/data.server";
import { canPublishProject, computePublishChecklist, type PublishChecklistItem } from "@/lib/founder/completeness";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function paths(projectId: string) {
  return [`/founder/projects/${projectId}/edit`, `/founder/projects/${projectId}/preview`];
}

function revalidateProject(projectId: string) {
  for (const path of paths(projectId)) revalidatePath(path);
}

/**
 * `claims_insert_project_collaborator` requires `created_by = auth.uid()` to be
 * present on the row itself — unlike `evidence`, there is no trigger that fills
 * this in automatically, so every claims insert in this file must set it explicitly.
 */
async function requireUserId(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** "Save draft" — touches `updated_at` so the "last saved" label is real, even though most edits already autosave per field. */
export async function touchProjectAction(projectId: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const project = await fetchFounderProject(supabase, projectId);
  if (!project) return { ok: false, error: "Project not found." };

  const { error } = await supabase.from("projects").update({ status: project.status }).eq("id", projectId);
  revalidateProject(projectId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

async function stripOriginTags(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  claimId: string,
) {
  const { data: links } = await supabase
    .from("claim_evidence")
    .select("evidence_id, note")
    .eq("claim_id", claimId);

  const taggedEvidenceIds = (links ?? [])
    .filter((link: { note: string | null }) => decodeOriginNote(link.note) !== null)
    .map((link: { evidence_id: string }) => link.evidence_id);

  if (taggedEvidenceIds.length > 0) {
    await supabase.from("claim_evidence").delete().eq("claim_id", claimId).in("evidence_id", taggedEvidenceIds);
  }
}

/**
 * Persists a founder-written statement for an existing claim. Any AI-structured
 * or external provenance tag on that claim is removed: once the founder has
 * written the words themselves, the claim is honestly founder-provided.
 */
export async function updateClaimTextAction(
  projectId: string,
  claimId: string,
  statement: string,
): Promise<ActionResult> {
  const trimmed = statement.trim();
  if (!trimmed) return { ok: false, error: "Add some text before saving." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  await stripOriginTags(supabase, claimId);
  const { error } = await supabase
    .from("claims")
    .update({ statement: trimmed, value: trimmed })
    .eq("id", claimId);

  revalidateProject(projectId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Creates the first claim for a section that has none yet (Users, Market, Team, …). */
export async function createSectionClaimAction(
  projectId: string,
  predicate: string,
  statement: string,
): Promise<ActionResult> {
  const trimmed = statement.trim();
  if (!trimmed) return { ok: false, error: "Add some text before saving." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const userId = await requireUserId(supabase);
  if (!userId) return { ok: false, error: "Your session expired. Sign in again." };

  const { error } = await supabase.from("claims").insert({
    project_id: projectId,
    created_by: userId,
    subject_type: "project",
    subject_id: projectId,
    predicate,
    statement: trimmed,
    value: trimmed,
    observed_at: new Date().toISOString(),
  });

  revalidateProject(projectId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Adds one more entry to a repeatable section (Traction updates, Milestones). */
export async function addRepeatableClaimAction(
  projectId: string,
  predicate: string,
  statement: string,
  observedAtIso?: string,
): Promise<ActionResult> {
  const trimmed = statement.trim();
  if (!trimmed) return { ok: false, error: "Add some text before saving." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const userId = await requireUserId(supabase);
  if (!userId) return { ok: false, error: "Your session expired. Sign in again." };

  const { error } = await supabase.from("claims").insert({
    project_id: projectId,
    created_by: userId,
    subject_type: "project",
    subject_id: projectId,
    predicate,
    statement: trimmed,
    value: trimmed,
    observed_at: observedAtIso ?? new Date().toISOString(),
  });

  revalidateProject(projectId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteClaimAction(projectId: string, claimId: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const { error } = await supabase.from("claims").delete().eq("id", claimId);
  revalidateProject(projectId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** "Accept" on an AI-structured suggestion — keeps the drafted text, just marks it founder-confirmed. */
export async function confirmClaimSuggestionAction(projectId: string, claimId: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const { data: links } = await supabase
    .from("claim_evidence")
    .select("evidence_id, note")
    .eq("claim_id", claimId);

  const taggedLink = (links ?? [])
    .map((link: { evidence_id: string; note: string | null }) => ({ link, decoded: decodeOriginNote(link.note) }))
    .find((entry): entry is { link: { evidence_id: string; note: string | null }; decoded: NonNullable<ReturnType<typeof decodeOriginNote>> } => entry.decoded !== null);

  if (!taggedLink) return { ok: false, error: "This claim has no suggestion to confirm." };

  const { error } = await supabase
    .from("claim_evidence")
    .update({
      note: encodeOriginNote(taggedLink.decoded.origin as "ai_structured" | "external", taggedLink.decoded.sourceNote ?? "", true),
    })
    .eq("claim_id", claimId)
    .eq("evidence_id", taggedLink.link.evidence_id);

  revalidateProject(projectId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

const EVIDENCE_TYPE_PATTERN = /^[a-z][a-z0-9_]*$/;

export async function addEvidenceAction(
  projectId: string,
  evidenceType: string,
  sourceUrl: string,
  excerpt?: string,
  linkClaimId?: string,
  relation: "supports" | "contradicts" | "context" = "supports",
): Promise<ActionResult> {
  if (!EVIDENCE_TYPE_PATTERN.test(evidenceType)) return { ok: false, error: "Invalid evidence type." };

  let normalizedUrl: string;
  try {
    const url = new URL(sourceUrl.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("bad protocol");
    normalizedUrl = url.toString();
  } catch {
    return { ok: false, error: "Add a valid link (https://…)." };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const { data: evidenceRow, error } = await supabase
    .from("evidence")
    .insert({
      project_id: projectId,
      evidence_type: evidenceType,
      source_url: normalizedUrl,
      excerpt: excerpt?.trim() || null,
    })
    .select("id")
    .maybeSingle();

  if (error || !evidenceRow) {
    revalidateProject(projectId);
    return { ok: false, error: error?.message ?? "Could not save this evidence." };
  }

  if (linkClaimId) {
    await supabase.from("claim_evidence").insert({
      claim_id: linkClaimId,
      evidence_id: evidenceRow.id,
      relation,
      note: "Added by founder as supporting evidence",
    });
  }

  revalidateProject(projectId);
  return { ok: true };
}

export interface PublishResult extends ActionResult {
  missing?: PublishChecklistItem[];
}

/** Shared by the editor's "Publish changes" button and the preview screen's "Publish profile" button. */
export async function publishProjectAction(projectId: string): Promise<PublishResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const [claims, evidence] = await Promise.all([
    fetchProjectClaims(supabase, projectId),
    fetchProjectEvidence(supabase, projectId),
  ]);
  const links = await fetchClaimEvidenceLinks(supabase, claims.map((claim) => claim.id));
  const checklist = computePublishChecklist(claims, evidence, links);

  if (!canPublishProject(checklist)) {
    return {
      ok: false,
      error: "Finish the required sections before publishing.",
      missing: checklist.filter((item) => item.status === "missing"),
    };
  }

  const { error } = await supabase
    .from("projects")
    .update({ status: "published", visibility: "published", published_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidateProject(projectId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function renameProjectAction(projectId: string, name: string): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Project name can't be empty." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const { error } = await supabase.from("projects").update({ name: trimmed }).eq("id", projectId);
  revalidateProject(projectId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** The profile can be taken back out of view at any time — it never re-drafts existing claims. */
export async function unpublishProjectAction(projectId: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const { error } = await supabase
    .from("projects")
    .update({ status: "founder_review", visibility: "private", published_at: null })
    .eq("id", projectId);

  revalidateProject(projectId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
