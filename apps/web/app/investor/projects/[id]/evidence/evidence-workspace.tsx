"use client";

import {
  ExternalLink,
  FileText,
  Github,
  Globe,
  Landmark,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  ConfidenceBadge,
  DataBadge,
  EvidenceRow,
  SourceChip,
  type EvidenceTone,
} from "@/components/pencil";
import type {
  ClaimRecord,
  ClaimState,
  EvidenceRecord,
  EvidenceRelation,
  OpportunityDetail,
  SourceType,
} from "@/lib/domain";
import { claimStateLabel, confidenceLevelFromTrust, formatDate, getEvidenceForClaim } from "../../_lib/diligence";
import styles from "./evidence-workspace.module.css";

const SOURCE_META: Record<SourceType, { icon: LucideIcon; label: string }> = {
  github: { icon: Github, label: "GitHub" },
  website: { icon: Globe, label: "Website" },
  public_registry: { icon: Landmark, label: "Registry" },
  deck: { icon: FileText, label: "Deck" },
  founder_submission: { icon: UserCheck, label: "Founder" },
  hackathon: { icon: Trophy, label: "Hackathon" },
};

function sourceIconFor(sourceType: SourceType | undefined) {
  const Icon = (sourceType ? SOURCE_META[sourceType]?.icon : undefined) ?? Globe;
  return <Icon aria-hidden="true" />;
}

const TONE_BY_STATE: Record<ClaimState, EvidenceTone> = {
  supported: "verified",
  partially_supported: "inference",
  unverified: "unknown",
  stale: "unknown",
  contradicted: "risk",
};

type TabKey = "all" | "verified" | "inferred" | "unconfirmed" | "contradictions";

const TAB_ORDER: { key: TabKey; label: string; states: ClaimState[] | null }[] = [
  { key: "all", label: "All", states: null },
  { key: "verified", label: "Verified", states: ["supported"] },
  { key: "inferred", label: "Inferred", states: ["partially_supported"] },
  { key: "unconfirmed", label: "Unconfirmed", states: ["unverified", "stale"] },
  { key: "contradictions", label: "Contradictions", states: ["contradicted"] },
];

interface ResolvedClaim {
  claim: ClaimRecord;
  primaryEvidence: EvidenceRecord | undefined;
  sourceCount: number;
  contradictionSummary: string | undefined;
}

/** Picks the single most relevant excerpt for a claim: the contradicting record when the claim
 * is contradicted, otherwise the strongest supporting record. Never fabricates a quote. */
function resolveClaim(opportunity: OpportunityDetail, claim: ClaimRecord): ResolvedClaim {
  const links = getEvidenceForClaim(opportunity, claim);
  const preferredRelation: EvidenceRelation = claim.state === "contradicted" ? "contradicts" : "supports";
  const primaryLink = links.find((link) => link.relation === preferredRelation)
    ?? links.find((link) => link.relation === "context")
    ?? links[0];
  const contradiction = opportunity.contradictions.find((item) => item.claimId === claim.id);

  return {
    claim,
    primaryEvidence: primaryLink?.evidence,
    sourceCount: primaryLink
      ? opportunity.evidence.filter((record) => record.sourceType === primaryLink.evidence.sourceType).length
      : 0,
    contradictionSummary: contradiction?.summary,
  };
}

function tabStatesFor(key: TabKey): ClaimState[] | null {
  return TAB_ORDER.find((tab) => tab.key === key)?.states ?? null;
}

