/**
 * Real GitHub Search API connector — discovers public repositories (and their
 * owners) matching a free-text query. Unlike `github-public.server.ts` (which
 * enriches a *known* login), this is the discovery step: it finds candidates
 * undr has never seen before. Works unauthenticated (lower rate limit); set
 * GITHUB_TOKEN to raise it. Server-only — never import from a Client Component.
 */

const GITHUB_API_ORIGIN = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;

export interface GitHubSearchOptions {
  token?: string;
  limit?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface GitHubSearchRepository {
  stableId: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  ownerLogin: string;
  ownerAvatarUrl: string | null;
  ownerHtmlUrl: string;
  primaryLanguage: string | null;
  topics: string[];
  starCount: number;
  forkCount: number;
  pushedAt: string | null;
  createdAt: string | null;
}

export interface GitHubSearchResult {
  query: string;
  capturedAt: string;
  totalCount: number;
  repositories: GitHubSearchRepository[];
  rateLimitRemaining: number | null;
  error: string | null;
}

function toRepository(item: unknown): GitHubSearchRepository | null {
  if (typeof item !== "object" || item === null) return null;
  const record = item as Record<string, unknown>;
  const owner = record.owner as Record<string, unknown> | undefined;
  const id = record.id;
  const name = record.name;
  const fullName = record.full_name;
  const htmlUrl = record.html_url;
  if (
    typeof id !== "number" ||
    typeof name !== "string" ||
    typeof fullName !== "string" ||
    typeof htmlUrl !== "string" ||
    !owner ||
    typeof owner.login !== "string"
  ) {
    return null;
  }

  const topics = Array.isArray(record.topics)
    ? record.topics.filter((topic): topic is string => typeof topic === "string")
    : [];

  return {
    stableId: `github:repository:${id}`,
    name,
    fullName,
    htmlUrl,
    description: typeof record.description === "string" ? record.description : null,
    ownerLogin: owner.login,
    ownerAvatarUrl: typeof owner.avatar_url === "string" ? owner.avatar_url : null,
    ownerHtmlUrl: typeof owner.html_url === "string" ? owner.html_url : `https://github.com/${owner.login}`,
    primaryLanguage: typeof record.language === "string" ? record.language : null,
    topics,
    starCount: typeof record.stargazers_count === "number" ? record.stargazers_count : 0,
    forkCount: typeof record.forks_count === "number" ? record.forks_count : 0,
    pushedAt: typeof record.pushed_at === "string" ? record.pushed_at : null,
    createdAt: typeof record.created_at === "string" ? record.created_at : null,
  };
}

/**
 * Runs a real (live, network) GitHub code-search-style repository query.
 * Never throws for ordinary failures (rate limit, network, bad query) —
 * returns an empty result set with `error` set instead, so one flaky
 * external source never breaks the whole search.
 */
export async function searchGitHubRepositories(
  query: string,
  options: GitHubSearchOptions = {},
): Promise<GitHubSearchResult> {
  const capturedAt = new Date().toISOString();
  const trimmed = query.trim();
  if (!trimmed) {
    return { query: trimmed, capturedAt, totalCount: 0, repositories: [], rateLimitRemaining: null, error: "empty_query" };
  }

  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(options.limit ?? DEFAULT_LIMIT)));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  const url = new URL("/search/repositories", GITHUB_API_ORIGIN);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(limit));

  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "undr-vc-intelligence",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  const token = options.token?.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    const rateLimitRemaining = (() => {
      const raw = response.headers.get("x-ratelimit-remaining");
      return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
    })();

    if (!response.ok) {
      const reason = response.status === 403 || response.status === 429 ? "rate_limited" : `http_${response.status}`;
      return { query: trimmed, capturedAt, totalCount: 0, repositories: [], rateLimitRemaining, error: reason };
    }

    const payload = (await response.json()) as { total_count?: number; items?: unknown[] };
    const repositories = Array.isArray(payload.items)
      ? payload.items.flatMap((item) => {
          const repo = toRepository(item);
          return repo ? [repo] : [];
        })
      : [];

    return {
      query: trimmed,
      capturedAt,
      totalCount: typeof payload.total_count === "number" ? payload.total_count : repositories.length,
      repositories,
      rateLimitRemaining,
      error: null,
    };
  } catch {
    const reason = controller.signal.aborted ? "timeout" : "network_error";
    return { query: trimmed, capturedAt, totalCount: 0, repositories: [], rateLimitRemaining: null, error: reason };
  } finally {
    clearTimeout(timeout);
  }
}
