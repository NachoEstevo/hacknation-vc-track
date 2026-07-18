import type { Metadata } from "next";
import {
  Check,
  CircleDashed,
  FileSearch,
  Globe2,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { LandingBriefFlow } from "./landing-brief-flow";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Evidence-first venture sourcing",
  description:
    "Discover early founders and projects through structured, source-backed evidence.",
};

const ledgerRows = [
  {
    icon: Check,
    label: "Working product",
    detail: "Verified from product and repository",
    tone: "verified",
  },
  {
    icon: Globe2,
    label: "Latin America",
    detail: "Founder-provided + public profile",
    tone: "external",
  },
  {
    icon: CircleDashed,
    label: "Institutional funding",
    detail: "Not enough evidence yet",
    tone: "unknown",
  },
] as const;

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Brand />
        <nav className={styles.nav} aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#principles">Principles</a>
        </nav>
        <div className={styles.headerActions}>
          <ButtonLink href="/sign-in" variant="ghost" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href="/onboarding/role" size="sm">
            Get started
          </ButtonLink>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="landing-heading">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span aria-hidden="true" /> Evidence-first venture sourcing
          </p>
          <h1 id="landing-heading">
            Find conviction
            <br />
            <em>before consensus.</em>
          </h1>
          <p className={styles.intro}>
            Discover founders and projects before they enter traditional venture
            channels. Every signal stays connected to its source, confidence,
            and contradictions.
          </p>

          <div className={styles.principles} id="principles">
            <div>
              <span>01</span>
              <p>Search internal knowledge first.</p>
            </div>
            <div>
              <span>02</span>
              <p>Enrich with permitted public evidence.</p>
            </div>
            <div>
              <span>03</span>
              <p>Keep the investment decision human.</p>
            </div>
          </div>
        </div>

        <div className={styles.discoveryColumn}>
          <LandingBriefFlow />
        </div>
      </section>

      <section className={styles.proof} id="how-it-works" aria-labelledby="proof-heading">
        <div className={styles.proofIntro}>
          <FileSearch size={21} strokeWidth={1.6} aria-hidden="true" />
          <p className={styles.kicker}>What survives the conversation</p>
          <h2 id="proof-heading">A research record, not another chat transcript.</h2>
          <p>
            Results become reusable founders, projects, claims, sources, and
            decisions. Unknown information remains unknown.
          </p>
        </div>

        <article className={styles.ledger} aria-label="Example evidence ledger">
          <div className={styles.ledgerHeader}>
            <div>
              <span className={styles.demoBadge}>Illustrative record</span>
              <h3>Relay Metrics</h3>
            </div>
            <span className={styles.match}>Strong thesis match</span>
          </div>
          <p className={styles.companyLine}>
            Open-source data reliability · Pre-seed · 3-person team
          </p>
          <div className={styles.ledgerRows}>
            {ledgerRows.map(({ icon: Icon, label, detail, tone }) => (
              <div className={styles.ledgerRow} key={label}>
                <span className={`${styles.stateIcon} ${styles[tone]}`}>
                  <Icon size={15} aria-hidden="true" />
                </span>
                <div>
                  <strong>{label}</strong>
                  <span>{detail}</span>
                </div>
                <span className={`${styles.stateLabel} ${styles[tone]}`}>
                  {tone === "unknown" ? "Missing" : tone}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <footer className={styles.footer}>
        <Brand />
        <p>Evidence over volume. Human judgment over automation.</p>
        <p>Built for early conviction.</p>
      </footer>
    </main>
  );
}
