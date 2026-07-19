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
import { findHackNationPersonByName, searchHackNationPeople } from "@/lib/catalog/hack-nation-people.server";
import { isTavilyEnabled, tavilyExtract, tavilySearch } from "@/lib/connectors/tavily/tavily.server";
import { requireUserInProduction } from "@/lib/supabase/api-auth";
import { USAGE_LIMITS, resetsInLabel } from "@/lib/usage/usage-limits";
import { resolveUsageOwnerId } from "@/lib/usage/usage-identity.server";
import { reserveUsage, usageStatusFor } from "@/lib/usage/usage-store.server";

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

This thesis is the investor's standing profile — who they are and what they like — not decoration: every score and whyMatch must reflect it. Combine every request with it when judging fit. It is context, not a hard filter — if the request contradicts it, the request wins, but note the tension.`
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
  const hackNation = controls?.dataSource === "hack_nation";
  const dataSourceBlock = controls?.dataSource === "web_search"
    ? `## Data source (set by the investor in the composer)
This search runs on web search only — undr's internal bases are not enabled for it. Do not mention unavailable sources; just research the open web well.`
    : hackNation
      ? `## Data source: HackNation base (set by the investor in the composer)
This search sources candidates EXCLUSIVELY from the HackNation base: every person scraped from hack-nation.ai and flagged with founder signals. Some are deeply researched (priority tier, outreach score, verified evidence); others are still queued with profile data only.
- FIRST and main move: call search_hack_nation with 2-3 keyword variants of the request. The bench comes from these results and nowhere else.
- Report each match via report_candidate with sourceKind "hack_nation" and links from the record (Hack-Nation profile, LinkedIn, GitHub, company site — never invented). Queued people with thin data get confidence "low" and honest unknowns.
- Web tools may ONLY verify or complete a HackNation person's gaps. NEVER report a person sourced from the web in this mode.
- The candidate target may be unreachable if the base lacks matches — that is fine and expected. Report the genuine fits you found (even zero), then say plainly in the investor's language that the HackNation base has no more matches for this brief, and suggest switching the composer data source to "undr engine" or "Web search", or broadening the brief. Never pad the bench with weak matches to hit the number.`
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

