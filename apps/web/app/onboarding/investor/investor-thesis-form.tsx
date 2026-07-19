"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button, ButtonLink } from "@/components/pencil";
import { useWorkspace } from "@/components/workspace-provider";
import { createActiveThesis, type ActiveThesis } from "@/lib/domain";
import { thesisChipDraftFromQuery } from "@/lib/search";
import styles from "./page.module.css";

const fallbackQuery =
  "Technical founders building developer infrastructure with a working product, before institutional seed.";

const DEFAULT_CHECK_RANGE = { currency: "USD" as const, min: 100_000, max: 750_000 };

function HydratedInvestorThesisForm({
  initialQuery,
  initialThesis,
  catalogCount,
}: {
  initialQuery: string;
  initialThesis: ActiveThesis | null;
  catalogCount: number;
}) {
  const router = useRouter();
  const {
    hasHydrated,
    storageAvailable,
    persistenceError,
    saveActiveThesis,
    clearPendingBrief,
  } = useWorkspace();
  const [query, setQuery] = useState(initialThesis?.brief || initialQuery || fallbackQuery);
  const [isNavigating, setIsNavigating] = useState(false);
  const [completionError, setCompletionError] = useState("");

  async function completeOnboarding() {
    setCompletionError("");
    const draft = thesisChipDraftFromQuery(query);
    const thesis = createActiveThesis({
      brief: query,
      sectors: initialThesis?.sectors ?? draft.sectors,
      stages: initialThesis?.stages ?? draft.stages,
      geographies: initialThesis?.geographies ?? draft.geographies,
      signals: initialThesis?.signals ?? draft.signals,
      exclusions: initialThesis?.exclusions ?? draft.exclusions,
      checkRange: initialThesis?.checkRange ?? DEFAULT_CHECK_RANGE,
      riskPosture: initialThesis?.riskPosture ?? "balanced",
    });
    setIsNavigating(true);
    if (!await saveActiveThesis(thesis)) {
      setIsNavigating(false);
      setCompletionError(
        persistenceError
        ?? "This browser could not persist the thesis, so it was not recorded as your active sourcing lens.",
      );
      return;
    }

    clearPendingBrief();
    router.push("/investor");
  }

  return (
    <form
      className={styles.builder}
      onSubmit={(event) => {
        event.preventDefault();
        completeOnboarding();
      }}
    >
      <div className={styles.main}>
        <div className={styles.intro}>
          <h1>Set your investment thesis</h1>
          <p>
            Describe it in plain language. This becomes your active sourcing lens —
            undr combines it with every search you run afterward to rank and explain
            matches, so be specific. It extracts the sectors, stage, geography, and
            signals automatically.
          </p>
        </div>

        <div className={styles.briefCard}>
          <label className={styles.briefLabel} htmlFor="thesis-query">
            Describe or paste your thesis
          </label>
          <textarea
            id="thesis-query"
            className={styles.briefTextarea}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={5}
            minLength={12}
            maxLength={1000}
            required
            autoFocus
          />
          <div className={styles.helper}>
            <Sparkles size={12} aria-hidden="true" />
            <span>
              Use “must” for required criteria; everything else remains a preference.
            </span>
          </div>
        </div>

        <p className={styles.matchNote}>
          {catalogCount} seed companies indexed — undr will score and explain every
          match against this thesis once you finish setup.
        </p>

        <div className={styles.footer}>
          <ButtonLink href="/onboarding/role" variant="secondary">
            Back
          </ButtonLink>
          <Button
            type="submit"
            aria-label="Finish setup and enter investor workspace"
            leadingIcon={isNavigating ? (
              <Loader2 size={15} className={styles.spin} aria-hidden="true" />
            ) : undefined}
            disabled={!query.trim() || isNavigating || !hasHydrated || storageAvailable !== true}
          >
            {isNavigating ? "Finishing setup…" : "Finish setup"}
          </Button>
          <p className={styles.autosaveNote}>Saved automatically</p>
        </div>
        {completionError || persistenceError ? (
          <p className={styles.completionError} role="alert" aria-live="assertive">
            {completionError || persistenceError}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function InvestorThesisForm({
  initialQuery,
  catalogCount,
}: {
  initialQuery: string;
  catalogCount: number;
}) {
  const { activeThesis, hasHydrated, pendingBrief } = useWorkspace();

  if (!hasHydrated) {
    return (
      <div className={styles.loadingState} role="status" aria-live="polite">
        Loading the sourcing lens saved in this browser…
      </div>
    );
  }

  return (
    <HydratedInvestorThesisForm
      key={activeThesis?.updatedAt ?? "new-thesis"}
      initialQuery={activeThesis ? "" : initialQuery || pendingBrief}
      initialThesis={activeThesis}
      catalogCount={catalogCount}
    />
  );
}
