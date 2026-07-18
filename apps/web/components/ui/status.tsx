import clsx from "clsx";
import type { HTMLAttributes } from "react";
import styles from "./status.module.css";

export type StatusKind =
  | "verified"
  | "supported"
  | "match"
  | "inferred"
  | "partial"
  | "unknown"
  | "unconfirmed"
  | "missing"
  | "contradicted"
  | "conflict"
  | "stale"
  | "external"
  | "founder-provided";

const DEFAULT_LABELS: Record<StatusKind, string> = {
  verified: "Verified",
  supported: "Supported",
  match: "Match",
  inferred: "Inferred",
  partial: "Partial",
  unknown: "Unknown",
  unconfirmed: "Unconfirmed",
  missing: "Missing",
  contradicted: "Contradicted",
  conflict: "Conflict",
  stale: "Stale",
  external: "External source",
  "founder-provided": "Founder provided",
};

const TONES: Record<StatusKind, string> = {
  verified: "positive",
  supported: "positive",
  match: "positive",
  inferred: "caution",
  partial: "caution",
  unknown: "neutral",
  unconfirmed: "neutral",
  missing: "neutral",
  contradicted: "negative",
  conflict: "negative",
  stale: "caution",
  external: "external",
  "founder-provided": "founder",
};

export interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  status: StatusKind;
  label?: string;
  showDot?: boolean;
}

/** Evidence and matching status. `missing` is intentionally neutral, never negative. */
export function StatusBadge({
  status,
  label = DEFAULT_LABELS[status],
  showDot = true,
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={clsx(styles.status, styles[TONES[status]], className)}
      data-status={status}
      {...props}
    >
      {showDot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

export const Status = StatusBadge;
