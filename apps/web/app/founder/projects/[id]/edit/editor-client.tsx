"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  Check,
  CircleCheck,
  CircleDashed,
  ExternalLink,
  Github,
  Globe,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button, DataBadge, SourceChip, StageBadge, TimelineItem } from "@/components/pencil";
import type { EvidenceTone } from "@/components/pencil";
import { SECTION_DEFINITIONS } from "@/lib/founder/sections";
import {
  computeCompletionPercent,
  countSectionsNeedingInput,
  type SectionSummary,
} from "@/lib/founder/completeness";
import { deriveClaimOrigin } from "@/lib/founder/origin";
import type { FounderProjectRow } from "@/lib/founder/data.server";
import type { ClaimOrigin, FounderClaimEvidenceLinkRow, FounderClaimRow, FounderEvidenceRow } from "@/lib/founder/types";
import { formatDate, formatRelativeToNow } from "@/lib/founder/format";
import {
  addEvidenceAction,
  addRepeatableClaimAction,
  confirmClaimSuggestionAction,
  createSectionClaimAction,
  deleteClaimAction,
  publishProjectAction,
  touchProjectAction,
  updateClaimTextAction,
  type ActionResult,
} from "../actions";
import styles from "./editor.module.css";

interface EditorClientProps {
  project: FounderProjectRow;
  claims: FounderClaimRow[];
  evidence: FounderEvidenceRow[];
  claimEvidenceLinks: FounderClaimEvidenceLinkRow[];
  sections: SectionSummary[];
}

