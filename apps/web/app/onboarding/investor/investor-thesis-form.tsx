"use client";

import type { KeyboardEvent } from "react";
import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CircleGauge,
  Plus,
  SearchCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import {
  createActiveThesis,
  parseCurrencyAmount,
  type ActiveThesis,
  type ThesisRiskPosture,
} from "@/lib/domain";
import { thesisChipDraftFromQuery } from "@/lib/search";
import styles from "./page.module.css";

type ChipEditorProps = {
  label: string;
  hint: string;
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
};

const fallbackQuery =
  "Technical founders building developer infrastructure with a working product, before institutional seed.";

function ChipEditor({
  label,
  hint,
  items,
  placeholder,
  onChange,
}: ChipEditorProps) {
  const [draft, setDraft] = useState("");
  const inputId = useId();

  function addItem() {
    const nextItem = draft.trim().replace(/,$/, "");
    if (!nextItem) return;

    const alreadyExists = items.some(
      (item) => item.toLocaleLowerCase() === nextItem.toLocaleLowerCase(),
    );
    if (!alreadyExists) onChange([...items, nextItem]);
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addItem();
    }
    if (event.key === "Backspace" && !draft && items.length > 0) {
      onChange(items.slice(0, -1));
    }
  }

  return (
    <fieldset className={styles.criteriaGroup}>
      <legend className="sr-only">{label}</legend>
      <div className={styles.criteriaHeading}>
        <strong aria-hidden="true">{label}</strong>
        <span>{hint}</span>
      </div>
      <div className={styles.chipField}>
        <div className={styles.chipList} aria-live="polite">
          {items.map((item) => (
            <span className={styles.chip} key={item}>
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((candidate) => candidate !== item))}
                aria-label={`Remove ${item} from ${label}`}
              >
                <X size={12} strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
        <div className={styles.addCriterion}>
          <label className="sr-only" htmlFor={inputId}>
            Add a criterion to {label}
          </label>
          <input
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={addItem}
            placeholder={placeholder}
          />
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={addItem}
            disabled={!draft.trim()}
            aria-label={`Add ${draft || "criterion"} to ${label}`}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </fieldset>
  );
}

