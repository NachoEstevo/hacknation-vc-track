"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CircleCheck,
  CircleDashed,
  ExternalLink,
  Github,
  Globe,
  TriangleAlert,
} from "lucide-react";
import { Avatar, Button, DataBadge, SectorTag, SourceChip, StageBadge, TimelineItem } from "@/components/pencil";
import type { FounderProjectRow } from "@/lib/founder/data.server";
import type { PublishChecklistItem, SectionStatus } from "@/lib/founder/completeness";
import { canPublishProject } from "@/lib/founder/completeness";
import type { FounderClaimEvidenceLinkRow, FounderClaimRow, FounderEvidenceRow } from "@/lib/founder/types";
import { formatDate } from "@/lib/founder/format";
import { addEvidenceAction, publishProjectAction, unpublishProjectAction } from "../actions";
import styles from "./preview.module.css";

interface PreviewClientProps {
  project: FounderProjectRow;
  claims: FounderClaimRow[];
  evidence: FounderEvidenceRow[];
  claimEvidenceLinks: FounderClaimEvidenceLinkRow[];
  checklist: PublishChecklistItem[];
  founderName: string;
}

function claimsFor(claims: FounderClaimRow[], predicate: string): FounderClaimRow[] {
  return claims.filter((claim) => claim.predicate === predicate);
}

function ChecklistIcon({ status }: { status: SectionStatus }) {
  if (status === "complete") return <CircleCheck size={16} className={styles.iconComplete} aria-hidden="true" />;
  if (status === "needs_evidence") return <TriangleAlert size={16} className={styles.iconWarning} aria-hidden="true" />;
  return <CircleDashed size={16} className={styles.iconMissing} aria-hidden="true" />;
}

