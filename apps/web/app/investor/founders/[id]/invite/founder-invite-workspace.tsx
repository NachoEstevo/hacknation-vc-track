"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clipboard,
  Copy,
  MailX,
  MapPin,
  ShieldQuestion,
  UserRoundCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { StatusBadge } from "@/components/ui/status";
import {
  createInvitationDraft,
  INVITATION_STATUS_COPY,
  invitationDraftForClipboard,
} from "./invitation-draft";
import styles from "./page.module.css";

type FounderInviteWorkspaceProps = {
  founder: {
    id: string;
    name: string;
    role: string;
    location: string;
  };
  opportunity: {
    id: string;
    name: string;
    tagline: string;
    dataLabel: "synthetic_demo";
  } | null;
  founderClaims: Array<{
    id: string;
    statement: string;
    state: "unverified" | "supported" | "partially_supported" | "contradicted" | "stale";
    trustScore: number;
  }>;
};

type InviteState = keyof typeof INVITATION_STATUS_COPY;

function claimStatus(
  state: FounderInviteWorkspaceProps["founderClaims"][number]["state"],
) {
  if (state === "supported") return "supported" as const;
  if (state === "contradicted") return "contradicted" as const;
  if (state === "stale") return "stale" as const;
  if (state === "partially_supported") return "partial" as const;
  return "unconfirmed" as const;
}

export function FounderInviteWorkspace({
  founder,
  opportunity,
  founderClaims,
}: FounderInviteWorkspaceProps) {
  const initialMessage = useMemo(() => createInvitationDraft({
    founderName: founder.name,
    projectName: opportunity?.name ?? null,
  }), [founder.name, opportunity?.name]);
  const [message, setMessage] = useState(initialMessage);
  const [inviteState, setInviteState] = useState<InviteState>("draft");

  async function copyInvitationDraft() {
    try {
      await navigator.clipboard.writeText(invitationDraftForClipboard(message));
      setInviteState("copied");
    } catch {
      setInviteState("copy_error");
    }
  }

  return (
    <AppShell
      eyebrow="Founder verification"
      title="Prepare invitation"
      headerAside={<Chip tone="accent" size="sm">synthetic_demo</Chip>}
      actions={opportunity ? (
        <Link href={`/investor/projects/${opportunity.id}` as Route} className={styles.backLink}>
          <ArrowLeft aria-hidden="true" /> Back to brief
        </Link>
      ) : undefined}
    >
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.profileBlock}>
            <span className={styles.avatar} aria-hidden="true">
              {founder.name === "Unresolved founder"
                ? "?"
                : founder.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}
            </span>
            <div>
              <div className={styles.profileTopline}>
                <Chip tone="founder" size="sm">Provisional profile</Chip>
                <Chip tone="accent" size="sm">synthetic_demo</Chip>
              </div>
              <h2>{founder.name}</h2>
              <p>{founder.role}{opportunity ? ` · ${opportunity.name}` : ""}</p>
              <span><MapPin aria-hidden="true" /> {founder.location}</span>
            </div>
          </div>
          <aside>
            <MailX aria-hidden="true" />
            <div>
              <strong>No automatic outreach</strong>
              <p>
                No verified email address is stored in this demo. Preparing or copying
                the draft does not send a message to any contact channel.
              </p>
            </div>
          </aside>
        </section>

        <div className={styles.workspaceGrid}>
          <section className={styles.composer} aria-labelledby="invite-composer-title">
            <header>
              <div>
                <p>Invitation draft</p>
                <h2 id="invite-composer-title">Ask the founder to review the record.</h2>
              </div>
              <span>{message.length} characters</span>
            </header>

            <label className={styles.messageField}>
              <span>Message</span>
              <textarea
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setInviteState("draft");
                }}
                rows={11}
                maxLength={1600}
              />
            </label>

            <div className={styles.copyDraft}>
              <div>
                <span>Manual handoff only</span>
                <p>
                  This prototype has no founder account or identity-verification flow.
                  Copy the visible message, then choose a verified contact channel yourself.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<Copy />}
                disabled={!message.trim()}
                onClick={copyInvitationDraft}
              >
                Copy invitation draft
              </Button>
            </div>

            <div className={styles.actions}>
              <Button
                variant="primary"
                size="lg"
                leadingIcon={<Clipboard />}
                disabled={!message.trim()}
                onClick={() => setInviteState("prepared")}
              >
                Prepare invitation
              </Button>
              <p>
                This creates a local prepared state only. Choose and operate the actual
                communication channel yourself.
              </p>
            </div>

            <div
              className={styles.inviteStatus}
              data-state={inviteState}
              role="status"
              aria-live="polite"
            >
              {inviteState === "draft" ? (
                <><ShieldQuestion aria-hidden="true" /> {INVITATION_STATUS_COPY.draft}</>
              ) : null}
              {inviteState === "prepared" ? (
                <><Check aria-hidden="true" /> {INVITATION_STATUS_COPY.prepared}</>
              ) : null}
              {inviteState === "copied" ? (
                <><Check aria-hidden="true" /> {INVITATION_STATUS_COPY.copied}</>
              ) : null}
              {inviteState === "copy_error" ? (
                <><ShieldQuestion aria-hidden="true" /> {INVITATION_STATUS_COPY.copy_error}</>
              ) : null}
            </div>
          </section>

          <aside className={styles.evidencePanel}>
            <header>
              <p>Before contact</p>
              <h2>Known vs. unknown</h2>
            </header>

            <section className={styles.known} aria-labelledby="known-title">
              <h3 id="known-title"><UserRoundCheck aria-hidden="true" /> Present in the fixture</h3>
              <dl>
                <div>
                  <dt>Name</dt>
                  <dd>{founder.name}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{founder.role}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{founder.location}</dd>
                </div>
                <div>
                  <dt>Linked project</dt>
                  <dd>{opportunity?.name ?? "Unknown"}</dd>
                </div>
              </dl>
            </section>

            {founderClaims.length ? (
              <section className={styles.claims} aria-labelledby="claims-title">
                <h3 id="claims-title">Founder-linked claims</h3>
                {founderClaims.map((claim) => (
                  <article key={claim.id}>
                    <StatusBadge status={claimStatus(claim.state)} label={claim.state.replaceAll("_", " ")} />
                    <p>{claim.statement}</p>
                    <span>Trust {claim.trustScore}/100 · synthetic evidence</span>
                  </article>
                ))}
              </section>
            ) : null}

            <section className={styles.unknown} aria-labelledby="unknown-title">
              <h3 id="unknown-title">Still unknown</h3>
              <ul>
                <li>Verified contact email or preferred channel</li>
                <li>Identity ownership and permission to edit</li>
                <li>Whether the profile is current beyond the recorded snapshot</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
