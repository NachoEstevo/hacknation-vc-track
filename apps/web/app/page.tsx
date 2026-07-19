import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/pencil";
import { LandingBriefFlow } from "./landing-brief-flow";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Evidence-first venture sourcing",
  description:
    "Describe your thesis in plain language. undr surfaces early teams, explains every match, and keeps the evidence, gaps, and contradictions attached.",
};

const STEPS = [
  {
    number: "01",
    title: "Describe",
    description: "Write what you're looking for in plain language — sector, stage, geography, signals.",
  },
  {
    number: "02",
    title: "Inspect",
    description: "Every match arrives with its sources, confidence level and contradictions attached.",
  },
  {
    number: "03",
    title: "Decide",
    description: "Compare teams, generate an evidence-linked memo, and move the best into your pipeline.",
  },
] as const;

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.heroBg} aria-hidden="true" />
      <div className={styles.heroWash} aria-hidden="true" />

      <div className={styles.hero}>
        <div className={styles.heroContent}>
          <header className={styles.header}>
            <Link href="/" className={styles.brand} aria-label="undr home">
              <span className={styles.brandWordmark}>undr</span>
            </Link>
            <div className={styles.headerSpacer} />
            <div className={styles.headerAuth}>
              <ButtonLink href="/onboarding/role" variant="primary">
                Get started
              </ButtonLink>
            </div>
          </header>

          <section className={styles.heroInner} aria-labelledby="landing-heading">
            <h1 id="landing-heading" className={styles.headline}>
              Find overlooked companies before the market does.
            </h1>
            <p className={styles.subhead}>
              Describe your thesis in plain language. undr surfaces early teams,
              explains every match, and keeps the evidence, gaps, and
              contradictions attached.
            </p>

            <LandingBriefFlow />
          </section>
        </div>
      </div>

      <section className={styles.howItWorks} aria-label="How undr works">
        <p className={styles.hiwLabel}>HOW IT WORKS</p>
        <div className={styles.hiwCols}>
          {STEPS.map(({ number, title, description }) => (
            <div className={styles.hiwCol} key={title}>
              <span className={styles.hiwNumber}>{number}</span>
              <p className={styles.hiwTitle}>{title}</p>
              <p className={styles.hiwDesc}>{description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <p>&copy; 2026 undr</p>
        <div className={styles.footerLinks}>
          <span>Privacy</span>
          <span>Terms</span>
          <span>Contact</span>
        </div>
      </footer>
    </main>
  );
}
