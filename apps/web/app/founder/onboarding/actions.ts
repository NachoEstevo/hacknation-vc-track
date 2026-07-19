"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isGitHubConnectorError, MAX_GITHUB_REPOSITORY_LIMIT } from "@/lib/connectors/github";
import { enrichGitHubPublicAccount } from "@/lib/connectors/github/github-public.server";
import { encodeOriginNote } from "@/lib/founder/origin";
import { parseGitHubRepoUrl } from "@/lib/founder/repo";
import { buildProductStatusSourceNote, buildProductStatusStatement } from "@/lib/founder/product-status";
import { structureOneLiner } from "@/lib/founder/ai-structuring.server";

export interface CreateFounderProjectResult {
  ok: boolean;
  error?: string;
}

const formSchema = z.object({
  founderName: z.string().trim().min(1, "Add your name.").max(120),
  projectName: z.string().trim().min(1, "Add a project name.").max(120),
  oneLiner: z.string().trim().min(1, "Add a one-line description.").max(400),
  website: z.string().trim().max(2048).optional(),
  repoUrl: z.string().trim().max(2048).optional(),
  demoUrl: z.string().trim().max(2048).optional(),
});

function normalizedHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const DECK_MAX_BYTES = 20 * 1024 * 1024;

export async function createFounderProjectAction(formData: FormData): Promise<CreateFounderProjectResult> {
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured in this environment." };
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { ok: false, error: "Your session expired. Sign in again." };
  }

  const parsed = formSchema.safeParse({
    founderName: formData.get("founderName"),
    projectName: formData.get("projectName"),
    oneLiner: formData.get("oneLiner"),
    website: formData.get("website") || undefined,
    repoUrl: formData.get("repoUrl") || undefined,
    demoUrl: formData.get("demoUrl") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const { founderName, projectName, oneLiner } = parsed.data;
  const websiteUrl = normalizedHttpUrl(parsed.data.website);
  const demoUrl = normalizedHttpUrl(parsed.data.demoUrl);
  const parsedRepo = parsed.data.repoUrl ? parseGitHubRepoUrl(parsed.data.repoUrl) : null;

  await supabase
    .from("profiles")
    .update({ display_name: founderName, onboarding_state: "in_progress" })
    .eq("id", user.id);

  // At most one row per user can be `is_primary`; demote any other role before claiming founder.
  // `authenticated` can only ever UPDATE the `is_primary` column on this table (by design), so an
  // upsert that touches every column on conflict would be denied — insert, then fall back to a
  // targeted update if the founder role row already exists.
  await supabase.from("user_roles").update({ is_primary: false }).eq("user_id", user.id).neq("role", "founder");
  const { error: roleInsertError } = await supabase
    .from("user_roles")
    .insert({ user_id: user.id, role: "founder", is_primary: true });
  if (roleInsertError) {
    await supabase.from("user_roles").update({ is_primary: true }).eq("user_id", user.id).eq("role", "founder");
  }

  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .insert({
      created_by: user.id,
      name: projectName,
      tagline: oneLiner,
      summary: oneLiner,
      data_label: "real",
      status: "draft",
      visibility: "private",
    })
    .select("id")
    .single();

  if (projectError || !projectRow) {
    return { ok: false, error: "Could not create your project. Try again." };
  }

  const projectId = projectRow.id as string;
  const now = new Date().toISOString();

  // Website / demo link evidence — plain references, no claim attached.
  const linkInserts: Record<string, unknown>[] = [];
  if (websiteUrl) linkInserts.push({ project_id: projectId, evidence_type: "website", source_url: websiteUrl });
  if (demoUrl) linkInserts.push({ project_id: projectId, evidence_type: "demo_link", source_url: demoUrl });
  if (linkInserts.length > 0) {
    await supabase.from("evidence").insert(linkInserts);
  }

  // AI-structured problem/solution, drafted only from the founder's own one-liner.
  const { data: structuringEvidence } = await supabase
    .from("evidence")
    .insert({
      project_id: projectId,
      evidence_type: "ai_structuring",
      excerpt: oneLiner,
      structured_payload: { source: "one_liner", text: oneLiner },
    })
    .select("id")
    .maybeSingle();

  const structured = await structureOneLiner(oneLiner);
  const problemText = structured?.problem ?? oneLiner;
  const solutionText = structured?.solution ?? oneLiner;

  const { data: draftedClaims, error: draftedClaimsError } = await supabase
    .from("claims")
    .insert([
      {
        project_id: projectId,
        created_by: user.id,
        subject_type: "project",
        subject_id: projectId,
        predicate: "project.problem",
        statement: problemText,
        value: problemText,
        observed_at: now,
      },
      {
        project_id: projectId,
        created_by: user.id,
        subject_type: "project",
        subject_id: projectId,
        predicate: "project.solution",
        statement: solutionText,
        value: solutionText,
        observed_at: now,
      },
    ])
    .select("id, predicate");

  if (draftedClaimsError) {
    console.error("Founder onboarding: could not create problem/solution claims", draftedClaimsError.message);
  }

  if (structuringEvidence && draftedClaims) {
    const note = encodeOriginNote("ai_structured", "Drafted from your one-liner");
    await supabase.from("claim_evidence").insert(
      draftedClaims.map((claim: { id: string }) => ({
        claim_id: claim.id,
        evidence_id: structuringEvidence.id,
        relation: "context",
        note,
      })),
    );
  }

  // GitHub repo — always record the raw link; only add a product-status claim
  // if the connector can actually find that repository among the account's
  // public repositories (never guessed at, never fabricated).
  if (parsedRepo) {
    let structuredPayload: Record<string, unknown> | null = null;
    let repoDescription: string | null = null;
    let productStatusStatement: string | null = null;
    let productStatusSourceNote: string | null = null;

    try {
      const enrichment = await enrichGitHubPublicAccount(parsedRepo.owner, {
        maxRepositories: MAX_GITHUB_REPOSITORY_LIMIT,
        token: process.env.GITHUB_TOKEN,
      });
      const repo = enrichment.repositories.find(
        (candidate) => candidate.name.toLowerCase() === parsedRepo.repo.toLowerCase(),
      );

      if (repo) {
        structuredPayload = {
          fullName: repo.fullName,
          description: repo.description,
          starCount: repo.starCount,
          forkCount: repo.forkCount,
          openIssueCount: repo.openIssueCount,
          primaryLanguage: repo.primaryLanguage,
          pushedAt: repo.pushedAt,
          capturedAt: enrichment.capturedAt,
        };
        repoDescription = repo.description;
        productStatusStatement = buildProductStatusStatement(repo);
        productStatusSourceNote = buildProductStatusSourceNote(repo);
      }
    } catch (error) {
      if (!isGitHubConnectorError(error)) {
        console.error("GitHub enrichment failed during founder onboarding", error);
      }
    }

    const { data: githubEvidence } = await supabase
      .from("evidence")
      .insert({
        project_id: projectId,
        evidence_type: "github_repo",
        source_url: parsedRepo.canonicalUrl,
        structured_payload: structuredPayload,
        excerpt: repoDescription,
      })
      .select("id")
      .maybeSingle();

    if (githubEvidence && productStatusStatement) {
      const { data: productStatusClaim } = await supabase
        .from("claims")
        .insert({
          project_id: projectId,
          created_by: user.id,
          subject_type: "project",
          subject_id: projectId,
          predicate: "project.product_status",
          statement: productStatusStatement,
          value: productStatusStatement,
          observed_at: now,
        })
        .select("id")
        .maybeSingle();

      if (productStatusClaim) {
        await supabase.from("claim_evidence").insert({
          claim_id: productStatusClaim.id,
          evidence_id: githubEvidence.id,
          relation: "supports",
          note: encodeOriginNote("ai_structured", productStatusSourceNote ?? "Drafted from repo activity"),
        });
      }
    }
  }

  // Deck upload (optional) — a real file in Supabase Storage, never a fabricated link.
  const deckFile = formData.get("deck");
  if (deckFile instanceof File && deckFile.size > 0 && deckFile.size <= DECK_MAX_BYTES) {
    const path = `${user.id}/${projectId}/deck.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("founder-decks")
      .upload(path, deckFile, { contentType: "application/pdf", upsert: true });

    if (!uploadError) {
      await supabase.from("evidence").insert({
        project_id: projectId,
        evidence_type: "deck",
        private_object_path: path,
        excerpt: deckFile.name,
      });
    } else {
      console.error("Deck upload failed during founder onboarding", uploadError.message);
    }
  }

  // Claims now exist for at least problem/solution — the project has moved
  // past a bare draft into the structured-review stage.
  await supabase.from("projects").update({ status: "ai_structured" }).eq("id", projectId);

  redirect(`/founder/projects/${projectId}/edit` as Route);
}
