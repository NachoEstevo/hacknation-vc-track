"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Database } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useWorkspace } from "@/components/workspace-provider";
import styles from "./page.module.css";

export function ActiveThesisCard() {
  const { activeThesis, hasHydrated } = useWorkspace();

  return (
    <aside className={styles.thesisCard} aria-label="Active thesis summary">
      <div className={styles.thesisHeading}>
        <span>Active sourcing lens</span>
        <Chip tone={activeThesis ? "accent" : "inference"} size="sm" dot>
          {!hasHydrated ? "Loading" : activeThesis ? "Browser saved" : "Starter"}
        </Chip>
      </div>
      <p>
        {!hasHydrated
          ? "Reading the sourcing lens saved in this browser…"
          : activeThesis?.summary
            ?? "Early technical teams, evidence of product velocity, and transparent funding history."}
      </p>
      <Link href={"/investor/thesis" as Route} className={styles.textLink}>
        Review thesis <ArrowRight size={13} aria-hidden="true" />
      </Link>
    </aside>
  );
}

export function HomeSearchComposer({
  fallbackQuery,
}: {
  fallbackQuery: string;
}) {
  const router = useRouter();
  const { activeThesis, hasHydrated, startSearchSession, searchSessionError } = useWorkspace();
  const [error, setError] = useState("");
  const query = (hasHydrated ? activeThesis?.brief : "") || fallbackQuery;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const brief = String(new FormData(event.currentTarget).get("brief") ?? "");
    if (!startSearchSession({ query: brief, source: "home" })) {
      setError(searchSessionError ?? "Private session storage could not open this exploration.");
      return;
    }
    router.push("/investor/search");
  }

  return (
    <form className={styles.composer} onSubmit={submit}>
      <label className="sr-only" htmlFor="investor-query">Sourcing query</label>
      <textarea
        key={query}
        id="investor-query"
        name="brief"
        rows={3}
        minLength={3}
        maxLength={1000}
        required
        defaultValue={query}
        placeholder="Describe sector, geography, stage, team, signals, or exclusions…"
      />
      <div className={styles.composerFooter}>
        <div className={styles.scopeNote}>
          <Database size={14} aria-hidden="true" />
          Internal dataset first
        </div>
        <button type="submit" className={styles.searchButton}>
          Explore companies
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
      {error ? <p role="alert" aria-live="assertive">{error}</p> : null}
    </form>
  );
}

export function HomeSearchExamples({
  examples,
}: {
  examples: readonly { label: string; query: string }[];
}) {
  const router = useRouter();
  const { startSearchSession, searchSessionError } = useWorkspace();
  const [error, setError] = useState("");

  function openExample(example: { label: string; query: string }) {
    if (!startSearchSession({ query: example.query, source: "example", sourceId: example.label })) {
      setError(searchSessionError ?? "Private session storage could not open this example.");
      return;
    }
    router.push("/investor/search");
  }

  return (
    <div className={styles.examples} aria-label="Example searches">
      <span>Try a sourcing brief</span>
      <div>
        {examples.map((example) => (
          <button key={example.label} type="button" onClick={() => openExample(example)}>
            {example.label}
            <ArrowRight size={12} aria-hidden="true" />
          </button>
        ))}
      </div>
      {error ? <p role="alert" aria-live="assertive">{error}</p> : null}
    </div>
  );
}

export function StarterSearchButton({ query }: { query: string }) {
  const router = useRouter();
  const { startSearchSession, searchSessionError } = useWorkspace();
  const [error, setError] = useState("");

  function openStarter() {
    if (!startSearchSession({ query, source: "starter" })) {
      setError(searchSessionError ?? "Private session storage could not open the starter search.");
      return;
    }
    router.push("/investor/search");
  }

  return (
    <span>
      <Button variant="quiet" size="sm" trailingIcon={<ArrowRight size={14} />} onClick={openStarter}>
        Browse all
      </Button>
      {error ? <span className="sr-only" role="alert" aria-live="assertive">{error}</span> : null}
    </span>
  );
}
