/**
 * Real arXiv Atom API connector — surfaces recent research papers related to
 * a technical query. No API key required. Useful signal for technical
 * sourcing theses (e.g. "AI infrastructure", "agent security"): a founder
 * publishing recent papers in the space is a real, checkable building signal.
 * Server-only. Never throws for ordinary failures — returns an empty list
 * with `error` set instead.
 */

const ARXIV_API_ORIGIN = "https://export.arxiv.org/api/query";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 15;

export interface ArxivSearchOptions {
  limit?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ArxivPaper {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  publishedAt: string | null;
  url: string;
}

export interface ArxivSearchResult {
  query: string;
  capturedAt: string;
  papers: ArxivPaper[];
  error: string | null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXmlEntities(match[1]) : null;
}

function extractAuthors(block: string): string[] {
  const matches = block.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g);
  return [...matches].map((match) => decodeXmlEntities(match[1])).filter(Boolean);
}

function parseEntries(xml: string): ArxivPaper[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  return entries.flatMap((entry) => {
    const id = extractTag(entry, "id");
    const title = extractTag(entry, "title");
    const summary = extractTag(entry, "summary");
    if (!id || !title) return [];
    return [{
      id,
      title,
      summary: summary ?? "",
      authors: extractAuthors(entry),
      publishedAt: extractTag(entry, "published"),
      url: id,
    }];
  });
}

/** Runs a real (live, network) arXiv search. Never throws for ordinary failures. */
export async function searchArxiv(
  query: string,
  options: ArxivSearchOptions = {},
): Promise<ArxivSearchResult> {
  const capturedAt = new Date().toISOString();
  const trimmed = query.trim();
  if (!trimmed) {
    return { query: trimmed, capturedAt, papers: [], error: "empty_query" };
  }

  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(options.limit ?? DEFAULT_LIMIT)));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  const url = new URL(ARXIV_API_ORIGIN);
  url.searchParams.set("search_query", `all:${trimmed}`);
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");
  url.searchParams.set("max_results", String(limit));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { "User-Agent": "undr-vc-intelligence" },
    });

    if (!response.ok) {
      return { query: trimmed, capturedAt, papers: [], error: `http_${response.status}` };
    }

    const xml = await response.text();
    return { query: trimmed, capturedAt, papers: parseEntries(xml), error: null };
  } catch {
    const reason = controller.signal.aborted ? "timeout" : "network_error";
    return { query: trimmed, capturedAt, papers: [], error: reason };
  } finally {
    clearTimeout(timeout);
  }
}
