import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { InvestorThesisForm } from "./investor-thesis-form";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Define your investment thesis",
  description:
    "Turn an investment mandate into transparent, editable sourcing criteria.",
};

export default function InvestorOnboardingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Brand />
        <div className={styles.step} aria-label="Onboarding progress: step 2 of 2">
          <span>Investment thesis</span>
          <span aria-hidden="true">02 / 02</span>
        </div>
        <ButtonLink href="/onboarding/role" variant="quiet" size="sm">
          Back
        </ButtonLink>
      </header>

      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Configure your sourcing lens</p>
          <h1>
            Make your thesis
            <br />
            <em>legible to the system.</em>
          </h1>
        </div>
        <div className={styles.headingNote}>
          <LockKeyhole size={16} strokeWidth={1.7} aria-hidden="true" />
          <p>
            Your criteria explain why a company appears. They are never used as
            hidden proxies or automatic investment decisions.
          </p>
        </div>
      </div>

      <InvestorThesisForm initialQuery="" />
    </main>
  );
}
