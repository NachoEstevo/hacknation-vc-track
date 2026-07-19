import {
  isSearchCriterion,
  type ActiveThesis,
  type SearchCriterion,
  type SearchIntent,
} from "../domain";
import {
  criterionMergeIdentity,
  mergeSearchCriteria,
  mergeThesisWithSearchIntent,
} from "./merge-search-intent";
import { parseSearchIntent } from "./parse-search-intent";

export const SEARCH_SESSION_SOURCES = [
  "starter",
  "home",
  "example",
  "active_thesis",
  "recent",
  "saved_search",
  "refinement",
] as const;

/** Data sources the investor can point a search at. `undr_engine` (the curated prospect base, web to fill gaps) is the default; `web_search` is web-only; `hack_nation` sources exclusively from the scraped HackNation founder base; the rest stay visible but disabled in the composer. */
export const SEARCH_DATA_SOURCES = [
  "undr_engine",
  "web_search",
  "hack_nation",
  "internal_catalog",
  "registered_founders",
  "github",
] as const;

export type SearchDataSource = (typeof SEARCH_DATA_SOURCES)[number];

export const SEARCH_GEOGRAPHY_KINDS = ["all", "region", "country"] as const;

export type SearchGeographyKind = (typeof SEARCH_GEOGRAPHY_KINDS)[number];

/** Where the search is allowed to look: everywhere, one region, or one country. */
export interface SearchGeography {
  kind: SearchGeographyKind;
  /** Human-readable place name the agent scopes queries with (empty for `all`). */
  label: string;
}

export const DEFAULT_SEARCH_QUERY =
  "Pre-seed AI infrastructure teams in Latin America with technical founders, a working demo, and no institutional funding.";

export type SearchSessionSource = (typeof SEARCH_SESSION_SOURCES)[number];

export interface SearchSession {
  version: 1;
  query: string;
  /** Presence means use this exact snapshot instead of recomputing from the current thesis. */
  criteria?: SearchCriterion[];
  source: SearchSessionSource;
  sourceId?: string;
  dataSource?: SearchDataSource;
  geography?: SearchGeography;
  /** How many candidate cards the agent must deliver before concluding. */
  targetCandidates?: number;
  updatedAt: string;
}

export const TARGET_CANDIDATE_OPTIONS = [1, 3, 5] as const;
export const DEFAULT_TARGET_CANDIDATES = 3;

function isTargetCandidates(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10;
}

export type NewSearchSession = Omit<SearchSession, "version" | "updatedAt">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function canonicalCriterion(criterion: SearchCriterion): string {
  const value = Array.isArray(criterion.value)
    ? [...criterion.value].map(String).sort().join("|")
    : String(criterion.value);
  return [criterion.field, criterion.operator, criterion.priority, value].join(":");
}

export function criteriaFingerprint(criteria: readonly SearchCriterion[] | undefined): string {
  if (criteria === undefined) return "dynamic";
  return criteria.filter(isSearchCriterion).map(canonicalCriterion).sort().join(";");
}

export function searchFingerprint(
  query: string,
  criteria: readonly SearchCriterion[] | undefined,
): string {
  const normalizedQuery = query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return `${normalizedQuery}::${criteriaFingerprint(criteria)}`;
}

function isSearchGeography(value: unknown): value is SearchGeography {
  if (!isRecord(value)) return false;
  if (!SEARCH_GEOGRAPHY_KINDS.includes(value.kind as SearchGeographyKind)) return false;
  if (typeof value.label !== "string" || value.label.length > 80) return false;
  if (value.kind !== "all" && !value.label.trim()) return false;
  return true;
}

export function createSearchSession(
  input: NewSearchSession,
  updatedAt = new Date().toISOString(),
): SearchSession {
  const query = input.query.trim().replace(/\s+/g, " ").slice(0, 1000);
  const sourceId = input.sourceId?.trim().slice(0, 200) || undefined;
  if (!query) throw new Error("A search query is required.");
  if (!SEARCH_SESSION_SOURCES.includes(input.source)) {
    throw new Error("The search session source is not supported.");
  }
  if (input.criteria !== undefined && !input.criteria.every(isSearchCriterion)) {
    throw new Error("The search session criteria snapshot is invalid.");
  }
  if (input.dataSource !== undefined && !SEARCH_DATA_SOURCES.includes(input.dataSource)) {
    throw new Error("The search data source is not supported.");
  }
  if (input.geography !== undefined && !isSearchGeography(input.geography)) {
    throw new Error("The search geography is invalid.");
  }
  if (input.targetCandidates !== undefined && !isTargetCandidates(input.targetCandidates)) {
    throw new Error("The candidate target must be a whole number between 1 and 10.");
  }

  return {
    version: 1,
    query,
    ...(input.criteria === undefined ? {} : { criteria: [...input.criteria] }),
    source: input.source,
    ...(sourceId ? { sourceId } : {}),
    ...(input.dataSource ? { dataSource: input.dataSource } : {}),
    ...(input.geography ? { geography: { ...input.geography } } : {}),
    ...(input.targetCandidates ? { targetCandidates: input.targetCandidates } : {}),
    updatedAt,
  };
}

export function searchIntentForSession(
  session: SearchSession,
  activeThesis: ActiveThesis | null,
): SearchIntent {
  const parsed = parseSearchIntent(session.query);
  return session.criteria !== undefined
    ? { ...parsed, criteria: [...session.criteria] }
    : mergeThesisWithSearchIntent(parsed, activeThesis);
}

export function refineSearchSession(
  session: SearchSession,
  nextQuery: string,
  currentCriteria: readonly SearchCriterion[],
  updatedAt = new Date().toISOString(),
): SearchSession {
  const parsedCurrent = parseSearchIntent(session.query);
  const parsedNext = parseSearchIntent(nextQuery);
  const currentQueryCriteria = new Set(parsedCurrent.criteria.map(criterionMergeIdentity));
  const addedCriteria = parsedNext.criteria.filter(
    (criterion) => !currentQueryCriteria.has(criterionMergeIdentity(criterion)),
  );
  return createSearchSession({
    query: nextQuery,
    criteria: mergeSearchCriteria(currentCriteria, addedCriteria),
    source: "refinement",
    ...(session.sourceId ? { sourceId: session.sourceId } : {}),
    ...(session.dataSource ? { dataSource: session.dataSource } : {}),
    ...(session.geography ? { geography: { ...session.geography } } : {}),
    ...(session.targetCandidates ? { targetCandidates: session.targetCandidates } : {}),
  }, updatedAt);
}

/** Runtime boundary for sessionStorage. */
export function isSearchSession(value: unknown): value is SearchSession {
  if (!isRecord(value) || value.version !== 1) return false;
  if (typeof value.query !== "string" || !value.query.trim() || value.query.length > 1000) return false;
  if (!SEARCH_SESSION_SOURCES.includes(value.source as SearchSessionSource)) return false;
  if (value.sourceId !== undefined && (typeof value.sourceId !== "string" || !value.sourceId.trim() || value.sourceId.length > 200)) return false;
  if (value.criteria !== undefined && (!Array.isArray(value.criteria) || !value.criteria.every(isSearchCriterion))) return false;
  if (value.dataSource !== undefined && !SEARCH_DATA_SOURCES.includes(value.dataSource as SearchDataSource)) return false;
  if (value.geography !== undefined && !isSearchGeography(value.geography)) return false;
  if (value.targetCandidates !== undefined && !isTargetCandidates(value.targetCandidates)) return false;
  if (typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt))) return false;
  return true;
}
