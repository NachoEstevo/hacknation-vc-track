import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Database,
  FileText,
  Github,
  Trophy,
  UserCheck,
  Globe,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Chip } from "@/components/ui/chip";
import {
  Avatar,
  DataBadge,
  EvaluationAxisCard,
  EvidenceRow,
  FounderScore,
  SectorTag,
  SourceChip,
  StageBadge,
  TimelineItem,
  type EvidenceTone,
} from "@/components/pencil";
import { DEMO_OPPORTUNITIES, getOpportunity } from "@/lib/demo";
import type { ClaimState, OpportunityDetail, SourceType } from "@/lib/domain";
import {
  CURRENT_STATUS_FIELDS,
  claimStateLabel,
  confidenceLevelFromTrust,
  findClaim,
  formatDate,
  formatToken,
  getClaimSummary,
  getDiligenceAxes,
  getEvidenceCoverage,
  getEvidenceForClaim,
  getStrongClaims,
  getTimeline,
  getUnknowns,
} from "../_lib/diligence";
import { ProjectActions } from "./project-actions";
import { ThesisFitCard } from "./thesis-fit";
import styles from "./diligence.module.css";

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

const SOURCE_ICONS: Record<SourceType, LucideIcon> = {
  deck: FileText,
  founder_submission: UserCheck,
  github: Github,
  hackathon: Trophy,
  public_registry: Building2,
  website: Globe,
};

function iconFor(sourceType: SourceType) {
  const Icon = SOURCE_ICONS[sourceType];
  return <Icon aria-hidden="true" />;
}

function claimTone(state: ClaimState): EvidenceTone {
  switch (state) {
    case "supported":
      return "verified";
    case "partially_supported":
      return "inference";
    case "unverified":
      return "unknown";
    case "contradicted":
      return "risk";
    case "stale":
      return "unknown";
  }
}

/** Maps a claim state (or the literal absence of a claim) to a badge tone/label. Missing evidence is always neutral, never negative. */
function summaryTone(state: ClaimState | "missing"): EvidenceTone {
  return state === "missing" ? "unknown" : claimTone(state);
}

