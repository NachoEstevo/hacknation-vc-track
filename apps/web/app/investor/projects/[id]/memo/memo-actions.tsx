"use client";

import type { Route } from "next";
import { useState } from "react";
import { ArrowLeft, Check, DatabaseZap, Printer } from "lucide-react";
import { Button, ButtonLink } from "@/components/pencil";
import { isSupabaseEnabled } from "@/lib/env";
import { generateMemoAction } from "@/lib/supabase/workspace-memo.actions";
import styles from "./memo.module.css";

export interface MemoActionsProps {
  projectId: string;
  evidenceCount: number;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/** Faithful port of Pencil's `Memo Bar`: status line + the memo's real actions (navigate back, export, and — when Supabase is configured — persist). */
export function MemoActions({ projectId, evidenceCount }: MemoActionsProps) {
  const supabaseEnabled = isSupabaseEnabled();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");

  async function generateAndSave() {
    setSaveState("saving");
    setError("");
    const result = await generateMemoAction(projectId);
    if (result.ok) {
      setSaveState("saved");
    } else {
      setSaveState("error");
      setError(result.error ?? "The memo could not be saved.");
    }
  }

  return (
    <div className={styles.bar}>
      <span className={styles.barStatus}>
        Draft memo · generated from {evidenceCount} evidence item{evidenceCount === 1 ? "" : "s"} · review before sharing
      </span>
      <div className={styles.barSpacer} aria-hidden="true" />
      <div className={styles.barActions}>
        <ButtonLink
          href={`/investor/projects/${projectId}` as Route}
          variant="ghost"
          leadingIcon={<ArrowLeft />}
        >
          Project brief
        </ButtonLink>
        {supabaseEnabled ? (
          <Button
            variant="secondary"
            leadingIcon={saveState === "saved" ? <Check /> : <DatabaseZap />}
            onClick={generateAndSave}
            disabled={saveState === "saving"}
          >
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved to workspace" : "Generate & save memo"}
          </Button>
        ) : null}
        <Button
          variant="primary"
          leadingIcon={<Printer />}
          onClick={() => window.print()}
        >
          Export PDF
        </Button>
      </div>
      {error ? (
        <p className={styles.barError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
