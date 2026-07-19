import type { Metadata } from "next";
import { notFound } from "next/navigation";
import clsx from "clsx";
import {
  Building2,
  FileSearch,
  FileText,
  Github,
  Globe,
  Trophy,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SourceChip, type EvidenceTone } from "@/components/pencil";
import { DEMO_OPPORTUNITIES, getOpportunity } from "@/lib/demo";
import type { ClaimRecord, OpportunityDetail, SourceType } from "@/lib/domain";
import {
  claimStateLabel,
  findClaim,
  formatDate,
  formatToken,
  getEvidenceForClaim,
  getMemoStrengths,
  getMemoWeaknesses,
  getStrongClaims,
  getUnknowns,
} from "../../_lib/diligence";
import { MemoActions } from "./memo-actions";
import styles from "./memo.module.css";

interface MemoPageProps {
  params: Promise<{ id: string }>;
}

const TONE_CLASS: Record<EvidenceTone, string> = {
  verified: styles.toneVerified,
  inference: styles.toneInference,
  risk: styles.toneRisk,
  unknown: styles.toneUnknown,
  "founder-provided": styles.toneFounderProvided,
  external: styles.toneExternal,
};

const SOURCE_TYPE_META: Record<SourceType, { icon: LucideIcon; label: string }> = {
  github: { icon: Github, label: "GitHub" },
  founder_submission: { icon: UserCheck, label: "Founder-provided" },
  deck: { icon: FileText, label: "Pitch deck" },
  hackathon: { icon: Trophy, label: "Hackathon" },
  public_registry: { icon: Building2, label: "Public registry" },
  website: { icon: Globe, label: "Website" },
};

/** Trailing qualifier appended to a claim-derived sentence — never lets a statement read as fully verified when it isn't. */
function qualifier(claim: ClaimRecord | undefined): string {
  if (!claim) return " (not available)";
  if (claim.state === "supported") return "";
  return ` (${claimStateLabel(claim.state).toLowerCase()})`;
}

function claimTone(opportunity: OpportunityDetail, claim: ClaimRecord | undefined): EvidenceTone {
  if (!claim) return "unknown";
  if (claim.state === "contradicted") return "risk";
  if (claim.state === "unverified" || claim.state === "stale") return "unknown";
  const links = getEvidenceForClaim(opportunity, claim);
  const onlyFounderProvided = links.length > 0
    && links.every((link) => link.evidence.sourceType === "founder_submission");
  if (onlyFounderProvided) return "founder-provided";
  return claim.state === "partially_supported" ? "inference" : "verified";
}

function kpiBadge(opportunity: OpportunityDetail, claim: ClaimRecord | undefined): { tone: EvidenceTone; label: string } {
  if (!claim) return { tone: "unknown", label: "Not available" };
  const tone = claimTone(opportunity, claim);
  return { tone, label: tone === "founder-provided" ? "Founder-provided" : claimStateLabel(claim.state) };
}

function formatClaimValue(value: ClaimRecord["value"]): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(formatToken).join(", ");
  return formatToken(value);
}

function evidenceLinkCount(claims: (ClaimRecord | undefined)[]): number {
  const ids = new Set<string>();
  for (const claim of claims) {
    if (!claim) continue;
    for (const link of claim.evidence) ids.add(link.evidenceId);
  }
  return ids.size;
}

function buildTeamNarrative(opportunity: OpportunityDetail, technicalClaim: ClaimRecord | undefined): string {
  const { founders, project, founderScore } = opportunity;
  if (founders.length === 0) {
    return "No founders are recorded for this snapshot; team composition is not available.";
  }
  const [primary, ...rest] = founders;
  const namedPart = rest.length
    ? `${primary.name} (${primary.role}, ${primary.location}), with ${rest.map((founder) => `${founder.name} (${founder.role})`).join(", ")}.`
    : `${primary.name} (${primary.role}, ${primary.location}).`;
  const unconfirmedCount = Math.max(project.teamSize - founders.length, 0);
  const unconfirmedPart = unconfirmedCount > 0
    ? ` Team size is reported as ${project.teamSize}; ${unconfirmedCount} additional member${unconfirmedCount === 1 ? "" : "s"} ${unconfirmedCount === 1 ? "is" : "are"} not individually confirmed.`
    : "";
  const technicalPart = technicalClaim
    ? ` ${technicalClaim.statement}${qualifier(technicalClaim)}${technicalClaim.state === "supported" ? "" : "."}`
    : " No claim about technical founder status is captured.";
  const scorePart = founderScore
    ? ` Founder Score: ${founderScore.score === null ? "not enough evidence" : `${founderScore.score}/100`} (${founderScore.confidence} confidence).`
    : " Founder Score is not available for this snapshot.";
  return `${namedPart}${technicalPart}${scorePart}${unconfirmedPart}`;
}

