import { notFound, redirect } from "next/navigation";
import { FounderNav } from "@/components/pencil";
import { createClient } from "@/lib/supabase/server";
import { fetchFounderProject } from "@/lib/founder/data.server";
import styles from "./layout.module.css";

interface FounderProjectLayoutProps {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export default async function FounderProjectLayout({ params, children }: FounderProjectLayoutProps) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) {
    redirect("/onboarding/role");
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    redirect("/onboarding/role");
  }

  const project = await fetchFounderProject(supabase, id);
  const isOwner = Boolean(
    project && (project.created_by === user.id || project.claimed_by_user_id === user.id),
  );
  if (!project || !isOwner) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const userName = profile?.display_name?.trim() || user.email || "Founder";

  return (
    <div className={styles.shell}>
      <FounderNav projectId={id} userName={userName} />
      {children}
    </div>
  );
}
