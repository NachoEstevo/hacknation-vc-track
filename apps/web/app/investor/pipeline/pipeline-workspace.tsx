"use client";

import Link from "next/link";
import type { Route } from "next";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookmarkCheck,
  FolderKanban,
  Globe,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  PIPELINE_STAGES,
  type PipelineItem,
  type PipelineStage,
  useWorkspace,
} from "@/components/workspace-provider";
import { getOpportunity } from "@/lib/demo";
import type { OpportunityDetail } from "@/lib/domain";
import styles from "./page.module.css";

const STAGE_LABELS: Record<PipelineStage, string> = {
  discovered: "Discovered",
  reviewing: "Reviewing",
  contacted: "Contacted",
  diligence: "Diligence",
  advancing: "Advancing",
  passed: "Passed",
};

const HIGH_SCORE_THRESHOLD = 75;

/** "pre_seed" -> "Pre-seed", "seed" -> "Seed". Mirrors the funding-stage vocabulary already in the fixtures. */
function formatFundingStage(stage: string): string {
  const words = stage.split("_").filter(Boolean);
  if (words.length === 0) return stage;
  return words
    .map((word, index) => (index === 0 ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word))
    .join("-");
}

/** "ai_infrastructure" -> "AI Infrastructure". Reused for the sector filter menu. */
function formatSector(tag: string): string {
  return tag
    .split("_")
    .filter(Boolean)
    .map((word) => (word === "ai" ? "AI" : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join(" ");
}

/** True when every piece of evidence for this profile came from outside the founder — never a guess. */
function isExternallySourced(opportunity: OpportunityDetail): boolean {
  return opportunity.evidence.length > 0
    && opportunity.evidence.every((record) => record.sourceType !== "founder_submission");
}

function PipelineCard({
  item,
  isNewest,
  shouldFocus,
  onMove,
  onFocused,
  onMessage,
  onRemoved,
}: {
  item: PipelineItem;
  isNewest: boolean;
  shouldFocus: boolean;
  onMove: (projectId: string, stage: PipelineStage) => void;
  onFocused: () => void;
  onMessage: (message: string) => void;
  onRemoved: (projectName: string) => void;
}) {
  const opportunity = getOpportunity(item.projectId);
  const cardRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const { removeFromPipeline, updatePipelineNote } = useWorkspace();

  useEffect(() => {
    if (!shouldFocus) return;
    cardRef.current?.focus();
    onFocused();
  }, [onFocused, shouldFocus]);

  async function remove() {
    const label = opportunity?.project.name ?? "this project";
    if (window.confirm(`Remove ${label} from the local demo pipeline?`)) {
      const result = await removeFromPipeline(item.projectId);
      if (result === "saved") {
        onRemoved(label);
      } else {
        onMessage(result === "no_change"
          ? `${label} was already absent from the pipeline.`
          : `Browser storage could not remove ${label}. Nothing changed.`);
      }
    }
  }

  const projectName = opportunity?.project.name ?? item.projectId;
  const founderName = opportunity?.founders[0]?.name;
  const score = opportunity?.founderScore?.score ?? null;
  const external = !isNewest && opportunity ? isExternallySourced(opportunity) : false;
  const panelId = `pipeline-card-panel-${item.projectId}`;

  return (
    <article
      ref={cardRef}
      className={clsx(styles.card, isNewest && styles.cardNew)}
      tabIndex={-1}
      aria-label={projectName}
    >
      <div className={styles.cardTop}>
        <span className={styles.cardName}>{projectName}</span>
        <span className={clsx(styles.cardScore, score !== null && score >= HIGH_SCORE_THRESHOLD && styles.cardScoreHigh)}>
          {score !== null ? Math.round(score) : "—"}
        </span>
        <button
          type="button"
          className={styles.cardMenu}
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={expanded ? `Hide actions for ${projectName}` : `Show actions for ${projectName}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </button>
      </div>

      <span className={styles.cardFounder}>
        {founderName ?? (opportunity ? opportunity.company.city : "Project record no longer in this demo catalog")}
      </span>

      {opportunity ? (
        <div className={styles.cardStageRow}>
          <span className={styles.cardStageDot} aria-hidden="true" />
          <span className={styles.cardStageLabel}>{formatFundingStage(opportunity.project.stage)}</span>
          {isNewest ? (
            <span className={clsx(styles.cardIndicator, styles.cardIndicatorNew)}>
              <BookmarkCheck aria-hidden="true" /> Newest addition
            </span>
          ) : external ? (
            <span className={clsx(styles.cardIndicator, styles.cardIndicatorExternal)}>
              <Globe aria-hidden="true" /> External
            </span>
          ) : null}
        </div>
      ) : null}

      {expanded ? (
        <div id={panelId} className={styles.cardExpanded}>
          <label className={styles.stageField}>
            <span>Move to stage</span>
            <select
              value={item.stage}
              onChange={(event) => onMove(item.projectId, event.target.value as PipelineStage)}
            >
              {PIPELINE_STAGES.map((stage) => (
                <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
              ))}
            </select>
          </label>

          <label className={styles.noteField}>
            <span>Private note</span>
            <textarea
              rows={2}
              defaultValue={item.note ?? ""}
              placeholder="Record a question, decision, or next step…"
              onBlur={async (event) => {
                const field = event.currentTarget;
                const result = await updatePipelineNote(item.projectId, field.value);
                if (result === "failed") field.value = item.note ?? "";
                onMessage(result === "saved"
                  ? "Private note saved in this browser."
                  : result === "no_change"
                    ? "Private note unchanged."
                    : "Browser storage could not save this note. The previous note was restored.");
              }}
            />
          </label>

          <div className={styles.cardExpandedActions}>
            {opportunity ? (
              <Link href={`/investor/projects/${opportunity.id}` as Route} className={styles.briefLink}>
                Open evidence brief <ArrowUpRight aria-hidden="true" />
              </Link>
            ) : <span />}
            <button type="button" className={styles.removeAction} onClick={remove}>
              <Trash2 aria-hidden="true" /> Remove
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function PipelineWorkspace() {
  const {
    pipelineItems,
    hasHydrated,
    movePipelineItem,
  } = useWorkspace();
  const [workspaceAnnouncement, setWorkspaceAnnouncement] = useState("");
  const [focusProjectId, setFocusProjectId] = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const focusBoardRef = useRef(false);
  const boardRegionRef = useRef<HTMLDivElement>(null);

  const availableSectors = useMemo(() => {
    const tags = new Set<string>();
    for (const item of pipelineItems) {
      getOpportunity(item.projectId)?.project.sectorTags.forEach((tag) => tags.add(tag));
    }
    return [...tags].sort();
  }, [pipelineItems]);

  const filteredItems = useMemo(() => {
    if (!sectorFilter) return pipelineItems;
    return pipelineItems.filter((item) =>
      getOpportunity(item.projectId)?.project.sectorTags.includes(sectorFilter));
  }, [pipelineItems, sectorFilter]);

  const grouped = useMemo(() => Object.fromEntries(
    PIPELINE_STAGES.map((stage) => [
      stage,
      filteredItems.filter((item) => item.stage === stage),
    ]),
  ) as Record<PipelineStage, PipelineItem[]>, [filteredItems]);

  const newestAddedAt = useMemo(() => pipelineItems.reduce<string | null>(
    (latest, item) => (!latest || item.addedAt > latest ? item.addedAt : latest),
    null,
  ), [pipelineItems]);

  useEffect(() => {
    if (!focusBoardRef.current) return;
    boardRegionRef.current?.focus();
    focusBoardRef.current = false;
  }, [pipelineItems]);

  function handleRemoved(projectName: string) {
    setWorkspaceAnnouncement(`${projectName} removed from the browser-saved pipeline.`);
    focusBoardRef.current = true;
  }

  async function handleMove(projectId: string, stage: PipelineStage) {
    const projectName = getOpportunity(projectId)?.project.name ?? projectId;
    const result = await movePipelineItem(projectId, stage);
    if (result === "saved") {
      setFocusProjectId(projectId);
      setWorkspaceAnnouncement(`${projectName} saved in ${STAGE_LABELS[stage]}.`);
    } else {
      setWorkspaceAnnouncement(result === "no_change"
        ? `${projectName} is already in ${STAGE_LABELS[stage]}.`
        : `Browser storage could not move ${projectName}. Its previous stage was kept.`);
    }
  }

  return (
    <AppShell
      eyebrow="Private workspace"
      title="Pipeline"
      headerAside={<Chip tone="accent" size="sm">synthetic_demo</Chip>}
      actions={(
        <ButtonLink
          href={"/investor/search" as Route}
          variant="secondary"
          size="sm"
          leadingIcon={<Search size={15} aria-hidden="true" />}
        >
          Add from search
        </ButtonLink>
      )}
    >
      <div className={styles.page} ref={boardRegionRef} tabIndex={-1}>
        <p className="sr-only" role="status" aria-live="polite">
          {workspaceAnnouncement}
        </p>

        {!hasHydrated ? (
          <div className={styles.loading} aria-live="polite">Loading local pipeline…</div>
        ) : pipelineItems.length === 0 ? (
          <section className={styles.empty}>
            <span className={styles.emptyIcon}><FolderKanban aria-hidden="true" /></span>
            <h2>Your pipeline is deliberately empty.</h2>
            <p>
              Add a synthetic opportunity from search to try stage moves and private notes.
              Nothing leaves this device.
            </p>
          </section>
        ) : (
          <>
            <div className={styles.boardHead}>
              <p className={styles.boardCount}>
                {pipelineItems.length} project{pipelineItems.length === 1 ? "" : "s"} · saved in this browser
              </p>
              <div className={styles.boardHeadActions}>
                {sectorFilter ? (
                  <button type="button" className={styles.clearFilter} onClick={() => setSectorFilter(null)}>
                    <X aria-hidden="true" /> Clear filter
                  </button>
                ) : null}
                {availableSectors.length > 0 ? (
                  <details className={styles.filterMenu}>
                    <summary className={styles.filterTrigger}>
                      <SlidersHorizontal aria-hidden="true" />
                      {sectorFilter ? `Filter: ${formatSector(sectorFilter)}` : "Filter"}
                    </summary>
                    <div className={styles.filterPanel}>
                      {availableSectors.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className={styles.filterOption}
                          data-active={sectorFilter === tag || undefined}
                          onClick={() => setSectorFilter((current) => (current === tag ? null : tag))}
                        >
                          {formatSector(tag)}
                        </button>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            </div>

            <section className={styles.board} aria-label="Pipeline stages">
              {PIPELINE_STAGES.map((stage) => (
                <section className={styles.column} key={stage} aria-labelledby={`stage-${stage}`}>
                  <header className={styles.columnHeader}>
                    <h2 id={`stage-${stage}`}>{STAGE_LABELS[stage]}</h2>
                    <span className={styles.columnCount}>{grouped[stage].length}</span>
                  </header>
                  <div className={styles.columnBody}>
                    {grouped[stage].length ? grouped[stage].map((item) => (
                      <PipelineCard
                        key={item.projectId}
                        item={item}
                        isNewest={item.addedAt === newestAddedAt}
                        shouldFocus={focusProjectId === item.projectId}
                        onMove={handleMove}
                        onFocused={() => setFocusProjectId(null)}
                        onMessage={setWorkspaceAnnouncement}
                        onRemoved={handleRemoved}
                      />
                    )) : (
                      <p className={styles.columnEmpty}>
                        {sectorFilter ? "No matches for this filter." : "No projects at this stage."}
                      </p>
                    )}
                  </div>
                </section>
              ))}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
