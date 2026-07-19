/**
 * One-time, idempotent seed that mirrors the six `synthetic_demo` opportunity
 * fixtures (`lib/demo/fixtures/*`) into real `projects` / `founders` /
 * `project_founders` / `evidence` / `claims` / `claim_evidence` rows.
 *
 * Why this exists: `pipeline_items.project_id`, `memos.project_id`, and
 * `memo_citations.claim_id` / `.evidence_id` are real foreign keys with RLS
 * and referential integrity. The demo catalog is intentionally never written
 * through the authenticated app (see `projects_insert_owned`, which forces
 * `data_label = 'real'` on every user-originated insert) — a "real" fixture
 * mirror can only be created by a privileged process, which is exactly what
 * this script is. It reuses the *exact same* TypeScript fixture data the UI
 * already renders (`lib/demo`), so nothing here is invented — it is the same
 * facts, claims, and evidence excerpts already shown to every user, given a
 * real row to live in.
 *
 * Every row uses a deterministic id (see `lib/supabase/deterministic-id.ts`),
 * so re-running this script is a no-op upsert, and the app's own server
 * actions (see `lib/supabase/workspace-pipeline.actions.ts` etc.) can compute
 * the same ids at request time without a lookup.
 *
 * Usage (local Supabase, from apps/web):
 *   SUPABASE_SECRET_KEY=<local secret key from `supabase status`> \
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *   npx tsx scripts/seed-synthetic-demo-catalog.ts
 *
 * This script talks to the Supabase REST API with the service role key,
 * which bypasses Row Level Security by design — that privilege must never be
 * given to the browser or to a normal server action.
 */
