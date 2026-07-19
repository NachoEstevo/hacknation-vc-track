"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  ArrowUp,
  Bookmark,
  Check,
  Database,
  Github,
  GitCompareArrows,
  Globe,
  History,
  LoaderCircle,
  Plus,
  SquarePen,
  UserCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Button,
  ButtonLink,
  ChatAssistantBubble,
  ChatUserBubble,
  ExternalSearchBanner,
  ProjectResultCard,
  type ProjectResultSource,
  type ResultBadgeTone,
} from "@/components/pencil";
import { useWorkspace } from "@/components/workspace-provider";
import {
  refineSearchSession,
  searchFingerprint,
  searchIntentForSession,
} from "@/lib/search";
import type { SearchCandidate, RunSearchOutput } from "@/lib/ai/search-harness";
import styles from "./page.module.css";

type SearchWorkspaceProps = {
  starterQuery: string;
};

const REFINEMENTS = [
  { label: "LATAM only", phrase: "in Latin America", field: "geography" },
  { label: "Pre-seed", phrase: "at pre-seed", field: "stage" },
  { label: "Working demo", phrase: "with a working demo", field: "working_demo" },
  { label: "Technical founder", phrase: "with a technical founder", field: "technical_founder" },
  { label: "No institutional funding", phrase: "without institutional funding", field: "institutional_funding" },
  { label: "Exclude crypto", phrase: "excluding crypto and web3", field: "sector-exclusion" },
] as const;

const RESULTS_PAGE_SIZE = 3;
const EXTERNAL_STEP_LABEL = "GitHub, arXiv";

