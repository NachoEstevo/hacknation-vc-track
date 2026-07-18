"use client";

import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  GitCompareArrows,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { StatusBadge, type StatusKind } from "@/components/ui/status";
import { useWorkspace } from "@/components/workspace-provider";
import { DEMO_OPPORTUNITIES } from "@/lib/demo";
import type { ClaimState, OpportunityDetail } from "@/lib/domain";
import {
  claimStateLabel,
  formatToken,
  getClaimSummary,
  getEvidenceCoverage,
  getUnknowns,
} from "../projects/_lib/diligence";
import styles from "./compare.module.css";

function claimStatus(state: ClaimState | "missing"): StatusKind {
  const statuses: Record<ClaimState | "missing", StatusKind> = {
    supported: "supported",
    partially_supported: "partial",
    unverified: "unconfirmed",
    contradicted: "contradicted",
    stale: "stale",
    missing: "missing",
  };
  return statuses[state];
}

function ClaimCell({
  opportunity,
  predicate,
}: {
  opportunity: OpportunityDetail;
  predicate:
    | "founder.technical"
    | "project.working_demo"
    | "project.traction"
    | "project.institutional_funding"
    | "project.raising";
}) {
  const summary = getClaimSummary(opportunity, predicate);
  return (
    <div className={styles.stateCell}>
      <StatusBadge
        status={claimStatus(summary.state)}
        label={summary.state === "missing" ? "Unknown" : claimStateLabel(summary.state)}
      />
      <span>{summary.detail}</span>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function CompareWorkspace() {
  const {
    compareIds,
    hasHydrated,
    clearCompare,
    removeFromCompare,
    toggleCompare,
  } = useWorkspace();
  const [message, setMessage] = useState("");
  const focusMatrixRef = useRef(false);
  const matrixTitleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!focusMatrixRef.current) return;
    matrixTitleRef.current?.focus();
    focusMatrixRef.current = false;
  }, [compareIds]);

  function clear() {
    const result = clearCompare();
    if (result === "saved") focusMatrixRef.current = true;
    setMessage(result === "saved"
      ? "Comparison cleared from this browser."
      : result === "no_change"
        ? "Comparison was already empty."
        : "Browser storage could not clear the comparison. Nothing changed.");
  }

  function toggle(projectId: string, projectName: string) {
    const result = toggleCompare(projectId);
    if (result === "added" || result === "removed") focusMatrixRef.current = true;
    setMessage(result === "added"
      ? `${projectName} saved to comparison in this browser.`
      : result === "removed"
        ? `${projectName} removed from comparison in this browser.`
        : result === "limit"
          ? "Comparison is limited to three projects."
          : "Browser storage could not update the comparison. Nothing changed.");
  }

  function remove(projectId: string, projectName: string) {
    const result = removeFromCompare(projectId);
    if (result === "saved") focusMatrixRef.current = true;
    setMessage(result === "saved"
      ? `${projectName} removed from comparison in this browser.`
      : result === "no_change"
        ? `${projectName} was not selected.`
        : "Browser storage could not update the comparison. Nothing changed.");
  }

  if (!hasHydrated) {
    return (
      <AppShell eyebrow="Evidence review" title="Compare opportunities">
        <div className={styles.loadingState} role="status">
          <GitCompareArrows aria-hidden="true" />
          <span>Preparing your comparison…</span>
        </div>
      </AppShell>
    );
  }

  const selected = compareIds
    .map((id) => DEMO_OPPORTUNITIES.find((opportunity) => opportunity.id === id))
    .filter((opportunity): opportunity is OpportunityDetail => Boolean(opportunity));
  const usingFallback = selected.length === 0;
  const opportunities = usingFallback ? [...DEMO_OPPORTUNITIES.slice(0, 3)] : selected.slice(0, 3);

  return (
    <AppShell
      eyebrow="Evidence review"
      title="Compare opportunities"
      actions={(
        <div className={styles.headerActions}>
          <ButtonLink href="/investor/search" variant="ghost" size="sm" leadingIcon={<Search />}>
            Find projects
          </ButtonLink>
          {!usingFallback ? (
            <Button variant="quiet" size="sm" leadingIcon={<Trash2 />} onClick={clear}>
              Clear comparison
            </Button>
          ) : null}
        </div>
      )}
    >
      <div className={styles.page}>
        <p className="sr-only" role="status" aria-live="polite">{message}</p>
        <div className={styles.principleBar} role="note">
          <AlertCircle aria-hidden="true" />
          <span>
            Compare evidence explicitly. Founder, market, and idea–market fit remain separate;
            missing fields stay unknown and there is no composite investment score.
          </span>
        </div>

        {usingFallback ? (
          <div className={styles.fallbackBanner}>
            <div>
              <Chip tone="muted" size="sm">Demo preview</Chip>
              <strong>No projects are selected yet.</strong>
              <span>
                Showing the first three synthetic opportunities as a visual fallback. Add one below
                or select projects from Discover to create your own comparison.
              </span>
            </div>
          </div>
        ) : (
          <p className={styles.selectionNote}>
            Comparing {opportunities.length} of 3 available slots. Add or remove projects from any project brief.
          </p>
        )}

        <section className={styles.tableCard} aria-labelledby="comparison-title">
          <div className={styles.tableIntro}>
            <div>
              <span className={styles.eyebrow}>Side-by-side diligence</span>
              <h2 id="comparison-title" ref={matrixTitleRef} tabIndex={-1}>Evidence matrix</h2>
            </div>
            <span>{opportunities.length} projects · synthetic_demo</span>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <caption className="sr-only">
                Evidence comparison across {opportunities.map((opportunity) => opportunity.project.name).join(", ")}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.rowHeading}>Dimension</th>
                  {opportunities.map((opportunity) => {
                    const isSelected = compareIds.includes(opportunity.id);
                    return (
                      <th key={opportunity.id} scope="col" className={styles.projectHeading}>
                        <div className={styles.projectIdentity}>
                          <span className={styles.projectMonogram} aria-hidden="true">{initials(opportunity.project.name)}</span>
                          <div>
                            <strong>{opportunity.project.name}</strong>
                            <span>{opportunity.project.tagline}</span>
                          </div>
                        </div>
                        <div className={styles.projectActions}>
                          <ButtonLink
                            href={`/investor/projects/${opportunity.id}` as Route}
                            variant="quiet"
                            size="sm"
                          >
                            Open brief
                          </ButtonLink>
                          {usingFallback && !isSelected ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Add ${opportunity.project.name} to comparison`}
                              title="Add to comparison"
                              onClick={() => toggle(opportunity.id, opportunity.project.name)}
                            >
                              <Plus aria-hidden="true" />
                            </Button>
                          ) : (
                            <Button
                              variant="quiet"
                              size="icon"
                              aria-label={`Remove ${opportunity.project.name} from comparison`}
                              title="Remove from comparison"
                              onClick={() => remove(opportunity.id, opportunity.project.name)}
                            >
                              <X aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className={styles.rowHeading}>Location</th>
                  {opportunities.map((item) => <td key={item.id}>{item.company.city}, {item.company.countryCode}</td>)}
                </tr>
                <tr>
                  <th scope="row" className={styles.rowHeading}>Stage</th>
                  {opportunities.map((item) => <td key={item.id}><Chip tone="accent" size="sm">{formatToken(item.project.stage)}</Chip></td>)}
                </tr>
                <tr>
                  <th scope="row" className={styles.rowHeading}>Sector</th>
                  {opportunities.map((item) => (
                    <td key={item.id}>
                      <div className={styles.chipCell}>{item.project.sectorTags.map((tag) => <Chip key={tag} tone="neutral" size="sm">{formatToken(tag)}</Chip>)}</div>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className={styles.rowHeading}>Team</th>
                  {opportunities.map((item) => <td key={item.id}>{item.project.teamSize} people</td>)}
                </tr>
                <tr className={styles.sectionRow}>
                  <th scope="row" className={styles.rowHeading}>Founder evidence</th>
                  {opportunities.map((item) => (
                    <td key={item.id}>
                      {item.founderScore ? (
                        <div className={styles.stateCell}>
                          <strong>{item.founderScore.score ?? "Unknown"}{item.founderScore.score === null ? "" : "/100"}</strong>
                          <span>{item.founderScore.evidenceCoverage}% factor coverage · {formatToken(item.founderScore.confidence)} confidence</span>
                          <small>Evidence-strength score, not a success prediction.</small>
                        </div>
                      ) : <StatusBadge status="missing" label="No founder evidence" />}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className={styles.rowHeading}>Technical founder</th>
                  {opportunities.map((item) => <td key={item.id}><ClaimCell opportunity={item} predicate="founder.technical" /></td>)}
                </tr>
                <tr className={styles.sectionRow}>
                  <th scope="row" className={styles.rowHeading}>Problem</th>
                  {opportunities.map((item) => <td key={item.id} className={styles.longText}>{item.project.problem}</td>)}
                </tr>
                <tr>
                  <th scope="row" className={styles.rowHeading}>Product</th>
                  {opportunities.map((item) => <td key={item.id} className={styles.longText}>{item.project.product}</td>)}
                </tr>
                <tr>
                  <th scope="row" className={styles.rowHeading}>Working product / demo</th>
                  {opportunities.map((item) => <td key={item.id}><ClaimCell opportunity={item} predicate="project.working_demo" /></td>)}
                </tr>
                <tr>
                  <th scope="row" className={styles.rowHeading}>Traction</th>
                  {opportunities.map((item) => <td key={item.id}><ClaimCell opportunity={item} predicate="project.traction" /></td>)}
                </tr>
                <tr className={styles.sectionRow}>
                  <th scope="row" className={styles.rowHeading}>Institutional funding</th>
                  {opportunities.map((item) => <td key={item.id}><ClaimCell opportunity={item} predicate="project.institutional_funding" /></td>)}
                </tr>
                <tr>
                  <th scope="row" className={styles.rowHeading}>Raising now</th>
                  {opportunities.map((item) => <td key={item.id}><ClaimCell opportunity={item} predicate="project.raising" /></td>)}
                </tr>
                <tr className={styles.sectionRow}>
                  <th scope="row" className={styles.rowHeading}>Evidence field coverage</th>
                  {opportunities.map((item) => {
                    const coverage = getEvidenceCoverage(item);
                    return (
                      <td key={item.id}>
                        <div className={styles.coverageCell}>
                          <strong>{coverage.coveredFields}/{coverage.expectedFields}</strong>
                          <span>{coverage.percent}% of expected fields have linked evidence</span>
                          <div className={styles.coverageTrack} aria-hidden="true"><span style={{ width: `${coverage.percent}%` }} /></div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row" className={styles.rowHeading}>Claim states</th>
                  {opportunities.map((item) => {
                    const coverage = getEvidenceCoverage(item);
                    return (
                      <td key={item.id}>
                        <div className={styles.claimCounts}>
                          <span><Check aria-hidden="true" /> {coverage.supportedClaims} supported</span>
                          <span>{coverage.partialClaims} partial</span>
                          <span>{coverage.unverifiedClaims} unverified</span>
                          <span>{coverage.contradictedClaims} contradicted</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row" className={styles.rowHeading}>Contradictions</th>
                  {opportunities.map((item) => (
                    <td key={item.id}>
                      {item.contradictions.length ? (
                        <div className={styles.conflictCell}>
                          <StatusBadge status="conflict" label={`${item.contradictions.length} open`} />
                          {item.contradictions.map((conflict) => <span key={conflict.id}>{conflict.summary}</span>)}
                        </div>
                      ) : (
                        <div className={styles.stateCell}>
                          <StatusBadge status="supported" label="None linked" />
                          <span>The snapshot can still be incomplete.</span>
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className={styles.rowHeading}>Missing / unresolved</th>
                  {opportunities.map((item) => {
                    const unknowns = getUnknowns(item);
                    return (
                      <td key={item.id}>
                        <div className={styles.missingCell}>
                          <StatusBadge status="unknown" label={`${unknowns.length} open`} />
                          <ul>
                            {unknowns.slice(0, 4).map((unknown, index) => (
                              <li key={`${unknown.predicate}-${index}`}>{unknown.label}</li>
                            ))}
                          </ul>
                        </div>
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row" className={styles.rowHeading}>Source artifacts</th>
                  {opportunities.map((item) => <td key={item.id}>{item.evidence.length} excerpts across {new Set(item.evidence.map((source) => source.sourceName)).size} sources</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <footer className={styles.footerNote}>
          <GitCompareArrows aria-hidden="true" />
          <span>Comparison is a reading aid. Verify source recency and resolve unknowns before forming a decision.</span>
        </footer>
      </div>
    </AppShell>
  );
}
