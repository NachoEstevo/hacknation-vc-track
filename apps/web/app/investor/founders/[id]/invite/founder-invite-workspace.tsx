"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import {
  Check,
  Clipboard,
  Copy,
  Globe,
  Mail,
  MailX,
  MapPin,
  ShieldQuestion,
  UserRoundCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Chip } from "@/components/ui/chip";
import { Avatar, Button, ConfidenceBadge, DataBadge, type EvidenceTone } from "@/components/pencil";
import { isSupabaseEnabled } from "@/lib/env";
import { sendFounderInvitationAction } from "@/lib/supabase/workspace-invitations.actions";
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

function claimTone(
  state: FounderInviteWorkspaceProps["founderClaims"][number]["state"],
): EvidenceTone {
  if (state === "supported") return "verified";
  if (state === "contradicted") return "risk";
  if (state === "stale") return "unknown";
  if (state === "partially_supported") return "inference";
  return "unknown";
}

/** Buckets a claim's Trust Score into the same confidence tiers used across the diligence views. */
function confidenceFromTrust(score: number): "high" | "medium" | "low" {
  if (score >= 75) return "high";
  if (score >= 55) return "medium";
  return "low";
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
  const [invitedEmail, setInvitedEmail] = useState("");
  const [emailInviteStatus, setEmailInviteStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailInviteError, setEmailInviteError] = useState("");
  const [sentToken, setSentToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const founderIsResolved = founder.name !== "Unresolved founder";
  const profileHref = founderIsResolved ? (`/investor/founders/${founder.id}` as Route) : null;
  const averageTrust = founderClaims.length
    ? Math.round(founderClaims.reduce((sum, claim) => sum + claim.trustScore, 0) / founderClaims.length)
    : null;
  const supabaseEnabled = isSupabaseEnabled();

  async function copyInvitationDraft() {
    try {
      await navigator.clipboard.writeText(invitationDraftForClipboard(message));
      setInviteState("copied");
    } catch {
      setInviteState("copy_error");
    }
  }

  async function sendEmailInvitation() {
    if (!opportunity) return;
    setEmailInviteStatus("sending");
    setEmailInviteError("");
    const result = await sendFounderInvitationAction({
      opportunityId: opportunity.id,
      invitedEmail,
    });
    if (result.ok) {
      setEmailInviteStatus("sent");
      setSentToken(result.token ?? null);
      setExpiresAt(result.expiresAt ?? null);
    } else {
      setEmailInviteStatus("error");
      setEmailInviteError(result.error ?? "The invitation could not be sent.");
    }
  }

  return (
    <AppShell
      eyebrow="Founder verification"
      title="Prepare invitation"
      headerAside={<Chip tone="accent" size="sm">synthetic_demo</Chip>}
      actions={opportunity ? (
        <Link href={`/investor/projects/${opportunity.id}` as Route} className={styles.backLink}>
          Back to brief
        </Link>
      ) : undefined}
    >
      <div className={styles.page}>
        <section className={styles.profileCard} aria-labelledby="profile-title">
          <div className={styles.profileBand}>
            <Globe aria-hidden="true" />
            <span>
              Provisional profile — assembled from the evidence captured in this demo. Not
              confirmed by the founder.
            </span>
          </div>

          <div className={styles.profileInner}>
            <div className={styles.identityRow}>
              <Avatar name={founder.name} />
              <div className={styles.identityCopy}>
                <div className={styles.identityNameRow}>
                  <h2 id="profile-title">{founder.name}</h2>
                  <Chip tone="founder" size="sm">Provisional profile</Chip>
                </div>
                <span className={styles.identitySub}>
                  <MapPin aria-hidden="true" />
                  {founder.role}
                  {opportunity ? ` · ${opportunity.name}` : ""} · {founder.location}
                </span>
              </div>
              {averageTrust !== null ? (
                <ConfidenceBadge level={confidenceFromTrust(averageTrust)} />
              ) : (
                <DataBadge tone="unknown" label="No confidence signal" />
              )}
            </div>

            <div className={styles.divider} />

            <span className={styles.signalsLabel}>Founder-linked claims</span>
            {founderClaims.length ? (
              <div className={styles.signalsList}>
                {founderClaims.map((claim) => (
                  <div key={claim.id} className={styles.signalRow}>
                    <DataBadge tone={claimTone(claim.state)} label={claim.state.replaceAll("_", " ")} />
                    <p>{claim.statement}</p>
                    <span className={styles.signalMeta}>Trust {claim.trustScore}/100</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.limitedNote}>
                <ShieldQuestion aria-hidden="true" />
                <span>No claims are linked to this founder yet in this demo snapshot.</span>
              </div>
            )}

            {profileHref ? (
              <Link href={profileHref} className={styles.profileLink}>
                <UserRoundCheck aria-hidden="true" /> View persistent founder profile
              </Link>
            ) : null}
          </div>
        </section>

        <aside className={styles.limitationNote}>
          <MailX aria-hidden="true" />
          <div>
            <strong>No automatic outreach</strong>
            <p>
              No verified email address is stored in this demo. Preparing or copying the draft
              does not send a message to any contact channel — choose and operate the actual
              communication channel yourself.
            </p>
          </div>
        </aside>

        <div className={styles.workspaceGrid}>
          <section className={styles.actionsCard} aria-labelledby="actions-title">
            <span className={styles.eyebrow} id="actions-title">Actions</span>
            <p className={styles.actionsHint}>Ask the founder to review the record.</p>

            <label className={styles.messageField}>
              <span>Message · {message.length} characters</span>
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
              <span>
                This prototype has no founder account or identity-verification flow. Copy the
                visible message, then choose a verified contact channel yourself.
              </span>
              <Button
                variant="secondary"
                leadingIcon={<Copy aria-hidden="true" />}
                disabled={!message.trim()}
                onClick={copyInvitationDraft}
              >
                Copy invitation draft
              </Button>
            </div>

            <Button
              variant="primary"
              leadingIcon={<Clipboard aria-hidden="true" />}
              disabled={!message.trim()}
              onClick={() => setInviteState("prepared")}
              className={styles.prepareButton}
            >
              Prepare invitation
            </Button>
            <p className={styles.actionsFootnote}>
              This creates a local prepared state only. Choose and operate the actual
              communication channel yourself.
            </p>

            <div className={styles.inviteStatus} data-state={inviteState} role="status" aria-live="polite">
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

            {supabaseEnabled && opportunity ? (
              <div className={styles.emailInviteCard}>
                <span>Real invitation</span>
                <label className={styles.emailField}>
                  <span className="sr-only">Founder email address</span>
                  <input
                    type="email"
                    value={invitedEmail}
                    onChange={(event) => {
                      setInvitedEmail(event.target.value);
                      setEmailInviteStatus("idle");
                    }}
                    placeholder="founder@company.com"
                    disabled={emailInviteStatus === "sending"}
                  />
                  <Button
                    variant="primary"
                    leadingIcon={<Mail aria-hidden="true" />}
                    disabled={!invitedEmail.trim() || emailInviteStatus === "sending"}
                    onClick={sendEmailInvitation}
                  >
                    {emailInviteStatus === "sending" ? "Sending…" : "Send invitation"}
                  </Button>
                </label>
                <p className={styles.emailInviteNote}>
                  Records a real, pending invitation for this email — a one-way hash is stored;
                  the raw token is shown once below and never persisted.
                </p>
                {emailInviteStatus === "error" ? (
                  <p className={styles.emailInviteError} role="alert">{emailInviteError}</p>
                ) : null}
                {emailInviteStatus === "sent" ? (
                  <p className={styles.emailInviteSuccess} role="status">
                    Invitation recorded for {invitedEmail}
                    {expiresAt ? ` · expires ${new Date(expiresAt).toLocaleDateString()}` : ""}.
                    {sentToken ? ` Token (share securely, shown once): ${sentToken}` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
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
