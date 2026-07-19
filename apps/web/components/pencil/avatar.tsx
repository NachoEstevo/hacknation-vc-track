import clsx from "clsx";
import type { HTMLAttributes } from "react";
import styles from "./avatar.module.css";

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  size?: "md" | "sm";
  /** "external" matches Pencil's blue treatment for unconfirmed external candidates. */
  tone?: "accent" | "external";
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/** Port of Pencil `Avatar`. */
export function Avatar({ name, size = "md", tone = "accent", className, ...props }: AvatarProps) {
  return (
    <span className={clsx(styles.avatar, size === "sm" && styles.small, tone === "external" && styles.external, className)} {...props}>
      <span className={styles.initials}>{initialsFor(name)}</span>
    </span>
  );
}
