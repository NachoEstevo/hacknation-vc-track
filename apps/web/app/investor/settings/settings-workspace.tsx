"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Avatar, Button } from "@/components/pencil";
import { useWorkspace } from "@/components/workspace-provider";
import { createActiveThesis } from "@/lib/domain";
import { thesisChipDraftFromQuery } from "@/lib/search";
import styles from "./settings.module.css";

const DEFAULT_CHECK_RANGE = { currency: "USD" as const, min: 100_000, max: 750_000 };
const FALLBACK_NAME = "Demo investor";

export function SettingsWorkspace() {
  const {
    hasHydrated,
    profileName,
    saveProfileName,
    activeThesis,
    saveActiveThesis,
    persistenceError,
  } = useWorkspace();

  // null = untouched: the field shows the hydrated stored value until the user types.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameMessage, setNameMessage] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  const [briefDraft, setBriefDraft] = useState<string | null>(null);
  const [briefMessage, setBriefMessage] = useState("");
  const [briefSaving, setBriefSaving] = useState(false);

  const name = nameDraft ?? profileName ?? "";
  const brief = briefDraft ?? activeThesis?.brief ?? "";
  const displayName = name.trim() || FALLBACK_NAME;

  async function handleSaveName() {
    setNameMessage("");
    setNameSaving(true);
    const result = await saveProfileName(name);
    setNameSaving(false);
    setNameMessage(result === "saved"
      ? "Name saved."
      : result === "no_change"
        ? "That is already your name."
        : persistenceError ?? "Your name could not be saved. Nothing changed.");
  }

  async function handleSaveBrief() {
    setBriefMessage("");
    setBriefSaving(true);
    try {
      // Same flow as investor onboarding: existing structured criteria are
      // kept; the deterministic parser only fills fields a first-time brief
      // needs. The brief itself is what search and chat receive as context.
      const draft = thesisChipDraftFromQuery(brief);
      const thesis = createActiveThesis({
        brief,
        sectors: activeThesis?.sectors ?? draft.sectors,
        stages: activeThesis?.stages ?? draft.stages,
        geographies: activeThesis?.geographies ?? draft.geographies,
        signals: activeThesis?.signals ?? draft.signals,
        exclusions: activeThesis?.exclusions ?? draft.exclusions,
        checkRange: activeThesis?.checkRange ?? DEFAULT_CHECK_RANGE,
        riskPosture: activeThesis?.riskPosture ?? "balanced",
        sourceScope: activeThesis?.sourceScope,
      });
      const saved = await saveActiveThesis(thesis);
      setBriefMessage(saved
        ? "Sourcing brief saved. Every new search will use it as context."
        : persistenceError ?? "The brief could not be saved. Nothing changed.");
    } catch {
      setBriefMessage("Write a short brief first — it cannot be empty.");
    } finally {
      setBriefSaving(false);
    }
  }

  return (
    <AppShell eyebrow="Workspace" title="Settings">
      <div className={styles.page}>
        {!hasHydrated ? (
          <div className={styles.loading} aria-live="polite">Loading your settings…</div>
        ) : (
          <>
            <section className={styles.section} aria-labelledby="profile-heading">
              <div className={styles.sectionIntro}>
                <h2 id="profile-heading">Profile</h2>
                <p>How you appear across this workspace.</p>
              </div>
              <div className={styles.sectionBody}>
                <div className={styles.profileRow}>
                  <Avatar name={displayName} className={styles.bigAvatar} />
                  <div className={styles.field}>
                    <label htmlFor="settings-name">Display name</label>
                    <input
                      id="settings-name"
                      type="text"
                      value={name}
                      maxLength={80}
                      placeholder={FALLBACK_NAME}
                      onChange={(event) => setNameDraft(event.target.value)}
                    />
                  </div>
                </div>
                <div className={styles.actionsRow}>
                  <Button onClick={() => void handleSaveName()} disabled={nameSaving || !name.trim()}>
                    {nameSaving ? "Saving…" : "Save name"}
                  </Button>
                  {nameMessage ? (
                    <p className={styles.message} role="status" aria-live="polite">{nameMessage}</p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="brief-heading">
              <div className={styles.sectionIntro}>
                <h2 id="brief-heading">Sourcing brief</h2>
                <p>
                  The thesis you wrote when you set up this workspace. It is passed as
                  context to search and chat so results are ranked and explained
                  against your profile.
                </p>
              </div>
              <div className={styles.sectionBody}>
                <div className={styles.field}>
                  <label htmlFor="settings-brief">Your brief</label>
                  <textarea
                    id="settings-brief"
                    rows={5}
                    minLength={12}
                    maxLength={1000}
                    value={brief}
                    placeholder="Describe the founders, sectors, stages, and signals you invest in…"
                    onChange={(event) => setBriefDraft(event.target.value)}
                  />
                </div>
                <div className={styles.actionsRow}>
                  <Button onClick={() => void handleSaveBrief()} disabled={briefSaving || !brief.trim()}>
                    {briefSaving ? "Saving…" : "Save brief"}
                  </Button>
                  {briefMessage ? (
                    <p className={styles.message} role="status" aria-live="polite">{briefMessage}</p>
                  ) : null}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
