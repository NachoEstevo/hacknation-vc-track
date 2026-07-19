import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { PersonProfileWorkspace } from "./profile-workspace";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Researched profile",
  description: "A live-researched dossier on one sourced candidate.",
};

export default async function PersonProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <AppShell hideHeader contentClassName={styles.shellContent}>
      <PersonProfileWorkspace slug={slug} />
    </AppShell>
  );
}
