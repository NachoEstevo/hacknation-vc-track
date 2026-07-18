import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, CheckCircle2, CircleHelp } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Chip } from "@/components/ui/chip";
import { StatusBadge, type StatusKind } from "@/components/ui/status";
import { DEMO_OPPORTUNITIES, getOpportunity } from "@/lib/demo";
import type { ClaimRecord, ClaimState, EvidenceRecord } from "@/lib/domain";
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
import styles from "../diligence.module.css";
import { MemoActions } from "./memo-actions";

interface MemoPageProps {
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

function evidenceCitation(
  claim: ClaimRecord | undefined,
  evidenceIndex: Map<string, number>,
) {
  const firstEvidenceId = claim?.evidence[0]?.evidenceId;
  if (!firstEvidenceId) return null;
  return evidenceIndex.get(firstEvidenceId) ?? null;
}

function ClaimBackedBlock({
  title,
  text,
  claim,
  evidence,
  citation,
}: {
  title: string;
  text: string;
  claim: ClaimRecord | undefined;
  evidence: EvidenceRecord | undefined;
  citation: number | null;
}) {
  return (
    <div className={styles.memoClaim}>
      <div className={styles.memoClaimTop}>
        <strong>{title}</strong>
        {claim ? (
          <StatusBadge status={claimStatus(claim.state)} label={claimStateLabel(claim.state)} />
        ) : (
          <StatusBadge status="missing" />
        )}
      </div>
      <blockquote>{text}{citation ? <sup> [{citation}]</sup> : null}</blockquote>
      <cite>
        {evidence
          ? `${evidence.sourceName} · captured ${formatDate(evidence.capturedAt)}`
          : "No supporting evidence is linked; treat this field as unknown."}
      </cite>
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

  const evidenceIndex = new Map(
    opportunity.evidence.map((evidence, index) => [evidence.id, index + 1]),
  );
  const problemClaim = findClaim(opportunity, "project.problem");
  const productClaim = findClaim(opportunity, "project.product");
  const tractionClaim = findClaim(opportunity, "project.traction");
  const workingDemoClaim = findClaim(opportunity, "project.working_demo");
  const problemEvidence = problemClaim ? getEvidenceForClaim(opportunity, problemClaim)[0]?.evidence : undefined;
  const productEvidence = productClaim ? getEvidenceForClaim(opportunity, productClaim)[0]?.evidence : undefined;
  const tractionEvidence = tractionClaim ? getEvidenceForClaim(opportunity, tractionClaim)[0]?.evidence : undefined;
  const workingDemoEvidence = workingDemoClaim ? getEvidenceForClaim(opportunity, workingDemoClaim)[0]?.evidence : undefined;
  const strongClaims = getStrongClaims(opportunity);
  const unknowns = getUnknowns(opportunity);
  const strengths = getMemoStrengths(opportunity);
  const weaknesses = getMemoWeaknesses(opportunity);
  const projectHref = `/investor/projects/${opportunity.id}` as Route;

  const analysisBasis = strongClaims.slice(0, 2).map((claim) => claim.statement).join(" ");
  const opportunityAnalysis = [
    `Analysis — test whether ${opportunity.project.sectorTags.map(formatToken).join(" / ")} fits the fund’s explicit thesis.`,
    `Analysis — a founder evidence request could resolve ${unknowns.length} open fields without treating them as negative signals.`,
  ];
  const riskAnalysis = opportunity.contradictions.length
    ? opportunity.contradictions.map((item) => `Open evidence conflict: ${item.summary}`)
    : ["Analysis — the current synthetic snapshot may be incomplete and needs independent customer corroboration."];

  return (
    <AppShell
      eyebrow={`${opportunity.project.name} · decision artifact`}
      title="Investment memo"
      actions={<MemoActions projectId={opportunity.id} />}
    >
      <div className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/investor/search">Discover</Link>
          <span>/</span>
          <Link href={projectHref}>{opportunity.project.name}</Link>
          <span>/</span>
          <span aria-current="page">Memo</span>
        </nav>

        <div className={styles.demoNotice} role="note">
          <CircleHelp aria-hidden="true" />
          <span>
            Draft generated from a <strong>synthetic_demo</strong> snapshot. Source-backed claims,
            analysis, contradictions, and unknowns are deliberately separated.
          </span>
        </div>

        <article className={styles.memoPaper} aria-labelledby="memo-title">
          <header className={styles.memoMasthead}>
            <div>
              <Chip tone="accent" size="sm">Internal · diligence draft</Chip>
              <h2 id="memo-title">{opportunity.project.name}</h2>
              <p>{opportunity.project.tagline}</p>
            </div>
            <div className={styles.memoMeta}>
              <strong>Snapshot</strong>
              {formatDate(opportunity.updatedAt)}<br />
              {opportunity.company.city}, {opportunity.company.countryCode}<br />
              {opportunity.dataLabel}
            </div>
          </header>

          <section className={styles.memoSection} aria-labelledby="snapshot-title">
            <h2 id="snapshot-title">Snapshot</h2>
            <div className={styles.snapshotGrid}>
              <div className={styles.snapshotCell}>
                <span>Stage</span>
                <strong>{formatToken(opportunity.project.stage)}</strong>
              </div>
              <div className={styles.snapshotCell}>
                <span>Team</span>
                <strong>{opportunity.project.teamSize} people</strong>
              </div>
              <div className={styles.snapshotCell}>
                <span>Sector</span>
                <strong>{opportunity.project.sectorTags.map(formatToken).join(", ")}</strong>
              </div>
              <div className={styles.snapshotCell}>
                <span>Evidence</span>
                <strong>{opportunity.evidence.length} artifacts</strong>
              </div>
            </div>
          </section>

          <section className={styles.memoSection} aria-labelledby="hypothesis-title">
            <h2 id="hypothesis-title">Thesis hypothesis</h2>
            <div className={styles.analysisCallout}>
              <span className={styles.analysisLabel}>Analysis · not a sourced claim</span>
              <p>
                {analysisBasis || "The captured evidence is not sufficient to form a thesis hypothesis."}
                {analysisBasis
                  ? " Together, these signals justify a founder conversation to test whether demonstrated execution can translate into durable usage and thesis fit."
                  : " Gather direct product and customer evidence before interpreting the opportunity."}
              </p>
            </div>
          </section>

          <section className={styles.memoSection} aria-labelledby="problem-product-memo-title">
            <h2 id="problem-product-memo-title">Problem &amp; product</h2>
            <ClaimBackedBlock
              title="Problem"
              text={opportunity.project.problem}
              claim={problemClaim}
              evidence={problemEvidence}
              citation={evidenceCitation(problemClaim, evidenceIndex)}
            />
            <ClaimBackedBlock
              title="Product"
              text={opportunity.project.product}
              claim={productClaim}
              evidence={productEvidence}
              citation={evidenceCitation(productClaim, evidenceIndex)}
            />
            {workingDemoClaim ? (
              <ClaimBackedBlock
                title="Product status"
                text={workingDemoClaim.statement}
                claim={workingDemoClaim}
                evidence={workingDemoEvidence}
                citation={evidenceCitation(workingDemoClaim, evidenceIndex)}
              />
            ) : null}
          </section>

          <section className={styles.memoSection} aria-labelledby="traction-title">
            <h2 id="traction-title">Traction &amp; KPIs</h2>
            {tractionClaim ? (
              <ClaimBackedBlock
                title="Captured traction claim"
                text={tractionClaim.statement}
                claim={tractionClaim}
                evidence={tractionEvidence}
                citation={evidenceCitation(tractionClaim, evidenceIndex)}
              />
            ) : (
              <div className={styles.unknownItem}>
                <CircleHelp aria-hidden="true" />
                <span>
                  No traction claim or KPI evidence is captured. Revenue, retention, usage,
                  growth, and customer counts remain unknown; this memo does not infer them.
                </span>
              </div>
            )}
          </section>

          <section className={styles.memoSection} aria-labelledby="swot-title">
            <h2 id="swot-title">SWOT evidence frame</h2>
            <div className={styles.swotGrid}>
              <div className={`${styles.swotCard} ${styles.swotPositive}`}>
                <h3>Strengths · evidence</h3>
                <ul>{strengths.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <div className={`${styles.swotCard} ${styles.swotCaution}`}>
                <h3>Weaknesses · evidence gaps</h3>
                <ul>{weaknesses.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <div className={`${styles.swotCard} ${styles.swotAnalysis}`}>
                <h3>Opportunities · analysis</h3>
                <ul>{opportunityAnalysis.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <div className={`${styles.swotCard} ${styles.swotRisk}`}>
                <h3>Threats · unresolved</h3>
                <ul>{riskAnalysis.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            </div>
          </section>

          <section className={styles.memoSection} aria-labelledby="unknowns-memo-title">
            <h2 id="unknowns-memo-title">Unknowns &amp; contradictions</h2>
            <ul className={styles.unknownList}>
              {unknowns.map((unknown, index) => (
                <li key={`${unknown.predicate}-${index}`} className={styles.unknownItem}>
                  <CircleHelp aria-hidden="true" />
                  <span>{unknown.label}</span>
                </li>
              ))}
            </ul>
            {opportunity.contradictions.map((contradiction) => (
              <div key={contradiction.id} className={styles.contradictionCard} style={{ marginTop: "0.7rem" }}>
                <div className={styles.contradictionTop}>
                  <strong>Open contradiction</strong>
                  <StatusBadge status="conflict" label={formatToken(contradiction.state)} />
                </div>
                <p>{contradiction.summary}</p>
              </div>
            ))}
          </section>

          <section className={styles.memoSection} aria-labelledby="citations-title">
            <h2 id="citations-title">Sources &amp; citations</h2>
            <ol className={styles.citationList}>
              {opportunity.evidence.map((evidence, index) => (
                <li key={evidence.id} className={styles.citationItem}>
                  <span className={styles.citationNumber}>{index + 1}</span>
                  <span>
                    <strong>{evidence.sourceName}</strong> · {formatToken(evidence.sourceType)} · captured {formatDate(evidence.capturedAt)}.
                    {" “"}{evidence.excerpt}{"”"}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.memoSection} aria-labelledby="next-steps-title">
            <h2 id="next-steps-title">Next diligence steps</h2>
            <ol className={styles.nextStepList}>
              {unknowns.slice(0, 4).map((unknown, index) => (
                <li key={`${unknown.label}-${index}`} className={styles.nextStepItem}>
                  <ArrowUpRight aria-hidden="true" />
                  <span>Request evidence to resolve: {unknown.label}</span>
                </li>
              ))}
              <li className={styles.nextStepItem}>
                <CheckCircle2 aria-hidden="true" />
                <span>Re-check every cited source and contradiction before sharing an investment recommendation.</span>
              </li>
            </ol>
          </section>

          <footer className={styles.memoFooter}>
            Generated from {opportunity.dataLabel} data · evidence snapshot {formatDate(opportunity.updatedAt)} ·
            this memo preserves unknowns and does not infer missing metrics.
          </footer>
        </article>
      </div>
    </AppShell>
  );
}
