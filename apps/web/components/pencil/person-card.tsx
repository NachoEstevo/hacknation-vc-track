import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Crosshair, Database, Github, Globe, HelpCircle, UserCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./person-card.module.css";
import { Avatar } from "./avatar";
import { ConfidenceBadge, SectorTag, StageBadge, SourceChip } from "./badges";
import { FounderScore } from "./founder-score";
import type { CandidateReport } from "@/lib/ai/sourcing-schema";

const SOURCE_BADGE: Record<
  CandidateReport["sourceKind"],
  { icon: ReactNode; color: string; background: string; label: string }
> = {
  web: { icon: <Globe aria-hidden="true" />, color: "#3C5C88", background: "#E8EDF5", label: "Web · Researched" },
  github: { icon: <Github aria-hidden="true" />, color: "#3C5C88", background: "#E8EDF5", label: "GitHub · Researched" },
  registered: { icon: <UserCheck aria-hidden="true" />, color: "#25764F", background: "#E2F1E7", label: "Registered" },
  internal_base: { icon: <Database aria-hidden="true" />, color: "#77746B", background: "#EFEEE8", label: "Internal base" },
  prospect_base: { icon: <Database aria-hidden="true" />, color: "#25764F", background: "#E2F1E7", label: "undr base" },
  hack_nation: { icon: <Users aria-hidden="true" />, color: "#5F51A0", background: "#EDEAF7", label: "HackNation" },
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The live-researched person card the sourcing agent fills in on the right
 * panel. The whole card links to the person's generated profile.
 */
export function PersonCard({ candidate }: { candidate: CandidateReport }) {
  const badge = SOURCE_BADGE[candidate.sourceKind];
  const subline = [candidate.role, candidate.location].filter(Boolean).join(" · ");
  const seenHosts = new Set<string>();
  const evidenceHosts = candidate.links
    .map((link) => hostnameOf(link.url))
    .filter((host) => (seenHosts.has(host) ? false : (seenHosts.add(host), true)))
    .slice(0, 3);

  return (
    <Link
      href={`/investor/people/${candidate.slug}` as Route}
      className={styles.card}
      aria-label={`Open the researched profile of ${candidate.name}`}
    >
      <div className={styles.header}>
        <Avatar
          name={candidate.name}
          tone={candidate.sourceKind === "registered" || candidate.sourceKind === "prospect_base" ? "accent" : "external"}
        />
        <div className={styles.titleCol}>
          <div className={styles.titleRow}>
            <span className={styles.personName}>{candidate.name}</span>
            <span className={styles.badge} style={{ color: badge.color, background: badge.background }}>
              {badge.icon}
              <span>{badge.label}</span>
            </span>
          </div>
          <span className={styles.subline}>
            {[subline, candidate.company].filter(Boolean).join(" — ") || "Details pending"}
          </span>
        </div>
        <FounderScore
          value={candidate.score}
          prefix={candidate.sourceKind === "registered" || candidate.sourceKind === "prospect_base" ? undefined : "~"}
        />
        <span className={styles.openHint} aria-hidden="true">
          <ArrowUpRight />
        </span>
      </div>

      <p className={styles.summary}>{candidate.summary}</p>

      <div className={styles.meta}>
        <StageBadge label={candidate.stage || "Stage unknown"} />
        {candidate.tags.map((tag) => (
          <SectorTag key={tag} label={tag} />
        ))}
      </div>

      <div className={styles.whyMatch}>
        <Crosshair aria-hidden="true" />
        <span className={styles.whyMatchText}>{candidate.whyMatch}</span>
      </div>

      <div className={styles.footer}>
        {evidenceHosts.map((host) => (
          <SourceChip
            key={host}
            icon={host === "github.com" ? <Github aria-hidden="true" /> : <Globe aria-hidden="true" />}
            label={host}
          />
        ))}
        <ConfidenceBadge level={candidate.confidence} />
        {candidate.unknowns ? (
          <span className={styles.unknownNote}>
            <HelpCircle aria-hidden="true" />
            <span className={styles.unknownNoteText}>{candidate.unknowns}</span>
          </span>
        ) : null}
      </div>
    </Link>
  );
}
