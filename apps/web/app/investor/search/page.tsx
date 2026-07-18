import type { Metadata, Route } from "next";
import { GitCompareArrows, Layers3 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  getClayCatalogSummary,
  listClayCatalogCompanies,
} from "@/lib/catalog/index.server";
import { SearchWorkspace } from "./search-workspace";
import { DEFAULT_SEARCH_QUERY } from "@/lib/search";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Discover companies",
  description: "Search companies and inspect the evidence behind every thesis match.",
};

export default async function SearchPage() {
  const [catalogSummary, catalogRows] = await Promise.all([
    getClayCatalogSummary(),
    listClayCatalogCompanies(),
  ]);

  return (
    <AppShell
      eyebrow="Evidence exploration"
      title="Discover companies"
      headerAside={
        <span className={styles.headerScope}>
          <Layers3 size={14} aria-hidden="true" /> Internal first · public next
        </span>
      }
      actions={
        <ButtonLink
          href={"/investor/compare" as Route}
          variant="secondary"
          size="sm"
          leadingIcon={<GitCompareArrows size={15} />}
        >
          Compare
        </ButtonLink>
      }
      contentClassName={styles.shellContent}
    >
      <div className={styles.page}>
        <div className={styles.demoNotice} role="note">
          <Chip tone="inference" size="sm">synthetic_demo</Chip>
          <span>
            Evidence-rich profiles below are fictional product fixtures. The secondary catalog
            uses {catalogSummary.acceptedCompanies} normalized source rows and remains unverified.
          </span>
        </div>
        <SearchWorkspace
          starterQuery={DEFAULT_SEARCH_QUERY}
          catalogRows={catalogRows.map((company) => ({ ...company }))}
          catalogTotal={catalogSummary.acceptedCompanies}
        />
      </div>
    </AppShell>
  );
}
