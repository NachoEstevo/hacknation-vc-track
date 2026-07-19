"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/pencil";
import type { FounderProjectRow } from "@/lib/founder/data.server";
import { renameProjectAction, unpublishProjectAction } from "../actions";
import styles from "./settings.module.css";

export function SettingsClient({ project }: { project: FounderProjectRow }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [isSaving, startSave] = useTransition();
  const [isUnpublishing, startUnpublish] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startSave(async () => {
      const result = await renameProjectAction(project.id, name);
      if (!result.ok) setError(result.error ?? "Could not save.");
      else router.refresh();
    });
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Project settings</h1>

      <section className={styles.card}>
        <label className={styles.field}>
          <span>Project name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
        </label>
        <Button disabled={isSaving || !name.trim()} onClick={save}>
          Save changes
        </Button>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Visibility</h2>
        <p className={styles.cardNote}>
          Status: <strong>{project.status}</strong> · Visibility: <strong>{project.visibility}</strong>
        </p>
        {project.visibility === "published" ? (
          <Button
            variant="secondary"
            disabled={isUnpublishing}
            onClick={() =>
              startUnpublish(async () => {
                await unpublishProjectAction(project.id);
                router.refresh();
              })
            }
          >
            Unpublish profile
          </Button>
        ) : (
          <p className={styles.cardNote}>This profile is private. Publish it from the preview screen when ready.</p>
        )}
      </section>
    </main>
  );
}
