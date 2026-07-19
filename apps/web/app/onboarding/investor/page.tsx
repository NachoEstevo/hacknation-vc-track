import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Brand } from "@/components/brand";
import { getClayCatalogSummary } from "@/lib/catalog/index.server";
import { InvestorThesisForm } from "./investor-thesis-form";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Define your investment thesis",
  description:
    "Turn an investment mandate into transparent, editable sourcing criteria.",
};

export default async function InvestorOnboardingPage() {
  const catalogSummary = await getClayCatalogSummary();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Brand hideMark />
        <nav className={styles.stepper} aria-label="Onboarding progress">
          <div className={styles.step}>
            <span className={styles.stepDot}>
              <Check size={11} aria-hidden="true" />
            </span>
            <span className={styles.stepLabel}>Workspace</span>
          </div>
          <span className={styles.stepLine} aria-hidden="true" />
          <div className={styles.step}>
            <span className={styles.stepDot}>2</span>
            <span className={`${styles.stepLabel} ${styles.stepLabelCurrent}`}>
              Investment thesis
            </span>
          </div>
        </nav>
        <Link href="/" className={styles.skip}>
          Save &amp; exit
        </Link>
      </header>

      <InvestorThesisForm
        initialQuery=""
        catalogCount={catalogSummary.acceptedCompanies}
      />
    </main>
  );
}
