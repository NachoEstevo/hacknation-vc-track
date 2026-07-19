import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { DEFAULT_SEARCH_QUERY } from "@/lib/search";
import { loadInvestorIdentityAction } from "@/lib/supabase/workspace-identity.actions";
import { HomeGreetingName, HomeSearchComposer, HomeSearchExamples } from "./home-thesis";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Investor workspace",
  description: "Explore companies through claims, evidence, and transparent thesis fit.",
};

const FALLBACK_INVESTOR_NAME = "Demo investor";

const EXAMPLE_SEARCHES = [
  {
    label: "AI infrastructure · LATAM",
    query:
      "Pre-seed AI infrastructure teams in Latin America with technical founders and a working demo.",
  },
  {
    label: "Hackathon-born security",
    query:
      "Hackathon-born AI security developer tools with small teams and a working demo.",
  },
  {
    label: "Climate · evidence of use",
    query:
      "Pre-seed climate tech in Latin America with evidence of traction and no institutional funding.",
  },
] as const;

export default async function InvestorHomePage() {
  const identity = await loadInvestorIdentityAction();
  const investorName = identity?.name ?? FALLBACK_INVESTOR_NAME;

  return (
    <AppShell
      hideHeader
      contentClassName={styles.shellContent}
      userName={investorName}
      userRole="Investor"
    >
      <div className={styles.page}>
        <section className={styles.greeting} aria-labelledby="workspace-title">
          <p className={styles.dateLine}>Today · Investor workspace</p>
          <h1 id="workspace-title" className={styles.greetingTitle}>
            What are you looking for, <HomeGreetingName fallback={investorName} />?
          </h1>
          <p className={styles.greetingSub}>
            Describe a search in plain language. Every result will retain its evidence,
            confidence, contradictions, and unknowns.
          </p>
        </section>

        <HomeSearchComposer fallbackQuery={DEFAULT_SEARCH_QUERY} />
        <HomeSearchExamples examples={EXAMPLE_SEARCHES} />
      </div>
    </AppShell>
  );
}
