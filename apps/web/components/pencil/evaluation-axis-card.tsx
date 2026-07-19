import { FileSearch } from "lucide-react";
import styles from "./evaluation-axis-card.module.css";
import { ConfidenceBadge, TrendIndicator } from "./badges";

export interface EvaluationAxisCardProps {
  /** Axis name, e.g. "Founder" / "Market" / "Idea vs. market". Left as `string` so callers own the exact wording. */
  axis: string;
  status: string;
  trend?: { direction: "up" | "down"; label: string };
  confidenceLevel: "high" | "medium" | "low";
  evidenceCount: number;
  /** Optional short caption explaining how coverage was derived. */
  note?: string;
}

/**
 * Port of Pencil `Card / Evaluation Axis`. Renders exactly one of the three independent axes —
 * never averaged with the other two.
 */
export function EvaluationAxisCard({ axis, status, trend, confidenceLevel, evidenceCount, note }: EvaluationAxisCardProps) {
  return (
    <div className={styles.card}>
      <span className={styles.label}>{axis}</span>
      <div className={styles.row}>
        <span className={styles.status}>{status}</span>
        {trend ? <TrendIndicator direction={trend.direction} label={trend.label} /> : null}
      </div>
      <ConfidenceBadge level={confidenceLevel} />
      <div className={styles.evidence}>
        <FileSearch aria-hidden="true" />
        <span className={styles.evidenceText}>{evidenceCount} evidence item{evidenceCount === 1 ? "" : "s"}</span>
      </div>
      {note ? <p className={styles.note}>{note}</p> : null}
    </div>
  );
}
