import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Database,
  MapPin,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Chip } from "@/components/ui/chip";
import { StatusBadge, type StatusKind } from "@/components/ui/status";
import { DEMO_OPPORTUNITIES, getOpportunity } from "@/lib/demo";
import type { ClaimState, OpportunityDetail } from "@/lib/domain";
import {
  claimStateLabel,
  findClaim,
  formatDate,
  formatToken,
  getDiligenceAxes,
  getEvidenceCoverage,
  getEvidenceForClaim,
  getStrongClaims,
  getUnknowns,
} from "../_lib/diligence";
import { ProjectActions } from "./project-actions";
import styles from "./diligence.module.css";

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

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

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function sourceGroups(opportunity: OpportunityDetail) {
  const grouped = new Map<string, { type: string; count: number; capturedAt: string }>();
  for (const evidence of opportunity.evidence) {
    const current = grouped.get(evidence.sourceName);
    grouped.set(evidence.sourceName, {
      type: formatToken(evidence.sourceType),
      count: (current?.count ?? 0) + 1,
      capturedAt: evidence.capturedAt,
    });
  }
  return [...grouped.entries()].map(([name, data]) => ({ name, ...data }));
}

export function generateStaticParams() {
  return DEMO_OPPORTUNITIES.map((opportunity) => ({ id: opportunity.id }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { id } = await params;
  const opportunity = getOpportunity(id);
  return {
    title: opportunity ? `${opportunity.project.name} diligence` : "Project not found",
    description: opportunity?.project.summary,
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const opportunity = getOpportunity(id);
  if (!opportunity) notFound();

  const coverage = getEvidenceCoverage(opportunity);
  const axes = getDiligenceAxes(opportunity);
  const strongClaims = getStrongClaims(opportunity);
  const unknowns = getUnknowns(opportunity);
  const sources = sourceGroups(opportunity);
  const firstFounder = opportunity.founders[0];
  const problemClaim = findClaim(opportunity, "project.problem");
  const productClaim = findClaim(opportunity, "project.product");

  return (
    <AppShell
      eyebrow="Evidence-first diligence"
      title="Project brief"
      headerAside={<Chip tone="muted" size="sm">{opportunity.dataLabel}</Chip>}
    >
      <div className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/investor/search">Discover</Link>
          <ChevronRight className={styles.breadcrumbIcon} aria-hidden="true" />
          <span aria-current="page">{opportunity.project.name}</span>
        </nav>

        <div className={styles.demoNotice} role="note">
          <Database aria-hidden="true" />
          <span>
            This is a <strong>synthetic_demo</strong> evidence bundle for product evaluation.
            Names, excerpts, and claims are fictional; no statement should be treated as real-world diligence.
          </span>
        </div>

        <section className={styles.hero} aria-labelledby="project-title">
          <div className={styles.heroTop}>
            <div>
              <div className={styles.identity}>
                <span className={styles.monogram} aria-hidden="true">
                  {initials(opportunity.project.name)}
                </span>
                <div className={styles.identityCopy}>
                  <h2 id="project-title">{opportunity.project.name}</h2>
                  <p className={styles.tagline}>{opportunity.project.tagline}</p>
                  <div className={styles.chips} aria-label="Project attributes">
                    <Chip tone="accent" size="sm">{formatToken(opportunity.project.stage)}</Chip>
                    {opportunity.project.sectorTags.map((sector) => (
                      <Chip key={sector} tone="neutral" size="sm">{formatToken(sector)}</Chip>
                    ))}
                    <Chip tone="muted" size="sm" leadingIcon={<MapPin />}>
                      {opportunity.company.city}, {opportunity.company.countryCode}
                    </Chip>
                  </div>
                </div>
              </div>
              <p className={styles.summary}>{opportunity.project.summary}</p>
            </div>
            <div className={styles.heroActions}>
              <ProjectActions projectId={opportunity.id} founderId={firstFounder?.id} />
            </div>
          </div>

          <div className={styles.snapshotStrip} aria-label="Project snapshot">
            <div className={styles.snapshotItem}>
              <span className={styles.snapshotLabel}>Stage</span>
              <strong className={styles.snapshotValue}>{formatToken(opportunity.project.stage)}</strong>
            </div>
            <div className={styles.snapshotItem}>
              <span className={styles.snapshotLabel}>Team</span>
              <strong className={styles.snapshotValue}>{opportunity.project.teamSize} people</strong>
            </div>
            <div className={styles.snapshotItem}>
              <span className={styles.snapshotLabel}>Evidence</span>
              <strong className={styles.snapshotValue}>{coverage.evidenceArtifacts} artifacts</strong>
            </div>
            <div className={styles.snapshotItem}>
              <span className={styles.snapshotLabel}>Claims</span>
              <strong className={styles.snapshotValue}>{opportunity.claims.length} captured</strong>
            </div>
            <div className={styles.snapshotItem}>
              <span className={styles.snapshotLabel}>Snapshot</span>
              <strong className={styles.snapshotValue}>{formatDate(opportunity.updatedAt)}</strong>
            </div>
          </div>
        </section>

        {opportunity.founderScore && firstFounder ? (
          <section className={styles.founderScorePanel} aria-labelledby="founder-score-title">
            <div className={styles.founderScoreLead}>
              <span className={styles.eyebrow}>Observed execution evidence · {firstFounder.name}</span>
              <h2 id="founder-score-title">Founder Score</h2>
              <p>{opportunity.founderScore.interpretation}</p>
              <div className={styles.founderScoreReading}>
                <strong>
                  {opportunity.founderScore.score === null
                    ? "Not enough evidence"
                    : `${opportunity.founderScore.score}/100`}
                </strong>
                <StatusBadge
                  status={opportunity.founderScore.confidence === "high"
                    ? "supported"
                    : opportunity.founderScore.confidence === "medium"
                      ? "partial"
                      : "unknown"}
                  label={`${formatToken(opportunity.founderScore.confidence)} confidence`}
                />
              </div>
              <div className={styles.founderCoverage}>
                <div className={styles.founderCoverageTop}>
                  <span>Factor evidence coverage</span>
                  <strong>{opportunity.founderScore.evidenceCoverage}%</strong>
                </div>
                <div
                  className={styles.coverageTrack}
                  role="progressbar"
                  aria-label="Founder Score factor evidence coverage"
                  aria-valuenow={opportunity.founderScore.evidenceCoverage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={styles.coverageFill}
                    style={{ width: `${opportunity.founderScore.evidenceCoverage}%` }}
                  />
                </div>
              </div>
            </div>
            <div className={styles.factorGrid}>
              {opportunity.founderScore.factors.map((factor) => (
                <article key={factor.id} className={styles.factorCard}>
                  <div className={styles.factorTop}>
                    <strong>{factor.label}</strong>
                    <span>{factor.weight}% weight</span>
                  </div>
                  <div className={styles.factorReading}>
                    <span>
                      {factor.state === "missing" ? "Unknown" : `${factor.evidenceStrength}/100`}
                    </span>
                    <StatusBadge
                      status={factor.state === "missing"
                        ? "missing"
                        : claimStatus(factor.state)}
                      label={factor.state === "missing" ? "Missing" : claimStateLabel(factor.state)}
                      showDot={false}
                    />
                  </div>
                </article>
              ))}
            </div>
            <div className={styles.founderScoreDisclaimer}>
              <AlertCircle aria-hidden="true" />
              <span>
                This score summarizes the strength of captured execution evidence only.
                Missing factors lower coverage, not the observed score. It is not a prediction,
                an investment recommendation, or an input to a universal company score; it remains
                separate from the three diligence axes below.
              </span>
            </div>
          </section>
        ) : null}

        <section className={styles.problemProductPanel} aria-labelledby="problem-product-title">
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Core understanding</span>
              <h2 id="problem-product-title">Problem &amp; product</h2>
              <p>Both descriptions are claim-backed and retain their source state.</p>
            </div>
          </div>
          <div className={styles.problemProductGrid}>
            {[
              { label: "Problem", text: opportunity.project.problem, claim: problemClaim },
              { label: "Product", text: opportunity.project.product, claim: productClaim },
            ].map((item) => {
              const evidence = item.claim
                ? getEvidenceForClaim(opportunity, item.claim)[0]?.evidence
                : undefined;
              return (
                <article key={item.label} className={styles.problemProductCard}>
                  <div className={styles.problemProductTop}>
                    <span className={styles.eyebrow}>{item.label}</span>
                    {item.claim ? (
                      <StatusBadge
                        status={claimStatus(item.claim.state)}
                        label={claimStateLabel(item.claim.state)}
                      />
                    ) : <StatusBadge status="missing" />}
                  </div>
                  <p>{item.text}</p>
                  <span className={styles.problemProductSource}>
                    {evidence
                      ? `${evidence.sourceName} · captured ${formatDate(evidence.capturedAt)}`
                      : "No supporting source is linked."}
                  </span>
                </article>
              );
            })}
          </div>
        </section>

        <div className={styles.workspace}>
          <div className={styles.mainColumn}>
            <section className={styles.panel} aria-labelledby="axes-title">
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Independent diligence lenses</span>
                  <h2 id="axes-title">Founder, market, and idea–market evidence</h2>
                  <p>
                    These axes are kept separate. Coverage describes what is documented;
                    it is not a company-quality score and is never averaged into one number.
                  </p>
                </div>
                <div className={styles.coverageSummary} aria-label={`${coverage.percent}% diligence field coverage`}>
                  <strong>{coverage.coveredFields}/{coverage.expectedFields}</strong>
                  <span>fields with linked evidence</span>
                </div>
              </div>

              <div className={styles.axisGrid}>
                {axes.map((axis) => (
                  <article key={axis.name} className={styles.axisCard}>
                    <div className={styles.axisTop}>
                      <h3>{axis.name}</h3>
                      <StatusBadge
                        status={axis.status === "Well evidenced"
                          ? "supported"
                          : axis.status === "Conflicted"
                            ? "conflict"
                            : axis.status === "Partial evidence"
                              ? "partial"
                              : "unknown"}
                        label={axis.status}
                      />
                    </div>
                    <p className={styles.axisDescription}>{axis.description}</p>
                    <div
                      className={styles.coverageTrack}
                      role="progressbar"
                      aria-label={`${axis.name} evidence coverage`}
                      aria-valuenow={axis.covered}
                      aria-valuemin={0}
                      aria-valuemax={axis.expected}
                    >
                      <div
                        className={styles.coverageFill}
                        style={{ width: `${(axis.covered / axis.expected) * 100}%` }}
                      />
                    </div>
                    <p className={styles.axisNote}>{axis.note}</p>
                    <div className={styles.axisClaims}>
                      {axis.supportingClaims.slice(0, 2).map((claim) => (
                        <div key={claim.id} className={styles.miniClaim}>
                          <CheckCircle2 aria-hidden="true" />
                          <span>{claim.statement}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="evidence-title">
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Highest-confidence claims</span>
                  <h2 id="evidence-title">Strong evidence</h2>
                  <p>Only supported claims with high provenance trust are elevated here.</p>
                </div>
                <Link href={`/investor/projects/${opportunity.id}/evidence` as Route}>
                  Inspect every claim →
                </Link>
              </div>

              <ul className={styles.evidenceList}>
                {strongClaims.slice(0, 6).map((claim) => {
                  const linkedEvidence = getEvidenceForClaim(opportunity, claim)[0]?.evidence;
                  return (
                    <li key={claim.id} className={styles.evidenceItem}>
                      <span className={styles.evidenceIcon} aria-hidden="true">
                        <CheckCircle2 />
                      </span>
                      <div className={styles.evidenceCopy}>
                        <strong>{claim.statement}</strong>
                        <span>
                          {linkedEvidence?.sourceName ?? "Linked evidence"} · observed {formatDate(claim.observedAt)}
                        </span>
                      </div>
                      <StatusBadge status="supported" label={`Trust ${claim.trust.score}/100`} />
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className={styles.panel} aria-labelledby="unknowns-title">
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Not yet established</span>
                  <h2 id="unknowns-title">Unknowns and evidence gaps</h2>
                  <p>Missing evidence stays neutral. It is a diligence task, not a negative signal.</p>
                </div>
                <StatusBadge status="unknown" label={`${unknowns.length} open`} />
              </div>
              <ul className={styles.unknownList}>
                {unknowns.slice(0, 7).map((unknown, index) => (
                  <li key={`${unknown.predicate}-${index}`} className={styles.unknownItem}>
                    <CircleHelp aria-hidden="true" />
                    <span>{unknown.label}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.panel} aria-labelledby="contradictions-title">
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Conflicting records</span>
                  <h2 id="contradictions-title">Contradictions</h2>
                </div>
              </div>
              {opportunity.contradictions.length ? (
                opportunity.contradictions.map((contradiction) => {
                  const claim = opportunity.claims.find((item) => item.id === contradiction.claimId);
                  return (
                    <article key={contradiction.id} className={styles.contradictionCard}>
                      <div className={styles.contradictionTop}>
                        <strong>{claim?.statement ?? "Conflicting claim"}</strong>
                        <StatusBadge status="conflict" label={formatToken(contradiction.state)} />
                      </div>
                      <p>{contradiction.summary}</p>
                    </article>
                  );
                })
              ) : (
                <div className={styles.emptyState}>
                  <CheckCircle2 aria-hidden="true" />
                  <span>No contradictory evidence is linked in this snapshot. This does not mean the claim set is complete.</span>
                </div>
              )}
            </section>
          </div>

          <aside className={styles.sideColumn} aria-label="Diligence context">
            <section className={styles.sideCard} aria-labelledby="founders-title">
              <span className={styles.eyebrow}>People</span>
              <h3 id="founders-title">Founder team</h3>
              <div className={styles.founderList} style={{ marginTop: "0.85rem" }}>
                {opportunity.founders.map((founder) => (
                  <article key={founder.id} className={styles.founderCard}>
                    <span className={styles.founderAvatar} aria-hidden="true">{initials(founder.name)}</span>
                    <div className={styles.founderCopy}>
                      <strong>{founder.name}</strong>
                      <span>{founder.role}</span>
                      <span>{founder.location}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.sideCard} aria-labelledby="coverage-title">
              <span className={styles.eyebrow}>Evidence state</span>
              <h3 id="coverage-title">Coverage, not conviction</h3>
              <div className={styles.coverageDetails} style={{ marginTop: "0.85rem" }}>
                <div className={styles.coverageStat}>
                  <strong>{coverage.supportedClaims}</strong>
                  <span>supported claims</span>
                </div>
                <div className={styles.coverageStat}>
                  <strong>{coverage.partialClaims}</strong>
                  <span>partial claims</span>
                </div>
                <div className={styles.coverageStat}>
                  <strong>{coverage.unverifiedClaims}</strong>
                  <span>unverified claims</span>
                </div>
                <div className={styles.coverageStat}>
                  <strong>{coverage.contradictedClaims}</strong>
                  <span>contradicted claims</span>
                </div>
              </div>
            </section>

            <section className={styles.sideCard} aria-labelledby="sources-title">
              <span className={styles.eyebrow}>Provenance</span>
              <h3 id="sources-title">Sources</h3>
              <ul className={styles.sourceList} style={{ marginTop: "0.85rem" }}>
                {sources.map((source) => (
                  <li key={source.name} className={styles.sourceItem}>
                    <div>
                      <strong>{source.name}</strong>
                      <span>{source.type} · {formatDate(source.capturedAt)}</span>
                    </div>
                    <span className={styles.sourceCount}>{source.count} excerpt{source.count === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.sideCard} aria-labelledby="timeline-title">
              <span className={styles.eyebrow}>Recency</span>
              <h3 id="timeline-title">Evidence timeline</h3>
              <ol className={styles.timeline} style={{ marginTop: "0.85rem" }}>
                <li className={styles.timelineItem}>
                  <span className={styles.timelineDot} aria-hidden="true" />
                  <div className={styles.timelineCopy}>
                    <strong>Snapshot refreshed</strong>
                    <span>{formatDate(opportunity.updatedAt)}</span>
                  </div>
                </li>
                {sources.slice(0, 4).map((source) => (
                  <li key={source.name} className={styles.timelineItem}>
                    <span className={styles.timelineDot} aria-hidden="true" />
                    <div className={styles.timelineCopy}>
                      <strong>{source.type} captured</strong>
                      <span>{formatDate(source.capturedAt)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
