import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { SearchWorkspace } from "./search-workspace";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Sourcing agent",
  description: "Chat with the sourcing agent: it researches the live web and returns evidence-backed people.",
};

export default function SearchPage() {
  return (
    <AppShell hideHeader contentClassName={styles.shellContent}>
      <SearchWorkspace />
    </AppShell>
  );
}
