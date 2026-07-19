"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight, BellOff, Bookmark, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, DataBadge, SectorTag } from "@/components/pencil";
import { Chip } from "@/components/ui/chip";
import { useWorkspace } from "@/components/workspace-provider";
import { DEFAULT_SEARCH_QUERY } from "@/lib/search";
import styles from "./page.module.css";

function formatSavedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "locally";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function SavedSearchesWorkspace() {
  const router = useRouter();
  const {
    savedSearches,
    removeSavedSearch,
    hasHydrated,
    startSearchSession,
    searchSessionError,
  } = useWorkspace();
  const [message, setMessage] = useState("");

  async function handleRemove(searchId: string, label: string) {
    if (!window.confirm(`Remove the saved search “${label}” from this browser?`)) {
      setMessage("Saved search kept.");
      return;
    }

    const result = await removeSavedSearch(searchId);
    setMessage(result === "saved"
      ? `Removed saved search “${label}” from this browser.`
      : result === "no_change"
        ? `Saved search “${label}” was already absent.`
        : `Browser storage could not remove “${label}”. Nothing changed.`);
  }

  function openStarter() {
    if (!startSearchSession({ query: DEFAULT_SEARCH_QUERY, source: "starter" })) {
      setMessage(searchSessionError ?? "Private session storage could not open a new search.");
      return;
    }
    router.push("/investor/search");
  }

  function reopen(search: (typeof savedSearches)[number]) {
    if (!startSearchSession({
      query: search.query,
      criteria: search.criteria ?? [],
      source: "saved_search",
      sourceId: search.id,
    })) {
      setMessage(searchSessionError ?? `Private session storage could not reopen “${search.label}”.`);
      return;
    }
    router.push("/investor/search");
  }

  return (
    <AppShell
      eyebrow="Reusable sourcing"
      title="Saved searches"
      headerAside={<Chip tone="accent" size="sm">synthetic_demo</Chip>}
      actions={(
        <Button variant="primary" onClick={openStarter}>New search</Button>
      )}
    >
      <div className={styles.page}>
        <p className="sr-only" role="status" aria-live="polite">{message}</p>

        {!hasHydrated ? (
          <div className={styles.loading} aria-live="polite">Loading saved searches…</div>
        ) : savedSearches.length === 0 ? (
          <section className={styles.empty}>
            <span className={styles.emptyIcon}><Bookmark aria-hidden="true" /></span>
            <Chip tone="accent" size="sm">synthetic_demo</Chip>
            <h2>No sourcing questions saved yet.</h2>
            <p>
              Save a query from Discover and it will appear here with its original
              wording and interpreted criteria. Demo searches remain in this browser only.
            </p>
            <Button variant="primary" trailingIcon={<ArrowUpRight aria-hidden="true" />} onClick={openStarter}>
              Start a search
            </Button>
          </section>
        ) : (
          <>
            <p className={styles.subtitle}>
              {savedSearches.length} saved · Browser storage only · no live alerts
            </p>
            <section className={styles.list} aria-label="Saved sourcing searches">
              {savedSearches.map((search) => {
                const criteria = search.criteria ?? [];
                const resavedLabel = search.updatedAt !== search.createdAt
                  ? formatSavedDate(search.updatedAt)
                  : null;
                return (
                  <article className={styles.card} key={search.id}>
                    <div className={styles.cardLeft}>
                      <p className={styles.query}>“{search.query}”</p>
                      <div className={styles.metaRow}>
                        <span className={styles.metaDate}>Saved {formatSavedDate(search.createdAt)}</span>
                        {resavedLabel ? (
                          <span className={styles.metaUpdated}>Re-saved {resavedLabel}</span>
                        ) : null}
                      </div>
                      <div className={styles.criteriaRow}>
                        <span className={styles.criteriaLabel}>Criteria</span>
                        {criteria.length > 0 ? (
                          criteria.map((criterion) => (
                            <SectorTag key={criterion.id} label={criterion.label} />
                          ))
                        ) : (
                          <DataBadge tone="unknown" label="Natural-language query" />
                        )}
                      </div>
                    </div>
                    <div className={styles.cardRight}>
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => handleRemove(search.id, search.label)}
                        aria-label={`Remove saved search ${search.label}`}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => reopen(search)}
                        className={styles.reopenButton}
                      >
                        Re-open <ArrowUpRight aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        )}

        <footer className={styles.footnote}>
          <BellOff aria-hidden="true" />
          <p>
            Alerts are not enabled in this prototype. Reopening a search runs the
            current deterministic demo matcher; no background monitoring is implied.
          </p>
        </footer>
      </div>
    </AppShell>
  );
}