interface RiskItem {
  title: string;
  note: string;
}

function buildRiskItems(opportunity: OpportunityDetail, weakClaims: ClaimRecord[]): RiskItem[] {
  if (opportunity.contradictions.length > 0) {
    return opportunity.contradictions.map((contradiction) => {
      const claim = opportunity.claims.find((item) => item.id === contradiction.claimId);
      return { title: claim?.statement ?? "Conflicting claim", note: contradiction.summary };
    });
  }
  if (weakClaims.length > 0) {
    return weakClaims.map((claim) => ({
      title: claim.statement,
      note: `${claimStateLabel(claim.state)} — treat this field as unresolved until independently corroborated.`,
    }));
  }
  return [{
    title: "No contradictions or unresolved high-trust claims recorded",
    note: "Absence of risk signals in this snapshot has not been independently verified.",
  }];
}

function SectionHead({ id, title, evidenceCount }: { id: string; title: string; evidenceCount?: number }) {
  return (
    <div className={styles.sectionHead}>
      <h2 id={id} className={styles.sectionTitle}>{title}</h2>
      <div className={styles.sectionSpacer} aria-hidden="true" />
      {evidenceCount !== undefined ? (
        <span className={styles.evidencePill}>
          <FileSearch aria-hidden="true" />
          {evidenceCount} evidence
        </span>
      ) : null}
    </div>
  );
}

function SnapshotCell({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={styles.snapshotCell}>
      <span className={styles.snapshotKey}>{label}</span>
      <strong className={clsx(styles.snapshotValue, muted && styles.snapshotValueMuted)}>{value}</strong>
    </div>
  );
}

function KpiTile({
  value,
  label,
  badge,
  muted,
}: {
  value: string;
  label: string;
  badge: { tone: EvidenceTone; label: string };
  muted?: boolean;
}) {
  return (
    <div className={styles.tkTile}>
      <span className={clsx(styles.tkNum, value.length > 10 && styles.tkNumCompact, muted && styles.tkNumMuted)}>
        {value}
      </span>
      <span className={styles.tkLabel}>{label}</span>
      <span className={clsx(styles.tkBadge, TONE_CLASS[badge.tone])}>{badge.label}</span>
    </div>
  );
}

export function generateStaticParams() {
  return DEMO_OPPORTUNITIES.map((opportunity) => ({ id: opportunity.id }));
}

export async function generateMetadata({ params }: MemoPageProps): Promise<Metadata> {
  const { id } = await params;
  const opportunity = getOpportunity(id);
  return { title: opportunity ? `${opportunity.project.name} memo` : "Memo not found" };
}

