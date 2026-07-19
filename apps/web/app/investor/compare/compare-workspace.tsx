"use client";

import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  AlertCircle,
  GitCompareArrows,
  Info,
  MoveRight,
  Plus,
  Scale,
  Search,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Avatar,
  Button,
  ButtonLink,
  ConfidenceBadge,
  DataBadge,
  FounderScore,
  SectorTag,
  StageBadge,
  type EvidenceTone,
} from "@/components/pencil";
import { useWorkspace } from "@/components/workspace-provider";
import { DEMO_OPPORTUNITIES } from "@/lib/demo";
import type { ClaimState, OpportunityDetail } from "@/lib/domain";
import {
  claimStateLabel,
  findClaim,
  formatToken,
  getDiligenceAxes,
  getEvidenceCoverage,
  getUnknowns,
  type DiligenceAxis,
  type DiligenceAxisName,
} from "../projects/_lib/diligence";
import styles from "./compare.module.css";

type AxisStatus = DiligenceAxis["status"];

const AXIS_RANK: Record<AxisStatus, number> = {
  "Well evidenced": 3,
  "Partial evidence": 2,
  Open: 1,
  Conflicted: 0,
};

const AXIS_TONE: Record<AxisStatus, EvidenceTone> = {
  "Well evidenced": "verified",
  "Partial evidence": "inference",
  Open: "unknown",
  Conflicted: "risk",
};

const CLAIM_TONE: Record<ClaimState | "missing", EvidenceTone> = {
  supported: "verified",
  partially_supported: "inference",
  unverified: "unknown",
  stale: "unknown",
  contradicted: "risk",
  missing: "unknown",
};

const CLAIM_RANK: Record<ClaimState | "missing", number> = {
  supported: 3,
  partially_supported: 2,
  unverified: 1,
  stale: 1,
  contradicted: 0,
  missing: 0,
};

const CONFIDENCE_RANK: Record<"low" | "medium" | "high", number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const AXIS_ROWS: { name: DiligenceAxisName; label: string }[] = [
  { name: "Founder", label: "Founder" },
  { name: "Market", label: "Market" },
  { name: "Idea vs. market", label: "Idea vs. Market" },
];

function leaderFlags(ranks: Array<number | null>): boolean[] {
  const valid = ranks.filter((rank): rank is number => rank !== null);
  if (valid.length < 2) return ranks.map(() => false);
  const max = Math.max(...valid);
  if (valid.every((rank) => rank === max)) return ranks.map(() => false);
  return ranks.map((rank) => rank !== null && rank === max);
}

function axisRowData(opportunities: OpportunityDetail[], axisName: DiligenceAxisName) {
  const axes = opportunities.map((opportunity) => {
    const axis = getDiligenceAxes(opportunity).find((candidate) => candidate.name === axisName);
    return axis!;
  });
  const leaders = leaderFlags(axes.map((axis) => AXIS_RANK[axis.status]));
  return axes.map((axis, index) => ({ axis, leading: leaders[index]! }));
}

function shortPredicateLabel(predicate: string): string {
  const [, field] = predicate.split(".");
  return formatToken(field ?? predicate);
}