function summaryLabel(state: ClaimState | "missing"): string {
  return state === "missing" ? "Insufficient evidence" : claimStateLabel(state);
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
  const grouped = new Map<string, { sourceType: SourceType; count: number; capturedAt: string }>();
  for (const evidence of opportunity.evidence) {
    const current = grouped.get(evidence.sourceName);
    grouped.set(evidence.sourceName, {
      sourceType: evidence.sourceType,
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
  const timeline = getTimeline(opportunity);
  const sources = sourceGroups(opportunity);
  const firstFounder = opportunity.founders[0];
  const problemClaim = findClaim(opportunity, "project.problem");
  const productClaim = findClaim(opportunity, "project.product");
  const problemEvidence = problemClaim ? getEvidenceForClaim(opportunity, problemClaim)[0]?.evidence : undefined;
  const productEvidence = productClaim ? getEvidenceForClaim(opportunity, productClaim)[0]?.evidence : undefined;
  const technicalFounderSummary = getClaimSummary(opportunity, "founder.technical");
  const evidenceHref = `/investor/projects/${opportunity.id}/evidence` as Route;

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
            <span className={styles.monogram} aria-hidden="true">
              {initials(opportunity.project.name)}
            </span>
            <div className={styles.identityCopy}>
              <div className={styles.identityRow}>
                <h2 id="project-title">{opportunity.project.name}</h2>
                <StageBadge label={formatToken(opportunity.project.stage)} />
              </div>
              <p className={styles.tagline}>
                {opportunity.project.tagline} · {firstFounder?.name ?? "Founder unknown"} ·{" "}
                {opportunity.company.city}, {opportunity.company.countryCode}
              </p>
              <div className={styles.chips} aria-label="Sector tags">
                {opportunity.project.sectorTags.map((sector) => (
                  <SectorTag key={sector} label={formatToken(sector)} />
                ))}
              </div>
            </div>
            <div className={styles.heroActions}>
              <ProjectActions projectId={opportunity.id} founderId={firstFounder?.id} />
            </div>
          </div>
          <p className={styles.summary}>{opportunity.project.summary}</p>
        </section>

        <div className={styles.workspace}>
          <div className={styles.mainColumn}>
            <section className={styles.panel} aria-labelledby="axes-title">
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Independent diligence lenses</span>
                  <h2 id="axes-title">Founder, market, and idea–market evidence</h2>
                  <p>
                    Each axis is read independently from real captured claims. Coverage describes
                    what is documented; it is never averaged into one company score.
                  </p>
                </div>
              </div>

              <div className={styles.axisGrid}>
                {axes.map((axis) => (
                  <EvaluationAxisCard
                    key={axis.name}
                    axis={axis.name}
                    status={axis.status}
                    confidenceLevel={axis.confidenceLevel}
                    evidenceCount={axis.evidenceCount}
                    note={axis.note}
                  />
                ))}
              </div>
              <p className={styles.axesNote}>
                Three separate reads, kept apart on purpose — they are not combined into a single score.
              </p>
            </section>

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
                  { label: "Problem", text: opportunity.project.problem, claim: problemClaim, evidence: problemEvidence },
                  { label: "Product", text: opportunity.project.product, claim: productClaim, evidence: productEvidence },
                ].map((item) => (
                  <article key={item.label} className={styles.problemProductCard}>
                    <div className={styles.problemProductTop}>
                      <span className={styles.eyebrow}>{item.label}</span>
                      <DataBadge
                        tone={summaryTone(item.claim?.state ?? "missing")}
                        label={summaryLabel(item.claim?.state ?? "missing")}
                      />
                    </div>
                    <p>{item.text}</p>
                    <span className={styles.problemProductSource}>
                      {item.evidence
                        ? `${item.evidence.sourceName} · captured ${formatDate(item.evidence.capturedAt)}`
                        : "No supporting source is linked."}
                    </span>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="team-title">
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>People</span>
                  <h2 id="team-title">Founder &amp; team</h2>
                  <p>Technical-execution evidence is shown exactly as captured, with its evidence state.</p>
                </div>
              </div>

              {opportunity.founderScore ? (
                <div className={styles.founderScoreRow}>
                  {opportunity.founderScore.score !== null ? (
                    <FounderScore value={opportunity.founderScore.score} />
                  ) : (
                    <DataBadge tone="unknown" label="Insufficient evidence for Founder Score" />
                  )}
                  <span className={styles.founderScoreCaption}>
                    {opportunity.founderScore.evidenceCoverage}% execution-evidence coverage ·{" "}
                    {formatToken(opportunity.founderScore.confidence)} confidence
                  </span>
                </div>
              ) : null}

              <div className={styles.founderList}>
                {opportunity.founders.map((founder, index) => (
                  <Link
                    key={founder.id}
                    href={`/investor/founders/${founder.id}` as Route}
                    className={styles.founderRow}
                  >
                    <Avatar name={founder.name} />
                    <div className={styles.founderCopy}>
                      <strong>{founder.name} — {founder.role}</strong>
                      <span>{founder.location}</span>
                    </div>
                    <DataBadge
                      tone={index === 0 ? summaryTone(technicalFounderSummary.state) : "unknown"}
                      label={index === 0
                        ? `Technical evidence · ${summaryLabel(technicalFounderSummary.state)}`
                        : "Insufficient evidence"}
                    />
                    <ArrowUpRight className={styles.founderRowIcon} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="status-title">
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Snapshot</span>
                  <h2 id="status-title">Current status</h2>
                  <p>Every field reflects a captured claim and its evidence state; missing fields stay neutral.</p>
                </div>
              </div>
              <div className={styles.statusGrid}>
                {CURRENT_STATUS_FIELDS.map((field) => {
                  const summary = getClaimSummary(opportunity, field.predicate);
                  return (
                    <div key={field.predicate} className={styles.statusCell}>
                      <span className={styles.statusCellLabel}>{field.label}</span>
                      <DataBadge tone={summaryTone(summary.state)} label={summaryLabel(summary.state)} />
                      <p className={styles.statusCellDetail}>{summary.detail}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="milestones-title">
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Recency</span>
                  <h2 id="milestones-title">Signals &amp; milestones</h2>
                  <p>Every entry is a captured evidence excerpt, ordered by capture date.</p>
                </div>
              </div>
              <div className={styles.timelineList}>
                {timeline.map((entry, index) => (
                  <TimelineItem
                    key={`${entry.sourceName}-${index}`}
                    date={entry.date}
                    title={entry.title}
                    sourceIcon={iconFor(entry.sourceType)}
                    sourceLabel={entry.sourceName}
                    isLast={index === timeline.length - 1}
                  />
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
                <Link href={evidenceHref}>Inspect every claim →</Link>
              </div>

              <div className={styles.evidenceRows}>
                {strongClaims.slice(0, 6).map((claim) => {
                  const linkedEvidence = getEvidenceForClaim(opportunity, claim)[0]?.evidence;
                  return (
                    <EvidenceRow
                      key={claim.id}
                      claim={claim.statement}
                      status="verified"
                      statusLabel={`Trust ${claim.trust.score}/100`}
                      quote={linkedEvidence?.excerpt}
                      sourceIcon={linkedEvidence ? iconFor(linkedEvidence.sourceType) : <FileText aria-hidden="true" />}
                      sourceLabel={linkedEvidence?.sourceName ?? "Linked evidence"}
                      sourceMeta={linkedEvidence ? formatToken(linkedEvidence.sourceType) : undefined}
                      capturedAt={linkedEvidence ? formatDate(linkedEvidence.capturedAt) : formatDate(claim.observedAt)}
                      confidenceLevel={confidenceLevelFromTrust(claim.trust.score)}
                      sourceUrl={linkedEvidence?.sourceUrl ?? undefined}
                    />
                  );
                })}
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="unknowns-title">
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Not yet established</span>
                  <h2 id="unknowns-title">Unknowns and evidence gaps</h2>
                  <p>Missing evidence stays neutral. It is a diligence task, not a negative signal.</p>
                </div>
                <DataBadge tone="unknown" label={`${unknowns.length} open`} />
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
                        <DataBadge tone="risk" label={formatToken(contradiction.state)} />
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
            <ThesisFitCard opportunity={opportunity} />

            <section className={styles.sideCard} aria-labelledby="evidence-summary-title">
              <span className={styles.eyebrow}>Evidence</span>
              <h3 id="evidence-summary-title">Evidence summary</h3>
              <ul className={styles.evidenceSummaryList}>
                <li className={styles.evidenceSummaryRow}>
                  <span className={styles.evidenceSummaryDot} style={{ background: "var(--verified)" }} aria-hidden="true" />
                  <strong>{coverage.supportedClaims}</strong>
                  <span>supported claims</span>
                </li>
                <li className={styles.evidenceSummaryRow}>
                  <span className={styles.evidenceSummaryDot} style={{ background: "var(--inference)" }} aria-hidden="true" />
                  <strong>{coverage.partialClaims}</strong>
                  <span>partially supported</span>
                </li>
                <li className={styles.evidenceSummaryRow}>
                  <span className={styles.evidenceSummaryDot} style={{ background: "var(--unknown)" }} aria-hidden="true" />
                  <strong>{coverage.unverifiedClaims}</strong>
                  <span>unverified</span>
                </li>
                <li className={styles.evidenceSummaryRow}>
                  <span className={styles.evidenceSummaryDot} style={{ background: "var(--risk)" }} aria-hidden="true" />
                  <strong>{coverage.contradictedClaims}</strong>
                  <span>contradicted</span>
                </li>
              </ul>
              <Link href={evidenceHref} className={styles.railLink}>
                Open evidence panel <ArrowUpRight aria-hidden="true" />
              </Link>
            </section>

            {opportunity.contradictions.length ? (
              <section className={styles.railAlert} data-tone="risk" aria-labelledby="contradiction-teaser-title">
                <TriangleAlert aria-hidden="true" />
                <div>
                  <strong id="contradiction-teaser-title">
                    {opportunity.contradictions.length} contradiction{opportunity.contradictions.length === 1 ? "" : "s"}
                  </strong>
                  <p>{opportunity.contradictions[0]?.summary}</p>
                </div>
              </section>
            ) : null}

            <section className={styles.railAlert} data-tone="unknown" aria-labelledby="missing-teaser-title">
              <CircleHelp aria-hidden="true" />
              <div>
                <strong id="missing-teaser-title">{unknowns.length} fields open</strong>
                <p>{unknowns[0]?.label ?? "No open evidence gaps in this snapshot."}</p>
              </div>
            </section>

            <section className={styles.sideCard} aria-labelledby="sources-title">
              <span className={styles.eyebrow}>Provenance</span>
              <h3 id="sources-title">Sources · {opportunity.evidence.length}</h3>
              <div className={styles.sourceChips}>
                {sources.map((source) => (
                  <SourceChip
                    key={source.name}
                    icon={iconFor(source.sourceType)}
                    label={source.name}
                    meta={`${source.count} · ${formatDate(source.capturedAt)}`}
                  />
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
