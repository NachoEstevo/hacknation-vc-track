import clsx from "clsx";
import {
  Check,
  Globe,
  HelpCircle,
  Lightbulb,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import styles from "./badges.module.css";

/** Semantic tone for a piece of evidence-backed data. Maps 1:1 to Pencil's evidence color language. */
export type EvidenceTone =
  | "verified"
  | "inference"
  | "risk"
  | "unknown"
  | "founder-provided"
  | "external";

const TONE_CONFIG: Record<
  EvidenceTone,
  { icon: LucideIcon; color: string; background: string; label: string }
> = {
  verified: { icon: Check, color: "var(--verified)", background: "var(--verified-soft)", label: "Verified" },
  inference: { icon: Lightbulb, color: "var(--inference)", background: "var(--inference-soft)", label: "Inferred" },
  risk: { icon: TriangleAlert, color: "var(--risk)", background: "var(--risk-soft)", label: "Contradicted" },
  unknown: { icon: HelpCircle, color: "var(--unknown)", background: "var(--unknown-soft)", label: "Insufficient evidence" },
  "founder-provided": { icon: UserCheck, color: "var(--founder-provided)", background: "var(--founder-provided-soft)", label: "Founder provided" },
  external: { icon: Globe, color: "var(--external)", background: "var(--external-soft)", label: "External source" },
};

export interface SectorTagProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
}

/** Port of Pencil `Tag / Sector`. */
export function SectorTag({ label, className, ...props }: SectorTagProps) {
  return (
    <span className={clsx(styles.sectorTag, className)} {...props}>
      <span className={styles.sectorTagLabel}>{label}</span>
    </span>
  );
}

export interface StageBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
}

/** Port of Pencil `Badge / Stage`. */
export function StageBadge({ label, className, ...props }: StageBadgeProps) {
  return (
    <span className={clsx(styles.stageBadge, className)} {...props}>
      <span className={styles.stageDot} aria-hidden="true" />
      <span className={styles.stageLabel}>{label}</span>
    </span>
  );
}

export interface DataBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone: EvidenceTone;
  label?: string;
  /** Pass an already-rendered icon element (e.g. `<Check aria-hidden />`), never a bare component reference — this crosses the server/client boundary. */
  icon?: ReactNode;
}

/** Port of Pencil `Badge / Data`. Carries the claim-verification state as color + icon. */
export function DataBadge({ tone, label, icon, className, ...props }: DataBadgeProps) {
  const config = TONE_CONFIG[tone];
  const DefaultIcon = config.icon;
  return (
    <span
      className={clsx(styles.dataBadge, className)}
      style={{ background: config.background, color: config.color }}
      {...props}
    >
      {icon ?? <DefaultIcon aria-hidden="true" />}
      <span className={styles.dataBadgeLabel}>{label ?? config.label}</span>
    </span>
  );
}

export interface ConfidenceBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  level: "high" | "medium" | "low";
  label?: string;
}

const CONFIDENCE_CONFIG: Record<ConfidenceBadgeProps["level"], { color: string; label: string }> = {
  high: { color: "var(--verified)", label: "High confidence" },
  medium: { color: "var(--inference)", label: "Medium confidence" },
  low: { color: "var(--unknown)", label: "Low confidence" },
};

/** Port of Pencil `Badge / Confidence`. */
export function ConfidenceBadge({ level, label, className, ...props }: ConfidenceBadgeProps) {
  const config = CONFIDENCE_CONFIG[level];
  return (
    <span className={clsx(styles.confidenceBadge, className)} {...props}>
      <span className={styles.confidenceDot} style={{ background: config.color }} aria-hidden="true" />
      <span className={styles.confidenceLabel}>{label ?? config.label}</span>
    </span>
  );
}

export interface TrendIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  direction: "up" | "down";
  label: string;
}

/** Port of Pencil `Indicator / Trend`. */
export function TrendIndicator({ direction, label, className, ...props }: TrendIndicatorProps) {
  const Icon = direction === "up" ? TrendingUp : TrendingDown;
  const color = direction === "up" ? "var(--verified)" : "var(--risk)";
  return (
    <span className={clsx(styles.trendIndicator, className)} style={{ color }} {...props}>
      <Icon aria-hidden="true" />
      <span className={styles.trendLabel}>{label}</span>
    </span>
  );
}

export interface SourceChipProps extends HTMLAttributes<HTMLSpanElement> {
  /** Pass an already-rendered icon element (e.g. `<Github aria-hidden />`), never a bare component reference — this crosses the server/client boundary. */
  icon: ReactNode;
  label: string;
  meta?: ComponentProps<"span">["children"];
}

/** Port of Pencil `Chip / Source`. */
export function SourceChip({ icon, label, meta, className, ...props }: SourceChipProps) {
  return (
    <span className={clsx(styles.sourceChip, className)} {...props}>
      {icon}
      <span className={styles.sourceChipLabel}>{label}</span>
      {meta !== undefined ? <span className={styles.sourceChipMeta}>{meta}</span> : null}
    </span>
  );
}
