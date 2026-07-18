import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CircleCheck,
  CircleX,
  ExternalLink,
  FileText,
  Info,
  ScanSearch,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { StatusBadge, type StatusKind } from "@/components/ui/status";
import { DEMO_OPPORTUNITIES, getOpportunity } from "@/lib/demo";
import type { ClaimState, EvidenceRelation } from "@/lib/domain";
import {
  claimStateLabel,
  formatDate,
  formatToken,
  getEvidenceForClaim,
} from "../../_lib/diligence";
import styles from "../diligence.module.css";

interface EvidencePageProps {
  params: Promise<{ id: string }>;
}

const TRUST_COMPONENTS = [
  { key: "sourceReliability", label: "Source reliability", maximum: 40 },
  { key: "directness", label: "Directness", maximum: 25 },
  { key: "corroboration", label: "Corroboration", maximum: 20 },
  { key: "recency", label: "Recency", maximum: 15 },
] as const;

function claimStatus(state: ClaimState): StatusKind {
  const statuses: Record<ClaimState, StatusKind> = {
    supported: "supported",
    partially_supported: "partial",
    unverified: "unconfirmed",
    contradicted: "contradicted",
    stale: "stale",
  };
  return statuses[state];
}

function relationPresentation(relation: EvidenceRelation) {
  if (relation === "supports") {
    return { label: "Supports", icon: <CircleCheck aria-hidden="true" />, className: styles.relation };
  }
  if (relation === "contradicts") {
    return { label: "Contradicts", icon: <CircleX aria-hidden="true" />, className: `${styles.relation} ${styles.relationContradicts}` };
  }
  return { label: "Context", icon: <Info aria-hidden="true" />, className: `${styles.relation} ${styles.relationContext}` };
}

export function generateStaticParams() {
  return DEMO_OPPORTUNITIES.map((opportunity) => ({ id: opportunity.id }));
}

export async function generateMetadata({ params }: EvidencePageProps): Promise<Metadata> {
  const { id } = await params;
  const opportunity = getOpportunity(id);
  return { title: opportunity ? `${opportunity.project.name} evidence` : "Evidence not found" };
}

export default async function EvidencePage({ params }: EvidencePageProps) {
  const { id } = await params;
  const opportunity = getOpportunity(id);
  if (!opportunity) notFound();

  const supportedCount = opportunity.claims.filter((claim) => claim.state === "supported").length;
  const unresolvedCount = opportunity.claims.filter((claim) => claim.state !== "supported").length;
  const projectHref = `/investor/projects/${opportunity.id}` as Route;
  const memoHref = `/investor/projects/${opportunity.id}/memo` as Route;

  return (
    <AppShell
      eyebrow={`${opportunity.project.name} · provenance`}
      title="Claim inspector"
      actions={(
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <ButtonLink href={projectHref} variant="ghost" size="sm" leadingIcon={<ArrowLeft />}>
            Project brief
          </ButtonLink>
          <ButtonLink href={memoHref} variant="secondary" size="sm" leadingIcon={<FileText />}>
            Open memo
          </ButtonLink>
        </div>
      )}
    >
      <div className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/investor/search">Discover</Link>
          <span>/</span>
          <Link href={projectHref}>{opportunity.project.name}</Link>
          <span>/</span>
          <span aria-current="page">Evidence</span>
        </nav>

        <div className={styles.demoNotice} role="note">
          <ScanSearch aria-hidden="true" />
          <span>
            Every item below belongs to a <strong>synthetic_demo</strong> fixture. Trust is a transparent
            provenance heuristic for the captured claim—not an investment score or statement of truth.
          </span>
        </div>

        <section className={styles.inspectorIntro} aria-label="Evidence summary">
          <div className={styles.introCard}>
            <span className={styles.eyebrow}>Evidence graph</span>
            <h2>{opportunity.claims.length} claims · {opportunity.evidence.length} source excerpts</h2>
            <p>
              {supportedCount} claims are supported in this snapshot; {unresolvedCount} remain partial,
              unverified, stale, or contradicted. Each relation is explicit so a source can support one
              claim while contradicting another.
            </p>
            <div className={styles.chips}>
              <Chip tone="verified" size="sm">{supportedCount} supported</Chip>
              <Chip tone={unresolvedCount ? "risk" : "muted"} size="sm">{unresolvedCount} unresolved</Chip>
              <Chip tone="muted" size="sm">Captured {formatDate(opportunity.updatedAt)}</Chip>
            </div>
          </div>
          <aside className={styles.trustLegend}>
            <span className={styles.eyebrow}>Trust Score</span>
            <h2>Four visible inputs</h2>
            <p>The total is additive and capped at 100. No hidden factor is used.</p>
            <div className={styles.trustFormula}>
              {TRUST_COMPONENTS.map((component) => (
                <span key={component.key}>
                  {component.label}
                  <strong>/{component.maximum}</strong>
                </span>
              ))}
            </div>
          </aside>
        </section>

        <section className={styles.claimStack} aria-label="Claims and linked evidence">
          {opportunity.claims.map((claim) => {
            const links = getEvidenceForClaim(opportunity, claim);
            return (
              <article key={claim.id} id={claim.id} className={styles.claimCard}>
                <header className={styles.claimHeader}>
                  <div>
                    <span className={styles.claimPredicate}>{claim.predicate}</span>
                    <h2>{claim.statement}</h2>
                    <p className={styles.claimObserved}>
                      Observed {formatDate(claim.observedAt)} · {links.length} linked excerpt{links.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <StatusBadge status={claimStatus(claim.state)} label={claimStateLabel(claim.state)} />
                </header>

                <div className={styles.claimBody}>
                  <div className={styles.records}>
                    {links.map(({ evidence, relation }) => {
                      const relationView = relationPresentation(relation);
                      return (
                        <section key={`${claim.id}-${evidence.id}`} className={styles.evidenceRecord} aria-label={`${relationView.label} evidence`}>
                          <div className={styles.recordTop}>
                            <span className={relationView.className}>
                              {relationView.icon}
                              {relationView.label}
                            </span>
                            <span className={styles.sourceType}>{formatToken(evidence.sourceType)}</span>
                          </div>
                          <blockquote className={styles.excerpt}>“{evidence.excerpt}”</blockquote>
                          <div className={styles.recordMeta}>
                            <span>{evidence.sourceName}</span>
                            <span>Captured {formatDate(evidence.capturedAt)}</span>
                            {evidence.sourceUrl ? (
                              <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">
                                Open source <ExternalLink size={11} aria-hidden="true" />
                              </a>
                            ) : (
                              <span>No public URL · synthetic fixture</span>
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>

                  <aside className={styles.trustPanel} aria-label={`Trust components for ${claim.statement}`}>
                    <div className={styles.trustTotal}>
                      <span>Trust Score</span>
                      <strong>{claim.trust.score}/100</strong>
                    </div>
                    <div className={styles.trustComponents}>
                      {TRUST_COMPONENTS.map((component) => {
                        const value = claim.trust[component.key];
                        return (
                          <div key={component.key}>
                            <div className={styles.trustComponentTop}>
                              <span>{component.label}</span>
                              <strong>{value}/{component.maximum}</strong>
                            </div>
                            <div className={styles.trustBar} aria-hidden="true">
                              <span style={{ width: `${(value / component.maximum) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className={styles.trustNote}>
                      This score describes source provenance and recency. Claim state still controls
                      whether the product treats it as supported, partial, unverified, or contradicted.
                    </p>
                  </aside>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
