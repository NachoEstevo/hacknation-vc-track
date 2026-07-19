import clsx from "clsx";
import { Info } from "lucide-react";
import type { HTMLAttributes } from "react";
import styles from "./founder-score.module.css";

export interface FounderScoreProps extends HTMLAttributes<HTMLSpanElement> {
  value: number;
  /** Prefix shown before the number, e.g. "~" for an activity-derived estimate rather than a claim-backed score. */
  prefix?: string;
  onExplain?: () => void;
}

/** Port of Pencil `Score / Founder`. The persistent, explainable Founder Score. */
export function FounderScore({ value, prefix, onExplain, className, ...props }: FounderScoreProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span className={clsx(styles.score, className)} {...props}>
      <span className={styles.value}>{prefix}{Math.round(clamped)}</span>
      <span className={styles.track}>
        <span className={styles.fill} style={{ width: `${clamped}%` }} />
      </span>
      {onExplain ? (
        <button type="button" className={styles.infoButton} onClick={onExplain} aria-label="Explain Founder Score">
          <Info aria-hidden="true" />
        </button>
      ) : (
        <Info aria-hidden="true" className={styles.infoButton} />
      )}
    </span>
  );
}
