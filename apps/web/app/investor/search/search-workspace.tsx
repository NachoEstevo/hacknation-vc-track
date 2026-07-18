"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  ExternalLink,
  FileSearch,
  GitCompareArrows,
  Layers3,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { StatusBadge } from "@/components/ui/status";
import { useWorkspace } from "@/components/workspace-provider";
import { searchClayCatalogRows } from "@/lib/catalog/search-catalog";
import type { ClayCatalogCompany, ClayCatalogSearchResult } from "@/lib/catalog/types";
import { searchOpportunities } from "@/lib/demo";
import {
  parseSearchIntent,
  refineSearchSession,
  searchFingerprint,
  searchIntentForSession,
} from "@/lib/search";
import type { CriterionMatchState, OpportunityMatch } from "@/lib/domain";
import styles from "./page.module.css";

type SearchWorkspaceProps = {
  starterQuery: string;
  catalogRows: ClayCatalogCompany[];
  catalogTotal: number;
};

const REFINEMENTS = [
  { label: "LATAM only", phrase: "in Latin America", field: "geography" },
  { label: "Pre-seed", phrase: "at pre-seed", field: "stage" },
  { label: "Working demo", phrase: "with a working demo", field: "working_demo" },
  { label: "Technical founder", phrase: "with a technical founder", field: "technical_founder" },
  { label: "No institutional funding", phrase: "without institutional funding", field: "institutional_funding" },
  { label: "Exclude crypto", phrase: "excluding crypto and web3", field: "sector-exclusion" },
] as const;

const MATCH_STATE_ORDER: Record<CriterionMatchState, number> = {
  match: 0,
  partial: 1,
  missing: 2,
  conflict: 3,
};

