import { NextResponse, type NextRequest } from "next/server";
import {
  convertToModelMessages,
  smoothStream,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import { resolveAnthropic, resolveModel } from "@/lib/ai/model";
import {
  AGENT_SECURITY_PROMPT,
  CHAT_RATE_LIMIT,
  acquireStreamSlot,
  agentAbortSignal,
  checkRateLimit,
  rateLimitKeyFor,
  sanitizeUIMessages,
} from "@/lib/ai/agent-guardrails";
import {
  CandidateReportSchema,
  SearchControlsSchema,
  ThesisContextSchema,
  type SearchControls,
  type ThesisContext,
} from "@/lib/ai/sourcing-schema";
import { searchRegisteredFounders } from "@/lib/search/registered-founders.server";
import { listClayCatalogCompanies } from "@/lib/catalog/index.server";
import { searchClayCatalogRows } from "@/lib/catalog/search-catalog";
import { searchGitHubRepositories } from "@/lib/connectors/github/github-search.server";
import { searchProspects } from "@/lib/catalog/hack-nation-prospects.server";
import { isTavilyEnabled, tavilyExtract, tavilySearch } from "@/lib/connectors/tavily/tavily.server";
import { requireUserInProduction } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_HISTORY_MESSAGES = 40;

function systemPrompt(
  thesis: ThesisContext | null,
  controls: SearchControls | null,
  tavilyEnabled: boolean,
  target: number,
): string {
  const thesisBlock = thesis
    ? `## The investor's active thesis (their standing sourcing lens)
Brief: "${thesis.brief}"
${thesis.criteria.length > 0 ? `Criteria: ${thesis.criteria.join("; ")}` : ""}
${thesis.riskPosture ? `Risk posture: ${thesis.riskPosture}` : ""}
${thesis.checkRange ? `Check range: ${thesis.checkRange}` : ""}

Combine every request with this thesis when judging fit. The thesis is context, not a hard filter — if the request contradicts it, the request wins, but note the tension.`
    : `## The investor has not set a thesis yet
Judge fit against the request alone, and remind them once (briefly) that setting an investment thesis during workspace setup will sharpen future results.`;

  const geography = controls?.geography;
  const geographyBlock = geography && geography.kind !== "all" && geography.label.trim()
    ? `## Geography constraint (hard filter — set by the investor in the composer)
This search is restricted to ${geography.label}${geography.kind === "region" ? " (region)" : " (country)"}.
- Compose every search query scoped to ${geography.label} (place names, cities, local accelerators, country TLDs where useful).
- Only call report_candidate for people based in ${geography.label}. If someone's location cannot be verified, either skip them or report with confidence "low" and name the unverified location in unknowns.
- If the written request names a different geography, tell the investor about the conflict in one line and follow the composer constraint.`
    : "";

  const undrEngine = !controls?.dataSource || controls.dataSource === "undr_engine";
  const dataSourceBlock = controls?.dataSource === "web_search"
    ? `## Data source (set by the investor in the composer)
This search runs on web search only — undr's internal bases are not enabled for it. Do not mention unavailable sources; just research the open web well.`
    : undrEngine
      ? `## Data source: undr engine (the default)
Your PRIMARY source is undr's curated prospect base: researched founders with priority tiers, outreach scores, evidence status and public profiles, assembled by undr's own research.
- FIRST move of every research run: call search_prospect_base with 2-3 keyword variants of the request (sector, product, technology, geography). Build the bench from matching records before anything else.
- Report each matching base person via report_candidate with sourceKind "prospect_base", links taken from the record (LinkedIn, GitHub, company site, Hack-Nation profile — never invented), and a score informed by the record's outreach score, tier, and fit to the request. Reflect weak evidence status as lower confidence.
- Base records have gaps ("No encontrado" fields). Use the web tools to VERIFY and COMPLETE gaps on base candidates — the base stays the backbone, the web fills holes.
- Only when the base cannot fill the target (too few matching records) do you source the remaining slots from the open web as usual, reporting those with their true sourceKind.`
      : "";

  return `You are undr's sourcing agent: an evidence-first venture scout that finds real people (founders, technical builders, operators) matching what an investor is looking for. You never invent a person, company, fact, or URL. Every claim you make traces back to a tool result.

${thesisBlock}
${geographyBlock ? `\n${geographyBlock}\n` : ""}${dataSourceBlock ? `\n${dataSourceBlock}\n` : ""}

## Candidate target (set by the investor in the composer)
The investor asked for ${target} candidate card${target === 1 ? "" : "s"}. That number is the contract for this search:
- Do NOT write the Summary or stop researching while fewer than ${target} candidates are reported and you still have search budget left. One or two candidates is a failed search unless the target is that low.
- Every report_candidate result tells you your current count — read it and act on it.
- Only conclude under target after genuinely exhausting your search angles, and then say plainly how many you found and why the rest were not findable.

## Conversation policy
- Reply in the language the user writes in (their prose may be Spanish or English); keep card fields you report in English.
- Messages prefixed with "[auto]" are automatic continuation nudges from the app, not the investor switching language — keep replying in the investor's language and simply continue the research.
- If the request is too vague to research well (no clear kind of person/sector, and no useful thesis context to fall back on), ask at most 3 short, pointed clarifying questions as a bullet list — and STOP there, without using any tools. One clarifying round maximum: after the user answers, or if they tell you to just search, you research with what you have.
- If the request is specific enough, do not ask questions. Start researching immediately.

## Research procedure
When you research:
1. Open with one line: **Plan:** followed by the angles you will take.
2. Use your tools iteratively, most-promising first:${undrEngine ? `
   - search_prospect_base — the FIRST call of every research run (see the Data source section above).` : ""}
   - ${tavilyEnabled ? `tavily_search and web_search — two independent engines that index the web differently; together they are your main ${undrEngine ? "gap-filling and verification instrument" : "instrument"}. OPEN every research angle with tavily_search, then run web_search on the same angle (same query or a locally-adapted one — translate to the local language where useful). Never run an angle on one engine only.` : "web_search — your main instrument."} Compose focused, people-centric queries (e.g. "fintech infrastructure founders Mexico pre-seed 2025", "site:linkedin.com/in CTO payments São Paulo", accelerator/demo-day batch lists, funding announcements). Run several distinct angles, not one broad query.${tavilyEnabled ? `
   - read_page — fetches the full content of up to 3 specific URLs from earlier results. Use it before reporting a candidate whose evidence is thin (verify identity, role, and company on the primary source) and to pull details a snippet cut off. Do not read pages unrelated to a candidate at hand.` : ""}${controls?.dataSource === "web_search" ? "" : `
   - search_registered_founders and search_internal_catalog — undr's own bases; call each once with the best keyword.
   - search_github — when the profile sought is technical; active repos often name real builders.`}
3. The cards panel is the deliverable: a person you mention in prose but never pass to report_candidate does not exist for the investor. THE MOMENT a search result names a specific founder/CTO/builder with at least one evidence URL, call report_candidate for them right away — low confidence is fine, batching for later is not. Your goal is exactly ${target} reported candidate${target === 1 ? "" : "s"}; stop reporting once you reach it.
4. Between tool calls, narrate minimally: at most ONE short sentence per angle saying what you're checking or what turned up, with at most one inline [title](url) citation. No headings mid-research, no recaps of tool output — the activity panel and the cards already show the detail. Total narration before the Summary must stay under ~120 words.
5. Before closing, re-scan your own narrative: every person you named with a URL must have a report_candidate call by now — file any you missed. If you are below ${target} candidates and any search angle remains untried, run the next search instead of concluding.
6. Close with a ### Summary section — HARD CAP 80 words total: your top pick in one line, one line on what remains unverified, and up to 2 one-line refinement bullets. No bold labels, no restating the candidates' details. Never feature a person in the Summary you did not report as a card.

## Grounding rules for report_candidate
- links must be URLs you actually saw in tool results this conversation. Never fabricate or "reconstruct" a URL.
- One report per person; slugs must be unique; skip anyone already reported in this conversation.
- score is fit vs request+thesis, 1-99, conservative. whyMatch must reference concrete evidence, not vibes.
- confidence reflects the evidence trail: "low" when it is one thin mention; unknowns names what you could not verify (funding, team, traction).
- Report people, not bare companies. If only a company surfaces, find who founded or leads it before reporting; if you cannot, mention the company in prose instead.

## Style
Sourcing-analyst voice: terse, concrete, honest about gaps. No filler, no hype, no exclamation marks. Brevity is a hard requirement, not a preference: the cards carry the detail, your prose is only a thin thread of what you did. If a search angle comes up empty, say so in five words and move on. If nothing real is found, say that plainly and propose reformulations — never pad results. If a tool input fails validation, fix it and retry silently — never narrate schema or character-limit issues.`;
}

interface ChatRequestBody {
  messages?: unknown;
  thesis?: unknown;
  controls?: unknown;
}

/**
 * The conversational sourcing agent. Streams a UI-message response: markdown
 * narration (left panel), live web/GitHub/internal-base tool activity, and
 * one `report_candidate` tool call per real person found (right panel cards).
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireUserInProduction();
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => null)) as ChatRequestBody | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ message: "messages are required." }, { status: 400 });
  }

  const rate = checkRateLimit(rateLimitKeyFor(request, "chat"), CHAT_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { message: `Rate limit reached: research runs are limited to ${CHAT_RATE_LIMIT.limit} per 10 minutes. Try again in ${rate.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const model = resolveModel("research");
  if (!model) {
    return NextResponse.json(
      { message: "No AI provider is configured. Set ANTHROPIC_API_KEY to enable the sourcing agent." },
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

  const thesisParse = ThesisContextSchema.safeParse(body.thesis);
  const thesis = thesisParse.success ? thesisParse.data : null;
  const controlsParse = SearchControlsSchema.safeParse(body.controls);
  const controls = controlsParse.success ? controlsParse.data : null;
  // "web_search" is the only composer-selectable source today: the internal
  // tools are withheld from the model entirely so the restriction is real.
  const webSearchOnly = controls?.dataSource === "web_search";
  const uiMessages = sanitizeUIMessages(body.messages, MAX_HISTORY_MESSAGES);
  if (uiMessages.length === 0) {
    slot.release();
    return NextResponse.json({ message: "No usable messages after sanitization." }, { status: 400 });
  }

  const target = controls?.targetCandidates ?? 5;

  const anthropic = resolveAnthropic();
  const catalogRows = webSearchOnly ? [] : await listClayCatalogCompanies();

  // Candidates reported in EARLIER runs of this conversation (e.g. before an
  // automatic continuation) count toward the target and block duplicates.
  const reportedSlugs = new Set<string>();
  for (const message of uiMessages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts as { type?: string; input?: { slug?: unknown }; output?: { recorded?: boolean } }[]) {
      if (part?.type !== "tool-report_candidate") continue;
      if (part.output?.recorded === false) continue;
      if (typeof part.input?.slug === "string") reportedSlugs.add(part.input.slug);
    }
  }

  // Plain Record + erased call signatures: TypeScript's inference over
  // multi-tool generics recurses deep enough to crash tsc on this codebase
  // (see lib/ai/search-harness.ts). Runtime validation is unaffected — every
  // tool's zod inputSchema still validates at call time.
  const defineTool = tool as unknown as (definition: unknown) => unknown;
  const tools: Record<string, unknown> = {
    report_candidate: defineTool({
      description:
        "Record one REAL person you found as a structured candidate card. Call this immediately each time a person with at least one evidence URL is identified.",
      inputSchema: CandidateReportSchema,
      execute: async (input: z.infer<typeof CandidateReportSchema>) => {
        if (reportedSlugs.has(input.slug)) {
          return {
            recorded: false,
            reason: "duplicate_slug",
            progress: `${reportedSlugs.size} of ${target} reported — this person is already on the board, find someone new`,
          };
        }
        if (reportedSlugs.size >= target) {
          return {
            recorded: false,
            reason: "target_reached",
            progress: `${reportedSlugs.size} of ${target} reported — target reached, stop reporting and write the Summary`,
          };
        }
        reportedSlugs.add(input.slug);
        const count = reportedSlugs.size;
        return {
          recorded: true,
          slug: input.slug,
          progress: count < target
            ? `${count} of ${target} reported — keep researching and report ${target - count} more before writing any Summary`
            : `${count} of ${target} reported — target reached, write the Summary now`,
        };
      },
    }),
  };

  // undr engine mode (the default): the curated prospect base is the primary
  // source; the tool only exists when the prompt advertises it.
  const undrEngineMode = !controls?.dataSource || controls.dataSource === "undr_engine";
  if (undrEngineMode) {
    tools.search_prospect_base = defineTool({
      description:
        "Search undr's curated prospect base: researched founders with priority tiers, outreach scores, evidence status and public profiles. PRIMARY source — call it with 2-3 keyword variants before any web search.",
      inputSchema: z.object({
        query: z.string().describe("Keywords: sector, product, technology, geography — one angle per call"),
      }),
      execute: async ({ query }: { query: string }) => {
        const results = await searchProspects(query, 10);
        return {
          count: results.length,
          prospects: results.map(({ record, matchScore }) => ({ ...record, matchScore })),
        };
      },
    });
  }

  // The system prompt only advertises these when the composer has not
  // restricted the search to web-only, so registration must match it.
  if (!webSearchOnly) {
    tools.search_registered_founders = defineTool({
      description: "Search undr's own registered-founder database (published profiles only) for a keyword.",
      inputSchema: z.object({ keyword: z.string().describe("A single sector/technology/geography keyword") }),
      execute: async ({ keyword }: { keyword: string }) => {
        const results = await searchRegisteredFounders([keyword], 8);
        return {
          count: results.length,
          founders: results.map((row) => ({
            projectId: row.projectId,
            founderName: row.founderName,
            projectName: row.projectName,
            location: row.location,
            stage: row.stage,
            summary: row.summary ?? row.tagline,
            sectorTags: row.sectorTags,
            hasWorkingDemo: row.hasWorkingDemo,
          })),
        };
      },
    });
    tools.search_internal_catalog = defineTool({
      description: "Search undr's internal unverified company catalog (Clay import) by a short term.",
      inputSchema: z.object({ term: z.string().describe("Company name, industry, or location keyword") }),
      execute: async ({ term }: { term: string }) => {
        const { results } = searchClayCatalogRows(catalogRows, term, 6);
        return {
          count: results.length,
          companies: results.map((company) => ({
            name: company.name,
            description: company.description,
            industry: company.primaryIndustry,
            location: company.location,
            domain: company.domain,
            linkedInUrl: company.linkedInUrl,
          })),
        };
      },
    });
    tools.search_github = defineTool({
      description:
        "Search GitHub's public repositories for currently active projects/builders. Compose a short GitHub search-qualifier query (keywords plus optional language:/topic:/pushed:>YYYY-MM-DD). Never use location: — unsupported for repository search.",
      inputSchema: z.object({ query: z.string().describe("GitHub repository search query") }),
      execute: async ({ query }: { query: string }) => {
        const result = await searchGitHubRepositories(query, { token: process.env.GITHUB_TOKEN, limit: 6 });
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
    });
  }

  if (anthropic) {
    // Deliberately tighter than tavily_search's budget: Tavily opens every
    // angle, this one complements it.
    tools.web_search = anthropic.tools.webSearch_20250305({
      maxUses: isTavilyEnabled() ? Math.min(10, 4 + target) : Math.min(16, 6 + target),
    });
  }

  const tavilyEnabled = isTavilyEnabled();
  if (tavilyEnabled) {
    // Per-run budgets: Tavily credits are metered, so the caps live in the
    // tools themselves rather than trusting the prompt. The search budget
    // mirrors web_search's so every angle can run on both engines.
    let tavilySearchesLeft = Math.min(16, 6 + target);
    let pageReadsLeft = 5;

    tools.tavily_search = defineTool({
      description:
        "Co-primary web search engine (Tavily, advanced depth), independent from web_search. Run it on EVERY research angle alongside web_search — same query or a locally-adapted one.",
      inputSchema: z.object({ query: z.string().describe("Focused, people-centric search query") }),
      execute: async ({ query }: { query: string }) => {
        if (tavilySearchesLeft <= 0) return { error: "tavily_search budget for this run is exhausted" };
        tavilySearchesLeft -= 1;
        const output = await tavilySearch(query, { maxResults: 6 });
        return { error: output.error, results: output.results };
      },
    });

    tools.read_page = defineTool({
      description:
        "Fetch the full readable content of up to 3 specific URLs seen in earlier search results, to verify a candidate against the primary source before reporting or to recover details a snippet cut off.",
      inputSchema: z.object({
        urls: z.array(z.string().url()).min(1).max(3).describe("http(s) URLs from earlier tool results"),
      }),
      execute: async ({ urls }: { urls: string[] }) => {
        if (pageReadsLeft <= 0) return { error: "read_page budget for this run is exhausted" };
        pageReadsLeft -= 1;
        const output = await tavilyExtract(urls);
        return { error: output.error, pages: output.pages, failedUrls: output.failedUrls };
      },
    });
  }

  // Same tsc-recursion erasure as above for the entry points themselves.
  const toModelMessages = convertToModelMessages as unknown as (
    messages: unknown,
    options?: unknown,
  ) => Promise<ModelMessage[]>;
  const stream = streamText as (options: unknown) => {
    toUIMessageStreamResponse: (init?: unknown) => Response;
  };

  const baseSystem = `${systemPrompt(thesis, controls, tavilyEnabled, target)}\n\n${AGENT_SECURITY_PROMPT}`;

  const result = stream({
    model,
    system: baseSystem,
    messages: await toModelMessages(uiMessages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    // Injected fresh on every step: weaker models drift off the candidate
    // contract mid-run; a live scoreboard in the system prompt keeps the
    // target in front of them at each decision point.
    prepareStep: ({ stepNumber }: { stepNumber: number }) => {
      const reported = reportedSlugs.size;
      if (reported >= target) return {};
      return {
        system: `${baseSystem}\n\n## LIVE STATUS — step ${stepNumber}\nCandidates reported so far: ${reported} of ${target}. This run is NOT done: keep searching and reporting real people until you reach ${target} or every tool budget is exhausted. Writing a Summary now would be a contract violation.`,
      };
    },
    // Step and search budgets scale with the requested bench size. Dual-engine
    // searching burns roughly twice the steps per angle, so the ceiling grows
    // when Tavily is on.
    stopWhen: stepCountIs(tavilyEnabled ? Math.min(48, 16 + target * 4) : Math.min(40, 12 + target * 3)),
    // Per-step ceiling: narration is deliberately thin (see prompt), so a
    // step never needs anywhere near the old 12k budget.
    maxOutputTokens: 4000,
    abortSignal: agentAbortSignal(request),
    experimental_transform: smoothStream(),
    onEnd: () => slot.release(),
    onAbort: () => slot.release(),
    onError: () => slot.release(),
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
    onError: (error: unknown) => {
      slot.release();
      console.error("[agent/chat]", error);
      return "The sourcing agent hit an upstream error. Try sending your message again.";
    },
  });
}
