import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { PendingBriefSummary } from "./pending-brief";
import { WorkspaceCards } from "./workspace-cards";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Choose your workspace",
  description: "Choose how you will use undr.",
};

export default function RolePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Brand hideMark />
        <p className={styles.stepNote}>Setup 1 of 2 · Choose workspace</p>
      </header>

      <section className={styles.body} aria-labelledby="role-heading">
        <h1 id="role-heading" className={styles.title}>
          Choose your workspace
        </h1>
        <p className={styles.sub}>
          Your workspace sets permissions, tools, and the onboarding you’ll
          see. Add another later.
        </p>

        <PendingBriefSummary />

        <WorkspaceCards />
      </section>
    </main>
  );
}
