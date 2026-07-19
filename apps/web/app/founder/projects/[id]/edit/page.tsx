import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ensureFounderReviewStatus,
  fetchClaimEvidenceLinks,
  fetchFounderProject,
  fetchProjectClaims,
  fetchProjectEvidence,
} from "@/lib/founder/data.server";
import { computeSectionSummaries } from "@/lib/founder/completeness";
import { EditorClient } from "./editor-client";

export const metadata: Metadata = { title: "Project editor" };

interface EditorPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectEditorPage({ params }: EditorPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) redirect("/onboarding/role");

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/onboarding/role");

  let project = await fetchFounderProject(supabase, id);
  if (!project || (project.created_by !== userData.user.id && project.claimed_by_user_id !== userData.user.id)) {
    notFound();
  }

  project = await ensureFounderReviewStatus(supabase, project);

  const [claims, evidence] = await Promise.all([
    fetchProjectClaims(supabase, id),
    fetchProjectEvidence(supabase, id),
  ]);
  const claimEvidenceLinks = await fetchClaimEvidenceLinks(supabase, claims.map((claim) => claim.id));
  const sections = computeSectionSummaries(claims, evidence, claimEvidenceLinks);

  return (
    <EditorClient
      project={project}
      claims={claims}
      evidence={evidence}
      claimEvidenceLinks={claimEvidenceLinks}
      sections={sections}
    />
  );
}
