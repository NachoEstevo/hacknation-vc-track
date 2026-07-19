"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowUpRight, Check, ChevronDown, Globe, Layers3, Search } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import {
  buildThesisChipLabel,
  describeSourceScope,
  THESIS_SOURCE_SCOPES,
  type ThesisSourceScope,
} from "@/lib/domain";
import styles from "./page.module.css";

/** The Pencil `Search Box`: input area + `Box Bar` (scope, active thesis, send). */
export function HomeSearchComposer({
  fallbackQuery,
}: {
  fallbackQuery: string;
}) {
  const router = useRouter();
  const {
    activeThesis,
    hasHydrated,
    startSearchSession,
    searchSessionError,
    setThesisSourceScope,
  } = useWorkspace();
  const [error, setError] = useState("");
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const scopeMenuRef = useRef<HTMLDivElement>(null);
  const query = (hasHydrated ? activeThesis?.brief : "") || fallbackQuery;
  const sourceScope = activeThesis?.sourceScope ?? "internal_then_public";
  const thesisChipLabel = !hasHydrated ? "Loading sourcing lens…" : buildThesisChipLabel(activeThesis);

  useEffect(() => {
    if (!scopeMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (scopeMenuRef.current?.contains(event.target)) return;
      setScopeMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setScopeMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [scopeMenuOpen]);

  async function selectSourceScope(scope: ThesisSourceScope) {
    setScopeMenuOpen(false);
    if (scope === sourceScope) return;
    const result = await setThesisSourceScope(scope);
    if (result === "failed") {
      setError("Browser storage could not save the sourcing scope. Nothing changed.");
    }
  }

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
    <form className={styles.searchBox} onSubmit={submit}>
      <div className={styles.inputArea}>
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
          placeholder="Describe the founders, teams, or projects you want to investigate…"
        />
      </div>
      <div className={styles.boxBar}>
        <div className={styles.scopeChipWrap} ref={scopeMenuRef}>
          <button
            type="button"
            className={styles.scopeChip}
            onClick={() => setScopeMenuOpen((open) => !open)}
            disabled={!activeThesis}
            aria-haspopup="listbox"
            aria-expanded={scopeMenuOpen}
            title={activeThesis ? undefined : "Set up a thesis to change where sourcing looks first"}
          >
            <Layers3 size={13} aria-hidden="true" />
            {describeSourceScope(sourceScope)}
            <ChevronDown size={12} aria-hidden="true" />
          </button>
          {scopeMenuOpen ? (
            <ul className={styles.scopeMenu} role="listbox" aria-label="Sourcing scope">
              {THESIS_SOURCE_SCOPES.map((scope) => (
                <li key={scope}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={scope === sourceScope}
                    className={styles.scopeMenuOption}
                    onClick={() => { void selectSourceScope(scope); }}
                  >
                    <span>{describeSourceScope(scope)}</span>
                    {scope === sourceScope ? <Check size={13} aria-hidden="true" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <span className={styles.thesisChip}>
          <Globe size={13} aria-hidden="true" />
          {thesisChipLabel}
        </span>
        <Link href={"/investor/thesis" as Route} className={styles.reviewLink}>
          Review thesis
        </Link>
        <span className={styles.barSpacer} aria-hidden="true" />
        <button type="submit" className={styles.sendButton} aria-label="Run search">
          <ArrowUp size={17} aria-hidden="true" />
        </button>
      </div>
      {error ? <p role="alert" aria-live="assertive" className={styles.formError}>{error}</p> : null}
    </form>
  );
}

/** The Pencil `Example Queries` list: one row per starter sourcing brief. */
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
      {examples.map((example) => (
        <button
          key={example.label}
          type="button"
          className={styles.exampleRow}
          onClick={() => openExample(example)}
        >
          <Search size={14} aria-hidden="true" />
          <span>{example.query}</span>
          <ArrowUpRight size={13} aria-hidden="true" />
        </button>
      ))}
      {error ? <p role="alert" aria-live="assertive" className={styles.formError}>{error}</p> : null}
    </div>
  );
}