function editableAmount(value: number): string {
  if (value >= 1_000_000 && value % 1_000_000 === 0) return `${value / 1_000_000}m`;
  if (value >= 1_000 && value % 1_000 === 0) return `${value / 1_000}k`;
  return String(value);
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
  const queryDraft = initialQuery && !initialThesis
    ? thesisChipDraftFromQuery(initialQuery)
    : null;
  const [query, setQuery] = useState(initialThesis?.brief || initialQuery || fallbackQuery);
  const [sectors, setSectors] = useState(initialThesis?.sectors ?? queryDraft?.sectors ?? [
    "AI infrastructure", "Developer tools", "Security",
  ]);
  const [stages, setStages] = useState(initialThesis?.stages ?? queryDraft?.stages ?? ["Pre-seed", "Seed"]);
  const [geographies, setGeographies] = useState(initialThesis?.geographies ?? queryDraft?.geographies ?? [
    "Latin America", "United States", "United Kingdom",
  ]);
  const [signals, setSignals] = useState(initialThesis?.signals ?? queryDraft?.signals ?? [
    "Working product", "Sustained technical activity", "Early enterprise use",
  ]);
  const [exclusions, setExclusions] = useState(
    initialThesis?.exclusions ?? queryDraft?.exclusions ?? ["Institutional Series A+"],
  );
  const [checkMin, setCheckMin] = useState(
    initialThesis ? editableAmount(initialThesis.checkRange.min) : "100k",
  );
  const [checkMax, setCheckMax] = useState(
    initialThesis ? editableAmount(initialThesis.checkRange.max) : "750k",
  );
  const [risk, setRisk] = useState<ThesisRiskPosture>(initialThesis?.riskPosture ?? "balanced");
  const [isNavigating, setIsNavigating] = useState(false);
  const [completionError, setCompletionError] = useState("");

  const parsedCheckMin = useMemo(() => parseCurrencyAmount(checkMin), [checkMin]);
  const parsedCheckMax = useMemo(() => parseCurrencyAmount(checkMax), [checkMax]);
  const checkError = useMemo(() => {
    if (parsedCheckMin === null || parsedCheckMax === null) {
      return "Enter positive USD amounts such as 100k, 750000, or 1.5m.";
    }
    if (parsedCheckMin > parsedCheckMax) {
      return "The minimum check must be less than or equal to the maximum check.";
    }
    return "";
  }, [parsedCheckMax, parsedCheckMin]);

  const summary = useMemo(() => {
    const sectorText = sectors.length ? sectors.join(", ") : "open sectors";
    const stageText = stages.length ? stages.join(" and ") : "any early stage";
    const geoText = geographies.length
      ? geographies.join(", ")
      : "any geography";
    return `Looking for ${stageText.toLowerCase()} companies in ${sectorText}, led by early technical teams across ${geoText}. Typical initial check: $${checkMin}–$${checkMax}.`;
  }, [checkMax, checkMin, geographies, sectors, stages]);

  const completeness = [
    query.trim(),
    sectors.length,
    stages.length,
    geographies.length,
    signals.length,
    exclusions.length,
    checkMin,
    checkMax,
    risk,
  ].filter(Boolean).length;

  function completeOnboarding() {
    setCompletionError("");
    if (checkError || parsedCheckMin === null || parsedCheckMax === null) return;

    const thesis = createActiveThesis({
      brief: query,
      sectors,
      stages,
      geographies,
      signals,
      exclusions,
      checkRange: { currency: "USD", min: parsedCheckMin, max: parsedCheckMax },
      riskPosture: risk,
    });
    if (!saveActiveThesis(thesis)) {
      setCompletionError(
        persistenceError
        ?? "This browser could not persist the thesis, so it was not recorded as your active sourcing lens.",
      );
      return;
    }

    clearPendingBrief();
    setIsNavigating(true);
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
      <div className={styles.editor}>
        <section className={styles.briefSection} aria-labelledby="brief-label">
          <div className={styles.sectionNumber}>01</div>
          <div className={styles.sectionContent}>
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="brief-label">Sourcing brief</h2>
                <p>Write as you would explain it to an investment partner.</p>
              </div>
              {initialQuery ? (
                <span className={styles.carriedBadge}>
                  <SearchCheck size={13} aria-hidden="true" /> From landing
                </span>
              ) : null}
            </div>
            <label className="sr-only" htmlFor="thesis-query">
              Sourcing brief
            </label>
            <textarea
              id="thesis-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              rows={4}
              minLength={12}
              maxLength={1000}
              required
            />
            <div className={styles.textareaMeta}>
              <span>The brief will open as your first workspace search.</span>
              <span>{query.length} / 1,000</span>
            </div>
          </div>
        </section>

        <section className={styles.criteriaSection} aria-labelledby="criteria-heading">
          <div className={styles.sectionNumber}>02</div>
          <div className={styles.sectionContent}>
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="criteria-heading">Structured criteria</h2>
                <p>Add or remove criteria. These remain visible in every match.</p>
              </div>
              <span className={styles.editableBadge}>Editable</span>
            </div>

            <ChipEditor
              label="Sectors"
              hint="What you understand or want to learn"
              items={sectors}
              onChange={setSectors}
              placeholder="Add sector"
            />
            <ChipEditor
              label="Stage"
              hint="Company maturity, not fundraising labels alone"
              items={stages}
              onChange={setStages}
              placeholder="Add stage"
            />
            <ChipEditor
              label="Geography"
              hint="Operating market or founder location"
              items={geographies}
              onChange={setGeographies}
              placeholder="Add geography"
            />
            <ChipEditor
              label="Signals you value"
              hint="Positive evidence — never protected attributes"
              items={signals}
              onChange={setSignals}
              placeholder="Add signal"
            />
            <ChipEditor
              label="Explicit exclusions"
              hint="Missing evidence is not an exclusion"
              items={exclusions}
              onChange={setExclusions}
              placeholder="Add exclusion"
            />
          </div>
        </section>

        <section className={styles.parametersSection} aria-labelledby="parameters-heading">
          <div className={styles.sectionNumber}>03</div>
          <div className={styles.sectionContent}>
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="parameters-heading">Investment parameters</h2>
                <p>Used to explain fit, never to silently suppress results.</p>
              </div>
            </div>

            <div className={styles.parameterGrid}>
              <fieldset className={styles.checkFieldset}>
                <legend>Initial check range</legend>
                <div className={styles.checkInputs}>
                  <label>
                    <span>From</span>
                    <span className={styles.moneyInput}>
                      <b>$</b>
                      <input
                        value={checkMin}
                        onChange={(event) => setCheckMin(event.target.value)}
                        aria-label="Minimum initial check"
                        inputMode="decimal"
                        autoComplete="off"
                        aria-invalid={Boolean(checkError)}
                        aria-describedby={checkError ? "check-range-error" : undefined}
                      />
                    </span>
                  </label>
                  <span aria-hidden="true">—</span>
                  <label>
                    <span>To</span>
                    <span className={styles.moneyInput}>
                      <b>$</b>
                      <input
                        value={checkMax}
                        onChange={(event) => setCheckMax(event.target.value)}
                        aria-label="Maximum initial check"
                        inputMode="decimal"
                        autoComplete="off"
                        aria-invalid={Boolean(checkError)}
                        aria-describedby={checkError ? "check-range-error" : undefined}
                      />
                    </span>
                  </label>
                </div>
                {checkError ? (
                  <p className={styles.fieldError} id="check-range-error" role="alert">
                    {checkError}
                  </p>
                ) : null}
              </fieldset>

              <fieldset className={styles.riskFieldset}>
                <legend>Risk posture</legend>
                <div className={styles.riskOptions}>
                  {[
                    ["focused", "Focused"],
                    ["balanced", "Balanced"],
                    ["frontier", "Frontier"],
                  ].map(([value, label]) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="risk"
                        value={value}
                        checked={risk === value}
                        onChange={() => setRisk(value as ThesisRiskPosture)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>
        </section>
      </div>

      <aside className={styles.summary} aria-labelledby="summary-heading">
        <div className={styles.summaryTopline}>
          <span className={styles.summaryIcon}>
            <CircleGauge size={19} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span>Live thesis summary</span>
        </div>
        <h2 id="summary-heading">Your sourcing lens</h2>
        <p className={styles.summaryText} aria-live="polite">
          {summary}
        </p>

        <div className={styles.completeness}>
          <div>
            <span>Thesis coverage</span>
            <strong>{completeness} / 9</strong>
          </div>
          <span className={styles.completenessTrack} aria-hidden="true">
            <i style={{ width: `${(completeness / 9) * 100}%` }} />
          </span>
        </div>

        <dl className={styles.summaryList}>
          <div>
            <dt>Stage</dt>
            <dd>{stages.length ? stages.join(" · ") : "Open"}</dd>
          </div>
          <div>
            <dt>Geography</dt>
            <dd>{geographies.length ? geographies.join(" · ") : "Open"}</dd>
          </div>
          <div>
            <dt>Risk posture</dt>
            <dd>{risk}</dd>
          </div>
          <div>
            <dt>Evidence signals</dt>
            <dd>{signals.length || "Not specified"}</dd>
          </div>
        </dl>

        <div className={styles.guardrails}>
          <p>
            <Check size={13} aria-hidden="true" /> Unknown stays unknown
          </p>
          <p>
            <Check size={13} aria-hidden="true" /> Claims retain their sources
          </p>
          <p>
            <Check size={13} aria-hidden="true" /> Founder, market and fit stay separate
          </p>
        </div>

        <Button
          type="submit"
          aria-label="Enter investor workspace"
          fullWidth
          size="lg"
          trailingIcon={<ArrowRight size={17} aria-hidden="true" />}
          loading={isNavigating}
          disabled={!query.trim() || Boolean(checkError) || isNavigating || !hasHydrated || storageAvailable !== true}
        >
          Enter investor workspace
        </Button>
        {completionError || persistenceError ? (
          <p className={styles.completionError} role="alert" aria-live="assertive">
            {completionError || persistenceError}
          </p>
        ) : null}
        <p className={styles.saveNote}>
          Prototype mode · saved only in this browser, with no account or cloud sync
        </p>
      </aside>
    </form>
  );
}

export function InvestorThesisForm({ initialQuery }: { initialQuery: string }) {
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
    />
  );
}
