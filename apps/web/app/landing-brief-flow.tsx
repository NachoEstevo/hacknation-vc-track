"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ChevronDown, Layers } from "lucide-react";
import { SectorTag } from "@/components/pencil";
import { useWorkspace } from "@/components/workspace-provider";
import styles from "./page.module.css";

const EXAMPLE_BRIEFS = [
  "Small B2B teams with shipped products",
  "Technical founders with public code",
  "Pre-seed teams with missing evidence",
] as const;

export function LandingBriefFlow() {
  const router = useRouter();
  const { activeThesis, hasHydrated, savePendingBrief, startSearchSession, searchSessionError } =
    useWorkspace();
  const [error, setError] = useState("");

  function continueWithBrief(brief: string) {
    setError("");

    // A workspace with an active thesis means the profile is already set up
    // (demo or account-backed): run the brief in the search screen directly.
    if (hasHydrated && activeThesis) {
      if (!startSearchSession({ query: brief, source: "home" })) {
        setError(searchSessionError ?? "Private session storage could not open this exploration.");
        return;
      }
      router.push("/investor/search");
      return;
    }

    // No profile yet: carry the brief into onboarding so setup completes first.
    if (!savePendingBrief(brief)) {
      setError(
        "This browser blocked private session storage. The brief was not placed in the URL; enable site storage to continue with it.",
      );
      return;
    }
    router.push("/onboarding/role");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    continueWithBrief(String(form.get("brief") ?? ""));
  }

  return (
    <div className={styles.heroSearchWrap}>
      <form className={styles.searchBox} onSubmit={submit}>
        <div className={styles.searchInputArea}>
          <label htmlFor="landing-query" className="sr-only">
            Sourcing brief
          </label>
          <input
            id="landing-query"
            name="brief"
            type="text"
            required
            minLength={12}
            maxLength={1000}
            placeholder="Describe the founders, teams, or projects you want to investigate…"
            className={styles.searchInput}
          />
        </div>
        <div className={styles.searchBoxBar}>
          <button type="button" className={styles.scopeChip}>
            <Layers size={13} aria-hidden="true" />
            <span>undr engine</span>
            <ChevronDown size={12} aria-hidden="true" />
          </button>
          <span className={styles.barSpacer} aria-hidden="true" />
          <button type="submit" className={styles.sendButton} aria-label="Run search">
            <ArrowUp size={17} aria-hidden="true" />
          </button>
        </div>
      </form>

      <div className={styles.tryRow} aria-label="Example sourcing briefs">
        <p className={styles.tryLabel}>Try:</p>
        {EXAMPLE_BRIEFS.map((brief) => (
          <button
            key={brief}
            type="button"
            className={styles.tryPill}
            onClick={() => continueWithBrief(brief)}
          >
            <SectorTag label={brief} />
          </button>
        ))}
      </div>
      {error ? (
        <p className={styles.formError} role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
