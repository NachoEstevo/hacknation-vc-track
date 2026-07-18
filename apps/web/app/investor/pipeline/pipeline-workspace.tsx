"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  FolderKanban,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  PIPELINE_STAGES,
  type PipelineItem,
  type PipelineStage,
  useWorkspace,
} from "@/components/workspace-provider";
import { DEMO_OPPORTUNITIES, getOpportunity } from "@/lib/demo";
import styles from "./page.module.css";

const STAGE_LABELS: Record<PipelineStage, string> = {
  discovered: "Discovered",
  reviewing: "Reviewing",
  contacted: "Contacted",
  diligence: "Diligence",
  advancing: "Advancing",
  passed: "Passed",
};

function PipelineCard({
  item,
  shouldFocus,
  onMove,
  onFocused,
  onMessage,
  onRemoved,
}: {
  item: PipelineItem;
  shouldFocus: boolean;
  onMove: (projectId: string, stage: PipelineStage) => void;
  onFocused: () => void;
  onMessage: (message: string) => void;
  onRemoved: (projectName: string) => void;
}) {
  const opportunity = getOpportunity(item.projectId);
  const cardRef = useRef<HTMLElement>(null);
  const {
    removeFromPipeline,
    updatePipelineNote,
  } = useWorkspace();

  useEffect(() => {
    if (!shouldFocus) return;
    cardRef.current?.focus();
    onFocused();
  }, [onFocused, shouldFocus]);

  function remove() {
    const label = opportunity?.project.name ?? "this project";
    if (window.confirm(`Remove ${label} from the local demo pipeline?`)) {
      const result = removeFromPipeline(item.projectId);
      if (result === "saved") {
        onRemoved(label);
      } else {
        onMessage(result === "no_change"
          ? `${label} was already absent from the pipeline.`
          : `Browser storage could not remove ${label}. Nothing changed.`);
      }
    }
  }

  return (
    <article
      ref={cardRef}
      className={styles.card}
      tabIndex={-1}
      aria-label={opportunity?.project.name ?? item.projectId}
    >
      <div className={styles.cardTopline}>
        <Chip tone="accent" size="sm">synthetic_demo</Chip>
        <button
          type="button"
          className={styles.removeButton}
          onClick={remove}
          aria-label={`Remove ${opportunity?.project.name ?? item.projectId} from pipeline`}
          title="Remove from pipeline"
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>

      <div className={styles.cardIdentity}>
        <p>{opportunity?.company.city ?? "Project record"}</p>
        <h3>{opportunity?.project.name ?? item.projectId}</h3>
        <span>{opportunity?.project.tagline ?? "The source record is no longer in this demo catalog."}</span>
      </div>

      {opportunity ? (
        <div className={styles.cardMeta}>
          <span>{opportunity.project.stage.replace("_", "-")}</span>
          <span>{opportunity.project.teamSize} people</span>
          <span>{opportunity.evidence.length} evidence items</span>
        </div>
      ) : null}

      <label className={styles.stageField}>
        <span>Stage</span>
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
          rows={3}
          defaultValue={item.note ?? ""}
          placeholder="Record a question, decision, or next step…"
          onBlur={(event) => {
            const result = updatePipelineNote(item.projectId, event.target.value);
            if (result === "failed") event.currentTarget.value = item.note ?? "";
            onMessage(result === "saved"
              ? "Private note saved in this browser."
              : result === "no_change"
                ? "Private note unchanged."
                : "Browser storage could not save this note. The previous note was restored.");
          }}
        />
        <small>Saved locally when you leave this field.</small>
      </label>

      {opportunity ? (
        <Link
          href={`/investor/projects/${opportunity.id}` as Route}
          className={styles.briefLink}
        >
          Open evidence brief <ArrowUpRight aria-hidden="true" />
        </Link>
      ) : null}
    </article>
  );
}

