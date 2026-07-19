import { NextResponse, type NextRequest } from "next/server";
import { listClayCatalogCompanies } from "@/lib/catalog/index.server";
import { runSearch } from "@/lib/ai/search-harness";
import { isSearchCriterion, type SearchCriterion } from "@/lib/domain";
import {
  checkRateLimit,
  rateLimitKeyFor,
  type RateLimitConfig,
} from "@/lib/ai/agent-guardrails";
import { requireUserInProduction } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

const SEARCH_RATE_LIMIT: RateLimitConfig = { limit: 20, windowMs: 10 * 60_000 };

interface RunSearchRequestBody {
  query?: unknown;
  criteria?: unknown;
  sourceScope?: unknown;
}

/**
 * Runs the real sourcing harness (see lib/ai/search-harness.ts) and streams
 * newline-delimited JSON progress events as each live source resolves,
 * ending with the synthesized result set. Nothing here is mocked: every
 * candidate traces back to a real DB row or a real live HTTP response.
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireUserInProduction();
  if (unauthorized) return unauthorized;

  const rate = checkRateLimit(rateLimitKeyFor(request, "search-run"), SEARCH_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { message: `Rate limit reached: searches are limited to ${SEARCH_RATE_LIMIT.limit} per 10 minutes. Try again in ${rate.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const body = (await request.json().catch(() => null)) as RunSearchRequestBody | null;
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 1000) : "";
  if (!query) {
    return NextResponse.json({ message: "A non-empty query is required." }, { status: 400 });
  }

  const criteria = Array.isArray(body?.criteria)
    ? (body.criteria as unknown[]).filter(isSearchCriterion)
    : [];
  const sourceScope = body?.sourceScope === "internal" ? "internal" : "internal_then_public";

  const catalogRows = await listClayCatalogCompanies();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function write(payload: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      }

      try {
        const output = await runSearch({
          query,
          intent: { query, criteria: criteria as SearchCriterion[], sourceScope },
          catalogRows,
          onProgress(event) {
            write({ type: "progress", ...event });
          },
        });
        write({ type: "done", output });
      } catch (error) {
        write({ type: "error", message: error instanceof Error ? error.message : "search_failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
