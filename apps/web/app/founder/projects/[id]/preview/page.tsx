import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchClaimEvidenceLinks,
  fetchFounderProject,
  fetchProjectClaims,
  fetchProjectEvidence,
} from "@/lib/founder/data.server";
import { computePublishChecklist } from "@/lib/founder/completeness";
import { PreviewClient } from "./preview-client";

export const metadata: Metadata = { title: "Profile preview" };

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectPreviewPage({ params }: PreviewPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) redirect("/onboarding/role");

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/onboarding/role");

  const project = await fetchFounderProject(supabase, id);
  if (!project || (project.created_by !== userData.user.id && project.claimed_by_user_id !== userData.user.id)) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, location")
    .eq("id", userData.user.id)
    .maybeSingle();

  const [claims, evidence] = await Promise.all([
    fetchProjectClaims(supabase, id),
    fetchProjectEvidence(supabase, id),
  ]);
  const claimEvidenceLinks = await fetchClaimEvidenceLinks(supabase, claims.map((claim) => claim.id));
  const checklist = computePublishChecklist(claims, evidence, claimEvidenceLinks);

  return (
    <PreviewClient
      project={project}
      claims={claims}
      evidence={evidence}
      claimEvidenceLinks={claimEvidenceLinks}
      checklist={checklist}
      founderName={profile?.display_name?.trim() || userData.user.email || "Founder"}
    />
  );
}
