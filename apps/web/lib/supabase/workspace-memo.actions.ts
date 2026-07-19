"use server";

import { findClaim, getMemoStrengths, getMemoWeaknesses, getStrongClaims, getUnknowns } from "@/app/investor/projects/_lib/diligence";
import { getOpportunity } from "@/lib/demo";
import type { ClaimPredicate, ClaimRecord } from "@/lib/domain";
import { resolveProjectDbId, syntheticClaimId, syntheticEvidenceId } from "./synthetic-demo-catalog";
import { getAuthedContext } from "./workspace-context";

export interface GenerateMemoResult {
  ok: boolean;
  error?: string;
  memoId?: string;
}

const SNAPSHOT_PREDICATES: ClaimPredicate[] = [
  "project.problem",
  "project.product",
  "project.traction",
  "project.working_demo",
  "project.team_size",
  "founder.technical",
  "project.raising",
  "project.hackathon_origin",
];

/**
 * Persists a real `memos` row plus `memo_citations` rows for
 * `/investor/projects/[id]/memo`. Every citation points at a real `claims`
 * row (and, where one exists, a real `evidence` row) mirrored from the same
 * fixture the memo page already renders — see
 * `scripts/seed-synthetic-demo-catalog.ts`. Nothing here is invented: the
 * executive summary and strengths/weaknesses/unknowns are built from the
 * same pure `_lib/diligence.ts` helpers the page itself uses, so the saved
 * memo matches what the investor is looking at when they generate it.
 */
export async function generateMemoAction(opportunityId: string): Promise<GenerateMemoResult> {
  const ctx = await getAuthedContext();
  if (!ctx) return { ok: false, error: "Sign in to generate and save a memo." };
  const { supabase, userId } = ctx;

  const opportunity = getOpportunity(opportunityId);
  if (!opportunity) return { ok: false, error: "This project record is not available." };

  const projectId = resolveProjectDbId(opportunityId);
  const strongClaims = getStrongClaims(opportunity);
  const weakClaims = opportunity.claims.filter((claim) => claim.state !== "supported").slice(0, 3);
  const strengths = getMemoStrengths(opportunity);
  const weaknesses = getMemoWeaknesses(opportunity);
  const unknowns = getUnknowns(opportunity);
  const snapshotClaims = SNAPSHOT_PREDICATES.flatMap((predicate) => {
    const claim = findClaim(opportunity, predicate);
    return claim ? [claim] : [];
  });

  const generatedAt = new Date().toISOString();
  const content = {
    dataLabel: opportunity.dataLabel,
    fixtureId: opportunity.id,
    generatedAt,
    executiveSummary: strengths.length
      ? `${strengths.slice(0, 2).join(" ")} Together, these signals justify a founder conversation to test whether demonstrated execution can translate into durable usage and thesis fit.`
      : "The captured evidence is not sufficient to form a thesis hypothesis. Gather direct product and customer evidence before interpreting the opportunity.",
    strengths,
    weaknesses,
    unknowns: unknowns.map((item) => item.label),
    contradictions: opportunity.contradictions.map((item) => item.summary),
  };

  // `owner_user_id` / `project_id` only have an INSERT-time grant (see the
  // migration's `grant update (title, status, executive_summary, content,
  // model_version, generated_at, finalized_at) on public.memos`) — they must
  // never appear in an UPDATE payload.
  const mutableMemoPayload = {
    title: `${opportunity.project.name} memo`,
    status: "generated" as const,
    executive_summary: content.executiveSummary,
    content,
    model_version: "deterministic-diligence-v1",
    generated_at: generatedAt,
  };

  const { data: existingMemo } = await supabase
    .from("memos")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("project_id", projectId)
    .maybeSingle();

  let memoId: string | null = null;
  if (existingMemo?.id) {
    const { error } = await supabase.from("memos").update(mutableMemoPayload).eq("id", existingMemo.id);
    memoId = error ? null : existingMemo.id;
  } else {
    const { data, error } = await supabase
      .from("memos")
      .insert({ ...mutableMemoPayload, owner_user_id: userId, project_id: projectId })
      .select("id")
      .single();
    memoId = error ? null : data?.id ?? null;
  }
  if (!memoId) return { ok: false, error: "The memo could not be saved." };

  const { error: clearCitationsError } = await supabase.from("memo_citations").delete().eq("memo_id", memoId);
  if (clearCitationsError) return { ok: false, error: "The memo was saved, but its previous citations could not be cleared.", memoId };

  const citationRows: {
    memo_id: string;
    section_key: string;
    claim_id: string | null;
    evidence_id: string | null;
    cited_statement: string;
    sort_order: number;
  }[] = [];
  const seen = new Set<string>();
  let sortOrder = 0;

  function addCitation(sectionKey: string, claim: ClaimRecord) {
    const claimDbId = syntheticClaimId(opportunity!.id, claim.id);
    const dedupeKey = `${sectionKey}:${claimDbId}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const firstEvidenceLink = claim.evidence[0];
    // `claims_select_accessible_project` only exposes a claim on an
    // unowned published project (which every synthetic_demo project is —
    // see the seed script) once it is past `unverified`. Citing an
    // unverified claim's id would fail `memo_citations_insert_own`'s own
    // "can I see this claim" check, so this cites the evidence alone and
    // keeps `claim_id` null — the statement text (and its "unverified"
    // framing) still reaches the memo, it just is not linked to a claim
    // record this account cannot read.
    const citableClaimId = claim.state === "unverified" ? null : claimDbId;
    citationRows.push({
      memo_id: memoId!,
      section_key: sectionKey,
      claim_id: citableClaimId,
      evidence_id: firstEvidenceLink ? syntheticEvidenceId(opportunity!.id, firstEvidenceLink.evidenceId) : null,
      cited_statement: claim.statement,
      sort_order: sortOrder++,
    });
  }

  for (const claim of strongClaims.slice(0, 4)) addCitation("strengths", claim);
  for (const claim of weakClaims) addCitation("weaknesses", claim);
  for (const claim of snapshotClaims) addCitation("snapshot", claim);

  if (citationRows.length > 0) {
    const { error: citationsError } = await supabase.from("memo_citations").insert(citationRows);
    if (citationsError) {
      return { ok: false, error: "The memo was saved, but its citations could not be recorded.", memoId };
    }
  }

  return { ok: true, memoId };
}