function useServerAction<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<ActionResult>,
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(...args: TArgs) {
    setError(null);
    startTransition(async () => {
      const result = await action(...args);
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  return { run, isPending, error };
}

const ORIGIN_CONFIG: Record<ClaimOrigin, { tone: EvidenceTone; icon: ReactNode; label: string }> = {
  founder_provided: { tone: "founder-provided", icon: <PenLine aria-hidden="true" />, label: "Founder-provided" },
  ai_structured: { tone: "inference", icon: <Sparkles aria-hidden="true" />, label: "AI-structured" },
  external: { tone: "external", icon: <Globe aria-hidden="true" />, label: "External source" },
};

function SectionStatusIcon({ status }: { status: SectionSummary["status"] }) {
  if (status === "complete") return <CircleCheck size={16} className={styles.iconComplete} aria-hidden="true" />;
  if (status === "needs_evidence") return <TriangleAlert size={16} className={styles.iconWarning} aria-hidden="true" />;
  return <CircleDashed size={16} className={styles.iconMissing} aria-hidden="true" />;
}

function ClaimCard({
  projectId,
  claim,
  links,
}: {
  projectId: string;
  claim: FounderClaimRow;
  links: FounderClaimEvidenceLinkRow[];
}) {
  const origin = deriveClaimOrigin(links.filter((link) => link.claim_id === claim.id));
  const config = ORIGIN_CONFIG[origin.origin];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(claim.statement);
  const saveAction = useServerAction(updateClaimTextAction);
  const confirmAction = useServerAction(confirmClaimSuggestionAction);
  const deleteAction = useServerAction(deleteClaimAction);

  const showSuggestion = origin.origin !== "founder_provided" && !origin.confirmed && !editing;

  return (
    <div className={styles.claimCard}>
      <div className={styles.claimCardTop}>
        <DataBadge tone={config.tone} icon={config.icon} label={config.label} />
        <div className={styles.claimCardActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Edit"
            onClick={() => {
              setDraft(claim.statement);
              setEditing((value) => !value);
            }}
          >
            <PenLine size={15} aria-hidden="true" />
          </button>
          {claim.predicate === "project.traction" || claim.predicate === "project.milestone" ? (
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Remove"
              disabled={deleteAction.isPending}
              onClick={() => deleteAction.run(projectId, claim.id)}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className={styles.editArea}>
          <textarea
            className={styles.editTextarea}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            autoFocus
          />
          <div className={styles.editActions}>
            <Button
              variant="secondary"
              disabled={saveAction.isPending}
              onClick={() => {
                saveAction.run(projectId, claim.id, draft);
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className={styles.claimStatement}>{claim.statement}</p>
      )}

      {showSuggestion ? (
        <div className={styles.suggestionBox}>
          <p className={styles.suggestionNote}>{origin.sourceNote ?? "Suggested"} — confirm or edit</p>
          <div className={styles.suggestionActions}>
            <Button variant="secondary" disabled={confirmAction.isPending} onClick={() => confirmAction.run(projectId, claim.id)}>
              Accept
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(claim.statement);
                setEditing(true);
              }}
            >
              Rewrite
            </Button>
          </div>
        </div>
      ) : null}

      {(saveAction.error || confirmAction.error || deleteAction.error) ? (
        <p className={styles.inlineError} role="alert">
          {saveAction.error ?? confirmAction.error ?? deleteAction.error}
        </p>
      ) : null}
    </div>
  );
}

function AddClaimForm({
  projectId,
  predicate,
  label,
  repeatable,
  withDate,
}: {
  projectId: string;
  predicate: string;
  label: string;
  repeatable?: boolean;
  withDate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const createAction = useServerAction(createSectionClaimAction);
  const addAction = useServerAction(addRepeatableClaimAction);
  const action = repeatable ? addAction : createAction;

  if (!open) {
    return (
      <button type="button" className={styles.addTrigger} onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden="true" />
        Add {label.toLowerCase()}
      </button>
    );
  }

  return (
    <div className={styles.addForm}>
      <textarea
        className={styles.editTextarea}
        placeholder={`Describe ${label.toLowerCase()}…`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        autoFocus
      />
      {withDate ? (
        <label className={styles.dateField}>
          <span>Date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      ) : null}
      <div className={styles.editActions}>
        <Button
          variant="secondary"
          disabled={action.isPending || !text.trim()}
          onClick={() => {
            if (repeatable) {
              addAction.run(projectId, predicate, text, withDate ? new Date(date).toISOString() : undefined);
            } else {
              createAction.run(projectId, predicate, text);
            }
            setText("");
            setOpen(false);
          }}
        >
          Save
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {action.error ? (
        <p className={styles.inlineError} role="alert">
          {action.error}
        </p>
      ) : null}
    </div>
  );
}

function AddLinkForm({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"website" | "github_repo" | "demo_link">("website");
  const [url, setUrl] = useState("");
  const action = useServerAction(addEvidenceAction);

  if (!open) {
    return (
      <button type="button" className={styles.addTrigger} onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden="true" />
        Add link
      </button>
    );
  }

  return (
    <div className={styles.addForm}>
      <div className={styles.linkFormRow}>
        <select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
          <option value="website">Website</option>
          <option value="github_repo">Code repository</option>
          <option value="demo_link">Demo link</option>
        </select>
        <input
          type="url"
          placeholder="https://…"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </div>
      <div className={styles.editActions}>
        <Button
          variant="secondary"
          disabled={action.isPending || !url.trim()}
          onClick={() => {
            action.run(projectId, type, url);
            setUrl("");
            setOpen(false);
          }}
        >
          Save
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {action.error ? (
        <p className={styles.inlineError} role="alert">
          {action.error}
        </p>
      ) : null}
    </div>
  );
}

function AddEvidenceForClaim({ projectId, claimId }: { projectId: string; claimId: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const action = useServerAction(addEvidenceAction);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add evidence
      </Button>
    );
  }

  return (
    <div className={styles.addForm}>
      <input type="url" placeholder="https://…" value={url} onChange={(event) => setUrl(event.target.value)} />
      <input
        type="text"
        placeholder="What does this show? (optional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className={styles.editActions}>
        <Button
          variant="secondary"
          disabled={action.isPending || !url.trim()}
          onClick={() => {
            action.run(projectId, "founder_link", url, note, claimId, "supports");
            setUrl("");
            setNote("");
            setOpen(false);
          }}
        >
          Save
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {action.error ? (
        <p className={styles.inlineError} role="alert">
          {action.error}
        </p>
      ) : null}
    </div>
  );
}

export function EditorClient({ project, claims, evidence, claimEvidenceLinks, sections }: EditorClientProps) {
  const completionPercent = computeCompletionPercent(sections);
  const sectionsNeedingInput = countSectionsNeedingInput(sections);
  const touchAction = useServerAction(touchProjectAction);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isPublishing, startPublish] = useTransition();
  const router = useRouter();

  const linkEvidence = evidence.filter((row) => ["website", "github_repo", "demo_link"].includes(row.evidence_type));
  const tractionSourceChips = evidence.filter((row) => ["github_repo", "demo_link"].includes(row.evidence_type));

  function publish() {
    setPublishError(null);
    startPublish(async () => {
      const result = await publishProjectAction(project.id);
      if (!result.ok) {
        setPublishError(
          result.missing && result.missing.length > 0
            ? `Still needed: ${result.missing.map((item) => item.label).join(", ")}.`
            : result.error ?? "Could not publish yet.",
        );
      } else {
        router.refresh();
      }
    });
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerTitleRow}>
            <h1 className={styles.projectName}>{project.name}</h1>
            {project.stage ? <StageBadge label={project.stage} /> : null}
          </div>
          <div className={styles.headerActions}>
            <Button variant="secondary" disabled={touchAction.isPending} onClick={() => touchAction.run(project.id)}>
              Save draft
            </Button>
            <Button disabled={isPublishing} onClick={publish}>
              {project.status === "published" ? "Update published profile" : "Publish changes"}
            </Button>
          </div>
        </div>
        <p className={styles.headerMeta}>
          Project editor · draft last saved {formatRelativeToNow(project.updated_at)}
        </p>
        <div className={styles.completionRow}>
          <div className={styles.completionTrack}>
            <div className={styles.completionFill} style={{ width: `${completionPercent}%` }} />
          </div>
          <span className={styles.completionLabel}>{completionPercent}% complete</span>
          <span className={styles.completionNote}>
            {sectionsNeedingInput} section{sectionsNeedingInput === 1 ? "" : "s"} still need{sectionsNeedingInput === 1 ? "s" : ""} input
          </span>
        </div>
        {publishError ? (
          <p className={styles.inlineError} role="alert">
            {publishError}
          </p>
        ) : null}
      </header>

      <div className={styles.layout}>
        <nav className={styles.sidebar} aria-label="Sections">
          <span className={styles.sidebarLabel}>Sections</span>
          {sections.map((section) => (
            <a key={section.key} href={`#${section.key}`} className={styles.sidebarItem}>
              <SectionStatusIcon status={section.status} />
              <span>{section.label}</span>
            </a>
          ))}
        </nav>

        <div className={styles.main}>
          {SECTION_DEFINITIONS.map((definition) => {
            const summary = sections.find((section) => section.key === definition.key)!;
            return (
              <section key={definition.key} id={definition.key} className={styles.sectionBlock}>
                <div className={styles.sectionHeading}>
                  <SectionStatusIcon status={summary.status} />
                  <h2>{definition.label}</h2>
                </div>

                {definition.kind === "claim" ? (
                  summary.claims.length > 0 ? (
                    <ClaimCard projectId={project.id} claim={summary.claims[0]!} links={claimEvidenceLinks} />
                  ) : (
                    <AddClaimForm projectId={project.id} predicate={definition.predicate!} label={definition.label} />
                  )
                ) : null}

                {definition.kind === "claim_repeatable" && definition.key === "traction" ? (
                  <>
                    {summary.claims.map((claim) => (
                      <ClaimCard key={claim.id} projectId={project.id} claim={claim} links={claimEvidenceLinks} />
                    ))}
                    {tractionSourceChips.length > 0 ? (
                      <div className={styles.chipRow}>
                        {tractionSourceChips.map((row) => (
                          <SourceChip
                            key={row.id}
                            icon={row.evidence_type === "github_repo" ? <Github aria-hidden="true" /> : <Globe aria-hidden="true" />}
                            label={row.evidence_type === "github_repo" ? "GitHub" : "Demo link"}
                          />
                        ))}
                      </div>
                    ) : null}
                    {summary.status === "needs_evidence" ? (
                      <div className={styles.warningBox}>
                        <TriangleAlert size={16} aria-hidden="true" />
                        <span>Add evidence to support this traction claim.</span>
                        <AddEvidenceForClaim projectId={project.id} claimId={summary.claims[0]!.id} />
                      </div>
                    ) : null}
                    <AddClaimForm projectId={project.id} predicate={definition.predicate!} label={definition.label} repeatable />
                  </>
                ) : null}

                {definition.kind === "claim_repeatable" && definition.key === "milestones" ? (
                  <>
                    {summary.claims.length > 0 ? (
                      <div className={styles.timeline}>
                        {summary.claims.map((claim, index) => (
                          <TimelineItem
                            key={claim.id}
                            date={formatDate(claim.observed_at)}
                            title={claim.statement}
                            isLast={index === summary.claims.length - 1}
                          />
                        ))}
                      </div>
                    ) : null}
                    <AddClaimForm
                      projectId={project.id}
                      predicate={definition.predicate!}
                      label={definition.label}
                      repeatable
                      withDate
                    />
                  </>
                ) : null}

                {definition.kind === "evidence_links" ? (
                  <>
                    {linkEvidence.length > 0 ? (
                      <ul className={styles.linkList}>
                        {linkEvidence.map((row) => (
                          <li key={row.id} className={styles.linkItem}>
                            {row.evidence_type === "github_repo" ? (
                              <Github size={15} aria-hidden="true" />
                            ) : (
                              <Globe size={15} aria-hidden="true" />
                            )}
                            <span className={styles.linkType}>
                              {row.evidence_type === "github_repo"
                                ? "Repository"
                                : row.evidence_type === "demo_link"
                                  ? "Demo"
                                  : "Website"}
                            </span>
                            <a href={row.source_url ?? "#"} target="_blank" rel="noreferrer" className={styles.linkHref}>
                              {row.source_url}
                              <ExternalLink size={12} aria-hidden="true" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <AddLinkForm projectId={project.id} />
                  </>
                ) : null}

                {definition.kind === "evidence_all" ? (
                  <ul className={styles.evidenceList}>
                    {evidence.length === 0 ? <li className={styles.emptyNote}>No evidence recorded yet.</li> : null}
                    {evidence.map((row) => (
                      <li key={row.id} className={styles.evidenceItem}>
                        <Check size={14} className={styles.iconComplete} aria-hidden="true" />
                        <span className={styles.evidenceType}>{row.evidence_type.replace(/_/g, " ")}</span>
                        <span className={styles.evidenceDate}>{formatDate(row.captured_at)}</span>
                        {row.source_url ? (
                          <a href={row.source_url} target="_blank" rel="noreferrer" className={styles.linkHref}>
                            View source
                            <ExternalLink size={12} aria-hidden="true" />
                          </a>
                        ) : row.excerpt ? (
                          <span className={styles.evidenceExcerpt}>&ldquo;{row.excerpt}&rdquo;</span>
                        ) : (
                          <span className={styles.evidenceExcerpt}>Private file</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