export default async function MemoPage({ params }: MemoPageProps) {
  const { id } = await params;
  const opportunity = getOpportunity(id);
  if (!opportunity) notFound();

  const problemClaim = findClaim(opportunity, "project.problem");
  const productClaim = findClaim(opportunity, "project.product");
  const tractionClaim = findClaim(opportunity, "project.traction");
  const workingDemoClaim = findClaim(opportunity, "project.working_demo");
  const teamSizeClaim = findClaim(opportunity, "project.team_size");
  const technicalClaim = findClaim(opportunity, "founder.technical");
  const raisingClaim = findClaim(opportunity, "project.raising");
  const hackathonClaim = findClaim(opportunity, "project.hackathon_origin");

  const strongClaims = getStrongClaims(opportunity);
  const unknowns = getUnknowns(opportunity);
  const weakClaims = opportunity.claims.filter((claim) => claim.state !== "supported").slice(0, 3);
  const strengths = getMemoStrengths(opportunity);
  const weaknesses = getMemoWeaknesses(opportunity);

  const hypothesisClaims = strongClaims.slice(0, 2);
  const analysisBasis = hypothesisClaims.map((claim) => claim.statement).join(" ");
  const hypothesisText = analysisBasis
    ? `${analysisBasis} Together, these signals justify a founder conversation to test whether demonstrated execution can translate into durable usage and thesis fit.`
    : "The captured evidence is not sufficient to form a thesis hypothesis. Gather direct product and customer evidence before interpreting the opportunity.";

  const opportunitiesText = [
    `Testing whether ${opportunity.project.sectorTags.map(formatToken).join(" / ") || "the covered sector"} fits the fund's explicit thesis could unlock conviction.`,
    `A founder evidence request could resolve ${unknowns.length} open field${unknowns.length === 1 ? "" : "s"} without treating them as a negative signal.`,
  ].join(" ");
  const threatsText = opportunity.contradictions.length
    ? opportunity.contradictions.map((item) => item.summary).join(" ")
    : "The current snapshot may be incomplete and needs independent customer corroboration.";

  const problemSentence = `${opportunity.project.problem}${qualifier(problemClaim)}`;
  const productSentence = `${opportunity.project.product}${qualifier(productClaim)}`;
  const demoSentence = workingDemoClaim
    ? `${workingDemoClaim.statement}${qualifier(workingDemoClaim)}${workingDemoClaim.state === "supported" ? "" : "."}`
    : "Working demo status is not available for this snapshot.";
  const problemProductText = `${problemSentence} ${productSentence} ${demoSentence}`;

  const productStatusValue = !workingDemoClaim
    ? "Not available"
    : workingDemoClaim.value === true
      ? "Working demo"
      : workingDemoClaim.value === false
        ? "No working demo"
        : formatClaimValue(workingDemoClaim.value);

  const teamNarrative = buildTeamNarrative(opportunity, technicalClaim);
  const riskItems = buildRiskItems(opportunity, weakClaims);
  const riskEvidenceCount = opportunity.contradictions.length > 0
    ? new Set(opportunity.contradictions.flatMap((item) => item.evidenceIds)).size
    : evidenceLinkCount(weakClaims);

  const unknownLabels = unknowns.map((item) => item.label);
  const shownUnknowns = unknownLabels.slice(0, 6);
  const extraUnknowns = unknownLabels.length - shownUnknowns.length;

  const sourceCounts = new Map<SourceType, number>();
  for (const evidence of opportunity.evidence) {
    sourceCounts.set(evidence.sourceType, (sourceCounts.get(evidence.sourceType) ?? 0) + 1);
  }

  const stepItems = [
    ...(opportunity.contradictions.length
      ? [`Resolve the open contradiction: ${opportunity.contradictions[0].summary}`]
      : []),
    ...unknowns.slice(0, 3).map((item) => `Request evidence to resolve: ${item.label}`),
    "Re-check every cited source before sharing an investment recommendation.",
  ].slice(0, 5);

  const founded = hackathonClaim
    ? `${hackathonClaim.statement}${qualifier(hackathonClaim)}`
    : "Not available — no founding date is captured.";
  const teamCell = (() => {
    const founders = opportunity.founders;
    if (founders.length === 0) return "Not available — no founders recorded.";
    const extra = founders.length > 1 ? ` + ${founders.length - 1}` : "";
    const unconfirmed = opportunity.project.teamSize - founders.length;
    return `${founders[0].name}${extra}${unconfirmed > 0 ? ` (${unconfirmed} unconfirmed)` : ""}`;
  })();
  const productCell = workingDemoClaim
    ? `${productStatusValue} · ${claimStateLabel(workingDemoClaim.state).toLowerCase()}`
    : "Not available";
  const ask = raisingClaim
    ? `${raisingClaim.statement}${qualifier(raisingClaim)}`
    : "Not available — fundraising status not captured.";

  const founderScoreBadge: { tone: EvidenceTone; label: string } = opportunity.founderScore
    ? {
        tone: opportunity.founderScore.confidence === "high"
          ? "verified"
          : opportunity.founderScore.confidence === "medium"
            ? "inference"
            : "unknown",
        label: `${formatToken(opportunity.founderScore.confidence)} confidence`,
      }
    : { tone: "unknown", label: "Not available" };

  return (
    <AppShell hideHeader>
      <div className={styles.page}>
        <div className={styles.column}>
          <MemoActions projectId={opportunity.id} evidenceCount={opportunity.evidence.length} />

          <article className={styles.doc} aria-labelledby="memo-title">
            <p className={styles.kicker}>
              INVESTMENT MEMO · DRAFT · {formatDate(opportunity.updatedAt).toUpperCase()} · {formatToken(opportunity.dataLabel).toUpperCase()}
            </p>
            <h1 id="memo-title" className={styles.title}>
              {opportunity.project.name} — {opportunity.project.tagline}
            </h1>

            <div className={styles.snapshot}>
              <div className={styles.snapshotRow}>
                <SnapshotCell label="FOUNDED" value={founded} muted={!hackathonClaim} />
                <SnapshotCell label="LOCATION" value={`${opportunity.company.city}, ${opportunity.company.countryCode}`} />
                <SnapshotCell label="STAGE" value={formatToken(opportunity.project.stage)} />
              </div>
              <div className={styles.snapshotRow}>
                <SnapshotCell label="TEAM" value={teamCell} />
                <SnapshotCell label="PRODUCT" value={productCell} muted={!workingDemoClaim} />
                <SnapshotCell label="ASK" value={ask} muted={!raisingClaim} />
              </div>
            </div>

            <section className={styles.section} aria-labelledby="hypothesis-title">
              <SectionHead id="hypothesis-title" title="Investment hypothesis" evidenceCount={evidenceLinkCount(hypothesisClaims)} />
              <p className={styles.analysisNote}>Analysis — synthesizes captured claims; not itself an individually sourced claim.</p>
              <p className={styles.bodyText}>{hypothesisText}</p>
            </section>

            <section className={styles.section} aria-labelledby="swot-title">
              <SectionHead
                id="swot-title"
                title="SWOT"
                evidenceCount={evidenceLinkCount([...strongClaims.slice(0, 4), ...weakClaims])}
              />
              <div className={styles.swotGrid}>
                <div className={styles.swotRow}>
                  <div className={styles.swotCard}>
                    <span className={clsx(styles.swotLabel, styles.toneVerified)}>STRENGTHS · EVIDENCE</span>
                    <p className={styles.swotBody}>{strengths.join(" ")}</p>
                  </div>
                  <div className={styles.swotCard}>
                    <span className={clsx(styles.swotLabel, styles.toneRisk)}>WEAKNESSES · EVIDENCE GAPS</span>
                    <p className={styles.swotBody}>{weaknesses.join(" ")}</p>
                  </div>
                </div>
                <div className={styles.swotRow}>
                  <div className={styles.swotCard}>
                    <span className={clsx(styles.swotLabel, styles.toneExternal)}>OPPORTUNITIES · ANALYSIS</span>
                    <p className={styles.swotBody}>{opportunitiesText}</p>
                  </div>
                  <div className={styles.swotCard}>
                    <span className={clsx(styles.swotLabel, styles.toneInference)}>THREATS · UNRESOLVED</span>
                    <p className={styles.swotBody}>{threatsText}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="problem-product-title">
              <SectionHead
                id="problem-product-title"
                title="Problem & product"
                evidenceCount={evidenceLinkCount([problemClaim, productClaim, workingDemoClaim])}
              />
              <p className={styles.bodyText}>{problemProductText}</p>
            </section>

            <section className={styles.section} aria-labelledby="traction-title">
              <SectionHead
                id="traction-title"
                title="Traction & KPIs"
                evidenceCount={evidenceLinkCount([tractionClaim, teamSizeClaim, workingDemoClaim])}
              />
              <div className={styles.tkRow}>
                <KpiTile
                  value={`${opportunity.project.teamSize}`}
                  label="people on team"
                  badge={kpiBadge(opportunity, teamSizeClaim)}
                  muted={!teamSizeClaim}
                />
                <KpiTile
                  value={tractionClaim ? formatClaimValue(tractionClaim.value) : "Not available"}
                  label="traction signal"
                  badge={kpiBadge(opportunity, tractionClaim)}
                  muted={!tractionClaim}
                />
                <KpiTile
                  value={productStatusValue}
                  label="product status"
                  badge={kpiBadge(opportunity, workingDemoClaim)}
                  muted={!workingDemoClaim}
                />
                <KpiTile
                  value={
                    opportunity.founderScore
                      ? opportunity.founderScore.score === null ? "N/A" : `${opportunity.founderScore.score}/100`
                      : "Not available"
                  }
                  label="Founder Score"
                  badge={founderScoreBadge}
                  muted={!opportunity.founderScore || opportunity.founderScore.score === null}
                />
              </div>
              <p className={styles.tkNote}>
                All figures reflect the {opportunity.dataLabel} snapshot captured {formatDate(opportunity.updatedAt)}.
                Founder-provided figures are not independently verified.
              </p>
            </section>

            <section className={styles.section} aria-labelledby="team-title">
              <SectionHead
                id="team-title"
                title="Team"
                evidenceCount={evidenceLinkCount([technicalClaim, teamSizeClaim])}
              />
              <p className={styles.bodyText}>{teamNarrative}</p>
            </section>

            <section className={styles.section} aria-labelledby="risks-title">
              <SectionHead id="risks-title" title="Risks" evidenceCount={riskEvidenceCount} />
              <div className={styles.riskList}>
                {riskItems.map((item) => (
                  <div key={item.title} className={styles.riskRow}>
                    <span className={styles.riskDot} aria-hidden="true" />
                    <div className={styles.riskCol}>
                      <span className={styles.riskTitle}>{item.title}</span>
                      <p className={styles.riskNote}>
                        {item.note} · <a className={styles.riskLink} href="#sources-title">evidence →</a>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.section} aria-labelledby="contradictions-title">
              <SectionHead id="contradictions-title" title="Contradictions & missing information" />
              <div className={styles.cmRow}>
                <div className={clsx(styles.cmCard, styles.cmContra)}>
                  <span className={styles.cmLabel}>
                    {opportunity.contradictions.length
                      ? `${opportunity.contradictions.length} CONTRADICTION${opportunity.contradictions.length === 1 ? "" : "S"}`
                      : "NO CONTRADICTIONS RECORDED"}
                  </span>
                  <p className={styles.cmBody}>
                    {contradictionSummaries(opportunity)}
                  </p>
                </div>
                <div className={clsx(styles.cmCard, styles.cmMissing)}>
                  <span className={styles.cmLabel}>STILL UNKNOWN ({unknownLabels.length})</span>
                  <p className={styles.cmBody}>
                    {shownUnknowns.join(" · ")}{extraUnknowns > 0 ? ` · +${extraUnknowns} more open field${extraUnknowns === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="sources-title">
              <SectionHead id="sources-title" title="Sources" />
              <div className={styles.sourcesRow}>
                {opportunity.evidence.length === 0 ? (
                  <p className={styles.bodyText}>No sources are captured for this snapshot.</p>
                ) : (
                  [...sourceCounts.entries()].map(([sourceType, count]) => {
                    const meta = SOURCE_TYPE_META[sourceType];
                    const Icon = meta.icon;
                    return <SourceChip key={sourceType} icon={<Icon aria-hidden="true" />} label={meta.label} meta={count} />;
                  })
                )}
              </div>
            </section>

            <section className={styles.section} aria-labelledby="next-steps-title">
              <SectionHead id="next-steps-title" title="Next steps" />
              <div className={styles.stepsList}>
                {stepItems.map((step, index) => (
                  <div key={step} className={styles.step}>
                    <span className={styles.stepNum} aria-hidden="true">{index + 1}</span>
                    <p className={styles.stepText}>{step}</p>
                  </div>
                ))}
              </div>
            </section>

            <p className={styles.footerNote}>
              Generated from {opportunity.dataLabel} data · evidence snapshot {formatDate(opportunity.updatedAt)} ·
              this memo preserves unknowns and does not infer missing metrics.
            </p>
          </article>
        </div>
      </div>
    </AppShell>
  );
}

function contradictionSummaries(opportunity: OpportunityDetail): string {
  if (opportunity.contradictions.length === 0) {
    return "No contradictions are recorded in this snapshot. This does not mean the claim set is complete.";
  }
  return opportunity.contradictions.map((item) => item.summary).join(" · ");
}
