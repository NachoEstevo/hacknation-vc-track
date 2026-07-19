import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchFounderProject } from "@/lib/founder/data.server";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Project settings" };

interface SettingsPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectSettingsPage({ params }: SettingsPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) redirect("/onboarding/role");

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/onboarding/role");

  const project = await fetchFounderProject(supabase, id);
  if (!project || (project.created_by !== userData.user.id && project.claimed_by_user_id !== userData.user.id)) {
    notFound();
  }

  return <SettingsClient project={project} />;
}