## What a great candidate looks like (undr's sourcing philosophy)
Investors come to undr for what other pipelines miss: companies that are just getting started and easily overlooked — pre-seed or earlier, little or no institutional funding, no press cycle — built by founders who are demonstrably serious. Seriousness is verifiable, not vibes:
- A real, working product or demo (not just a landing page or a deck).
- An active GitHub with genuine code and recent commits when the product is technical.
- A coherent public trail: a LinkedIn that matches the claimed role and history, consistent identity across profiles, a maintained site or docs.
- Concrete signs of care: documentation, shipped releases, visible users or community activity.
Being early and unknown is a plus, not a minus — a famous, heavily-funded company is usually NOT what the investor needs from undr unless the request says otherwise. When a seriousness signal is missing, flag it in unknowns instead of assuming it.

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
   - search_prospect_base — the FIRST call of every research run (see the Data source section above).` : ""}${hackNation ? `
   - search_hack_nation — the FIRST call of every research run and the ONLY source of candidates (see the Data source section above).` : ""}
   - ${tavilyEnabled ? `tavily_search — your web search engine${undrEngine || hackNation ? " for gap-filling and verification" : ""}. ${hackNation ? "In this mode it only verifies or completes HackNation people — never source from it." : "Run EVERY web angle through it, translating the query to the local language where useful."}
   - web_search — an expensive backstop, not a routine engine. Use it at most a few times per run, ONLY when tavily_search came back thin on an important angle or to cross-check a critical single-source claim right before reporting someone. Never mirror every Tavily query into it.` : "web_search — your main instrument."}
   Angle playbook — a professional sweep covers DIFFERENT discovery surfaces, not reformulations of one query. Pick the 3-4 most promising for THIS brief; after one empty result on an angle, drop it and move to the next:
   - Funding trails: "«sector» pre-seed seed round 2025 2026", local tech press (in the region's language), funding databases.
   - Program batches: accelerator/demo-day/incubator batch lists (YC, Techstars, regional programs, university spinouts) — batch pages name founders directly.
   - Builder surfaces: GitHub topics and orgs, Product Hunt launches, "Show HN" posts, hackathon winner lists.
   - People pages: "site:linkedin.com/in «role» «sector» «city»", conference speaker lists, podcast guests.
   - Local language: when the target geography is non-English-speaking, rerun the two strongest angles in the local language — the best overlooked founders often have zero English press.${tavilyEnabled ? `
   - read_page — fetches the full content of up to 3 specific URLs from earlier results. Use it before reporting a candidate whose evidence is thin (verify identity, role, and company on the primary source) and to pull details a snippet cut off. Do not read pages unrelated to a candidate at hand.` : ""}${controls?.dataSource === "web_search" || hackNation ? "" : `
   - search_registered_founders and search_internal_catalog — undr's own bases; call each once with the best keyword.
   - search_github — when the profile sought is technical; active repos often name real builders.`}
3. The cards panel is the deliverable: a person you mention in prose but never pass to report_candidate does not exist for the investor. THE MOMENT a search result names a specific founder/CTO/builder with at least one evidence URL, call report_candidate for them right away — low confidence is fine, batching for later is not. Your goal is exactly ${target} reported candidate${target === 1 ? "" : "s"}; stop reporting once you reach it.
4. Between tool calls, narrate minimally: at most ONE short sentence per angle saying what you're checking or what turned up, with at most one inline [title](url) citation. No headings mid-research, no recaps of tool output — the activity panel and the cards already show the detail. Total narration before the Summary must stay under ~120 words.
5. Before closing, re-scan your own narrative: every person you named with a URL must have a report_candidate call by now — file any you missed. If you are below ${target} candidates and any search angle remains untried, run the next search instead of concluding.
6. Close with a ### Summary section — HARD CAP 80 words total: your top pick in one line, one line on what remains unverified, and up to 2 one-line refinement bullets. No bold labels, no restating the candidates' details. Never feature a person in the Summary you did not report as a card.

## Grounding rules for report_candidate
- links must be URLs you actually saw in tool results this conversation. Never fabricate or "reconstruct" a URL.
- links lead with direct contact channels: the person's LinkedIn profile plus at least one more direct channel (GitHub, X, personal or company site) whenever findable. If you have none when ready to report, run ONE dedicated search ("«name» «company» linkedin") first. Press articles come after these, never instead of them.
- One report per person; slugs must be unique; skip anyone already reported in this conversation.
- score blends three things, 1-99, conservative: fit to the written request, alignment with the investor's thesis (when one exists), and verifiable founder seriousness (working product, active GitHub, coherent LinkedIn/public trail).
- Score calibration — use the full scale and make differences between candidates visible in the numbers, never cluster the bench at 75-80: 85+ exceptional (rare: multi-source verified, working product, direct thesis hit), 70-84 strong fit with minor gaps, 55-69 promising but meaningfully unverified, below 55 speculative. An unverified claim never raises a score; it belongs in unknowns.
- whyMatch must reference concrete evidence, not vibes — and when a thesis exists, name the specific thesis element the person matches (sector, stage, geography, or signal).
- confidence reflects the evidence trail: "low" when it is one thin mention; unknowns names what you could not verify (funding, team, traction).
- Two-source rule: verify every candidate on at least TWO independent sources (e.g. the press mention that surfaced them PLUS their LinkedIn, GitHub, or product site) before reporting. A person you could only find in one place gets confidence "low", a score of at most 60, and the missing verification named in unknowns.
- Recency rule: prefer ventures with visible signals from the last 12 months (commits, releases, launches, posts). If the newest trace you found is older than a year, say so in unknowns — a dead project dressed as a candidate is worse than no candidate.
- Bench diversity: unless the brief targets one company or program, never report two people from the same company, and avoid filling the bench from a single accelerator batch — breadth is the product.
- Report people, not bare companies. If only a company surfaces, find who founded or leads it before reporting; if you cannot, mention the company in prose instead.

## Style
Sourcing-analyst voice: terse, concrete, honest about gaps. No filler, no hype, no exclamation marks. Brevity is a hard requirement, not a preference: the cards carry the detail, your prose is only a thin thread of what you did. If a search angle comes up empty, say so in five words and move on. If nothing real is found, say that plainly and propose reformulations — never pad results. If a tool input fails validation, fix it and retry silently — never narrate schema or character-limit issues.`;
}

interface ChatRequestBody {
  messages?: unknown;
  thesis?: unknown;
  controls?: unknown;
  chatId?: unknown;
}

