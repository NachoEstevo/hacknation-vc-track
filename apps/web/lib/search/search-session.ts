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
  updatedAt: string;
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

  return {
    version: 1,
    query,
    ...(input.criteria === undefined ? {} : { criteria: [...input.criteria] }),
    source: input.source,
    ...(sourceId ? { sourceId } : {}),
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
  }, updatedAt);
}

/** Runtime boundary for sessionStorage. */
export function isSearchSession(value: unknown): value is SearchSession {
  if (!isRecord(value) || value.version !== 1) return false;
  if (typeof value.query !== "string" || !value.query.trim() || value.query.length > 1000) return false;
  if (!SEARCH_SESSION_SOURCES.includes(value.source as SearchSessionSource)) return false;
  if (value.sourceId !== undefined && (typeof value.sourceId !== "string" || !value.sourceId.trim() || value.sourceId.length > 200)) return false;
  if (value.criteria !== undefined && (!Array.isArray(value.criteria) || !value.criteria.every(isSearchCriterion))) return false;
  if (typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt))) return false;
  return true;
}
