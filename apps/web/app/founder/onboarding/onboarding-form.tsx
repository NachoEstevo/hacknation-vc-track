"use client";

import { useMemo, useRef, useState, useTransition, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { ArrowRight, CircleCheck, CircleDashed, FileText, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/pencil";
import { parseGitHubRepoUrl } from "@/lib/founder/repo";
import { createFounderProjectAction } from "./actions";
import styles from "./page.module.css";

interface DraftSection {
  key: string;
  label: string;
  drafted: boolean;
  note: string;
}

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [founderName, setFounderName] = useState(defaultName);
  const [projectName, setProjectName] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  const [website, setWebsite] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [deckFile, setDeckFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const hasValidRepo = useMemo(() => Boolean(repoUrl.trim() && parseGitHubRepoUrl(repoUrl)), [repoUrl]);
  const hasOneLiner = oneLiner.trim().length > 0;

  const draftedSections: DraftSection[] = [
    {
      key: "problem",
      label: "Problem",
      drafted: hasOneLiner,
      note: hasOneLiner ? "Drafted from your one-liner" : "Add a one-line description to draft this",
    },
    {
      key: "solution",
      label: "Solution",
      drafted: hasOneLiner,
      note: hasOneLiner ? "Drafted from your one-liner" : "Add a one-line description to draft this",
    },
    {
      key: "product_status",
      label: "Product status",
      drafted: hasValidRepo,
      note: hasValidRepo ? "Drafted from repo activity" : "Add a repository to draft this",
    },
  ];

  const pendingSections = [
    { key: "team", label: "Team" },
    { key: "traction", label: "Traction" },
  ];

  function handleDeckPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setDeckFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") {
      setDeckFile(file);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const formData = new FormData();
    formData.set("founderName", founderName);
    formData.set("projectName", projectName);
    formData.set("oneLiner", oneLiner);
    formData.set("website", website);
    formData.set("repoUrl", repoUrl);
    formData.set("demoUrl", demoUrl);
    if (deckFile) formData.set("deck", deckFile);

    startTransition(async () => {
      const result = await createFounderProjectAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Try again.");
      }
    });
  }

  return (
    <div className={styles.body}>
      <form className={styles.form} onSubmit={submit} ref={formRef}>
        <h1 className={styles.title}>Tell us about your project</h1>
        <p className={styles.sub}>
          We draft the first version of your profile from what you give us here. You review and confirm every
          section before it ever reaches an investor.
        </p>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Your name</span>
          <input
            required
            value={founderName}
            onChange={(event) => setFounderName(event.target.value)}
            placeholder="Ada Lovelace"
            maxLength={120}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Project name</span>
          <input
            required
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Relay Metrics"
            maxLength={120}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>One-line description</span>
          <textarea
            required
            value={oneLiner}
            onChange={(event) => setOneLiner(event.target.value)}
            placeholder="Relay helps infra teams see incident cost in real time instead of after the postmortem."
            maxLength={400}
            rows={3}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Website</span>
          <input
            type="url"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="https://relaymetrics.dev"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Code repository (optional)</span>
          <input
            type="url"
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            placeholder="https://github.com/acme/relay"
          />
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Deck (optional)</span>
          <div
            className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className={styles.dropZoneInput}
              onChange={handleDeckPick}
            />
            {deckFile ? (
              <span className={styles.dropZoneFile}>
                <FileText size={16} aria-hidden="true" />
                {deckFile.name}
                <button
                  type="button"
                  className={styles.dropZoneRemove}
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeckFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  aria-label="Remove deck"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            ) : (
              <span className={styles.dropZoneHint}>
                <Upload size={16} aria-hidden="true" />
                Drop a PDF, or click to choose one
              </span>
            )}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Demo link (optional)</span>
          <input
            type="url"
            value={demoUrl}
            onChange={(event) => setDemoUrl(event.target.value)}
            placeholder="https://relaymetrics.dev/demo"
          />
        </label>

        {error ? (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" fullWidth disabled={isPending} trailingIcon={<ArrowRight size={16} aria-hidden="true" />}>
          {isPending ? "Creating your profile…" : "Continue"}
        </Button>
      </form>

      <aside className={styles.draftPanel} aria-labelledby="draft-panel-heading">
        <span className={styles.draftBadge}>
          <Sparkles size={13} aria-hidden="true" />
          AI-structured · from your inputs
        </span>
        <h2 id="draft-panel-heading" className={styles.draftTitle}>
          We drafted your profile — review it next.
        </h2>

        <ul className={styles.draftList}>
          {draftedSections.map((section) => (
            <li key={section.key} className={styles.draftItem}>
              {section.drafted ? (
                <CircleCheck size={18} className={styles.draftIconDone} aria-hidden="true" />
              ) : (
                <CircleDashed size={18} className={styles.draftIconPending} aria-hidden="true" />
              )}
              <div>
                <p className={styles.draftItemLabel}>{section.label}</p>
                <p className={styles.draftItemNote}>{section.note}</p>
              </div>
            </li>
          ))}
          {pendingSections.map((section) => (
            <li key={section.key} className={styles.draftItem}>
              <CircleDashed size={18} className={styles.draftIconPending} aria-hidden="true" />
              <div>
                <p className={styles.draftItemLabel}>{section.label}</p>
                <p className={styles.draftItemNote}>Needs your input</p>
              </div>
            </li>
          ))}
        </ul>

        <p className={styles.draftFooterNote}>
          Nothing here is published yet. Every drafted section stays private until you confirm it in the editor.
        </p>

        <Button
          type="button"
          variant="ghost"
          fullWidth
          disabled={isPending}
          onClick={() => formRef.current?.requestSubmit()}
        >
          Preview draft
        </Button>
      </aside>
    </div>
  );
}
