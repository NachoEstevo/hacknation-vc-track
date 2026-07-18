import type { Metadata } from "next";
import {
  BriefcaseBusiness,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { ContinueAsInvestorButton, PendingBriefSummary } from "./pending-brief";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Choose your workspace",
  description: "Choose how you will use undr.",
};

export default function RolePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Brand />
        <div className={styles.progress} aria-label="Onboarding progress">
          <span>01</span>
          <span className={styles.progressLine} aria-hidden="true">
            <i />
          </span>
          <span>02</span>
        </div>
        <ButtonLink href="/" variant="quiet" size="sm">
          Back to home
        </ButtonLink>
      </header>

      <section className={styles.content} aria-labelledby="role-heading">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Set up your workspace · 1 of 2</p>
          <h1 id="role-heading">
            What brings you
            <br />
            <em>under the surface?</em>
          </h1>
          <p>
            Your workspace changes what you can research, contribute, and
            control. You can join another workspace later.
          </p>
        </div>

        <PendingBriefSummary />

        <div className={styles.roles}>
          <article className={`${styles.roleCard} ${styles.activeCard}`}>
            <div className={styles.cardTopline}>
              <span className={styles.roleIcon}>
                <BriefcaseBusiness size={22} strokeWidth={1.65} aria-hidden="true" />
              </span>
              <span className={styles.recommended}>Recommended for this demo</span>
            </div>
            <p className={styles.cardIndex}>Workspace 01</p>
            <h2>Investor / VC</h2>
            <p className={styles.roleDescription}>
              Source early companies, inspect claims and turn public signals
              into an investment record your team can revisit.
            </p>
            <ul className={styles.capabilities}>
              <li>
                <ShieldCheck size={15} aria-hidden="true" /> Evidence-backed discovery
              </li>
              <li>
                <ShieldCheck size={15} aria-hidden="true" /> Explainable thesis matching
              </li>
              <li>
                <ShieldCheck size={15} aria-hidden="true" /> Comparisons, memos and pipeline
              </li>
            </ul>
            <ContinueAsInvestorButton />
          </article>

          <article className={styles.roleCard}>
            <div className={styles.cardTopline}>
              <span className={styles.roleIcon}>
                <UserRound size={22} strokeWidth={1.65} aria-hidden="true" />
              </span>
              <span className={styles.planned}>Founder flow follows</span>
            </div>
            <p className={styles.cardIndex}>Workspace 02</p>
            <h2>Founder / Builder</h2>
            <p className={styles.roleDescription}>
              Build a source-backed profile, correct what the system inferred,
              and decide which information investors can see.
            </p>
            <ul className={styles.capabilities}>
              <li>
                <ShieldCheck size={15} aria-hidden="true" /> Structured project profile
              </li>
              <li>
                <ShieldCheck size={15} aria-hidden="true" /> Evidence and privacy controls
              </li>
              <li>
                <ShieldCheck size={15} aria-hidden="true" /> Investor invitation loop
              </li>
            </ul>
            <p className={styles.founderNote}>
              This delivery is focused on the investor workflow. Founder setup
              will connect to the same evidence model.
            </p>
          </article>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Private by default</span>
        <p>
          Role is used to configure your workspace — never as an investment signal.
        </p>
      </footer>
    </main>
  );
}