function readableToken(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function lexicalScore(match: OpportunityMatch, query: string): number {
  const terms = query
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3);
  if (terms.length === 0) return 0;

  const opportunity = match.opportunity;
  const text = [
    opportunity.project.name,
    opportunity.project.tagline,
    opportunity.project.summary,
    ...opportunity.project.sectorTags,
    opportunity.company.city,
    opportunity.company.countryCode,
  ].join(" ").toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function ResultCard({
  match,
  rank,
  onFeedback,
}: {
  match: OpportunityMatch;
  rank: number;
  onFeedback: (message: string) => void;
}) {
  const {
    addToPipeline,
    isInPipeline,
    toggleCompare,
    isComparing,
    compareLimit,
  } = useWorkspace();
  const { opportunity } = match;
  const inPipeline = isInPipeline(opportunity.id);
  const comparing = isComparing(opportunity.id);
  const evaluations = [...match.evaluations].sort(
    (left, right) => MATCH_STATE_ORDER[left.state] - MATCH_STATE_ORDER[right.state],
  );
  const strongestEvidence = match.strongestEvidenceIds.flatMap((id) => {
    const evidence = opportunity.evidence.find((record) => record.id === id);
    return evidence ? [evidence] : [];
  }).slice(0, 2);

  function handleCompare() {
    const result = toggleCompare(opportunity.id);
    if (result === "limit") {
      onFeedback(`Comparison is limited to ${compareLimit} companies. Remove one before adding another.`);
      return;
    }
    if (result === "failed") {
      onFeedback(`Browser storage could not update the comparison. ${opportunity.project.name} was not changed.`);
      return;
    }
    onFeedback(
      result === "added"
        ? `${opportunity.project.name} added to comparison.`
        : `${opportunity.project.name} removed from comparison.`,
    );
  }

  function handlePipeline() {
    if (inPipeline) {
      onFeedback(`${opportunity.project.name} is already in your pipeline.`);
      return;
    }
    const result = addToPipeline(opportunity.id);
    onFeedback(result === "saved"
      ? `${opportunity.project.name} saved to the discovered stage in this browser.`
      : result === "no_change"
        ? `${opportunity.project.name} is already in your pipeline.`
        : `Browser storage could not add ${opportunity.project.name} to the pipeline.`);
  }

  return (
    <article className={styles.resultCard} aria-labelledby={`result-${opportunity.id}`}>
      <div className={styles.rankColumn}>
        <span>{String(rank).padStart(2, "0")}</span>
        <div aria-hidden="true" />
      </div>

      <div className={styles.resultMain}>
        <div className={styles.resultTopline}>
          <div className={styles.resultIdentity}>
            <div className={styles.resultLabels}>
              <Chip tone="inference" size="sm">synthetic_demo</Chip>
              <span>{readableToken(opportunity.project.stage)}</span>
              <span>{opportunity.company.city}</span>
            </div>
            <h2 id={`result-${opportunity.id}`}>{opportunity.project.name}</h2>
            <p>{opportunity.project.tagline}</p>
          </div>
          <div className={styles.matchSummary}>
            <div>
              <strong>{match.thesisMatch}%</strong>
              <span>thesis fit*</span>
            </div>
            <div>
              <strong>{match.evidenceCoverage}%</strong>
              <span>evidence coverage</span>
            </div>
            <div className={styles.founderMetric}>
              <strong>{opportunity.founderScore?.score ?? "—"}</strong>
              <span>founder score</span>
              <em>
                {opportunity.founderScore
                  ? `${opportunity.founderScore.evidenceCoverage}% coverage · ${opportunity.founderScore.confidence} confidence`
                  : "insufficient founder evidence"}
              </em>
            </div>
          </div>
        </div>

        <div className={styles.resultContext}>
          <p>{opportunity.project.summary}</p>
          <div className={styles.tagList}>
            {opportunity.project.sectorTags.map((tag) => (
              <span key={tag}>{readableToken(tag)}</span>
            ))}
            <span>{opportunity.project.teamSize} people</span>
          </div>
        </div>

        <section className={styles.whyMatch} aria-label={`Why ${opportunity.project.name} matches`}>
          <div className={styles.blockHeading}>
            <span><Sparkles size={14} aria-hidden="true" /> Why it appears</span>
            <span>{match.evaluations.length} criteria assessed</span>
          </div>
          {evaluations.length > 0 ? (
            <div className={styles.evaluationGrid}>
              {evaluations.map((evaluation) => (
                <div className={styles.evaluation} key={evaluation.criterion.id}>
                  <div>
                    <strong>{evaluation.criterion.label}</strong>
                    <StatusBadge status={evaluation.state} />
                  </div>
                  <p>{evaluation.explanation}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.noCriteria}>
              <CircleHelp size={15} aria-hidden="true" />
              No structured criteria were recognized. The name and project description are used
              only to order the fixtures; no thesis-fit claim is made.
            </div>
          )}
        </section>

        {strongestEvidence.length > 0 ? (
          <section className={styles.evidenceStrip} aria-label="Strongest supporting evidence">
            <div className={styles.blockHeading}>
              <span><ShieldCheck size={14} aria-hidden="true" /> Strongest evidence</span>
              <Link href={`/investor/projects/${opportunity.id}/evidence` as Route}>
                Evidence room <ChevronRight size={13} aria-hidden="true" />
              </Link>
            </div>
            <div className={styles.evidenceGrid}>
              {strongestEvidence.map((evidence) => (
                <div key={evidence.id} className={styles.evidenceItem}>
                  <div>
                    <span>{readableToken(evidence.sourceType)}</span>
                    <time dateTime={evidence.capturedAt}>
                      {new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(
                        new Date(evidence.capturedAt),
                      )}
                    </time>
                  </div>
                  <strong>{evidence.sourceName}</strong>
                  <p>{evidence.excerpt}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className={styles.nextAction}>
          <FileSearch size={15} aria-hidden="true" />
          <span><strong>Next diligence step</strong>{match.nextDiligenceAction}</span>
        </div>

        <div className={styles.resultActions}>
          <ButtonLink
            href={`/investor/projects/${opportunity.id}` as Route}
            size="sm"
            trailingIcon={<ArrowRight size={14} />}
          >
            Open project brief
          </ButtonLink>
          <Button
            variant={comparing ? "secondary" : "quiet"}
            size="sm"
            onClick={handleCompare}
            leadingIcon={comparing ? <Check size={14} /> : <GitCompareArrows size={14} />}
          >
            {comparing ? "Comparing" : "Compare"}
          </Button>
          <Button
            variant={inPipeline ? "secondary" : "quiet"}
            size="sm"
            onClick={handlePipeline}
            leadingIcon={inPipeline ? <Check size={14} /> : <Plus size={14} />}
          >
            {inPipeline ? "In pipeline" : "Add to pipeline"}
          </Button>
        </div>
      </div>
    </article>
  );
}

function CatalogSection({
  catalogResults,
  catalogTotal,
  catalogSearchTerm,
}: {
  catalogResults: ClayCatalogSearchResult[];
  catalogTotal: number;
  catalogSearchTerm: string;
}) {
  return (
    <section className={styles.catalogSection} aria-labelledby="catalog-heading">
      <div className={styles.catalogHeader}>
        <div>
          <div className={styles.catalogEyebrow}>
            <Database size={14} aria-hidden="true" /> Internal source catalog
          </div>
          <h2 id="catalog-heading">Unverified source-field matches</h2>
          <p>
            These records come directly from the checked-in Clay CSV. They are companies, not
            evidence-rich opportunities; unknown fields remain unknown.
          </p>
        </div>
        <div className={styles.catalogMeta}>
          <Chip tone="external" size="sm">clay_csv</Chip>
          <StatusBadge status="unconfirmed" label="Unverified" />
          <span>{catalogTotal} total</span>
        </div>
      </div>

      {catalogSearchTerm ? (
        <p className={styles.catalogLookup}>
          Direct source-field lookup for <strong>“{catalogSearchTerm}”</strong> · {catalogResults.length} shown
        </p>
      ) : (
        <p className={styles.catalogLookup}>
          This conversational query has no safe direct source-field term. No catalog inference was attempted.
        </p>
      )}

      {catalogResults.length > 0 ? (
        <div className={styles.catalogGrid}>
          {catalogResults.map((company) => (
            <article className={styles.catalogCard} key={company.stableId}>
              <div className={styles.catalogCardTop}>
                <div>
                  <span>{company.countryCode ?? "Country unknown"}</span>
                  <h3>{company.name}</h3>
                </div>
                {company.domain ? (
                  <a
                    href={`https://${company.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${company.name} website`}
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                ) : null}
              </div>
              <p>{company.description ?? "Description unknown in the source."}</p>
              <dl>
                <div>
                  <dt>Industry</dt>
                  <dd>{company.primaryIndustry ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{company.sizeBand ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{company.location ?? "Unknown"}</dd>
                </div>
              </dl>
              <div className={styles.matchedFields}>
                {company.matchedFields.length > 0 ? (
                  company.matchedFields.map((field) => <span key={field}>Matched: {readableToken(field)}</span>)
                ) : (
                  <span>Source record</span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.catalogEmpty}>
          <Search size={17} aria-hidden="true" />
          <div>
            <strong>No direct catalog matches</strong>
            <p>Try a company name, industry, domain, or location. We do not infer missing classifications.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function HydratedSearchWorkspace({
  starterQuery,
  catalogRows,
  catalogTotal,
}: SearchWorkspaceProps) {
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

  const parsedIntent = useMemo(() => parseSearchIntent(query), [query]);
  const intent = useMemo(
    () => searchIntentForSession(session, activeThesis),
    [activeThesis, session],
  );
  const configuredCriterionIds = useMemo(
    () => new Set(
      session.criteria?.map((criterion) => criterion.id)
      ?? activeThesis?.criteria.map((criterion) => criterion.id)
      ?? [],
    ),
    [activeThesis, session.criteria],
  );
  const matches = useMemo(() => {
    const ranked = searchOpportunities(intent);
    if (intent.criteria.length > 0) return ranked;
    return [...ranked].sort((left, right) =>
      lexicalScore(right, query) - lexicalScore(left, query)
      || left.opportunity.project.name.localeCompare(right.opportunity.project.name),
    );
  }, [intent, query]);
  const currentFingerprint = searchFingerprint(query, intent.criteria);
  const currentSaved = savedSearches.some((search) =>
    searchFingerprint(search.query, search.criteria ?? []) === currentFingerprint);
  const activeFields = new Set(intent.criteria.map((criterion) =>
    criterion.priority === "exclude" ? `${criterion.field}-exclusion` : criterion.field,
  ));
  const catalog = useMemo(() => searchClayCatalogRows(catalogRows, query, 6), [catalogRows, query]);

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

  function handleSave() {
    if (currentSaved) {
      setFeedback("This exploration is already saved.");
      return;
    }
    if (storageAvailable !== true || persistenceError) {
      setFeedback(
        persistenceError
        ?? "Browser storage is unavailable, so this exploration was not saved.",
      );
      return;
    }
    const savedId = saveSearch({ query, label: query, criteria: intent.criteria });
    if (!savedId) {
      setFeedback("Browser storage could not save this exploration. Nothing was recorded as saved.");
      return;
    }
    setFeedback("Search saved in this browser-only workspace.");
  }

  return (
    <div className={styles.workspace}>
      <aside className={styles.conversation} aria-label="Search conversation">
        <div className={styles.conversationHeader}>
          <div>
            <span className={styles.aiMark} aria-hidden="true"><Sparkles size={14} /></span>
            <div>
              <strong>Sourcing copilot</strong>
              <span>Internal evidence mode</span>
            </div>
          </div>
          <StatusBadge status="supported" label="Ready" />
        </div>

        <div className={styles.thread} aria-live="polite">
          <div className={styles.userMessage}>
            <span>You</span>
            <p>{query}</p>
          </div>

          <div className={styles.assistantMessage}>
            <span className={styles.aiMark} aria-hidden="true"><Sparkles size={13} /></span>
            <div>
              <strong>
                {intent.criteria.length === 0
                  ? "I could not safely infer structured criteria from that wording."
                  : session.criteria !== undefined
                    ? `I restored this exploration into ${intent.criteria.length} visible criteria.`
                    : activeThesis
                    ? `I combined your active thesis with ${parsedIntent.criteria.length} query criteria into ${intent.criteria.length} visible criteria.`
                    : `I translated this into ${intent.criteria.length} visible criteria.`}
              </strong>
              <p>
                I searched the evidence-rich demo profiles first. Missing evidence remains
                neutral and is reported separately from thesis fit.
              </p>
            </div>
          </div>

          {intent.criteria.length > 0 ? (
            <div className={styles.criteriaCard}>
              <div className={styles.criteriaTitle}>
                <span>Interpreted criteria</span>
                <span>{intent.sourceScope === "internal" ? "Internal only" : "Internal → public"}</span>
              </div>
              <div className={styles.criteriaList}>
                {intent.criteria.map((criterion) => (
                  <div key={criterion.id}>
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
          ) : null}

          <div className={styles.assistantMessage}>
            <span className={styles.aiMark} aria-hidden="true"><Layers3 size={13} /></span>
            <div>
              <strong>{matches.length} profiles available for inspection.</strong>
              <p>
                The result panel retains the evidence, contradictions, open questions, and
                diligence actions while you refine this conversation.
              </p>
            </div>
          </div>
        </div>

        <div className={styles.refinements}>
          <span>Refine without starting over</span>
          <div>
            {REFINEMENTS.map((refinement) => {
              const active = activeFields.has(refinement.field);
              return (
                <button
                  key={refinement.label}
                  type="button"
                  onClick={() => addRefinement(refinement.phrase)}
                  disabled={active}
                  aria-pressed={active}
                >
                  {active ? <Check size={12} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
                  {refinement.label}
                </button>
              );
            })}
          </div>
        </div>

        <form className={styles.queryComposer} onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="refine-query">Refine sourcing query</label>
          <textarea
            id="refine-query"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Refine sector, stage, geography, signals, or exclusions…"
          />
          <div>
            <button
              type="button"
              className={styles.resetButton}
              onClick={() => setDraft(query)}
              disabled={draft === query}
              aria-label="Reset query draft"
            >
              <RotateCcw size={14} aria-hidden="true" />
            </button>
            <Button type="submit" size="sm" disabled={!draft.trim() || draft.trim() === query.trim()}>
              Search again
            </Button>
          </div>
        </form>
      </aside>

      <section className={styles.results} aria-label="Search results">
        <div className={styles.resultsHeader}>
          <div>
            <p className={styles.resultsEyebrow}>Structured result set</p>
            <h1>{matches.length} evidence-rich profiles</h1>
            <p>
              Ranked deterministically. Thesis fit uses assessed criteria only; coverage shows
              how much of the brief has evidence.
            </p>
          </div>
          <div className={styles.resultHeaderActions}>
            <Button
              variant={currentSaved ? "secondary" : "quiet"}
              size="sm"
              onClick={handleSave}
              leadingIcon={currentSaved ? <Check size={14} /> : <Bookmark size={14} />}
            >
              {currentSaved ? "Saved" : "Save search"}
            </Button>
            {compareIds.length >= 2 ? (
              <ButtonLink
                href={"/investor/compare" as Route}
                variant="secondary"
                size="sm"
                leadingIcon={<GitCompareArrows size={14} />}
              >
                Compare {compareIds.length}
              </ButtonLink>
            ) : null}
          </div>
        </div>

        <div className={styles.axisNote}>
          <CircleHelp size={15} aria-hidden="true" />
          <p>
            <strong>*Thesis fit is not an investment score.</strong> Founder Score is shown as a
            separate evidence-weighted lens; market and idea–market analysis also remain separate.
            Unknown evidence is excluded from fit and shown in coverage.
          </p>
        </div>

        <p className={styles.feedback} aria-live="polite">{feedback}</p>

        <div className={styles.resultList}>
          {matches.map((match, index) => (
            <ResultCard
              key={match.opportunity.id}
              match={match}
              rank={index + 1}
              onFeedback={setFeedback}
            />
          ))}
        </div>

        <CatalogSection
          catalogResults={catalog.results}
          catalogTotal={catalogTotal}
          catalogSearchTerm={catalog.term}
        />
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