function Trend({ leading }: { leading: boolean }) {
  return leading ? (
    <TrendingUp aria-hidden="true" className={styles.trendUp} />
  ) : (
    <MoveRight aria-hidden="true" className={styles.trendNeutral} />
  );
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

  const founderAxis = axisRowData(opportunities, "Founder");
  const marketAxis = axisRowData(opportunities, "Market");
  const ideaAxis = axisRowData(opportunities, "Idea vs. market");
  const axisRows = [
    { ...AXIS_ROWS[0]!, cells: founderAxis },
    { ...AXIS_ROWS[1]!, cells: marketAxis },
    { ...AXIS_ROWS[2]!, cells: ideaAxis },
  ];

  const tractionRows = opportunities.map((opportunity) => {
    const claim = findClaim(opportunity, "project.traction");
    const state: ClaimState | "missing" = claim?.state ?? "missing";
    return { claim, state };
  });
  const tractionLeaders = leaderFlags(tractionRows.map((row) => CLAIM_RANK[row.state]));

  const evidenceRows = opportunities.map((opportunity) => {
    const coverage = getEvidenceCoverage(opportunity);
    const tone: EvidenceTone = coverage.contradictedClaims > 0
      ? "risk"
      : coverage.percent >= 60
        ? "verified"
        : coverage.percent > 0
          ? "inference"
          : "unknown";
    return { coverage, tone };
  });
  const evidenceLeaders = leaderFlags(evidenceRows.map((row) => row.coverage.percent));

  const founderScoreLeaders = leaderFlags(
    opportunities.map((opportunity) => opportunity.founderScore?.score ?? null),
  );

  const confidenceLeaders = leaderFlags(
    opportunities.map((opportunity) => {
      const confidence = opportunity.founderScore?.confidence;
      return confidence ? CONFIDENCE_RANK[confidence] : null;
    }),
  );

  const keyDifferences: string[] = [];
  if (opportunities.length > 1) {
    for (const group of [
      { label: "founder evidence", cells: founderAxis },
      { label: "market evidence", cells: marketAxis },
      { label: "idea–market fit", cells: ideaAxis },
    ]) {
      const leaderIndex = group.cells.findIndex((cell) => cell.leading);
      const leaderCount = group.cells.filter((cell) => cell.leading).length;
      if (leaderIndex !== -1 && leaderCount === 1) {
        keyDifferences.push(`${opportunities[leaderIndex]!.project.name} leads on ${group.label}.`);
      }
    }

    for (const opportunity of opportunities) {
      if (opportunity.contradictions.length > 0) {
        keyDifferences.push(
          `${opportunity.project.name} has ${opportunity.contradictions.length} open contradiction${opportunity.contradictions.length > 1 ? "s" : ""}.`,
        );
      }
    }

    const lowestIndex = evidenceRows.reduce(
      (min, row, index) => (row.coverage.percent < evidenceRows[min]!.coverage.percent ? index : min),
      0,
    );
    if (evidenceRows[lowestIndex]!.coverage.percent < 40) {
      keyDifferences.push(
        `${opportunities[lowestIndex]!.project.name}'s evidence coverage is low (${evidenceRows[lowestIndex]!.coverage.percent}%) — most claims are unverified.`,
      );
    }
  }
  const keyDifferenceNotes = keyDifferences.slice(0, 3);

  return (
    <AppShell
      eyebrow="Evidence review"
      title="Compare opportunities"
      actions={(
        <div className={styles.headerActions}>
          <ButtonLink href="/investor/search" variant="secondary" leadingIcon={<Search aria-hidden="true" />}>
            Find projects
          </ButtonLink>
          {!usingFallback ? (
            <Button variant="ghost" leadingIcon={<Trash2 aria-hidden="true" />} onClick={clear}>
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
            <span className={styles.fallbackTag}>Demo preview</span>
            <div>
              <strong>No projects are selected yet.</strong>
              <span>
                Showing the first three synthetic opportunities as a visual fallback. Add one below
                or select projects from Discover to create your own comparison.
              </span>
            </div>
          </div>
        ) : (
          <p className={styles.selectionNote}>
            Comparing {opportunities.length} of 3 available slots. Highlighted cells mark where one
            project clearly leads on that axis. Add or remove projects from any project brief.
          </p>
        )}

        {keyDifferenceNotes.length > 0 ? (
          <div className={styles.keyDifferences} role="note">
            <Scale aria-hidden="true" />
            <p>
              <strong>What separates them:</strong> {keyDifferenceNotes.join(" ")}
            </p>
          </div>
        ) : null}

        <section className={styles.tableCard} aria-labelledby="comparison-title">
          <div className={styles.tableIntro}>
            <div>
              <h2 id="comparison-title" ref={matrixTitleRef} tabIndex={-1}>
                Comparing {opportunities.length} opportunit{opportunities.length === 1 ? "y" : "ies"}
              </h2>
              <p>Side-by-side reads on each axis. Founder, market, and idea–market fit are never averaged.</p>
            </div>
            <span className={styles.tableMeta}>{opportunities.length} projects · {opportunities[0]?.dataLabel ?? "synthetic_demo"}</span>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.table} style={{ minWidth: `${11 + opportunities.length * 15}rem` }}>
              <caption className="sr-only">
                Evidence comparison across {opportunities.map((opportunity) => opportunity.project.name).join(", ")}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.rowLabel} aria-hidden="true" />
                  {opportunities.map((opportunity) => {
                    const isSelected = compareIds.includes(opportunity.id);
                    return (
                      <th key={opportunity.id} scope="col" className={styles.headerCell}>
                        <div className={styles.identity}>
                          <Avatar name={opportunity.project.name} />
                          <div className={styles.identityText}>
                            <strong>{opportunity.project.name}</strong>
                            <span>
                              {opportunity.founders[0]?.name ?? "Founder unknown"} · {formatToken(opportunity.project.stage)}
                            </span>
                          </div>
                          {usingFallback && !isSelected ? (
                            <Button
                              variant="ghost"
                              aria-label={`Add ${opportunity.project.name} to comparison`}
                              title="Add to comparison"
                              onClick={() => toggle(opportunity.id, opportunity.project.name)}
                            >
                              <Plus aria-hidden="true" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              aria-label={`Remove ${opportunity.project.name} from comparison`}
                              title="Remove from comparison"
                              onClick={() => remove(opportunity.id, opportunity.project.name)}
                            >
                              <X aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                        <ButtonLink
                          href={`/investor/projects/${opportunity.id}` as Route}
                          variant="secondary"
                          className={styles.openBriefLink}
                        >
                          Open brief
                        </ButtonLink>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className={styles.rowLabel}>Stage</th>
                  {opportunities.map((item) => (
                    <td key={item.id} className={styles.cell}>
                      <StageBadge label={formatToken(item.project.stage)} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className={styles.rowLabel}>Sector</th>
                  {opportunities.map((item) => (
                    <td key={item.id} className={styles.cell}>
                      <div className={styles.tagRow}>
                        {item.project.sectorTags.map((tag) => (
                          <SectorTag key={tag} label={formatToken(tag)} />
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>

                <tr className={styles.sectionRow}>
                  <th scope="row" className={styles.rowLabel}>Founder Score</th>
                  {opportunities.map((item, index) => (
                    <td
                      key={item.id}
                      className={clsx(styles.cell, founderScoreLeaders[index] && styles.leadingCell)}
                    >
                      {item.founderScore && item.founderScore.score !== null ? (
                        <div className={styles.scoreCell}>
                          <FounderScore value={item.founderScore.score} />
                          <span className={styles.caption}>
                            {item.founderScore.evidenceCoverage}% factor coverage · {formatToken(item.founderScore.confidence)} confidence
                          </span>
                        </div>
                      ) : (
                        <DataBadge tone="unknown" label="No founder score yet" />
                      )}
                    </td>
                  ))}
                </tr>

                {axisRows.map(({ name, label, cells }) => (
                  <tr key={name}>
                    <th scope="row" className={styles.rowLabel}>{label}</th>
                    {cells.map(({ axis, leading }, index) => (
                      <td
                        key={opportunities[index]!.id}
                        className={clsx(styles.cell, leading && styles.leadingCell)}
                      >
                        <div className={styles.axisCell}>
                          <DataBadge tone={AXIS_TONE[axis.status]} label={axis.status} />
                          <Trend leading={leading} />
                        </div>
                        <span className={styles.caption}>{axis.covered}/{axis.expected} fields evidenced</span>
                      </td>
                    ))}
                  </tr>
                ))}

                <tr className={styles.sectionRow}>
                  <th scope="row" className={styles.rowLabel}>Traction</th>
                  {tractionRows.map(({ claim, state }, index) => (
                    <td
                      key={opportunities[index]!.id}
                      className={clsx(styles.cell, tractionLeaders[index] && styles.leadingCell)}
                    >
                      <div className={styles.axisCell}>
                        <DataBadge tone={CLAIM_TONE[state]} label={state === "missing" ? "Unknown" : claimStateLabel(state)} />
                        <Trend leading={tractionLeaders[index]!} />
                      </div>
                      <span className={styles.caption}>
                        {claim?.statement ?? "No traction claim captured. Absence of evidence is not treated as a negative signal."}
                      </span>
                    </td>
                  ))}
                </tr>

                <tr>
                  <th scope="row" className={styles.rowLabel}>Evidence coverage</th>
                  {evidenceRows.map(({ coverage, tone }, index) => (
                    <td
                      key={opportunities[index]!.id}
                      className={clsx(styles.cell, evidenceLeaders[index] && styles.leadingCell)}
                    >
                      <DataBadge tone={tone} label={`${coverage.supportedClaims} supported · ${coverage.contradictedClaims} contradicted`} />
                      <span className={styles.caption}>{coverage.percent}% of expected fields have linked evidence</span>
                    </td>
                  ))}
                </tr>

                <tr className={styles.sectionRow}>
                  <th scope="row" className={styles.rowLabel}>Top risk</th>
                  {opportunities.map((item) => {
                    const topContradiction = item.contradictions[0];
                    return (
                      <td key={item.id} className={styles.cell}>
                        {topContradiction ? (
                          <DataBadge tone="risk" label={topContradiction.summary} />
                        ) : (
                          <DataBadge tone="verified" label="No open contradictions" />
                        )}
                      </td>
                    );
                  })}
                </tr>

                <tr>
                  <th scope="row" className={styles.rowLabel}>Missing info</th>
                  {opportunities.map((item) => {
                    const unknowns = getUnknowns(item);
                    const preview = unknowns.slice(0, 2).map((unknown) => shortPredicateLabel(unknown.predicate)).join(", ");
                    return (
                      <td key={item.id} className={styles.cell}>
                        {unknowns.length > 0 ? (
                          <>
                            <DataBadge tone="unknown" label={`${unknowns.length} unresolved field${unknowns.length > 1 ? "s" : ""}`} />
                            {preview ? <span className={styles.caption}>{preview}</span> : null}
                          </>
                        ) : (
                          <DataBadge tone="verified" label="Fully documented" />
                        )}
                      </td>
                    );
                  })}
                </tr>

                <tr className={styles.sectionRow}>
                  <th scope="row" className={styles.rowLabel}>Confidence</th>
                  {opportunities.map((item, index) => (
                    <td
                      key={item.id}
                      className={clsx(styles.cell, confidenceLeaders[index] && styles.leadingCell)}
                    >
                      {item.founderScore ? (
                        <ConfidenceBadge level={item.founderScore.confidence} />
                      ) : (
                        <DataBadge tone="unknown" label="No founder score" />
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className={styles.tableFoot}>
            <Info aria-hidden="true" />
            <span>Highlighted cells mark the clearest lead on that axis. Open a project brief to see its evidence.</span>
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
