"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight, BellOff, Bookmark, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Chip } from "@/components/ui/chip";
import { useWorkspace } from "@/components/workspace-provider";
import { DEFAULT_SEARCH_QUERY } from "@/lib/search";
import styles from "./page.module.css";

function formatSavedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved locally";
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

  function handleRemove(searchId: string, label: string) {
    if (!window.confirm(`Remove the saved search “${label}” from this browser?`)) {
      setMessage("Saved search kept.");
      return;
    }

    const result = removeSavedSearch(searchId);
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
        <button type="button" className={styles.newSearchLink} onClick={openStarter}>
          <Search aria-hidden="true" /> New search
        </button>
      )}
    >
      <div className={styles.page}>
        <p className="sr-only" role="status" aria-live="polite">{message}</p>
        <section className={styles.intro}>
          <div>
            <p>Saved locally</p>
            <h2>Return to a sourcing question without turning it into a black-box alert.</h2>
          </div>
          <aside>
            <BellOff aria-hidden="true" />
            <p>
              Alerts are not enabled in this prototype. Reopening a search runs the
              current deterministic demo matcher; no background monitoring is implied.
            </p>
          </aside>
        </section>

        {!hasHydrated ? (
          <div className={styles.loading} aria-live="polite">Loading saved searches…</div>
        ) : savedSearches.length === 0 ? (
          <section className={styles.empty}>
            <span className={styles.emptyIcon}><Bookmark aria-hidden="true" /></span>
            <Chip tone="accent" size="sm">synthetic_demo</Chip>
            <h2>No sourcing questions saved yet.</h2>
            <p>
              Save a query from Discover and it will appear here with its original
              wording. Demo searches remain in this browser only.
            </p>
            <button type="button" className={styles.primaryLink} onClick={openStarter}>
              Start a search <ArrowUpRight aria-hidden="true" />
            </button>
          </section>
        ) : (
          <section className={styles.list} aria-label="Saved sourcing searches">
            <div className={styles.listHeader}>
              <span>{savedSearches.length} saved {savedSearches.length === 1 ? "search" : "searches"}</span>
              <span>Browser storage · no live alerts</span>
            </div>
            {savedSearches.map((search) => {
              const criteriaCount = search.criteria?.length ?? 0;
              return (
                <article className={styles.searchCard} key={search.id}>
                  <div className={styles.searchIndex} aria-hidden="true">
                    {String(savedSearches.indexOf(search) + 1).padStart(2, "0")}
                  </div>
                  <div className={styles.searchBody}>
                    <div className={styles.searchTopline}>
                      <Chip tone="accent" size="sm">synthetic_demo</Chip>
                      <span>{formatSavedDate(search.updatedAt)}</span>
                    </div>
                    <h2>{search.label}</h2>
                    <blockquote>{search.query}</blockquote>
                    <div className={styles.searchMeta}>
                      <span>{criteriaCount ? `${criteriaCount} structured criteria` : "Natural-language query"}</span>
                      <span>No scheduled alerts</span>
                    </div>
                  </div>
                  <div className={styles.searchActions}>
                    <button
                      type="button"
                      onClick={() => reopen(search)}
                      className={styles.reopenLink}
                    >
                      Reopen <ArrowUpRight aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(search.id, search.label)}
                      aria-label={`Remove saved search ${search.label}`}
                    >
                      <Trash2 aria-hidden="true" /> Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </AppShell>
  );
}
