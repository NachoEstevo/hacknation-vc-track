"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ChevronDown, Layers } from "lucide-react";
import { SectorTag } from "@/components/pencil";
import { useWorkspace } from "@/components/workspace-provider";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseEnabled } from "@/lib/env";
import styles from "./page.module.css";

const EXAMPLE_BRIEFS = [
  "Small B2B teams with shipped products",
  "Technical founders with public code",
  "Pre-seed teams with missing evidence",
] as const;

export function LandingBriefFlow() {
  const router = useRouter();
  const { savePendingBrief } = useWorkspace();
  const [error, setError] = useState("");

  function continueWithBrief(brief: string) {
    setError("");
    if (!savePendingBrief(brief)) {
      setError(
        "This browser blocked private session storage. The brief was not placed in the URL; enable site storage to continue with it.",
      );
      return;
    }
    router.push("/onboarding/role");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const brief = String(form.get("brief") ?? "");

    if (isSupabaseEnabled()) {
      const supabase = createClient();
      const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
      if (data.user) {
        router.push("/investor");
        return;
      }
    }

    continueWithBrief(brief);
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
            <span>All sources</span>
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
