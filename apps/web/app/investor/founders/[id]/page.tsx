import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CircleHelp,
  Database,
  FileText,
  Github,
  Globe,
  Trophy,
  TriangleAlert,
  UserCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Chip } from "@/components/ui/chip";
import {
  Avatar,
  ButtonLink,
  ConfidenceBadge,
  DataBadge,
  SectorTag,
  SourceChip,
  StageBadge,
  TimelineItem,
  type EvidenceTone,
} from "@/components/pencil";
import { DEMO_OPPORTUNITIES } from "@/lib/demo";
import type {
  ClaimState,
  FounderScoreFactor,
  OpportunityDetail,
  SourceType,
} from "@/lib/domain";
import {
  formatDate,
  formatToken,
  getEvidenceCoverage,
  getEvidenceForClaim,
  getTimeline,
} from "../../projects/_lib/diligence";
import styles from "./page.module.css";

interface FounderProfilePageProps {
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

/** Maps a Founder Score factor's evidence state to a +/-/neutral reading. `missing` is intentionally neutral, never negative. */
function factorSign(state: FounderScoreFactor["state"]): { symbol: string; tone: EvidenceTone } {
  switch (state) {
    case "supported":
      return { symbol: "+", tone: "verified" };
    case "partially_supported":
      return { symbol: "±", tone: "inference" };
    case "contradicted":
      return { symbol: "–", tone: "risk" };
    case "unverified":
    case "stale":
    case "missing":
    default:
      return { symbol: "·", tone: "unknown" };
  }
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

/**
 * There is no independent founder table in this demo — a founder profile is resolved by
 * scanning the opportunities for a project that lists this founder id. If undr later adds a
 * standalone founders table, this lookup becomes a direct query instead of a scan.
 */
function findFounderContext(id: string) {
  const opportunity = DEMO_OPPORTUNITIES.find((candidate) => (
    candidate.founders.some((founder) => founder.id === id)
  )) ?? null;
  const founder = opportunity?.founders.find((candidate) => candidate.id === id) ?? null;
  return { opportunity, founder };
}

export function generateStaticParams() {
  return DEMO_OPPORTUNITIES.flatMap((opportunity) => (
    opportunity.founders.map((founder) => ({ id: founder.id }))
  ));
}

export async function generateMetadata({ params }: FounderProfilePageProps): Promise<Metadata> {
  const { id } = await params;
  const { founder } = findFounderContext(id);
  return {
    title: founder ? `${founder.name} · Founder profile` : "Founder not found",
    description: founder ? `${founder.role} · ${founder.location}` : undefined,
  };
}

export default async function FounderProfilePage({ params }: FounderProfilePageProps) {
  const { id } = await params;
  const { opportunity, founder } = findFounderContext(id);
  if (!opportunity || !founder) notFound();

  const isPrimaryFounder = opportunity.founderScore?.founderId === founder.id;
  const founderScore = isPrimaryFounder ? opportunity.founderScore : null;
  const technicalClaim = opportunity.claims.find((claim) => (
    claim.predicate === "founder.technical" && claim.subjectId === founder.id
  )) ?? null;
  const technicalEvidence = technicalClaim ? getEvidenceForClaim(opportunity, technicalClaim) : [];
  const primaryTechnicalEvidence = technicalEvidence[0]?.evidence ?? null;
  const timeline = getTimeline(opportunity, 6);
  const coverage = getEvidenceCoverage(opportunity);
  const sources = sourceGroups(opportunity);
  const projectHref = `/investor/projects/${opportunity.id}` as Route;
  const evidenceHref = `/investor/projects/${opportunity.id}/evidence` as Route;
  const inviteHref = `/investor/founders/${founder.id}/invite?project=${opportunity.id}` as Route;
  const relevantContradictions = technicalClaim
    ? opportunity.contradictions.filter((contradiction) => contradiction.claimId === technicalClaim.id)
    : [];

  return (
    <AppShell
      eyebrow="Founder profile"
      title={founder.name}
      headerAside={<Chip tone="muted" size="sm">{opportunity.dataLabel}</Chip>}
      actions={(
        <Link href={projectHref} className={styles.backLink}>
          <ArrowLeft aria-hidden="true" /> Back to project brief
        </Link>
      )}
    >
      <div className={styles.page}>
        <div className={styles.demoNotice} role="note">
          <Database aria-hidden="true" />
          <span>
            This is a <strong>synthetic_demo</strong> founder profile, assembled from the evidence
            captured for {opportunity.project.name}. Names, excerpts, and claims are fictional; no
            statement should be treated as real-world diligence.
          </span>
        </div>

        <section className={styles.hero} aria-labelledby="founder-name">
          <Avatar name={founder.name} />
          <div className={styles.heroCopy}>
            <div className={styles.nameRow}>
              <h2 id="founder-name">{founder.name}</h2>
              {technicalClaim ? (
                <DataBadge
                  tone={claimTone(technicalClaim.state)}
                  label={`Technical evidence · ${formatToken(technicalClaim.state)}`}
                />
              ) : (
                <DataBadge tone="unknown" label="Insufficient evidence" />
              )}
            </div>
            <p className={styles.subline}>
              {founder.role} · {opportunity.project.name} · {founder.location}
            </p>
            <div className={styles.tags}>
              {opportunity.project.sectorTags.map((sector) => (
                <SectorTag key={sector} label={formatToken(sector)} />
              ))}
              <StageBadge label={formatToken(opportunity.project.stage)} />
            </div>
          </div>
          <div className={styles.heroActions}>
            <ButtonLink href={inviteHref} variant="primary" leadingIcon={<UserPlus aria-hidden="true" />}>
              Prepare invitation
            </ButtonLink>
            <ButtonLink href={projectHref} variant="secondary">
              View project brief
            </ButtonLink>
          </div>
        </section>

        <div className={styles.columns}>
          <div className={styles.main}>
            <section className={styles.panel} aria-labelledby="summary-title">
              <span className={styles.eyebrow}>Summary</span>
              <h3 id="summary-title">Persistent founder profile</h3>
              <p>
                {founder.name} is listed as {founder.role} on {opportunity.project.name}, a{" "}
                {formatToken(opportunity.project.stage)}-stage team of {opportunity.project.teamSize}{" "}
                based in {opportunity.company.city}, {opportunity.company.countryCode}. This profile is
                meant to persist independently of any single deal.
              </p>
              {!isPrimaryFounder ? (
                <p className={styles.note}>
                  <CircleHelp aria-hidden="true" />
                  <span>
                    Insufficient evidence: in this demo, only the primary technical founder linked to a
                    project has a direct, sourced evidence trail. Co-founder claims are not separately captured.
                  </span>
                </p>
              ) : null}
            </section>

            <section className={styles.panel} aria-labelledby="experience-title">
              <span className={styles.eyebrow}>Experience</span>
              <h3 id="experience-title">Technical execution evidence</h3>
              {technicalClaim ? (
                <div className={styles.experienceRow}>
                  <div className={styles.experienceCopy}>
                    <p>{technicalClaim.statement}</p>
                    {primaryTechnicalEvidence ? (
                      <SourceChip
                        icon={iconFor(primaryTechnicalEvidence.sourceType)}
                        label={primaryTechnicalEvidence.sourceName}
                        meta={formatDate(primaryTechnicalEvidence.capturedAt)}
                      />
                    ) : null}
                  </div>
                  <DataBadge tone={claimTone(technicalClaim.state)} label={formatToken(technicalClaim.state)} />
                </div>
              ) : (
                <div className={styles.unknownCard}>
                  <CircleHelp aria-hidden="true" />
                  <span>No technical-execution claim is captured for this founder.</span>
                </div>
              )}
              <p className={styles.note}>
                <CircleHelp aria-hidden="true" />
                <span>
                  Insufficient evidence for prior employers, roles, or education — this demo only
                  captures claims tied to the founder&apos;s current project.
                </span>
              </p>
            </section>

            <section className={styles.panel} aria-labelledby="projects-title">
              <span className={styles.eyebrow}>Projects</span>
              <h3 id="projects-title">Current &amp; previous projects</h3>
              <Link href={projectHref} className={styles.projectCard}>
                <div className={styles.projectCopy}>
                  <div className={styles.projectTop}>
                    <span className={styles.projectName}>{opportunity.project.name}</span>
                    <StageBadge label={formatToken(opportunity.project.stage)} />
                  </div>
                  <p>{opportunity.project.tagline} · Current, active</p>
                </div>
                <ArrowUpRight aria-hidden="true" />
              </Link>
              <div className={styles.unknownCard}>
                <CircleHelp aria-hidden="true" />
                <span>
                  Insufficient evidence for previous projects. undr does not yet maintain an independent
                  founder history across ventures.
                </span>
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="milestones-title">
              <span className={styles.eyebrow}>Recency</span>
              <h3 id="milestones-title">Milestones &amp; signals</h3>
              <p className={styles.panelHint}>
                Signals captured for {opportunity.project.name}, the project currently linked to this founder.
              </p>
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

            {relevantContradictions.length ? (
              <section className={styles.contradictionPanel} aria-labelledby="contradiction-title">
                <TriangleAlert aria-hidden="true" />
                <div>
                  <strong id="contradiction-title">
                    {relevantContradictions.length} contradiction{relevantContradictions.length === 1 ? "" : "s"} found
                  </strong>
                  <p>{relevantContradictions[0]?.summary}</p>
                </div>
              </section>
            ) : null}

            <section className={styles.panel} aria-labelledby="unknown-title">
              <span className={styles.eyebrow}>Not yet established</span>
              <h3 id="unknown-title">Still unknown</h3>
              <ul className={styles.unknownList}>
                <li><CircleHelp aria-hidden="true" /><span>Prior work history and education</span></li>
                <li><CircleHelp aria-hidden="true" /><span>Published papers or research</span></li>
                <li><CircleHelp aria-hidden="true" /><span>Hackathon history beyond linked evidence</span></li>
                <li><CircleHelp aria-hidden="true" /><span>Verified contact channel for outreach</span></li>
              </ul>
            </section>
          </div>

          <aside className={styles.rail} aria-label="Founder Score and evidence context">
            <section className={styles.scoreCard} aria-labelledby="score-title">
              <div className={styles.scoreTop}>
                <span className={styles.eyebrow}>Founder Score</span>
                {founderScore ? <ConfidenceBadge level={founderScore.confidence} /> : null}
              </div>

              {founderScore && founderScore.score !== null ? (
                <>
                  <div className={styles.scoreNumRow}>
                    <span className={styles.scoreBig}>{founderScore.score}</span>
                    <span className={styles.scoreOf}>/ 100</span>
                  </div>
                  <p className={styles.scoreInterpretation}>{founderScore.interpretation}</p>
                  <div className={styles.scoreTrack} aria-hidden="true">
                    <div className={styles.scoreFill} style={{ width: `${founderScore.score}%` }} />
                  </div>

                  <span className={styles.whyLabel} id="score-title">Why this score</span>
                  {founderScore.factors.map((factor) => {
                    const sign = factorSign(factor.state);
                    return (
                      <div key={factor.id} className={styles.whyRow}>
                        <span className={styles.whySign} data-tone={sign.tone}>{sign.symbol}</span>
                        <span className={styles.whyText}>
                          {factor.label}
                          {factor.state === "missing"
                            ? " — insufficient evidence, not yet assessed"
                            : ` — ${formatToken(factor.state)} (${factor.evidenceStrength}/100 evidence strength)`}
                        </span>
                      </div>
                    );
                  })}

                  <div className={styles.evolutionNote}>
                    <CircleHelp aria-hidden="true" />
                    <span>
                      Insufficient evidence for score history. This is a single snapshot calculated{" "}
                      {formatDate(founderScore.calculatedAt)}; undr does not track Founder Score changes
                      over time in this demo.
                    </span>
                  </div>
                </>
              ) : (
                <div className={styles.unknownCard}>
                  <CircleHelp aria-hidden="true" />
                  <span>
                    Insufficient evidence for Founder Score.{" "}
                    {!isPrimaryFounder
                      ? "Only the primary technical founder linked to a project is scored in this demo."
                      : "Not enough execution evidence has been captured yet."}
                  </span>
                </div>
              )}
            </section>

            <section className={styles.sideCard} aria-labelledby="evidence-summary-title">
              <span className={styles.eyebrow}>Evidence</span>
              <h3 id="evidence-summary-title">Linked project evidence</h3>
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