function readableToken(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceIconFor(type: SearchCandidate["sources"][number]["type"]) {
  if (type === "github") return <Github aria-hidden="true" />;
  if (type === "registry") return <UserCheck aria-hidden="true" />;
  return <Globe aria-hidden="true" />;
}

function badgeToneFor(sourceCategory: SearchCandidate["sourceCategory"]): ResultBadgeTone {
  return sourceCategory;
}

interface SearchProgressState {
  completed: number;
  total: number;
  externalCompleted: number;
  externalTotal: number;
}

interface SearchRunState {
  status: "idle" | "loading" | "paused" | "done" | "error";
  output: RunSearchOutput | null;
  progress: SearchProgressState;
}

interface ChatTurn {
  query: string;
  assistantMessage: string;
}

function ResultCard({
  candidate,
  onFeedback,
}: {
  candidate: SearchCandidate;
  onFeedback: (message: string) => void;
}) {
  const { addToPipeline, isInPipeline, toggleCompare, compareLimit } = useWorkspace();
  const isExternal = candidate.sourceCategory === "external_unconfirmed";

  function handleCompare() {
    const result = toggleCompare(candidate.id);
    if (result === "limit") {
      onFeedback(`Comparison is limited to ${compareLimit} companies. Remove one before adding another.`);
      return;
    }
    if (result === "failed") {
      onFeedback(`Browser storage could not update the comparison. ${candidate.projectName} was not changed.`);
      return;
    }
    onFeedback(result === "added" ? `${candidate.projectName} added to comparison.` : `${candidate.projectName} removed from comparison.`);
  }

  async function handleSaveToPipeline() {
    if (isInPipeline(candidate.id)) {
      onFeedback(`${candidate.projectName} is already in your pipeline.`);
      return;
    }
    const result = await addToPipeline(candidate.id);
    onFeedback(result === "saved"
      ? `${candidate.projectName} saved to the discovered stage in this browser.`
      : result === "no_change"
        ? `${candidate.projectName} is already in your pipeline.`
        : `Browser storage could not add ${candidate.projectName} to the pipeline.`);
  }

  function handleInvite() {
    onFeedback(`An invite to ${candidate.founderName} would be sent from here once outbound email is wired up.`);
  }

  const sources: ProjectResultSource[] = candidate.sources.map((source) => ({
    icon: sourceIconFor(source.type),
    label: source.label,
    meta: source.count,
  }));

  return (
    <ProjectResultCard
      href={candidate.sourceCategory === "registered" ? `/investor/projects/${candidate.id.replace("registered:", "")}` : undefined}
      founderName={candidate.founderName}
      projectName={candidate.projectName}
      badgeTone={badgeToneFor(candidate.sourceCategory)}
      founderSubline={candidate.founderSubline}
      founderScore={candidate.score}
      scorePrefix={candidate.scoreIsEstimate ? "~" : undefined}
      description={candidate.description}
      stageLabel={readableToken(candidate.stageLabel)}
      tags={candidate.tags.map(readableToken)}
      whyMatch={candidate.whyMatch}
      sources={sources}
      confidenceLevel={candidate.confidenceLevel}
      unknownNote={candidate.unknownNote ?? undefined}
      onSave={handleSaveToPipeline}
      onCompare={isExternal ? undefined : handleCompare}
      onInvite={isExternal ? handleInvite : undefined}
    />
  );
}

function HydratedSearchWorkspace({ starterQuery }: SearchWorkspaceProps) {
  const {
    savedSearches,
    saveSearch,
    compareIds,
    activeThesis,
    storageAvailable,
    persistenceError,
    searchSession,
    searchSessionError,
    startSearchSession,
    clearSearchSession,
  } = useWorkspace();
  const session = useMemo(() => searchSession ?? ({
    version: 1 as const,
    query: starterQuery,
    source: "starter" as const,
    updatedAt: "starter",
  }), [searchSession, starterQuery]);
  const query = session.query;
  const [draft, setDraft] = useState(query);
  const [feedback, setFeedback] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE);
  const [run, setRun] = useState<SearchRunState>({
    status: "idle",
    output: null,
    progress: { completed: 0, total: 0, externalCompleted: 0, externalTotal: 0 },
  });

  const intent = useMemo(() => searchIntentForSession(session, activeThesis), [activeThesis, session]);
  const configuredCriterionIds = useMemo(
    () => new Set(
      session.criteria?.map((criterion) => criterion.id)
      ?? activeThesis?.criteria.map((criterion) => criterion.id)
      ?? [],
    ),
    [activeThesis, session.criteria],
  );
  const currentFingerprint = searchFingerprint(query, intent.criteria);
  const currentSaved = savedSearches.some((search) =>
    searchFingerprint(search.query, search.criteria ?? []) === currentFingerprint);
  const activeFields = new Set(intent.criteria.map((criterion) =>
    criterion.priority === "exclude" ? `${criterion.field}-exclusion` : criterion.field,
  ));

  const lastRequestRef = useRef<{ query: string; criteria: typeof intent.criteria; sourceScope: typeof intent.sourceScope } | null>(null);
  const lastFingerprintRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function executeSearch(searchQuery: string, criteria: typeof intent.criteria, sourceScope: typeof intent.sourceScope) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    lastRequestRef.current = { query: searchQuery, criteria, sourceScope };
    const externalTotal = sourceScope === "internal_then_public" ? 2 : 0;
    setVisibleCount(RESULTS_PAGE_SIZE);
    setRun({ status: "loading", output: null, progress: { completed: 0, total: 2 + externalTotal, externalCompleted: 0, externalTotal } });

    try {
      const response = await fetch("/api/search/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, criteria, sourceScope }),
        signal: controller.signal,
      });
      if (!response.body) throw new Error("no_stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event.type === "progress") {
            setRun((previous) => ({
              ...previous,
              progress: {
                ...previous.progress,
                completed: event.completed as number,
                externalCompleted: event.isExternal ? previous.progress.externalCompleted + 1 : previous.progress.externalCompleted,
              },
            }));
          } else if (event.type === "done") {
            const output = event.output as RunSearchOutput;
            setRun((previous) => ({ ...previous, status: "done", output }));
            setTurns((previous) => [...previous, { query: searchQuery, assistantMessage: output.assistantMessage }]);
          } else if (event.type === "error") {
            setRun((previous) => ({ ...previous, status: "error" }));
          }
        }
      }
    } catch {
      if (controller.signal.aborted) {
        setRun((previous) => ({ ...previous, status: "paused" }));
        return;
      }
      setRun((previous) => ({ ...previous, status: "error" }));
    }
  }

  useEffect(() => {
    if (lastFingerprintRef.current === currentFingerprint) return;
    lastFingerprintRef.current = currentFingerprint;
    void executeSearch(query, intent.criteria, intent.sourceScope);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFingerprint]);

  function handlePauseResume() {
    if (run.status === "loading") {
      abortRef.current?.abort();
      return;
    }
    if (run.status === "paused" && lastRequestRef.current) {
      const { query: pendingQuery, criteria, sourceScope } = lastRequestRef.current;
      void executeSearch(pendingQuery, criteria, sourceScope);
    }
  }

  function commitSearch(nextQuery: string) {
    const normalized = nextQuery.trim().replace(/\s+/g, " ").slice(0, 1000);
    if (!normalized) return;
    const opened = startSearchSession(refineSearchSession(session, normalized, intent.criteria));
    if (!opened) {
      setFeedback(searchSessionError ?? "Private session storage could not preserve this refinement. Nothing changed.");
      return;
    }
    setDraft(normalized);
    setFeedback("");
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commitSearch(draft);
  }

  function addRefinement(phrase: string) {
    const separator = /[.!?]$/.test(query.trim()) ? " " : ", ";
    commitSearch(`${query.trim()}${separator}${phrase}.`);
  }

  function startNewChat() {
    const cleared = clearSearchSession();
    if (!cleared) {
      setFeedback(searchSessionError ?? "Private session storage could not start a new exploration.");
      return;
    }
    setTurns([]);
    setDraft(starterQuery);
    setFeedback("");
  }

  async function handleSave() {
    if (currentSaved) {
      setFeedback("This exploration is already saved.");
      return;
    }
    if (storageAvailable !== true || persistenceError) {
      setFeedback(persistenceError ?? "Browser storage is unavailable, so this exploration was not saved.");
      return;
    }
    const savedId = await saveSearch({ query, label: query, criteria: intent.criteria });
    if (!savedId) {
      setFeedback("Browser storage could not save this exploration. Nothing was recorded as saved.");
      return;
    }
    setFeedback("Search saved in this browser-only workspace.");
  }

  const candidates = run.output?.candidates ?? [];
  const visibleCandidates = candidates.slice(0, visibleCount);
  const registeredCount = run.output?.registeredCount ?? 0;
  const internalBaseCount = run.output?.internalBaseCount ?? 0;
  const externalCount = run.output?.externalCount ?? 0;
  const isSearching = run.status === "loading";
  const showExternalBanner = intent.sourceScope === "internal_then_public"
    && (isSearching || run.status === "paused")
    && run.progress.externalTotal > 0;

  return (
    <div className={styles.workspace}>
      <aside className={styles.chatPanel} aria-label="Search conversation">
        <div className={styles.chatHead}>
          <span className={styles.chatHeadTitle}>Conversation</span>
          <span className={styles.chatHeadSpacer} aria-hidden="true" />
          <Link
            href={"/investor/saved-searches" as Route}
            className={styles.chatHeadIcon}
            aria-label="View saved searches"
            title="Saved searches"
          >
            <History aria-hidden="true" />
          </Link>
          <button
            type="button"
            className={styles.chatHeadIcon}
            onClick={startNewChat}
            aria-label="Start a new search"
            title="New search"
          >
            <SquarePen aria-hidden="true" />
          </button>
        </div>

        <div className={styles.thread} aria-live="polite">
          <ChatUserBubble>{query}</ChatUserBubble>

          <ChatAssistantBubble
            extra={intent.criteria.length > 0 ? (
              <div className={styles.criteriaCard}>
                <div className={styles.criteriaTitle}>
                  <span>Interpreted criteria</span>
                  <span>{intent.sourceScope === "internal" ? "Internal only" : "Internal → public"}</span>
                </div>
                <div className={styles.criteriaList}>
                  {intent.criteria.map((criterion) => (
                    <div className={styles.criteriaRow} key={criterion.id}>
                      <span className={styles.priorityMark} data-priority={criterion.priority} aria-hidden="true" />
                      <span>{criterion.label}</span>
                      <em>
                        {configuredCriterionIds.has(criterion.id)
                          ? session.criteria !== undefined ? "search snapshot" : "active thesis"
                          : "query"}
                        {` · ${criterion.priority}`}
                      </em>
                    </div>
                  ))}
                </div>
              </div>
            ) : undefined}
          >
            {intent.criteria.length === 0
              ? "I could not safely infer structured criteria from that wording."
              : `I translated this into ${intent.criteria.length} visible criteria.`}
          </ChatAssistantBubble>

          <div className={styles.refineRow}>
            {REFINEMENTS.map((refinement) => {
              const active = activeFields.has(refinement.field);
              return (
                <button
                  key={refinement.label}
                  type="button"
                  className={styles.refineChip}
                  data-active={active ? "true" : undefined}
                  onClick={() => addRefinement(refinement.phrase)}
                  disabled={active}
                  aria-pressed={active}
                >
                  {active ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                  {refinement.label}
                </button>
              );
            })}
          </div>

          {turns.map((turn, index) => (
            <ChatAssistantBubble key={`${turn.query}-${index}`}>{turn.assistantMessage}</ChatAssistantBubble>
          ))}

          {isSearching ? (
            <div className={styles.thinkingRow}>
              <LoaderCircle aria-hidden="true" className={styles.thinkingSpin} />
              <span>
                {run.progress.total > 0
                  ? `Scanning ${EXTERNAL_STEP_LABEL}… ${run.progress.completed} of ${run.progress.total} sources`
                  : "Starting search…"}
              </span>
            </div>
          ) : null}
        </div>

        <form className={styles.composer} onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="refine-query">Refine sourcing query</label>
          <div className={styles.composerBox}>
            <textarea
              id="refine-query"
              className={styles.composerTextarea}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={1}
              maxLength={1000}
              placeholder="Refine your search…"
            />
            <button
              type="submit"
              className={styles.sendButtonComposer}
              disabled={!draft.trim() || draft.trim() === query.trim()}
              aria-label="Send refinement"
            >
              <ArrowUp aria-hidden="true" />
            </button>
          </div>
        </form>
      </aside>

      <section className={styles.results} aria-label="Search results">
        <div className={styles.resultsHeadWrap}>
          <div className={styles.resultsHead}>
            <h1>{candidates.length} result{candidates.length === 1 ? "" : "s"}</h1>
            <span className={styles.sortChip}>Relevance</span>
            {compareIds.length >= 2 ? (
              <ButtonLink
                href={"/investor/compare" as Route}
                variant="secondary"
                leadingIcon={<GitCompareArrows aria-hidden="true" />}
              >
                Compare {compareIds.length}
              </ButtonLink>
            ) : null}
            <Button
              variant={currentSaved ? "secondary" : "primary"}
              onClick={handleSave}
              leadingIcon={currentSaved ? <Check aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
            >
              {currentSaved ? "Saved" : "Save search"}
            </Button>
          </div>
          <p className={styles.resultsQueryLine}>{intent.criteria.map((c) => c.label).join(" · ") || query}</p>
        </div>

        <div className={styles.sourceSummary}>
          <span className={styles.summaryPill} data-tone="registered">
            <UserCheck aria-hidden="true" /> Registered {registeredCount}
          </span>
          <span className={styles.summaryPill} data-tone="internal_base">
            <Database aria-hidden="true" /> Internal base {internalBaseCount}
          </span>
          {intent.sourceScope === "internal_then_public" ? (
            <span className={styles.summaryPill} data-tone="external_unconfirmed">
              <Globe aria-hidden="true" /> External {externalCount}
            </span>
          ) : null}
          <span className={styles.summarySpacer} aria-hidden="true" />
          <span className={styles.summaryUpdated}>
            {run.status === "done" ? "Updated just now" : run.status === "error" ? "Search failed" : "Updating…"}
            {run.output && !run.output.usedAi ? " · deterministic fallback" : ""}
          </span>
        </div>

        {showExternalBanner ? (
          <div className={styles.externalBannerSlot}>
            <ExternalSearchBanner
              active={run.status === "loading"}
              actionLabel={run.status === "paused" ? "Resume" : "Pause"}
              onAction={handlePauseResume}
              text={
                run.status === "paused"
                  ? `Paused — ${run.progress.externalCompleted} of ${run.progress.externalTotal} external sources complete`
                  : `Searching external sources — ${EXTERNAL_STEP_LABEL}… ${run.progress.externalCompleted} of ${run.progress.externalTotal} complete`
              }
            />
          </div>
        ) : null}

        <p className={styles.feedback} aria-live="polite">{feedback}</p>

        {run.status === "error" ? (
          <p className={styles.feedback} role="status">Something went wrong reaching live sources. Try refining your query again.</p>
        ) : null}

        <div className={styles.resultList}>
          {visibleCandidates.map((candidate) => (
            <ResultCard key={candidate.id} candidate={candidate} onFeedback={setFeedback} />
          ))}
        </div>

        {candidates.length === 0 && run.status === "done" ? (
          <p className={styles.feedback} role="status">No matches yet across the registered base, internal catalog, or external sources for this brief.</p>
        ) : null}

        {candidates.length > visibleCount ? (
          <button
            type="button"
            className={styles.showMore}
            onClick={() => setVisibleCount((count) => count + RESULTS_PAGE_SIZE)}
          >
            Show {Math.min(RESULTS_PAGE_SIZE, candidates.length - visibleCount)} more matches ↓
          </button>
        ) : null}
      </section>
    </div>
  );
}

export function SearchWorkspace(props: SearchWorkspaceProps) {
  const { hasHydrated, searchSessionError } = useWorkspace();

  if (!hasHydrated) {
    return (
      <div className={styles.workspace} role="status" aria-live="polite">
        Loading the private search session from this browser tab…
      </div>
    );
  }

  return (
    <>
      {searchSessionError ? (
        <p className={styles.feedback} role="status" aria-live="polite">{searchSessionError}</p>
      ) : null}
      <HydratedSearchWorkspace {...props} />
    </>
  );
}
