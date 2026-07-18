import type { Metadata } from "next";
import {
  FileSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Chip } from "@/components/ui/chip";
import { getClayCatalogSummary } from "@/lib/catalog/index.server";
import { DEMO_OPPORTUNITIES } from "@/lib/demo";
import { DEFAULT_SEARCH_QUERY } from "@/lib/search";
import { RecentSearches } from "./search/recent-searches";
import {
  ActiveThesisCard,
  HomeSearchComposer,
  HomeSearchExamples,
  StarterSearchButton,
} from "./home-thesis";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Investor workspace",
  description: "Explore companies through claims, evidence, and transparent thesis fit.",
};

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
  const catalogSummary = await getClayCatalogSummary();
  const claimCount = DEMO_OPPORTUNITIES.reduce(
    (total, opportunity) => total + opportunity.claims.length,
    0,
  );
  const evidenceCount = DEMO_OPPORTUNITIES.reduce(
    (total, opportunity) => total + opportunity.evidence.length,
    0,
  );
  const countryCount = new Set(
    DEMO_OPPORTUNITIES.map((opportunity) => opportunity.company.countryCode),
  ).size;

  return (
    <AppShell
      hideHeader
      contentClassName={styles.shellContent}
    >
      <div className={styles.page}>
        <section className={styles.hero} aria-labelledby="workspace-title">
          <div className={styles.heroCopy}>
            <div className={styles.kicker}>
              <span className={styles.kickerMark} aria-hidden="true">
                <Sparkles size={13} strokeWidth={1.8} />
              </span>
              Evidence-first sourcing
            </div>
            <h1 id="workspace-title">
              Find the signal.
              <br />
              <em>Keep the reasoning.</em>
            </h1>
            <p>
              Describe the company you are looking for in plain language. Every result
              stays connected to the claim, source, confidence, and open question behind it.
            </p>
          </div>

          <ActiveThesisCard />
        </section>

        <section className={styles.searchStage} aria-labelledby="search-heading">
          <div className={styles.searchNumber} aria-hidden="true">01</div>
          <div className={styles.searchBody}>
            <div className={styles.sectionIntro}>
              <div>
                <p className={styles.eyebrow}>Start an exploration</p>
                <h2 id="search-heading">What are you looking for?</h2>
              </div>
              <p>
                We search the internal dataset first. Public enrichment is a separate,
                visible step when evidence is missing.
              </p>
            </div>

            <HomeSearchComposer fallbackQuery={DEFAULT_SEARCH_QUERY} />
            <HomeSearchExamples examples={EXAMPLE_SEARCHES} />
          </div>
        </section>

        <div className={styles.lowerGrid}>
          <section className={styles.datasetPanel} aria-labelledby="dataset-heading">
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.eyebrow}>Internal dataset</p>
                <h2 id="dataset-heading">Real catalog, explicit verification state</h2>
              </div>
              <Chip tone="external" size="sm">clay_csv · unverified</Chip>
            </div>

            <div className={styles.metrics}>
              <div>
                <strong>{catalogSummary.acceptedCompanies}</strong>
                <span>normalized companies</span>
              </div>
              <div>
                <strong>{catalogSummary.duplicateRows}</strong>
                <span>duplicate rows</span>
              </div>
              <div>
                <strong>{catalogSummary.missingDomains}</strong>
                <span>unknown domains</span>
              </div>
              <div>
                <strong>{DEMO_OPPORTUNITIES.length}</strong>
                <span>evidence-rich demo profiles</span>
              </div>
            </div>

            <div className={styles.datasetFoot}>
              <div>
                <ShieldCheck size={16} aria-hidden="true" />
                <span>
                  {claimCount} synthetic claims and {evidenceCount} evidence records support the
                  product flow across {countryCount} countries. Missing stays unknown.
                </span>
              </div>
              <StarterSearchButton query={DEFAULT_SEARCH_QUERY} />
            </div>
          </section>

          <section className={styles.recentPanel} aria-labelledby="recent-heading">
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.eyebrow}>Your workspace</p>
                <h2 id="recent-heading">Recent searches</h2>
              </div>
              <FileSearch size={19} strokeWidth={1.6} aria-hidden="true" />
            </div>
            <RecentSearches fallbackQuery={DEFAULT_SEARCH_QUERY} />
          </section>
        </div>
      </div>
    </AppShell>
  );
}
