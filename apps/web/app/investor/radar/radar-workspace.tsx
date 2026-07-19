"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight, Radar as RadarIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, PersonCard } from "@/components/pencil";
import { Chip } from "@/components/ui/chip";
import { useWorkspace } from "@/components/workspace-provider";
import styles from "./radar.module.css";

const CANDIDATES_STORAGE_KEY = "undr.sourcing-candidates.v1";

function formatSavedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function RadarWorkspace() {
  const router = useRouter();
  const { radarPeople, removeFromRadar, hasHydrated } = useWorkspace();
  const [message, setMessage] = useState("");

  // The person profile page reads its candidate stub from sessionStorage, so
  // seed the stubs for every pinned person — opening a card keeps working in
  // a fresh tab, long after the originating search session is gone.
  useEffect(() => {
    if (radarPeople.length === 0) return;
    try {
      const raw = sessionStorage.getItem(CANDIDATES_STORAGE_KEY);
      const existing = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      for (const person of radarPeople) {
        existing[person.candidate.slug] = { candidate: person.candidate, query: person.sourceQuery ?? "" };
      }
      sessionStorage.setItem(CANDIDATES_STORAGE_KEY, JSON.stringify(existing));
    } catch {
      // Private-mode storage failures only cost opening profiles from here.
    }
  }, [radarPeople]);

  function handleRemove(slug: string, name: string) {
    const result = removeFromRadar(slug);
    setMessage(result === "saved"
      ? `${name} was removed from your radar.`
      : result === "no_change"
        ? `${name} was already off your radar.`
        : "Browser storage could not update your radar. Nothing changed.");
  }

  return (
    <AppShell
      eyebrow="Tracked people"
      title="Radar"
      headerAside={<Chip tone="accent" size="sm">browser_saved</Chip>}
      actions={(
        <Button variant="primary" onClick={() => router.push("/investor/search")}>
          Find more people
        </Button>
      )}
    >
      <div className={styles.page}>
        <p className="sr-only" role="status" aria-live="polite">{message}</p>

        {!hasHydrated ? (
          <div className={styles.loading} aria-live="polite">Loading your radar…</div>
        ) : radarPeople.length === 0 ? (
          <section className={styles.empty}>
            <span className={styles.emptyIcon}><RadarIcon aria-hidden="true" /></span>
            <h2>No one on your radar yet.</h2>
            <p>
              Pin people from their researched profile — open any candidate card and
              press “Save to radar”. They stay here with their evidence and fit context.
            </p>
            <Button
              variant="primary"
              trailingIcon={<ArrowUpRight aria-hidden="true" />}
              onClick={() => router.push("/investor/search")}
            >
              Start a search
            </Button>
          </section>
        ) : (
          <>
            <p className={styles.subtitle}>
              {radarPeople.length} {radarPeople.length === 1 ? "person" : "people"} pinned · Browser storage only
            </p>
            <section className={styles.list} aria-label="People on your radar">
              {radarPeople.map((person) => (
                <article className={styles.entry} key={person.candidate.slug}>
                  <div className={styles.entryMeta}>
                    <span className={styles.entrySaved}>Saved {formatSavedDate(person.savedAt)}</span>
                    {person.sourceQuery ? (
                      <span className={styles.entryQuery} title={person.sourceQuery}>
                        from “{person.sourceQuery}”
                      </span>
                    ) : null}
                    <span className={styles.entrySpacer} aria-hidden="true" />
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => handleRemove(person.candidate.slug, person.candidate.name)}
                      aria-label={`Remove ${person.candidate.name} from your radar`}
                      title="Remove from radar"
                    >
                      <X aria-hidden="true" />
                    </button>
                  </div>
                  <PersonCard candidate={person.candidate} />
                </article>
              ))}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
