import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Bookmark, Columns2, Crosshair, Database, Globe, HelpCircle, MailPlus, UserCheck } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./project-result-card.module.css";
import { Avatar } from "./avatar";
import { ConfidenceBadge, SectorTag, StageBadge, SourceChip } from "./badges";
import { FounderScore } from "./founder-score";

export interface ProjectResultSource {
  /** Pass an already-rendered icon element (e.g. `<Github aria-hidden />`), never a bare component reference — this crosses the server/client boundary. */
  icon: ReactNode;
  label: string;
  meta?: string | number;
}

export type ResultBadgeTone = "registered" | "internal_base" | "external_unconfirmed";

const BADGE_CONFIG: Record<ResultBadgeTone, { icon: ReactNode; color: string; background: string; defaultLabel: string }> = {
  registered: { icon: <UserCheck aria-hidden="true" />, color: "#25764F", background: "#E2F1E7", defaultLabel: "Registered" },
  internal_base: { icon: <Database aria-hidden="true" />, color: "#77746B", background: "#EFEEE8", defaultLabel: "Internal base" },
  external_unconfirmed: { icon: <Globe aria-hidden="true" />, color: "#3C5C88", background: "#E8EDF5", defaultLabel: "External · Unconfirmed" },
};

export interface ProjectResultCardProps {
  /** Omit when there's no real profile page to open yet (e.g. an unconfirmed external candidate). */
  href?: string;
  founderName: string;
  projectName: string;
  badgeTone: ResultBadgeTone;
  badgeLabel?: string;
  founderSubline: string;
  founderScore: number;
  /** e.g. "~" when the score is derived from public activity rather than verified claims. */
  scorePrefix?: string;
  description: string;
  stageLabel: string;
  tags: string[];
  whyMatch: string;
  sources: ProjectResultSource[];
  confidenceLevel: "high" | "medium" | "low";
  unknownNote?: string;
  onSave?: () => void;
  onCompare?: () => void;
  /** Shown instead of compare/open for unconfirmed external candidates who haven't joined undr. */
  onInvite?: () => void;
}

/** Port of Pencil `Card / Project Result` — the primary unit produced by a search. */
export function ProjectResultCard({
  href,
  founderName,
  projectName,
  badgeTone,
  badgeLabel,
  founderSubline,
  founderScore,
  scorePrefix,
  description,
  stageLabel,
  tags,
  whyMatch,
  sources,
  confidenceLevel,
  unknownNote,
  onSave,
  onCompare,
  onInvite,
}: ProjectResultCardProps) {
  const badge = BADGE_CONFIG[badgeTone];
  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <Avatar name={founderName} tone={badgeTone === "external_unconfirmed" ? "external" : "accent"} />
        <div className={styles.titleCol}>
          <div className={styles.titleRow}>
            <span className={styles.projectName}>{projectName}</span>
            <span className={styles.badge} style={{ color: badge.color, background: badge.background }}>
              {badge.icon}
              <span>{badgeLabel ?? badge.defaultLabel}</span>
            </span>
          </div>
          <span className={styles.founderSub}>{founderSubline}</span>
        </div>
        <FounderScore value={founderScore} prefix={scorePrefix} />
        <div className={styles.actions}>
          {onInvite ? (
            <>
              <button type="button" className={styles.actionButton} onClick={onSave} aria-label="Save project">
                <Bookmark aria-hidden="true" />
              </button>
              <button type="button" className={styles.inviteButton} onClick={onInvite}>
                <MailPlus aria-hidden="true" />
                <span>Invite</span>
              </button>
            </>
          ) : (
            <>
              <button type="button" className={styles.actionButton} onClick={onSave} aria-label="Save project">
                <Bookmark aria-hidden="true" />
              </button>
              <button type="button" className={styles.actionButton} onClick={onCompare} aria-label="Add to comparison">
                <Columns2 aria-hidden="true" />
              </button>
              {href ? (
                <Link href={href as Route} className={`${styles.actionButton} ${styles.actionButtonPrimary}`} aria-label="Open project">
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>

      <p className={styles.description}>{description}</p>

      <div className={styles.meta}>
        <StageBadge label={stageLabel} />
        {tags.map((tag) => (
          <SectorTag key={tag} label={tag} />
        ))}
      </div>

      <div className={styles.whyMatch}>
        <Crosshair aria-hidden="true" />
        <span className={styles.whyMatchText}>{whyMatch}</span>
      </div>

      <div className={styles.footer}>
        {sources.map((source, index) => (
          <SourceChip key={`${source.label}-${index}`} icon={source.icon} label={source.label} meta={source.meta} />
        ))}
        <ConfidenceBadge level={confidenceLevel} />
        {unknownNote ? (
          <span className={styles.unknownNote}>
            <HelpCircle aria-hidden="true" />
            <span className={styles.unknownNoteText}>{unknownNote}</span>
          </span>
        ) : null}
      </div>
    </article>
  );
}
