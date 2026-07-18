"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { searchFingerprint, type SearchSessionSource } from "@/lib/search";
import type { SearchCriterion } from "@/lib/domain";
import styles from "../page.module.css";

type RecentSearchesProps = {
  fallbackQuery: string;
};

type RecentRecord = {
  id: string;
  label: string;
  query: string;
  criteria?: SearchCriterion[];
  source: string;
  sessionSource: SearchSessionSource;
};

export function RecentSearches({ fallbackQuery }: RecentSearchesProps) {
  const router = useRouter();
  const {
    activeThesis,
    savedSearches,
    hasHydrated,
    startSearchSession,
    searchSessionError,
  } = useWorkspace();
  const [error, setError] = useState("");
  const records = [
    ...(activeThesis
      ? [{
          id: "active-thesis-query",
          label: activeThesis.brief,
          query: activeThesis.brief,
          criteria: activeThesis.criteria,
          source: "Active thesis",
          sessionSource: "active_thesis" as const,
        }]
      : []),
    ...savedSearches.map((search) => ({
      id: search.id,
      label: search.label,
      query: search.query,
      criteria: search.criteria ?? [],
      source: "Saved search",
      sessionSource: "saved_search" as const,
    })),
  ].filter((record, index, all) =>
    all.findIndex((candidate) =>
      searchFingerprint(candidate.query, candidate.criteria)
      === searchFingerprint(record.query, record.criteria)) === index,
  ).slice(0, 3);

  function open(record: RecentRecord) {
    if (!startSearchSession({
      query: record.query,
      ...(record.criteria === undefined ? {} : { criteria: record.criteria }),
      source: record.sessionSource,
      sourceId: record.id,
    })) {
      setError(searchSessionError ?? "Private session storage could not reopen this exploration.");
      return;
    }
    router.push("/investor/search");
  }

  if (!hasHydrated) {
    return <p className={styles.recentEmpty}>Loading this workspace’s saved explorations…</p>;
  }

  if (records.length === 0) {
    const starter: RecentRecord = {
      id: "starter-search",
      label: "Run the starter evidence search",
      query: fallbackQuery,
      source: "Suggested exploration",
      sessionSource: "starter",
    };
    return (
      <div className={styles.recentList}>
        <button
          type="button"
          onClick={() => open(starter)}
          className={styles.recentItem}
        >
          <span className={styles.recentIndex}>01</span>
          <span className={styles.recentCopy}>
            <strong>Run the starter evidence search</strong>
            <span>Suggested exploration</span>
          </span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </button>
        {error ? <p role="alert" aria-live="assertive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={styles.recentList}>
      {records.map((record, index) => (
        <button
          type="button"
          key={record.id}
          onClick={() => open(record)}
          className={styles.recentItem}
        >
          <span className={styles.recentIndex}>{String(index + 1).padStart(2, "0")}</span>
          <span className={styles.recentCopy}>
            <strong>{record.label}</strong>
            <span>{record.source}</span>
          </span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      ))}
      {error ? <p role="alert" aria-live="assertive">{error}</p> : null}
    </div>
  );
}
