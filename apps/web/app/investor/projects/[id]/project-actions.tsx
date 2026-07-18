"use client";

import type { Route } from "next";
import {
  BookmarkCheck,
  BookmarkPlus,
  FileText,
  GitCompareArrows,
  ScanSearch,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import styles from "./project-actions.module.css";

interface ProjectActionsProps {
  projectId: string;
  founderId?: string;
}

export function ProjectActions({ projectId, founderId }: ProjectActionsProps) {
  const {
    addToPipeline,
    removeFromPipeline,
    isInPipeline,
    isComparing,
    toggleCompare,
  } = useWorkspace();
  const [message, setMessage] = useState("");
  const saved = isInPipeline(projectId);
  const comparing = isComparing(projectId);

  function handleSave() {
    if (saved) {
      if (!window.confirm("Remove this project from the local demo pipeline?")) {
        setMessage("Project kept in the pipeline.");
        return;
      }
      const result = removeFromPipeline(projectId);
      setMessage(result === "saved"
        ? "Removed from the browser-saved pipeline."
        : result === "no_change"
          ? "This project was not in the pipeline."
          : "Browser storage could not remove this project. Nothing changed.");
      return;
    }
    const result = addToPipeline({ projectId, stage: "reviewing" });
    setMessage(result === "saved"
      ? "Saved to the Reviewing stage in this browser."
      : result === "no_change"
        ? "This project is already in the pipeline."
        : "Browser storage could not save this project to the pipeline.");
  }

  function handleCompare() {
    const result = toggleCompare(projectId);
    setMessage(
      result === "limit"
        ? "Comparison is limited to three projects. Remove one to add another."
        : result === "failed"
          ? "Browser storage could not update the comparison. Nothing changed."
        : result === "added"
          ? "Added to comparison."
          : "Removed from comparison.",
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.primaryActions}>
        <Button
          variant={saved ? "secondary" : "primary"}
          size="sm"
          leadingIcon={saved ? <BookmarkCheck /> : <BookmarkPlus />}
          onClick={handleSave}
        >
          {saved ? "Remove from pipeline" : "Save to pipeline"}
        </Button>
        <Button
          variant={comparing ? "secondary" : "ghost"}
          size="sm"
          leadingIcon={<GitCompareArrows />}
          onClick={handleCompare}
        >
          {comparing ? "In compare" : "Compare"}
        </Button>
      </div>

      <div className={styles.secondaryActions}>
        <ButtonLink
          href={`/investor/projects/${projectId}/evidence` as Route}
          variant="quiet"
          size="sm"
          leadingIcon={<ScanSearch />}
        >
          Evidence
        </ButtonLink>
        <ButtonLink
          href={`/investor/projects/${projectId}/memo` as Route}
          variant="quiet"
          size="sm"
          leadingIcon={<FileText />}
        >
          Memo
        </ButtonLink>
        {founderId ? (
          <ButtonLink
            href={`/investor/founders/${founderId}/invite?project=${projectId}` as Route}
            variant="quiet"
            size="sm"
            leadingIcon={<UserPlus />}
          >
            Invite founder
          </ButtonLink>
        ) : null}
      </div>

      <p className={styles.message} aria-live="polite">{message}</p>
    </div>
  );
}
