"use client";

import { useMemo, useState } from "react";
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

/**
 * Real investor archetypes, written in the vocabulary the thesis extractor
 * understands (stage, geography, signals, exclusions) so picking one lights
 * up the profile chips immediately. Each is a starting point to edit, not a
 * form to submit as-is.
 */
const THESIS_PRESETS: readonly { label: string; text: string }[] = [
  {
    label: "Dev tools & infra",
    text: "Technical founders building developer tools and infrastructure with a working demo and an active GitHub, at pre-seed, without institutional funding.",
  },
  {
    label: "Applied AI",
    text: "AI-native products with real users and early traction at seed stage, built by technical founders who ship fast and publish their work.",
  },
  {
    label: "Fintech · emerging markets",
    text: "Fintech infrastructure for Latin America at pre-seed, founded by technical operators who understand regulated markets, with a working product.",
  },
  {
    label: "Vertical SaaS",
    text: "Capital-efficient vertical SaaS for overlooked industries with early revenue and a working product, at seed, excluding crypto and web3.",
  },
  {
    label: "Climate & hard tech",
    text: "Scientific and technical founders building climate or hard tech with deep IP at pre-seed, patient horizons, without institutional funding.",
  },
  {
    label: "Open source first",
    text: "Commercial open-source projects with real community traction and active GitHub repositories, technical founders, before institutional seed.",
  },
];

/**
 * Live mirror of what undr understands from the investor's own words: the
 * same extractor that builds the saved thesis runs on every keystroke, so
 * the chips below the textarea always reflect the current profile.
 */
function DetectedProfile({ query }: { query: string }) {
  const draft = useMemo(() => thesisChipDraftFromQuery(query), [query]);
  const groups = [
    { label: "Sectors", values: draft.sectors, exclude: false },
    { label: "Stage", values: draft.stages, exclude: false },
    { label: "Geography", values: draft.geographies, exclude: false },
    { label: "Signals", values: draft.signals, exclude: false },
    { label: "Excludes", values: draft.exclusions, exclude: true },
  ].filter((group) => group.values.length > 0);

  return (
    <div className={styles.detected} aria-live="polite">
      <p className={styles.detectedTitle}>What undr understood — updates as you type</p>
      {groups.length === 0 ? (
        <p className={styles.detectedEmpty}>
          Nothing yet — as you write, the sectors, stage and places you mention
          will show up here so you can check undr got you right.
        </p>
      ) : (
        <div className={styles.detectedGroups}>
          {groups.map((group) => (
            <div key={group.label} className={styles.detectedGroup}>
              <span className={styles.detectedLabel}>{group.label}</span>
              {group.values.map((value) => (
                <span
                  key={value}
                  className={styles.detectedChip}
                  data-exclude={group.exclude ? "true" : undefined}
                >
                  {value}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HydratedInvestorThesisForm({
  initialQuery,
  initialThesis,
}: {
  initialQuery: string;
  initialThesis: ActiveThesis | null;
}) {
  const router = useRouter();
  const {
    hasHydrated,
    storageAvailable,
    persistenceError,
    saveActiveThesis,
    clearPendingBrief,
  } = useWorkspace();
  // Starts empty for new investors — the example lives in the placeholder,
  // never as pre-written text. Editing an existing thesis (or arriving with
  // a brief typed on the landing) still prefills what THEY wrote.
  const [query, setQuery] = useState(initialThesis?.brief || initialQuery || "");
  const [isNavigating, setIsNavigating] = useState(false);
  const [completionError, setCompletionError] = useState("");

  function skipSetup() {
    setIsNavigating(true);
    clearPendingBrief();
    router.push("/investor");
  }

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
        ?? "This browser could not save your profile — nothing was recorded. Try again.",
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
          <h1>What do you invest in?</h1>
          <p>
            Tell undr in one or two plain sentences: the kind of founders you back,
            the sectors you like, and how early. undr remembers it and uses it to
            rank every search you run — and to explain why each person matches you.
            You can change it anytime.
          </p>
        </div>

        <div className={styles.presets} role="group" aria-label="Investor archetype starting points">
          <span className={styles.presetsLabel}>Not sure how to start? Tap one and make it yours:</span>
          {THESIS_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={styles.presetChip}
              data-active={query === preset.text ? "true" : undefined}
              onClick={() => setQuery(preset.text)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className={styles.briefCard}>
          <label className={styles.briefLabel} htmlFor="thesis-query">
            In your own words
          </label>
          <textarea
            id="thesis-query"
            className={styles.briefTextarea}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={5}
            maxLength={1000}
            placeholder={`e.g. “${fallbackQuery}”`}
            autoFocus
          />
          <div className={styles.helper}>
            <Sparkles size={12} aria-hidden="true" />
            <span>
              Tip: write “must” for anything non-negotiable — e.g. “must have a
              working product”.
            </span>
          </div>
        </div>

        <DetectedProfile query={query} />

        <p className={styles.matchNote}>
          That&rsquo;s the whole setup. From now on, every search result is scored
          against this profile — and you&rsquo;ll always see why someone matches.
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
          <Button
            variant="secondary"
            onClick={skipSetup}
            disabled={isNavigating}
            aria-label="Skip this step and enter the workspace without a profile"
          >
            Skip for now
          </Button>
          <p className={styles.autosaveNote}>
            {query.trim() ? "Saved automatically" : "Optional — you can add it later from My thesis"}
          </p>
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
}: {
  initialQuery: string;
  /** Kept for call-site compatibility; the screen no longer surfaces the count. */
  catalogCount?: number;
}) {
  const { activeThesis, hasHydrated, pendingBrief } = useWorkspace();

  if (!hasHydrated) {
    return (
      <div className={styles.loadingState} role="status" aria-live="polite">
        Loading your saved profile…
      </div>
    );
  }

  return (
    <HydratedInvestorThesisForm
      key={activeThesis?.updatedAt ?? "new-thesis"}
      initialQuery={activeThesis ? "" : initialQuery || pendingBrief}
      initialThesis={activeThesis}
    />
  );
}