function DemoCatalog({
  pipelineIds,
  onAdd,
}: {
  pipelineIds: string[];
  onAdd: (projectId: string, projectName: string) => void;
}) {
  const available = DEMO_OPPORTUNITIES.filter((opportunity) => !pipelineIds.includes(opportunity.id));

  if (!available.length) return null;

  return (
    <section className={styles.catalog} aria-labelledby="demo-catalog-title">
      <div className={styles.sectionHeading}>
        <div>
          <p>Demo catalog</p>
          <h2 id="demo-catalog-title">Add another opportunity</h2>
        </div>
        <span>Local action · no CRM sync</span>
      </div>
      <div className={styles.catalogGrid}>
        {available.map((opportunity) => (
          <article key={opportunity.id} className={styles.catalogCard}>
            <div>
              <Chip tone="accent" size="sm">synthetic_demo</Chip>
              <h3>{opportunity.project.name}</h3>
              <p>{opportunity.project.tagline}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Plus />}
              onClick={() => onAdd(opportunity.id, opportunity.project.name)}
            >
              Add to pipeline
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PipelineWorkspace() {
  const {
    addToPipeline,
    pipelineItems,
    pipelineIds,
    hasHydrated,
    movePipelineItem,
  } = useWorkspace();
  const [workspaceAnnouncement, setWorkspaceAnnouncement] = useState("");
  const [focusProjectId, setFocusProjectId] = useState<string | null>(null);
  const focusIntroRef = useRef(false);
  const introHeadingRef = useRef<HTMLHeadingElement>(null);
  const grouped = useMemo(() => Object.fromEntries(
    PIPELINE_STAGES.map((stage) => [
      stage,
      pipelineItems.filter((item) => item.stage === stage),
    ]),
  ) as Record<PipelineStage, PipelineItem[]>, [pipelineItems]);

  useEffect(() => {
    if (!focusIntroRef.current) return;
    introHeadingRef.current?.focus();
    focusIntroRef.current = false;
  }, [pipelineItems]);

  function handleAdd(projectId: string, projectName: string) {
    const result = addToPipeline(projectId);
    if (result === "saved") {
      setFocusProjectId(projectId);
      setWorkspaceAnnouncement(`${projectName} saved to the browser pipeline.`);
      return;
    }
    setWorkspaceAnnouncement(result === "no_change"
      ? `${projectName} is already in the pipeline.`
      : `Browser storage could not add ${projectName}. Nothing changed.`);
  }

  function handleRemoved(projectName: string) {
    setWorkspaceAnnouncement(`${projectName} removed from the browser-saved pipeline.`);
    focusIntroRef.current = true;
  }

  function handleMove(projectId: string, stage: PipelineStage) {
    const projectName = getOpportunity(projectId)?.project.name ?? projectId;
    const result = movePipelineItem(projectId, stage);
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
      title="Investment pipeline"
      headerAside={<Chip tone="accent" size="sm">synthetic_demo</Chip>}
      actions={(
        <Link href={"/investor/search" as Route} className={styles.searchLink}>
          <Search aria-hidden="true" /> Discover projects
        </Link>
      )}
    >
      <div className={styles.page}>
        <p className="sr-only" role="status" aria-live="polite">
          {workspaceAnnouncement}
        </p>
        <section className={styles.intro}>
          <div>
            <p className={styles.kicker}>Decision context stays attached</p>
            <h2 ref={introHeadingRef} tabIndex={-1}>
              Move a project without losing the reasoning behind it.
            </h2>
          </div>
          <p>
            Stages and private notes are stored only in this browser during the demo.
            Moving a card does not contact a founder or create an external record.
          </p>
        </section>

        {!hasHydrated ? (
          <div className={styles.loading} aria-live="polite">Loading local pipeline…</div>
        ) : pipelineItems.length === 0 ? (
          <section className={styles.empty}>
            <span className={styles.emptyIcon}><FolderKanban aria-hidden="true" /></span>
            <Chip tone="accent" size="sm">synthetic_demo</Chip>
            <h2>Your pipeline is deliberately empty.</h2>
            <p>
              Add a synthetic opportunity below to try stage moves and private notes.
              Nothing leaves this device.
            </p>
          </section>
        ) : (
          <section className={styles.board} aria-label="Pipeline stages">
            {PIPELINE_STAGES.map((stage) => (
              <section className={styles.column} key={stage} aria-labelledby={`stage-${stage}`}>
                <header className={styles.columnHeader}>
                  <h2 id={`stage-${stage}`}>{STAGE_LABELS[stage]}</h2>
                  <span>{grouped[stage].length}</span>
                </header>
                <div className={styles.columnBody}>
                  {grouped[stage].length ? grouped[stage].map((item) => (
                    <PipelineCard
                      key={item.projectId}
                      item={item}
                      shouldFocus={focusProjectId === item.projectId}
                      onMove={handleMove}
                      onFocused={() => setFocusProjectId(null)}
                      onMessage={setWorkspaceAnnouncement}
                      onRemoved={handleRemoved}
                    />
                  )) : (
                    <p className={styles.columnEmpty}>No projects at this stage.</p>
                  )}
                </div>
              </section>
            ))}
          </section>
        )}

        {hasHydrated ? (
          <DemoCatalog pipelineIds={pipelineIds} onAdd={handleAdd} />
        ) : null}
      </div>
    </AppShell>
  );
}
