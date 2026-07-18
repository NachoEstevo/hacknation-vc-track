"use client";

import { useState } from "react";
import {
  Check,
  Database,
  EyeOff,
  HardDrive,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
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
        <section className={styles.hero}>
          <div>
            <p>Runtime boundary</p>
            <h2>Know exactly what this workspace keeps—and where.</h2>
          </div>
          <div className={styles.modeCard}>
            <span className={styles.modeIcon}>
              {demoMode ? <HardDrive aria-hidden="true" /> : <Database aria-hidden="true" />}
            </span>
            <div>
              <Chip tone={mode.tone} size="sm" dot>{mode.label}</Chip>
              <p>{mode.detail}</p>
            </div>
          </div>
        </section>

        <section className={styles.statusSection} aria-labelledby="status-title">
          <header className={styles.sectionHeader}>
            <div>
              <p>Current state</p>
              <h2 id="status-title">Workspace inventory</h2>
            </div>
            <span>{hasHydrated ? "Read from this browser" : "Reading browser state…"}</span>
          </header>
          <dl className={styles.inventory}>
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
        </section>

        <section className={styles.privacySection} aria-labelledby="privacy-title">
          <header className={styles.sectionHeader}>
            <div>
              <p>Privacy by surface</p>
              <h2 id="privacy-title">What does and does not happen</h2>
            </div>
          </header>
          <div className={styles.privacyGrid}>
            <article>
              <span className={styles.privacyIcon}><LockKeyhole aria-hidden="true" /></span>
              <h3>Private workspace notes</h3>
              <p>
                In demo mode, pipeline notes stay in local browser storage. They are
                not represented as shared team notes or durable cloud records.
              </p>
            </article>
            <article>
              <span className={styles.privacyIcon}><EyeOff aria-hidden="true" /></span>
              <h3>No silent founder contact</h3>
              <p>
                Preparing an invitation never sends a message. You must explicitly copy
                the invitation draft and choose a verified channel yourself. This demo
                has no founder account or identity-verification flow.
              </p>
            </article>
            <article>
              <span className={styles.privacyIcon}><ShieldCheck aria-hidden="true" /></span>
              <h3>Evidence remains qualified</h3>
              <p>
                Synthetic records are labeled. Missing evidence stays unknown, and a
                contradiction remains visible instead of being averaged away.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.dangerZone} aria-labelledby="reset-title">
          <div className={styles.dangerCopy}>
            <span className={styles.warningIcon}><TriangleAlert aria-hidden="true" /></span>
            <div>
              <p>Local reset</p>
              <h2 id="reset-title">Clear interactive demo state</h2>
              <span>
                Removes the local pipeline, private notes, comparison set, saved searches,
                and navigation preference. The synthetic catalog itself is not deleted.
              </span>
            </div>
          </div>
          <Button
            variant="danger"
            size="md"
            leadingIcon={<RotateCcw />}
            disabled={!hasHydrated}
            onClick={reset}
          >
            Reset local state
          </Button>
        </section>

        {resetComplete ? (
          <div className={styles.successNotice} role="status">
            <Check aria-hidden="true" /> Local demo state cleared. No remote data was changed.
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
