import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { SearchWorkspace } from "./search-workspace";
import { DEFAULT_SEARCH_QUERY } from "@/lib/search";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Discover companies",
  description: "Search companies and inspect the evidence behind every thesis match.",
};

export default function SearchPage() {
  return (
    <AppShell hideHeader contentClassName={styles.shellContent}>
      <SearchWorkspace starterQuery={DEFAULT_SEARCH_QUERY} />
    </AppShell>
  );
}
