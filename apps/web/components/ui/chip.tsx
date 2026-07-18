import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";
import styles from "./chip.module.css";

export type ChipTone =
  | "neutral"
  | "accent"
  | "verified"
  | "inference"
  | "risk"
  | "external"
  | "founder"
  | "muted";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  size?: "sm" | "md";
  dot?: boolean;
  leadingIcon?: ReactNode;
}

export function Chip({
  tone = "neutral",
  size = "md",
  dot = false,
  leadingIcon,
  className,
  children,
  ...props
}: ChipProps) {
  return (
    <span className={clsx(styles.chip, styles[tone], styles[size], className)} {...props}>
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {leadingIcon ? <span className={styles.icon} aria-hidden="true">{leadingIcon}</span> : null}
      <span className={styles.label}>{children}</span>
    </span>
  );
}