function BlockControls({ projectId, claimId, editHref }: { projectId: string; claimId?: string; editHref: string }) {
  const [addOpen, setAddOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className={styles.blockControls}>
      <button
        type="button"
        className={styles.controlButton}
        aria-disabled="true"
        title="Claims stay private until independently verified — nothing to hide yet."
      >
        Hide
      </button>
      <Link href={editHref as Route} className={styles.controlButton}>
        Fix info
      </Link>
      {claimId ? (
        <button type="button" className={styles.controlButton} onClick={() => setAddOpen((value) => !value)}>
          Add evidence
        </button>
      ) : null}
      {addOpen && claimId ? (
        <div className={styles.addEvidencePopover}>
          <input
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button
            variant="secondary"
            disabled={isPending || !url.trim()}
            onClick={() =>
              startTransition(async () => {
                await addEvidenceAction(projectId, "founder_link", url, undefined, claimId, "supports");
                setUrl("");
                setAddOpen(false);
                router.refresh();
              })
            }
          >
            Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function PreviewClient({
  project,
  claims,
  evidence,
  claimEvidenceLinks,
  checklist,
  founderName,
}: PreviewClientProps) {
  const router = useRouter();
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isPublishing, startPublish] = useTransition();
  const [isUnpublishing, startUnpublish] = useTransition();

  const problem = claimsFor(claims, "project.problem")[0];
  const solution = claimsFor(claims, "project.solution")[0];
  const productStatus = claimsFor(claims, "project.product_status")[0];
  const team = claimsFor(claims, "project.team")[0];
  const traction = claimsFor(claims, "project.traction");
  const milestones = claimsFor(claims, "project.milestone").slice().sort((a, b) =>
    a.observed_at < b.observed_at ? 1 : -1,
  );
  const tractionHasEvidence = traction.some((claim) =>
    claimEvidenceLinks.some((link) => link.claim_id === claim.id),
  );
  const tractionChips = evidence.filter((row) => ["github_repo", "demo_link"].includes(row.evidence_type));

  const editHref = `/founder/projects/${project.id}/edit`;
  const canPublish = canPublishProject(checklist);
  const isPublished = project.visibility === "published";

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

  function unpublish() {
    startUnpublish(async () => {
      await unpublishProjectAction(project.id);
      router.refresh();
    });
  }

  return (
    <main className={styles.page}>
      <div className={styles.banner}>
        <span>Preview mode — this is exactly how investors see your profile. Hidden items stay private.</span>
        <Link href={editHref as Route} className={styles.bannerLink}>
          Back to editor
        </Link>
      </div>

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.headerCard}>
            <Avatar name={project.name} />
            <div className={styles.headerCardBody}>
              <div className={styles.headerCardTitleRow}>
                <h1>{project.name}</h1>
                {isPublished ? <DataBadge tone="verified" label="Published profile" /> : null}
              </div>
              <p className={styles.headerCardMeta}>
                {founderName}
                {project.location ? ` · ${project.location}` : ""}
              </p>
              <div className={styles.headerCardTags}>
                {project.stage ? <StageBadge label={project.stage} /> : null}
                {project.sector_tags.map((tag) => (
                  <SectorTag key={tag} label={tag} />
                ))}
              </div>
            </div>
          </section>

          <section className={styles.block}>
            <div className={styles.blockHeading}>
              <h2>Problem &amp; solution</h2>
              <BlockControls projectId={project.id} editHref={`${editHref}#problem`} />
            </div>
            {problem || solution ? (
              <div className={styles.blockBody}>
                {problem ? <p>{problem.statement}</p> : null}
                {solution ? <p>{solution.statement}</p> : null}
              </div>
            ) : (
              <p className={styles.emptyNote}>Insufficient evidence — not provided yet.</p>
            )}
          </section>

          <section className={styles.block}>
            <div className={styles.blockHeading}>
              <h2>Product status</h2>
              <BlockControls projectId={project.id} claimId={productStatus?.id} editHref={`${editHref}#product_status`} />
            </div>
            {productStatus ? (
              <p className={styles.blockBody}>{productStatus.statement}</p>
            ) : (
              <p className={styles.emptyNote}>Insufficient evidence — not provided yet.</p>
            )}
          </section>

          <section className={styles.block}>
            <div className={styles.blockHeading}>
              <h2>Team</h2>
              <BlockControls projectId={project.id} editHref={`${editHref}#team`} />
            </div>
            {team ? (
              <p className={styles.blockBody}>{team.statement}</p>
            ) : (
              <p className={styles.emptyNote}>Insufficient evidence — not provided yet.</p>
            )}
          </section>

          <section className={styles.block}>
            <div className={styles.blockHeading}>
              <h2>Traction</h2>
              <BlockControls projectId={project.id} claimId={traction[0]?.id} editHref={`${editHref}#traction`} />
            </div>
            {traction.length > 0 ? (
              <div className={styles.blockBody}>
                {traction.map((claim) => (
                  <p key={claim.id}>{claim.statement}</p>
                ))}
                {tractionChips.length > 0 ? (
                  <div className={styles.chipRow}>
                    {tractionChips.map((row) => (
                      <SourceChip
                        key={row.id}
                        icon={row.evidence_type === "github_repo" ? <Github aria-hidden="true" /> : <Globe aria-hidden="true" />}
                        label={row.evidence_type === "github_repo" ? "GitHub" : "Demo link"}
                      />
                    ))}
                  </div>
                ) : null}
                {!tractionHasEvidence ? (
                  <div className={styles.warningBox}>
                    <TriangleAlert size={16} aria-hidden="true" />
                    <span>Traction has no evidence yet — investors will see these claims marked as unverified.</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className={styles.emptyNote}>Insufficient evidence — not provided yet.</p>
            )}
          </section>

          <section className={styles.block}>
            <div className={styles.blockHeading}>
              <h2>Milestones</h2>
              <BlockControls projectId={project.id} editHref={`${editHref}#milestones`} />
            </div>
            {milestones.length > 0 ? (
              <div className={styles.timeline}>
                {milestones.map((claim, index) => (
                  <TimelineItem
                    key={claim.id}
                    date={formatDate(claim.observed_at)}
                    title={claim.statement}
                    isLast={index === milestones.length - 1}
                  />
                ))}
              </div>
            ) : (
              <p className={styles.emptyNote}>Insufficient evidence — not provided yet.</p>
            )}
          </section>
        </div>

        <aside className={styles.sidebar}>
          <h2 className={styles.sidebarTitle}>Before you publish</h2>
          <ul className={styles.checklist}>
            {checklist.map((item) => (
              <li key={item.key} className={styles.checklistItem}>
                <ChecklistIcon status={item.status} />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
          <p className={styles.sidebarNote}>Visible to registered investors only.</p>
          {publishError ? (
            <p className={styles.inlineError} role="alert">
              {publishError}
            </p>
          ) : null}
          {isPublished ? (
            <>
              <Button variant="secondary" fullWidth disabled>
                Profile published
              </Button>
              <button type="button" className={styles.unpublishLink} disabled={isUnpublishing} onClick={unpublish}>
                Unpublish
              </button>
            </>
          ) : (
            <>
              <Button fullWidth disabled={!canPublish || isPublishing} onClick={publish}>
                Publish profile
              </Button>
              <p className={styles.sidebarNote}>You can unpublish at any time.</p>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
