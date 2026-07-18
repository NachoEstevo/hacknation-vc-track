import type { Metadata } from "next";
import { DEMO_OPPORTUNITIES } from "@/lib/demo";
import { FounderInviteWorkspace } from "./founder-invite-workspace";

export const metadata: Metadata = {
  title: "Prepare founder invitation",
  description: "Prepare and copy a manual founder verification request without sending outreach automatically.",
};

type FounderInvitePageProps = {
  params: Promise<{ id: string }>;
};

export default async function FounderInvitePage({ params }: FounderInvitePageProps) {
  const { id } = await params;
  const opportunity = DEMO_OPPORTUNITIES.find((candidate) => (
    candidate.founders.some((founder) => founder.id === id)
  )) ?? null;
  const founder = opportunity?.founders.find((candidate) => candidate.id === id) ?? null;
  const founderClaims = opportunity?.claims
    .filter((claim) => claim.subjectId === id)
    .map((claim) => ({
      id: claim.id,
      statement: claim.statement,
      state: claim.state,
      trustScore: claim.trust.score,
    })) ?? [];

  return (
    <FounderInviteWorkspace
      founder={{
        id,
        name: founder?.name ?? "Unresolved founder",
        role: founder?.role ?? "Role unknown",
        location: founder?.location ?? "Location unknown",
      }}
      opportunity={opportunity ? {
        id: opportunity.id,
        name: opportunity.project.name,
        tagline: opportunity.project.tagline,
        dataLabel: opportunity.dataLabel,
      } : null}
      founderClaims={founderClaims}
    />
  );
}
