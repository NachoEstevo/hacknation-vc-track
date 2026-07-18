"use client";

import type { Route } from "next";
import {
  ArrowRight,
  Check,
  CircleHelp,
  HardDrive,
  Minus,
  SlidersHorizontal,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useWorkspace } from "@/components/workspace-provider";
import type { SearchCriterion } from "@/lib/domain";
import { DEMO_OPPORTUNITIES } from "@/lib/demo";
import styles from "./page.module.css";

const STARTER_BRIEF =
  "Technical founders building developer infrastructure with a working product, before institutional seed.";

const STARTER_CRITERIA: SearchCriterion[] = [
  { id: "starter-sector", field: "sector", operator: "includes_any", value: ["ai_infrastructure", "developer_tools", "ai_security"], priority: "required", label: "AI infrastructure · Developer tools · Security" },
  { id: "starter-stage", field: "stage", operator: "includes_any", value: ["pre_seed", "seed"], priority: "required", label: "Pre-seed · Seed" },
  { id: "starter-geography", field: "geography", operator: "includes_any", value: ["LATAM", "US", "GB"], priority: "required", label: "Latin America · United States · United Kingdom" },
  { id: "starter-working-product", field: "working_demo", operator: "equals", value: true, priority: "preferred", label: "Working product" },
];

function readableField(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

function criterionRationale(criterion: SearchCriterion): string {
  if (["check_size", "acceptable_risk", "team_preferences", "valued_signal_types"].includes(criterion.field)) {
    return "This parameter remains visible, but the current demo has no evidence predicate for it; it stays unknown and does not reduce fit.";
  }
  if (criterion.priority === "exclude") {
    return "The exclusion is applied only when supporting evidence exists. Missing evidence remains unknown.";
  }
  return "This criterion is evaluated against qualified claims and retains its evidence state in every match.";
}

export function ThesisWorkspace() {
  const { activeThesis, hasHydrated } = useWorkspace();
  const brief = activeThesis?.brief ?? STARTER_BRIEF;
  const criteria = activeThesis?.criteria ?? STARTER_CRITERIA;
  const requiredCount = criteria.filter((criterion) => criterion.priority === "required").length;
  const preferredCount = criteria.filter((criterion) => criterion.priority === "preferred").length;
  const exclusionCount = criteria.filter((criterion) => criterion.priority === "exclude").length;

  return (
    <AppShell
      eyebrow="Sourcing lens"
      title="Investment thesis"
      headerAside={(
        <Chip tone={activeThesis ? "accent" : "inference"} size="sm">
          {activeThesis ? "browser_saved" : "starter_demo"}
        </Chip>
      )}
      actions={(
        <ButtonLink
          href={"/onboarding/investor" as Route}
          variant="secondary"
          size="sm"
          leadingIcon={<SlidersHorizontal />}
        >
          Edit sourcing lens
        </ButtonLink>
      )}
    >
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p>{activeThesis ? "Active browser thesis" : "Starter demo thesis"}</p>
            <h2>A visible lens for sourcing, not a hidden score for deciding.</h2>
            <blockquote>{hasHydrated ? brief : "Reading the sourcing lens saved in this browser…"}</blockquote>
          </div>
          <aside className={styles.snapshot}>
            <span className={styles.snapshotIcon}><HardDrive aria-hidden="true" /></span>
            <div>
              <strong>{activeThesis ? "Saved in this browser" : "No configured thesis saved"}</strong>
              <p>
                {activeThesis
                  ? "This sourcing lens persists only in local browser storage. It is not an account record and is not synced to Supabase."
                  : "Starter values keep the demo usable. Configure the lens to save a browser-only active thesis."}
              </p>
            </div>
          </aside>
        </section>

        <section className={styles.criteriaSection} aria-labelledby="criteria-title">
          <header className={styles.sectionHeader}>
            <div>
              <p>How matches are explained</p>
              <h2 id="criteria-title">
                {requiredCount} required · {preferredCount} preferred
                {exclusionCount ? ` · ${exclusionCount} excluded` : ""}
              </h2>
            </div>
            <span>{DEMO_OPPORTUNITIES.length} synthetic opportunities available for evaluation</span>
          </header>
          <div className={styles.criteriaGrid}>
            {criteria.map((criterion, index) => (
              <article className={styles.criterion} key={criterion.id}>
                <div className={styles.criterionNumber}>{String(index + 1).padStart(2, "0")}</div>
                <div className={styles.criterionBody}>
                  <div className={styles.criterionTopline}>
                    <Chip
                      tone={criterion.priority === "required" ? "accent" : criterion.priority === "exclude" ? "risk" : "inference"}
                      size="sm"
                    >
                      {criterion.priority}
                    </Chip>
                    <span>{readableField(criterion.field)}</span>
                  </div>
                  <h3>{criterion.label}</h3>
                  <p>{criterionRationale(criterion)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.interpretation} aria-labelledby="interpretation-title">
          <header>
            <p>Decision hygiene</p>
            <h2 id="interpretation-title">Three states stay distinct.</h2>
          </header>
          <div className={styles.stateGrid}>
            <article>
              <span className={styles.stateIconPositive}><Check aria-hidden="true" /></span>
              <h3>Supported match</h3>
              <p>A claim has evidence that supports the criterion at the recorded timestamp.</p>
            </article>
            <article>
              <span className={styles.stateIconNeutral}><CircleHelp aria-hidden="true" /></span>
              <h3>Missing evidence</h3>
              <p>Unknown remains unknown. Absence of evidence is never treated as a negative fact.</p>
            </article>
            <article>
              <span className={styles.stateIconRisk}><Minus aria-hidden="true" /></span>
              <h3>Documented conflict</h3>
              <p>A contradiction is shown with its source instead of being silently collapsed.</p>
            </article>
          </div>
        </section>

        <section className={styles.editCallout}>
          <div>
            <p>Need a different mandate?</p>
            <h2>Reopen the thesis builder with the browser-saved lens.</h2>
            <span>
              Completing the builder replaces this browser-only active thesis. Structured
              criteria and investment parameters are not placed in the URL.
            </span>
          </div>
          <ButtonLink
            href={"/onboarding/investor" as Route}
            variant="primary"
            size="lg"
            trailingIcon={<ArrowRight />}
          >
            Edit sourcing lens
          </ButtonLink>
        </section>
      </div>
    </AppShell>
  );
}
