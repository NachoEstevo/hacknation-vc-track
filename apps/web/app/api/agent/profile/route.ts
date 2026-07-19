import { NextResponse, type NextRequest } from "next/server";
import { smoothStream, streamText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { resolveAnthropic, resolveModel } from "@/lib/ai/model";
import {
  AGENT_SECURITY_PROMPT,
  PROFILE_RATE_LIMIT,
  acquireStreamSlot,
  agentAbortSignal,
  checkRateLimit,
  rateLimitKeyFor,
} from "@/lib/ai/agent-guardrails";
import { CandidateReportSchema, ThesisContextSchema } from "@/lib/ai/sourcing-schema";
import { searchGitHubRepositories } from "@/lib/connectors/github/github-search.server";
import { findProspectByName } from "@/lib/catalog/hack-nation-prospects.server";
import { findHackNationPersonByName } from "@/lib/catalog/hack-nation-people.server";
import { isTavilyEnabled, tavilyExtract, tavilySearch } from "@/lib/connectors/tavily/tavily.server";
import { requireUserInProduction } from "@/lib/supabase/api-auth";
import { USAGE_LIMITS, resetsInLabel } from "@/lib/usage/usage-limits";
import { resolveUsageOwnerId } from "@/lib/usage/usage-identity.server";
import { refundUsage, reserveUsage } from "@/lib/usage/usage-store.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PROFILE_SYSTEM = `You are undr's diligence writer. You produce a grounded dossier on ONE person for an investor, researching them live on the web. You never invent facts or URLs; everything you state is either cited from a tool result this conversation, provided in the candidate seed, or explicitly labeled as unverified.

Procedure:
1. Research first, silently: if the candidate seed's sourceKind is "prospect_base" or "hack_nation", call lookup_prospect FIRST and treat the returned record as your base evidence — then research the web only for what the record lacks or leaves unverified. Otherwise run several focused web searches on the person (name + company, name + role, funding announcements, talks/podcasts, GitHub/LinkedIn presence). Use search_github when they are technical. Follow the evidence links given in the seed. Do not narrate the searching. Your research budget is about 9 tool steps — batch several searches into each step and stop researching in time to write.
   Contact channels are mandatory research: if the seed lacks the person's LinkedIn (or another direct channel — GitHub, X, personal site), run one dedicated search for it ("«name» «company» linkedin"). A dossier the investor cannot act on is incomplete.
2. Then write the dossier as one clean markdown document, in the structure below. Reply in the language of the investor's original request; keep proper nouns as-is. Output NOTHING before the first heading: no title line, no preamble, no "let me compile" — your very first characters are "### Overview".

Structure (use exactly these ### headings, translated to the reply language):
### Overview — who they are, what they are building, in 3-4 sentences.
### Background — career and education trail, dated where possible.
### Current venture — what the company/project does, stage, traction signals, team context.
### Evidence — a bullet list of the sources you actually used: [title](url) — one line on what each shows. Only URLs from tool results or the provided seed.
### Contact & channels — a bullet list of direct ways to reach them, one per line: [LinkedIn](url), [GitHub](url), [X](url), personal site, published work email. Only URLs seen in tool results or the seed. Name plainly any channel you searched for and could not find ("LinkedIn: not found").
### Thesis fit — how they map to the investor's thesis and original request: name the specific thesis elements they match (sector, stage, geography, signals), what does not match, and the strongest reason to take the meeting.
### Risks & unknowns — what you could not verify, contradictions found, and honest confidence in this dossier (high/medium/low with one line why).
### Suggested approach — 2-3 bullets: the outreach angle, what to ask first, what evidence to request.

Rules:
- Sourcing-analyst voice: terse, concrete, no hype, no exclamation marks.
- Markdown discipline: only the ### section headings above, plain paragraphs, and flat "-" bullet lists. Name repos, products, and profiles as inline [name](url) links. Never wrap a link in bold or italics, never nest lists, no blockquotes, no HTML, no tables — and never let a sentence's punctuation land at the start of a line or list item.
- Assess founder seriousness explicitly — undr's investors back early, overlooked companies only when the founder is demonstrably serious. Does the public trail hold together: LinkedIn history vs claimed role, GitHub activity and real code, a maintained product/docs, shipped releases? Credit the strong signals in Background/Current venture and name the gaps in Risks & unknowns.
- If the web turns up little or nothing about the person, say so plainly in Overview and keep the dossier short rather than padding it — a thin honest dossier beats a fabricated rich one.
- Distinguish clearly between verified facts (cited), the seed data you were given, and your inference — label inference as such inline ("likely", "appears to").`;

interface ProfileRequestBody {
  candidate?: unknown;
  thesis?: unknown;
  query?: unknown;
  usageKey?: unknown;
}

/**
 * Streams a full, freshly researched markdown dossier for one reported
 * candidate. The client caches the result per slug, so this only runs when
 * a profile is first opened (or explicitly refreshed).
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireUserInProduction();
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => null)) as ProfileRequestBody | null;
  const candidateParse = CandidateReportSchema.safeParse(body?.candidate);
  if (!candidateParse.success) {
    return NextResponse.json({ message: "A valid candidate seed is required." }, { status: 400 });
  }
  const candidate = candidateParse.data;

  const rate = checkRateLimit(rateLimitKeyFor(request, "profile"), PROFILE_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { message: `Rate limit reached: dossiers are limited to ${PROFILE_RATE_LIMIT.limit} per 10 minutes. Try again in ${rate.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const model = resolveModel("research");
  if (!model) {
    return NextResponse.json(
      { message: "No AI provider is configured. Set ANTHROPIC_API_KEY to enable dossiers." },
      { status: 503 },
    );
  }

  const slot = acquireStreamSlot();
  if (!slot.acquired) {
    return NextResponse.json(
      { message: "Too many concurrent agent runs right now. Wait for one to finish and retry." },
      { status: 429, headers: { "Retry-After": "20" } },
    );
  }

  // ---- Free-tier usage accounting (lib/usage) ----
  // Generating or refreshing a dossier consumes one profile_completion;
  // opening a cached dossier never calls this route. The client sends a
  // stable usageKey per generation attempt, so its silent auto-retry (and a
  // double click) replays the same reservation instead of paying twice.
  // Failed runs are refunded in the stream error handler below.
  const ownerId = await resolveUsageOwnerId();
  const usageKeyRaw = typeof body?.usageKey === "string" ? body.usageKey.trim() : "";
  const usageKey = `profile:${(usageKeyRaw || candidate.slug).slice(0, 140)}`;
  const reservation = await reserveUsage({ ownerId, kind: "profile_completion", idempotencyKey: usageKey });
  if (!reservation.allowed) {
    slot.release();
    const resets = resetsInLabel(reservation.status.windowEndsAt);
    return NextResponse.json(
      {
        message: `Free limit reached: ${USAGE_LIMITS.profile_completion} researched profiles per 48 hours.${resets ? ` Resets in ${resets}.` : ""} Already-researched dossiers stay readable.`,
        usage: reservation.status,
      },
      { status: 429 },
    );
  }

  const thesisParse = ThesisContextSchema.safeParse(body?.thesis);
  const thesis = thesisParse.success ? thesisParse.data : null;
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 1000) : "";

  const anthropic = resolveAnthropic();

  const defineTool = tool as unknown as (definition: unknown) => unknown;
  const tools: Record<string, unknown> = {
    lookup_prospect: defineTool({
      description:
        "Fetch this person's full record from undr's bases (curated prospect base and the scraped HackNation founder base). Call it FIRST when the candidate seed's sourceKind is 'prospect_base' or 'hack_nation'.",
      inputSchema: z.object({ name: z.string().describe("The person's full name") }),
      execute: async ({ name }: { name: string }) => {
        const record = await findProspectByName(name);
        if (record) return { found: true, base: "prospect_base", record };
        const person = await findHackNationPersonByName(name);
        if (person) return { found: true, base: "hack_nation", record: person };
        return { found: false, note: "No base record under that name." };
      },
    }),
    search_github: defineTool({
      description: "Search GitHub repositories to verify a technical person's public work.",
      inputSchema: z.object({ query: z.string().describe("GitHub repository search query") }),
      execute: async ({ query: githubQuery }: { query: string }) => {
        const result = await searchGitHubRepositories(githubQuery, { token: process.env.GITHUB_TOKEN, limit: 6 });
        return {
          count: result.repositories.length,
          error: result.error,
          repositories: result.repositories.map((repo) => ({
            name: repo.name,
            owner: repo.ownerLogin,
            url: repo.htmlUrl,
            description: repo.description,
            stars: repo.starCount,
            language: repo.primaryLanguage,
            pushedAt: repo.pushedAt,
          })),
        };
      },
    }),
  };
  if (anthropic) {
    // With Tavily on, Claude's built-in search is a metered backstop only.
    tools.web_search = anthropic.tools.webSearch_20250305({ maxUses: isTavilyEnabled() ? 4 : 8 });
  }

  const tavilyEnabled = isTavilyEnabled();
  if (tavilyEnabled) {
    // Metered per run — see lib/connectors/tavily/tavily.server.ts. Matches
    // web_search's budget so every angle can run on both engines.
    let tavilySearchesLeft = 14;
    let pageReadsLeft = 6;

    tools.tavily_search = defineTool({
      description:
        "Co-primary web search engine (Tavily, advanced depth), independent from web_search. Run it on EVERY search angle alongside web_search — same query or a locally-adapted one.",
      inputSchema: z.object({ query: z.string().describe("Focused search query about this person or their company") }),
      execute: async ({ query: tavilyQuery }: { query: string }) => {
        if (tavilySearchesLeft <= 0) return { error: "tavily_search budget for this run is exhausted" };
        tavilySearchesLeft -= 1;
        const output = await tavilySearch(tavilyQuery, { maxResults: 6 });
        return { error: output.error, results: output.results };
      },
    });

    tools.read_page = defineTool({
      description:
        "Fetch the full readable content of up to 3 specific URLs (the candidate's evidence links or pages found while searching). Prefer reading primary sources over trusting snippets.",
      inputSchema: z.object({
        urls: z.array(z.string().url()).min(1).max(3).describe("http(s) URLs to read in full"),
      }),
      execute: async ({ urls }: { urls: string[] }) => {
        if (pageReadsLeft <= 0) return { error: "read_page budget for this run is exhausted" };
        pageReadsLeft -= 1;
        const output = await tavilyExtract(urls);
        return { error: output.error, pages: output.pages, failedUrls: output.failedUrls };
      },
    });
  }

  const tavilyNote = tavilyEnabled
    ? "\n\nAdditional tools available: tavily_search (your web search engine — run EVERY search angle through it, translating the query to the person's local language where useful), read_page (fetches the full content of up to 3 URLs — read the person's strongest sources, starting with the evidence links in the seed, before writing the dossier), and web_search (an expensive backstop — at most a couple of uses, only when tavily_search comes back thin on something critical)."
    : "";

  const prompt = `Candidate seed (from the sourcing conversation):
${JSON.stringify(candidate, null, 2)}

${thesis ? `Investor's active thesis: "${thesis.brief}"${thesis.criteria.length > 0 ? `\nThesis criteria: ${thesis.criteria.join("; ")}` : ""}` : "The investor has no active thesis; judge fit against the original request alone."}

${query ? `Original sourcing request: "${query}"` : ""}

Research this person now and write the dossier.`;

  const messages: ModelMessage[] = [{ role: "user", content: prompt }];

  // Erased call signature — see lib/ai/search-harness.ts for why (tsc
  // recursion over multi-tool generics). Zod still validates at runtime.
  const stream = streamText as (options: unknown) => {
    toUIMessageStreamResponse: (init?: unknown) => Response;
  };

  const result = stream({
    model,
    system: `${PROFILE_SYSTEM}${tavilyNote}\n\n${AGENT_SECURITY_PROMPT}`,
    messages,
    tools,
    // Write-out fuse: research gets the first 7 steps; from step 7 the tools
    // are cut off, so a run can never end as searches-with-no-dossier when
    // the step ceiling hits (the failure mode was a blank profile page).
    prepareStep: ({ stepNumber }: { stepNumber: number }) => {
      if (stepNumber < 9) return {};
      return {
        toolChoice: "none" as const,
        system: `${PROFILE_SYSTEM}\n\n${AGENT_SECURITY_PROMPT}\n\nResearch is over for this run — tools are disabled. Write the complete dossier NOW from the evidence already gathered, following the exact structure. Do not apologize for unfinished research; fold gaps into Risks & unknowns.`,
      };
    },
    stopWhen: stepCountIs(12),
    maxOutputTokens: 6000,
    abortSignal: agentAbortSignal(request),
    experimental_transform: smoothStream(),
    onEnd: () => slot.release(),
    onAbort: () => slot.release(),
    onError: () => {
      slot.release();
      // A run that died didn't deliver a dossier — give the reservation
      // back. Refunds are idempotent, and the client's retry re-reserves
      // the same key, so the net charge stays exactly one per dossier.
      void refundUsage(ownerId, usageKey);
    },
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
    onError: (error: unknown) => {
      slot.release();
      void refundUsage(ownerId, usageKey);
      console.error("[agent/profile]", error);
      return "The dossier writer hit an upstream error. Refresh to retry.";
    },
  });
}