export function EvidenceWorkspace({ opportunity }: { opportunity: OpportunityDetail }) {
  const resolved = useMemo(
    () => opportunity.claims.map((claim) => resolveClaim(opportunity, claim)),
    [opportunity],
  );

  const counts = useMemo(() => {
    const base: Record<TabKey, number> = {
      all: resolved.length,
      verified: 0,
      inferred: 0,
      unconfirmed: 0,
      contradictions: 0,
    };
    for (const item of resolved) {
      if (item.claim.state === "supported") base.verified += 1;
      else if (item.claim.state === "partially_supported") base.inferred += 1;
      else if (item.claim.state === "unverified" || item.claim.state === "stale") base.unconfirmed += 1;
      else if (item.claim.state === "contradicted") base.contradictions += 1;
    }
    return base;
  }, [resolved]);

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [selectedClaimId, setSelectedClaimId] = useState<string | undefined>(resolved[0]?.claim.id);

  const visible = useMemo(() => {
    const states = tabStatesFor(activeTab);
    if (!states) return resolved;
    return resolved.filter((item) => states.includes(item.claim.state));
  }, [resolved, activeTab]);

  const selected = visible.find((item) => item.claim.id === selectedClaimId) ?? visible[0];

  function selectTab(tab: TabKey) {
    setActiveTab(tab);
    const states = tabStatesFor(tab);
    const nextVisible = states ? resolved.filter((item) => states.includes(item.claim.state)) : resolved;
    setSelectedClaimId(nextVisible[0]?.claim.id);
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.subtitle}>
        Every claim, its source, and how much to trust it. Select any claim to inspect the original excerpt.
      </p>

      <div className={styles.tabs} role="tablist" aria-label="Filter claims by verification state">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={styles.tab}
            data-active={activeTab === tab.key ? "true" : undefined}
            onClick={() => selectTab(tab.key)}
          >
            {tab.key !== "all" ? (
              <span className={styles.tabDot} data-tone={tab.key} aria-hidden="true" />
            ) : null}
            {tab.label} · {counts[tab.key]}
          </button>
        ))}
      </div>

      <div className={styles.columns}>
        <ul className={styles.list}>
          {visible.map((item) => {
            const meta = item.primaryEvidence ? SOURCE_META[item.primaryEvidence.sourceType] : undefined;
            return (
              <li
                key={item.claim.id}
                className={styles.rowWrap}
                data-selected={selected?.claim.id === item.claim.id ? "true" : undefined}
                onClick={() => setSelectedClaimId(item.claim.id)}
              >
                <EvidenceRow
                  claim={item.claim.statement}
                  status={TONE_BY_STATE[item.claim.state]}
                  statusLabel={claimStateLabel(item.claim.state)}
                  quote={item.primaryEvidence?.excerpt}
                  sourceIcon={sourceIconFor(item.primaryEvidence?.sourceType)}
                  sourceLabel={meta?.label ?? "Unknown source"}
                  sourceMeta={item.primaryEvidence ? item.sourceCount : undefined}
                  capturedAt={item.primaryEvidence ? formatDate(item.primaryEvidence.capturedAt) : "Not captured"}
                  confidenceLevel={confidenceLevelFromTrust(item.claim.trust.score)}
                  sourceUrl={item.primaryEvidence?.sourceUrl ?? undefined}
                />
              </li>
            );
          })}
          {visible.length === 0 ? (
            <li className={styles.empty}>No claims match this filter in the current snapshot.</li>
          ) : null}
        </ul>

        {selected ? (
          <aside className={styles.detail} aria-label="Claim inspector">
            <span className={styles.detailEyebrow}>Claim inspector</span>
            <h2 className={styles.detailClaim}>&ldquo;{selected.claim.statement}&rdquo;</h2>
            <div className={styles.detailBadges}>
              <DataBadge tone={TONE_BY_STATE[selected.claim.state]} label={claimStateLabel(selected.claim.state)} />
              <ConfidenceBadge level={confidenceLevelFromTrust(selected.claim.trust.score)} />
            </div>

            {selected.primaryEvidence ? (
              <div className={styles.sourceBox}>
                <div className={styles.sourceBoxTop}>
                  <SourceChip
                    icon={sourceIconFor(selected.primaryEvidence.sourceType)}
                    label={selected.primaryEvidence.sourceName}
                  />
                  <span className={styles.sourceBoxDate}>
                    CAPTURED {formatDate(selected.primaryEvidence.capturedAt).toUpperCase()}
                  </span>
                </div>
                <p className={styles.sourceBoxQuote}>&ldquo;{selected.primaryEvidence.excerpt}&rdquo;</p>
                <span className={styles.sourceBoxNote}>Exact fragment captured from this source.</span>
              </div>
            ) : (
              <p className={styles.empty}>No linked evidence excerpt is captured for this claim yet.</p>
            )}

            {selected.contradictionSummary ? (
              <div className={styles.contradictionBox}>
                <ShieldAlert aria-hidden="true" />
                <span>{selected.contradictionSummary}</span>
              </div>
            ) : (
              <div className={styles.noContradictionBox}>
                <ShieldCheck aria-hidden="true" />
                <span>No contradicting source is linked to this claim in the current snapshot.</span>
              </div>
            )}

            <div className={styles.detailActions}>
              {selected.primaryEvidence?.sourceUrl ? (
                <a
                  className={styles.openSourceButton}
                  href={selected.primaryEvidence.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original source
                  <ExternalLink aria-hidden="true" />
                </a>
              ) : (
                <span className={styles.detailActionsNote}>No public URL for this source · synthetic fixture</span>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
