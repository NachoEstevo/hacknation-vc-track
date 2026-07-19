"use server";

import { createHash, randomBytes } from "node:crypto";
import { getOpportunity } from "@/lib/demo";
import { getAuthedContext } from "./workspace-context";

export interface SendInvitationResult {
  ok: boolean;
  error?: string;
  /** The raw, one-time invitation token. Only ever returned once, never persisted — the database only stores `token_hash`. */
  token?: string;
  expiresAt?: string;
}

function normalizeInvitationEmail(raw: string): string | null {
  const trimmed = raw.trim().toLocaleLowerCase();
  if (!trimmed || trimmed.indexOf("@") <= 0) return null;
  return trimmed;
}

/**
 * Sends a real founder invitation from `/investor/founders/[id]/invite`.
 *
 * `invitations_insert_creator` requires the inviter to be the *creator* of
 * the target project (`created_by = auth.uid()`), which the shared
 * `synthetic_demo` catalog project can never satisfy (it has no owner — see
 * `scripts/seed-synthetic-demo-catalog.ts`). So when inviting a founder off
 * a demo opportunity, this first finds-or-creates the *inviting investor's
 * own* private, real (`data_label = 'real'`) project draft that anchors the
 * invitation — the same real-world action as "I'm bringing this company
 * into undr and asking its founder to verify it," which is a genuinely new,
 * real relationship even though the discovery signal was synthetic.
 *
 * The raw token is generated here, hashed with SHA-256, and only the hash is
 * ever persisted (see the `invitations.token_hash` column comment). The raw
 * token is returned once so the caller can show/share an invite link; it is
 * never written to the database or logged.
 */
export async function sendFounderInvitationAction(input: {
  opportunityId: string;
  invitedEmail: string;
}): Promise<SendInvitationResult> {
  const ctx = await getAuthedContext();
  if (!ctx) return { ok: false, error: "Sign in to send an invitation." };
  const { supabase, userId } = ctx;

  const email = normalizeInvitationEmail(input.invitedEmail);
  if (!email) return { ok: false, error: "Enter a valid email address." };

  const opportunity = getOpportunity(input.opportunityId);
  if (!opportunity) return { ok: false, error: "This project record is not available." };

  const { data: existingProject, error: existingProjectError } = await supabase
    .from("projects")
    .select("id")
    .eq("created_by", userId)
    .eq("slug", input.opportunityId)
    .eq("data_label", "real")
    .maybeSingle();
  if (existingProjectError) return { ok: false, error: "The invitation could not be prepared." };

  let projectId: string | null = existingProject?.id ?? null;
  if (!projectId) {
    const { data: createdProject, error: createProjectError } = await supabase
      .from("projects")
      .insert({
        created_by: userId,
        name: `${opportunity.project.name} — investor invitation`,
        slug: input.opportunityId,
        tagline: opportunity.project.tagline,
        data_label: "real",
        status: "draft",
        visibility: "private",
      })
      .select("id")
      .single();
    if (createProjectError || !createdProject) {
      return { ok: false, error: "The invitation could not be prepared: no project record could be created." };
    }
    projectId = createdProject.id;
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: invitationError } = await supabase.from("invitations").insert({
    project_id: projectId,
    inviter_user_id: userId,
    invitee_email: email,
    invitation_role: "founder",
    token_hash: tokenHash,
    status: "pending",
    expires_at: expiresAt,
  });
  if (invitationError) {
    // invitations_one_pending_idx: unique (project_id, invitee_email) where status = 'pending'.
    if (invitationError.code === "23505") {
      return { ok: false, error: "An invitation is already pending for this email on this project." };
    }
    return { ok: false, error: "The invitation could not be saved." };
  }

  return { ok: true, token: rawToken, expiresAt };
}
