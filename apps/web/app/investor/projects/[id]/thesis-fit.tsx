"use client";

import { Check, CircleHelp, Minus, X } from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { matchOpportunity } from "@/lib/search";
import type { OpportunityDetail } from "@/lib/domain";
import styles from "./thesis-fit.module.css";

function fitLabel(percent: number): string {
  if (percent >= 70) return "Strong match";
  if (percent >= 40) return "Partial match";
  return "Weak match";
}

interface ThesisFitCardProps {
  opportunity: OpportunityDetail;
}

/**
 * Mirrors Pencil's "Fit with your thesis" rail card, but only renders a match when the
 * investor has actually saved an active thesis in this workspace. `matchOpportunity` is the
 * same evaluator the search flow uses — nothing here is a separately invented score.
 */
export function ThesisFitCard({ opportunity }: ThesisFitCardProps) {
  const { activeThesis } = useWorkspace();

  if (!activeThesis) {
    return (
      <section className={styles.card} aria-label="Fit with your thesis">
        <span className={styles.label}>Fit with your thesis</span>
        <p className={styles.empty}>
          No active thesis is set for this workspace — insufficient evidence to compute a fit.
        </p>
      </section>
    );
  }

  const match = matchOpportunity(opportunity, {
    query: activeThesis.brief,
    criteria: activeThesis.criteria,
    sourceScope: "internal",
  });

  return (
    <section className={styles.card} aria-label="Fit with your thesis">
      <span className={styles.label}>Fit with your thesis</span>
      <strong className={styles.status}>
        {fitLabel(match.thesisMatch)} · {match.thesisMatch}%
      </strong>
      <ul className={styles.rows}>
        {match.evaluations.slice(0, 4).map((evaluation) => (
          <li key={evaluation.criterion.id} className={styles.row}>
            {evaluation.state === "match" ? (
              <Check aria-hidden="true" />
            ) : evaluation.state === "conflict" ? (
              <X aria-hidden="true" />
            ) : evaluation.state === "missing" ? (
              <CircleHelp aria-hidden="true" />
            ) : (
              <Minus aria-hidden="true" />
            )}
            <span>{evaluation.criterion.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
