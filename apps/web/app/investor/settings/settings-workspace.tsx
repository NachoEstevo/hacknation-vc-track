"use client";

import { useState } from "react";
import {
  Check,
  ChartColumn,
  Database,
  HardDrive,
  Link as LinkIcon,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  User,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useWorkspace } from "@/components/workspace-provider";
import styles from "./page.module.css";

type SettingsWorkspaceProps = {
  demoMode: boolean;
  hasPublicSupabaseConfig: boolean;
  syntheticOpportunityCount: number;
};

const DEMO_INVESTOR_NAME = "Demo investor";

interface ToggleRowData {
  label: string;
  desc: string;
  checked: boolean;
}

const PROFILE_VISIBILITY_ROWS: ToggleRowData[] = [
  {
    label: "Show my name to founders I contact",
    desc: "Founders would see “Demo investor, Investor workspace” instead of “An investor.”",
    checked: true,
  },
  {
    label: "Share my thesis summary with matched founders",
    desc: "Only the plain-English summary — never your private notes.",
    checked: true,
  },
  {
    label: "Include my activity in aggregate analytics",
    desc: "Anonymized. Never shown per person.",
    checked: false,
  },
];

const NOTIFICATION_ROWS: ToggleRowData[] = [
  {
    label: "Saved search alerts",
    desc: "Daily email when a saved search has new results.",
    checked: true,
  },
  {
    label: "Pipeline reminders",
    desc: "Weekly nudge for projects idle in a stage 14+ days.",
    checked: true,
  },
  {
    label: "Product updates",
    desc: "Occasional news about undr features.",
    checked: false,
  },
];

const DATA_USAGE_ROWS: { icon: LucideIcon; label: string; desc: string }[] = [
  {
    icon: User,
    label: "Profile details you provide",
    desc: "Name shown in the sidebar; kept in this browser only.",
  },
  {
    icon: Search,
    label: "Search queries you run",
    desc: "Kept in this browser to rank results and reopen saved searches.",
  },
  {
    icon: LinkIcon,
    label: "Sources you connect",
    desc: "Not available in this demo — no source-connection flow exists yet.",
  },
  {
    icon: ChartColumn,
    label: "Usage analytics",
    desc: "Not collected in this demo — there is no analytics pipeline.",
  },
];

function DemoUnavailableChip() {
  return <Chip tone="muted" size="sm">demo_unavailable</Chip>;
}

function ToggleRow({ label, desc, checked }: ToggleRowData) {
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleCol}>
        <span className={styles.toggleLabel}>{label}</span>
        <span className={styles.toggleDesc}>{desc}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled
        className={clsx(styles.toggle, checked && styles.toggleOn)}
      >
        <span className={styles.toggleKnob} aria-hidden="true" />
      </button>
    </div>
  );
}