function userTextOf(message: { parts?: unknown }): string {
  const parts = (message as { parts?: { type?: string; text?: string }[] }).parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join(" ");
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

  // ---- Free-tier usage accounting (lib/usage) ----
  // Every user message consumes one chat_message from this chat's pool of
  // 10; [auto] continuations are agent-driven and free (already step-capped).
  // The metered "search" unit is the CANDIDATE CARD, charged per person in
  // report_candidate below. Idempotency keys derive from turn/slug, so a
  // retry of the same message or card never double-charges.
  const ownerId = await resolveUsageOwnerId();
  const chatId = typeof body.chatId === "string" && body.chatId.trim()
    ? body.chatId.trim().slice(0, 120)
    : `${ownerId}:default`;
  const userTurns = uiMessages.filter(
    (message) => message.role === "user" && !userTextOf(message).trimStart().startsWith("[auto]"),
  ).length;

  if (userTurns > 0) {
    const chatMessage = await reserveUsage({
      ownerId,
      kind: "chat_message",
      chatId,
      idempotencyKey: `chat:${chatId}:turn:${userTurns}`,
    });
    if (!chatMessage.allowed) {
      slot.release();
      const resets = resetsInLabel(chatMessage.status.windowEndsAt);
      return NextResponse.json(
        {
          message: `This chat reached its ${USAGE_LIMITS.chat_message}-message limit. Start a new search to keep going${resets ? ` — everything resets in ${resets}` : ""}.`,
          usage: chatMessage.status,
        },
        { status: 429 },
      );
    }
  }

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

  // Each card is one prospect_search. Reconcile earlier turns' cards now
  // (idempotent replay — the client also charges them live via
  // /api/usage/reconcile), then compute how many cards this run may still
  // deliver. report_candidate enforces that budget below, so a run can never
  // put more people on the board than the free tier has left.
  for (const slug of reportedSlugs) {
    await reserveUsage({ ownerId, kind: "prospect_search", idempotencyKey: `card:${chatId}:${slug}` });
  }
  const usageAtStart = await usageStatusFor(ownerId, chatId);
  let cardBudget = Math.max(0, USAGE_LIMITS.prospect_search - usageAtStart.searchesUsed);
  if (cardBudget <= 0 && userTurns === 1) {
    // A brand-new search that cannot deliver a single card is pointless —
    // bounce it before spending model tokens. Follow-ups in existing chats
    // still run (discussing people already found needs no new cards).
    slot.release();
    const resets = resetsInLabel(usageAtStart.windowEndsAt);
    return NextResponse.json(
      {
        message: `Free limit reached: ${USAGE_LIMITS.prospect_search} candidate cards per 48 hours.${resets ? ` Resets in ${resets}.` : ""} Dossiers for people already found stay available.`,
        usage: usageAtStart,
      },
      { status: 429 },
    );
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
        // HackNation mode is base-exclusive BY CONSTRUCTION, not by trust:
        // anyone absent from the base bounces here regardless of the prompt.
        if (controls?.dataSource === "hack_nation") {
          const inBase = await findHackNationPersonByName(input.name);
          if (!inBase) {
            return {
              recorded: false,
              reason: "not_in_hack_nation_base",
              instruction:
                "This person is not in the HackNation base and this search is restricted to it. Do not report web-sourced people. If the base has no more matches, tell the investor plainly and suggest switching the composer data source to 'undr engine' or 'Web search'.",
            };
          }
        }
        if (reportedSlugs.size >= target) {
          return {
            recorded: false,
            reason: "target_reached",
            progress: `${reportedSlugs.size} of ${target} reported — target reached, stop reporting and write the Summary`,
          };
        }
        if (cardBudget <= 0) {
          return {
            recorded: false,
            reason: "usage_limit",
            instruction: `The investor's free candidate limit (${USAGE_LIMITS.prospect_search} cards per 48 hours) is used up. Stop searching NOW: tell them plainly the free limit is reached and when it resets, then write the Summary from what is already on the board.`,
          };
        }
        cardBudget -= 1;
        // Durable charge where the backend supports mid-stream writes
        // (Supabase RPC); on the cookie ledger this persists via the
        // client's live reconcile and the next turn's replay above.
        void reserveUsage({ ownerId, kind: "prospect_search", idempotencyKey: `card:${chatId}:${input.slug}` });
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

  // HackNation mode: the scraped hack-nation.ai founder base is the ONLY
  // candidate source; web tools stay registered for verification only.
  const hackNationMode = controls?.dataSource === "hack_nation";
  if (hackNationMode) {
    tools.search_hack_nation = defineTool({
      description:
        "Search the HackNation base: every person scraped from hack-nation.ai with founder signals (some deeply researched, some queued with profile data only). The ONLY candidate source in this mode — call it with 2-3 keyword variants before anything else.",
      inputSchema: z.object({
        query: z.string().describe("Keywords: sector, product, technology, geography — one angle per call"),
      }),
      execute: async ({ query }: { query: string }) => {
        const results = await searchHackNationPeople(query, 12);
        return {
          count: results.length,
          people: results.map(({ person, matchScore }) => ({ ...person, matchScore })),
          note: results.length === 0
            ? "No HackNation records matched this angle. Try different keywords; if nothing matches, tell the investor and suggest switching data source."
            : undefined,
        };
      },
    });
  }

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
  // restricted the search (web-only and HackNation modes withhold them).
  if (!webSearchOnly && !hackNationMode) {
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
    // With Tavily on, Claude's built-in search is a metered backstop (it is
    // the expensive engine) — a handful of uses per run, not one per angle.
    tools.web_search = anthropic.tools.webSearch_20250305({
      maxUses: isTavilyEnabled() ? Math.min(6, 3 + Math.ceil(target / 3)) : Math.min(16, 6 + target),
    });
  }

  const tavilyEnabled = isTavilyEnabled();
  if (tavilyEnabled) {
    // Per-run budgets: Tavily credits are metered, so the caps live in the
    // tools themselves rather than trusting the prompt. The search budget
    // mirrors web_search's so every angle can run on both engines.
    let tavilySearchesLeft = Math.min(26, 12 + target * 2);
    let pageReadsLeft = 8;

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
    stopWhen: stepCountIs(tavilyEnabled ? Math.min(56, 20 + target * 4) : Math.min(44, 14 + target * 3)),
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