import { createClient } from "@supabase/supabase-js";
import { DEMO_OPPORTUNITIES } from "../lib/demo";
import {
  syntheticClaimId,
  syntheticEvidenceId,
  syntheticFounderId,
  syntheticProjectId,
} from "../lib/supabase/synthetic-demo-catalog";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to run this seed script (it must never be committed).`);
  }
  return value;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "http://127.0.0.1:54321";
  const secretKey = requireEnv("SUPABASE_SECRET_KEY");
  const admin = createClient(url, secretKey, { auth: { persistSession: false } });

  const projectRows: Record<string, unknown>[] = [];
  const founderRows = new Map<string, { id: string; display_name: string }>();
  const projectFounderRows: Record<string, unknown>[] = [];
  const evidenceRows: Record<string, unknown>[] = [];
  const claimRows: Record<string, unknown>[] = [];
  const claimEvidenceRows: Record<string, unknown>[] = [];

  for (const opportunity of DEMO_OPPORTUNITIES) {
    const projectId = syntheticProjectId(opportunity.id);

    projectRows.push({
      id: projectId,
      company_id: null,
      created_by: null,
      claimed_by_user_id: null,
      name: opportunity.project.name,
      slug: opportunity.id,
      tagline: opportunity.project.tagline,
      summary: opportunity.project.summary,
      stage: opportunity.project.stage,
      sector_tags: opportunity.project.sectorTags,
      team_size: opportunity.project.teamSize,
      // Institutional funding / raising / working demo / hackathon origin / traction
      // exist only as evidence-gated *claims* in this fixture model (see claims
      // below), not as unconditional project metadata — leaving these columns
      // null keeps the project record from asserting a fact the claims layer
      // has not (or only partially) supported.
      institutional_funding: null,
      is_raising: null,
      has_working_demo: null,
      hackathon_origin: null,
      traction_summary: null,
      location: opportunity.company.city,
      country_code: opportunity.company.countryCode,
      data_label: "synthetic_demo",
      status: "published",
      visibility: "published",
      published_at: opportunity.updatedAt,
    });

    opportunity.founders.forEach((founder, index) => {
      const founderId = syntheticFounderId(founder.id);
      founderRows.set(founderId, { id: founderId, display_name: founder.name });
      projectFounderRows.push({
        project_id: projectId,
        founder_id: founderId,
        created_by: null,
        role_title: founder.role,
        is_primary: index === 0,
        // Curated fixture data reviewed by the platform, not a founder's own
        // self-confirmation (there is no real founder account behind this
        // synthetic identity), so "admin_confirmed" is the honest state.
        relationship_state: "admin_confirmed",
        confidence: 1,
        resolution_reason: "synthetic_demo fixture seed (scripts/seed-synthetic-demo-catalog.ts)",
      });
    });

    for (const evidence of opportunity.evidence) {
      evidenceRows.push({
        id: syntheticEvidenceId(opportunity.id, evidence.id),
        company_id: null,
        founder_id: null,
        source_id: null,
        project_id: projectId,
        created_by: null,
        evidence_type: evidence.sourceType,
        source_url: evidence.sourceUrl,
        private_object_path: null,
        excerpt: evidence.excerpt,
        structured_payload: { sourceName: evidence.sourceName, fixtureEvidenceId: evidence.id },
        visibility: "public",
        verification_state: "unverified",
        captured_at: evidence.capturedAt,
        content_hash: evidence.contentHash,
      });
    }

    for (const claim of opportunity.claims) {
      const isFounderClaim = claim.predicate.startsWith("founder.");
      const subjectType = isFounderClaim ? "founder" : "project";
      const subjectId = isFounderClaim ? syntheticFounderId(claim.subjectId) : projectId;

      claimRows.push({
        id: syntheticClaimId(opportunity.id, claim.id),
        project_id: projectId,
        created_by: null,
        subject_type: subjectType,
        subject_id: subjectId,
        predicate: claim.predicate,
        statement: claim.statement,
        value: claim.value,
        state: claim.state,
        visibility: "published",
        source_reliability: claim.trust.sourceReliability,
        directness: claim.trust.directness,
        corroboration: claim.trust.corroboration,
        recency: claim.trust.recency,
        observed_at: claim.observedAt,
      });

      for (const link of claim.evidence) {
        claimEvidenceRows.push({
          claim_id: syntheticClaimId(opportunity.id, claim.id),
          evidence_id: syntheticEvidenceId(opportunity.id, link.evidenceId),
          relation: link.relation,
          note: null,
        });
      }
    }
  }

  console.log(`Seeding ${projectRows.length} synthetic_demo projects…`);
  const { error: projectsError } = await admin.from("projects").upsert(projectRows, { onConflict: "id" });
  if (projectsError) throw new Error(`projects upsert failed: ${projectsError.message}`);

  console.log(`Seeding ${founderRows.size} founders…`);
  const { error: foundersError } = await admin.from("founders").upsert([...founderRows.values()], { onConflict: "id" });
  if (foundersError) throw new Error(`founders upsert failed: ${foundersError.message}`);

  console.log(`Seeding ${projectFounderRows.length} project_founders links…`);
  const { error: projectFoundersError } = await admin
    .from("project_founders")
    .upsert(projectFounderRows, { onConflict: "project_id,founder_id" });
  if (projectFoundersError) throw new Error(`project_founders upsert failed: ${projectFoundersError.message}`);

  console.log(`Seeding ${evidenceRows.length} evidence rows…`);
  const { error: evidenceError } = await admin.from("evidence").upsert(evidenceRows, { onConflict: "id" });
  if (evidenceError) throw new Error(`evidence upsert failed: ${evidenceError.message}`);

  console.log(`Seeding ${claimRows.length} claims…`);
  const { error: claimsError } = await admin.from("claims").upsert(claimRows, { onConflict: "id" });
  if (claimsError) throw new Error(`claims upsert failed: ${claimsError.message}`);

  console.log(`Seeding ${claimEvidenceRows.length} claim_evidence links…`);
  const { error: claimEvidenceError } = await admin
    .from("claim_evidence")
    .upsert(claimEvidenceRows, { onConflict: "claim_id,evidence_id" });
  if (claimEvidenceError) throw new Error(`claim_evidence upsert failed: ${claimEvidenceError.message}`);

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
