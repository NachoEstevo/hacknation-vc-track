import robotsParserModule from "robots-parser";
import { assertSafePublicUrl } from "./safe-url";
import type { FetchPageResult } from "./types";

const USER_AGENT = "HackNationVCResearch/0.1 (+https://github.com/NachoEstevo/hacknation-vc-track)";
const MAX_BYTES = 2 * 1024 * 1024;
const parseRobots = robotsParserModule as unknown as (
  url: string,
  contents: string,
) => { isAllowed(url: string, userAgent?: string): boolean | undefined };

export interface FetchPublicPageOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  checkRobots?: boolean;
}

async function fetchWithRedirects(url: URL, fetcher: typeof fetch, signal: AbortSignal): Promise<Response> {
  let current = url;
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    await assertSafePublicUrl(current);
    const response = await fetcher(current, { redirect: "manual", signal, headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" } });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    current = new URL(location, current);
  }
  throw new Error("too_many_redirects");
}

export async function fetchPublicPage(input: string | URL, options: FetchPublicPageOptions = {}): Promise<FetchPageResult> {
  const url = typeof input === "string" ? new URL(input) : input;
  const fetcher = options.fetcher ?? fetch;
  try {
    await assertSafePublicUrl(url);
    if (options.checkRobots !== false) {
      const robotsController = new AbortController();
      const robotsTimer = setTimeout(() => robotsController.abort(), 2_500);
      try {
        const robotsUrl = new URL("/robots.txt", url);
        const robotsResponse = await fetchWithRedirects(robotsUrl, fetcher, robotsController.signal);
        if (robotsResponse.ok) {
          const parser = parseRobots(robotsUrl.toString(), (await robotsResponse.text()).slice(0, 512_000));
          if (!parser.isAllowed(url.toString(), USER_AGENT)) return { failure: { url: url.toString(), reason: "robots_disallowed" } };
        }
      } catch {
        // Unavailable robots.txt is treated as no published restriction.
      } finally {
        clearTimeout(robotsTimer);
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
    const response = await fetchWithRedirects(url, fetcher, controller.signal).finally(() => clearTimeout(timer));
    if (!response.ok) return { failure: { url: url.toString(), reason: `http_${response.status}` } };
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return { failure: { url: url.toString(), reason: "not_html" } };
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_BYTES) return { failure: { url: url.toString(), reason: "too_large" } };
    const html = await response.text();
    if (Buffer.byteLength(html) > MAX_BYTES) return { failure: { url: url.toString(), reason: "too_large" } };
    return { page: { url: response.url || url.toString(), html, status: response.status } };
  } catch (error) {
    return { failure: { url: url.toString(), reason: error instanceof Error ? error.message : "fetch_failed" } };
  }
}