export function SettingsWorkspace({
  demoMode,
  hasPublicSupabaseConfig,
  syntheticOpportunityCount,
}: SettingsWorkspaceProps) {
  const {
    hasHydrated,
    pipelineItems,
    compareIds,
    savedSearches,
    resetDemoState,
  } = useWorkspace();
  const [resetComplete, setResetComplete] = useState(false);

  const mode = demoMode
    ? {
        label: "Demo mode active",
        detail: "Workspace actions persist in this browser only.",
        tone: "accent" as const,
      }
    : hasPublicSupabaseConfig
      ? {
          label: "Live configuration present",
          detail: "Public Supabase settings are present; this page does not claim a successful health check.",
          tone: "verified" as const,
        }
      : {
          label: "Live mode incomplete",
          detail: "Demo mode is disabled, but the required public Supabase configuration is missing.",
          tone: "risk" as const,
        };

  function reset() {
    const confirmed = window.confirm(
      "Reset this browser's demo workspace? This removes pipeline stages, private notes, comparisons, saved searches, and sidebar preferences. The action cannot be undone.",
    );
    if (!confirmed) return;
    setResetComplete(resetDemoState());
  }

  return (
    <AppShell
      eyebrow="Workspace control"
      title="Settings & privacy"
      headerAside={<Chip tone="accent" size="sm">synthetic_demo</Chip>}
    >
      <div className={styles.page}>
        <p className={styles.lede}>
          Account, visibility, notification preferences, and data controls — with demo-mode
          boundaries called out explicitly instead of simulated.
        </p>

        <div className={styles.body}>
          <div className={styles.main}>
            <section className={styles.card} aria-labelledby="workspace-title">
              <div className={styles.cardHeader}>
                <h2 id="workspace-title" className={styles.cardTitle}>Workspace</h2>
              </div>
              <div className={styles.modeRow}>
                <span className={styles.modeIcon}>
                  {demoMode ? <HardDrive aria-hidden="true" /> : <Database aria-hidden="true" />}
                </span>
                <div className={styles.modeCol}>
                  <Chip tone={mode.tone} size="sm" dot>{mode.label}</Chip>
                  <p className={styles.modeDetail}>{mode.detail}</p>
                </div>
              </div>
              <dl className={styles.inventoryGrid}>
                <div>
                  <dt>Pipeline records</dt>
                  <dd>{hasHydrated ? pipelineItems.length : "—"}</dd>
                  <span>Includes stage and private note</span>
                </div>
                <div>
                  <dt>Comparison set</dt>
                  <dd>{hasHydrated ? compareIds.length : "—"}</dd>
                  <span>Maximum three projects</span>
                </div>
                <div>
                  <dt>Saved searches</dt>
                  <dd>{hasHydrated ? savedSearches.length : "—"}</dd>
                  <span>No scheduled alerts</span>
                </div>
                <div>
                  <dt>Synthetic catalog</dt>
                  <dd>{syntheticOpportunityCount}</dd>
                  <span>Read-only demo fixtures</span>
                </div>
              </dl>
              <span className={styles.hydrationNote}>
                {hasHydrated ? "Read from this browser" : "Reading browser state…"}
              </span>
            </section>

            <section className={styles.card} aria-labelledby="account-title">
              <div className={styles.cardHeader}>
                <h2 id="account-title" className={styles.cardTitle}>Account</h2>
                <DemoUnavailableChip />
              </div>
              <p className={styles.cardNote}>
                Account editing isn&rsquo;t available in this demo — sign-in doesn&rsquo;t create a
                persisted profile, so nothing below is saved server-side.
              </p>
              <div className={styles.fields}>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Full name</span>
                  <span className={styles.fieldValue}>{DEMO_INVESTOR_NAME}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Email</span>
                  <span className={clsx(styles.fieldValue, styles.fieldValueMuted)}>Not tracked in demo mode</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Firm</span>
                  <span className={clsx(styles.fieldValue, styles.fieldValueMuted)}>Not tracked in demo mode</span>
                </div>
              </div>
              <div className={styles.accountActions}>
                <Button variant="secondary" size="sm" disabled>Save changes</Button>
              </div>
            </section>

            <section className={styles.card} aria-labelledby="role-title">
              <div className={styles.cardHeader}>
                <h2 id="role-title" className={styles.cardTitle}>Role</h2>
                <DemoUnavailableChip />
              </div>
              <p className={styles.cardNote}>
                This prototype only implements the Investor workspace. Switching to Founder
                isn&rsquo;t available yet.
              </p>
              <div className={styles.roleRow}>
                <div className={styles.segmented} role="group" aria-label="Workspace role">
                  <button type="button" className={styles.segmentActive} disabled aria-pressed="true">
                    Investor
                  </button>
                  <button type="button" className={styles.segmentDisabled} disabled aria-pressed="false">
                    Founder
                  </button>
                </div>
                <span className={styles.roleNote}>Switching roles keeps your account and data.</span>
              </div>
            </section>

            <section className={styles.card} aria-labelledby="visibility-title">
              <div className={styles.cardHeader}>
                <h2 id="visibility-title" className={styles.cardTitle}>Profile visibility</h2>
                <DemoUnavailableChip />
              </div>
              <p className={styles.cardNote}>
                Illustrative only — this demo has no founder accounts or identity-verification
                flow, so nothing below is actually shared. Preparing an invitation never sends a
                message on your behalf; you must copy the draft and send it yourself.
              </p>
              {PROFILE_VISIBILITY_ROWS.map((row) => (
                <ToggleRow key={row.label} {...row} />
              ))}
            </section>

            <section className={styles.card} aria-labelledby="notifications-title">
              <div className={styles.cardHeader}>
                <h2 id="notifications-title" className={styles.cardTitle}>Notifications</h2>
                <DemoUnavailableChip />
              </div>
              <p className={styles.cardNote}>
                Illustrative only — this prototype does not send email.
              </p>
              {NOTIFICATION_ROWS.map((row) => (
                <ToggleRow key={row.label} {...row} />
              ))}
            </section>
          </div>

          <div className={styles.rail}>
            <section className={styles.card} aria-labelledby="sources-title">
              <div className={styles.cardHeader}>
                <h2 id="sources-title" className={styles.cardTitle}>Connected sources</h2>
                <DemoUnavailableChip />
              </div>
              <p className={styles.cardNote}>
                Connecting accounts isn&rsquo;t available in this demo — there is no OAuth flow.
                The public GitHub enrichment endpoint reads data per search and does not store a
                connection.
              </p>
              <button type="button" className={styles.ghostAction} disabled>
                <Plus aria-hidden="true" />
                Connect a source
              </button>
            </section>

            <section className={styles.card} aria-labelledby="data-usage-title">
              <div className={styles.cardHeader}>
                <h2 id="data-usage-title" className={styles.cardTitle}>What data we use about you</h2>
              </div>
              {DATA_USAGE_ROWS.map(({ icon: Icon, label, desc }) => (
                <div className={styles.dataRow} key={label}>
                  <span className={styles.dataIcon}><Icon aria-hidden="true" /></span>
                  <div className={styles.dataCol}>
                    <span className={styles.dataLabel}>{label}</span>
                    <span className={styles.dataDesc}>{desc}</span>
                  </div>
                </div>
              ))}
              <span className={styles.dataFooter}>Data export isn&rsquo;t available in this demo.</span>
            </section>

            <section className={clsx(styles.card, styles.dangerCard)} aria-labelledby="reset-title">
              <div className={styles.dangerHeader}>
                <Trash2 aria-hidden="true" />
                <h2 id="reset-title" className={styles.dangerTitle}>Reset local demo state</h2>
              </div>
              <p className={styles.dangerText}>
                Removes the local pipeline, private notes, comparison set, saved searches, and
                navigation preference from this browser. The synthetic catalog itself is not
                deleted. This cannot be undone. Deleting a real account isn&rsquo;t possible in this
                demo — there is no backend account to delete.
              </p>
              <Button
                variant="danger"
                size="md"
                leadingIcon={<RotateCcw aria-hidden="true" />}
                disabled={!hasHydrated}
                onClick={reset}
              >
                Reset local state
              </Button>
              {resetComplete ? (
                <div className={styles.successNotice} role="status">
                  <Check aria-hidden="true" /> Local demo state cleared. No remote data was changed.
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
