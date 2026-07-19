/**
 * Tavily connector — LLM-oriented web search and page extraction
 * (https://docs.tavily.com). Complements Anthropic's provider web search:
 * a second, independent index for search, plus something the provider tool
 * cannot do at all — pulling the full content of a specific page so the
 * agent can verify a candidate against the primary source.
 *
 * Plain fetch against the REST API; no SDK dependency. Server-only: the key
 * never leaves this module.
 */

const TAVILY_BASE_URL = "https://api.tavily.com";
const REQUEST_TIMEOUT_MS = 25_000;

export function isTavilyEnabled(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

interface TavilyFetchResult {
  ok: boolean;
  status: number;
  data: Record<string, unknown> | null;
  error: string | null;
}

async function tavilyFetch(path: string, body: Record<string, unknown>): Promise<TavilyFetchResult> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return { ok: false, status: 0, data: null, error: "tavily_not_configured" };

  try {
    const response = await fetch(`${TAVILY_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, data: null, error: `tavily_http_${response.status}` };
    }
    const data = (await response.json()) as Record<string, unknown>;
    return { ok: true, status: response.status, data, error: null };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return { ok: false, status: 0, data: null, error: timedOut ? "tavily_timeout" : "tavily_network_error" };
  }
}

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilySearchOutput {
  results: TavilySearchResult[];
  answer: string | null;
  error: string | null;
}

export async function tavilySearch(
  query: string,
  options: { maxResults?: number; topic?: "general" | "news"; includeAnswer?: boolean } = {},
): Promise<TavilySearchOutput> {
  const response = await tavilyFetch("/search", {
    query: query.slice(0, 400),
    search_depth: "advanced",
    max_results: Math.min(options.maxResults ?? 6, 10),
    topic: options.topic ?? "general",
    include_answer: options.includeAnswer ? "basic" : false,
  });

  if (!response.ok || !response.data) {
    return { results: [], answer: null, error: response.error };
  }

  const rawResults = Array.isArray(response.data.results) ? response.data.results : [];
  return {
    results: rawResults
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        title: typeof entry.title === "string" ? entry.title : "",
        url: typeof entry.url === "string" ? entry.url : "",
        content: typeof entry.content === "string" ? entry.content.slice(0, 1200) : "",
        score: typeof entry.score === "number" ? entry.score : 0,
      }))
      .filter((entry) => entry.url),
    answer: typeof response.data.answer === "string" ? response.data.answer : null,
    error: null,
  };
}

export interface TavilyExtractedPage {
  url: string;
  content: string;
}

export interface TavilyExtractOutput {
  pages: TavilyExtractedPage[];
  failedUrls: string[];
  error: string | null;
}

const MAX_URLS_PER_EXTRACT = 3;
const MAX_CONTENT_CHARS_PER_PAGE = 7000;

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function tavilyExtract(urls: string[]): Promise<TavilyExtractOutput> {
  const safeUrls = urls.filter(isHttpUrl).slice(0, MAX_URLS_PER_EXTRACT);
  if (safeUrls.length === 0) {
    return { pages: [], failedUrls: urls, error: "no_valid_urls" };
  }

  const response = await tavilyFetch("/extract", {
    urls: safeUrls,
    extract_depth: "basic",
    format: "markdown",
  });

  if (!response.ok || !response.data) {
    return { pages: [], failedUrls: safeUrls, error: response.error };
  }

  const rawResults = Array.isArray(response.data.results) ? response.data.results : [];
  const rawFailed = Array.isArray(response.data.failed_results) ? response.data.failed_results : [];
  return {
    pages: rawResults
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        url: typeof entry.url === "string" ? entry.url : "",
        content: typeof entry.raw_content === "string"
          ? entry.raw_content.slice(0, MAX_CONTENT_CHARS_PER_PAGE)
          : "",
      }))
      .filter((entry) => entry.url && entry.content),
    failedUrls: rawFailed
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => (typeof entry.url === "string" ? entry.url : ""))
      .filter(Boolean),
    error: null,
  };
}
