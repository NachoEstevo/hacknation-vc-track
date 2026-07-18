import type { Metadata } from "next";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Access your undr research workspace.",
};

export default function SignInPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Brand />
        <ButtonLink href="/" variant="quiet" size="sm">
          Back to home
        </ButtonLink>
      </header>

      <section className={styles.content} aria-labelledby="sign-in-heading">
        <div className={styles.editorial}>
          <p className={styles.eyebrow}>Private research workspace</p>
          <h1 id="sign-in-heading">
            Return to the work
            <br />
            <em>beneath the pitch.</em>
          </h1>
          <p className={styles.intro}>
            Your theses, searches, evidence and decisions belong to your
            workspace — not to a public founder directory.
          </p>
          <div className={styles.promise}>
            <ShieldCheck size={18} strokeWidth={1.65} aria-hidden="true" />
            <p>
              Missing evidence remains distinct from negative evidence in every
              company record.
            </p>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardIcon}>
            <LockKeyhole size={20} strokeWidth={1.7} aria-hidden="true" />
          </div>
          <p className={styles.cardKicker}>Prototype bypass</p>
          <h2>Continue without signing in</h2>
          <p className={styles.cardIntro}>
            Account authentication is not connected in this local prototype.
            Continue directly to role selection; no credentials are requested or stored.
          </p>
          <div className={styles.bypassAction}>
            <ButtonLink
              href="/onboarding/role"
              fullWidth
              size="lg"
              trailingIcon={<ArrowRight size={17} aria-hidden="true" />}
            >
              Continue to onboarding
            </ButtonLink>
          </div>
          <p className={styles.disclaimer}>
            Prototype bypass only · no account or session is created.
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Evidence-first by design</span>
        <span>Human judgment stays final</span>
      </footer>
    </main>
  );
}
