import { NextResponse, type NextRequest } from "next/server";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { resolveAnthropic, resolveModel } from "@/lib/ai/model";
import { CandidateReportSchema, ThesisContextSchema, type ThesisContext } from "@/lib/ai/sourcing-schema";
import { searchRegisteredFounders } from "@/lib/search/registered-founders.server";
import { listClayCatalogCompanies } from "@/lib/catalog/index.server";
import { searchClayCatalogRows } from "@/lib/catalog/search-catalog";
import { searchGitHubRepositories } from "@/lib/connectors/github/github-search.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_HISTORY_MESSAGES = 40;

function systemPrompt(thesis: ThesisContext | null): string {
  const thesisBlock = thesis
    ? `## The investor's active thesis (their standing sourcing lens)
Brief: "${thesis.brief}"
${thesis.criteria.length > 0 ? `Criteria: ${thesis.criteria.join("; ")}` : ""}
${thesis.riskPosture ? `Risk posture: ${thesis.riskPosture}` : ""}
${thesis.checkRange ? `Check range: ${thesis.checkRange}` : ""}

Combine every request with this thesis when judging fit. The thesis is context, not a hard filter — if the request contradicts it, the request wins, but note the tension.`
    : `## The investor has not set a thesis yet
Judge fit against the request alone, and remind them once (briefly) that setting a thesis in "My thesis" will sharpen future results.`;

  return `You are undr's sourcing agent: an evidence-first venture scout that finds real people (founders, technical builders, operators) matching what an investor is looking for. You never invent a person, company, fact, or URL. Every claim you make traces back to a tool result.

${thesisBlock}

## Conversation policy
- Reply in the language the user writes in (their prose may be Spanish or English); keep card fields you report in English.
- If the request is too vague to research well (no clear kind of person/sector, and no useful thesis context to fall back on), ask at most 3 short, pointed clarifying questions as a bullet list — and STOP there, without using any tools. One clarifying round maximum: after the user answers, or if they tell you to just search, you research with what you have.
- If the request is specific enough, do not ask questions. Start researching immediately.

## Research procedure
When you research:
1. Open with one line: **Plan:** followed by the angles you will take.
2. Use your tools iteratively, most-promising first:
   - web_search — your main instrument. Compose focused, people-centric queries (e.g. "fintech infrastructure founders Mexico pre-seed 2025", "site:linkedin.com/in CTO payments São Paulo", accelerator/demo-day batch lists, funding announcements). Run several distinct angles, not one broad query.
   - search_registered_founders and search_internal_catalog — undr's own bases; call each once with the best keyword.
   - search_github — when the profile sought is technical; active repos often name real builders.
3. THE MOMENT you can name a real person with at least one evidence URL, call report_candidate for them. Report candidates one by one as you find them — never save them up for the end. Aim for 5-8 solid candidates; stop at 8.
4. Between tool calls, narrate what you are doing in short markdown sections: a ### heading naming the angle, then 1-3 sentences on what you found, citing sources inline as [title](url). This narration streams live to the investor — keep it tight and factual.
5. Close with a ### Summary section: how many candidates and from where, your top 2-3 picks with one line of reasoning each, what remains unverified, and 2-3 suggested refinements as bullets.

## Grounding rules for report_candidate
- links must be URLs you actually saw in tool results this conversation. Never fabricate or "reconstruct" a URL.
- One report per person; slugs must be unique; skip anyone already reported in this conversation.
- score is fit vs request+thesis, 1-99, conservative. whyMatch must reference concrete evidence, not vibes.
- confidence reflects the evidence trail: "low" when it is one thin mention; unknowns names what you could not verify (funding, team, traction).
- Report people, not bare companies. If only a company surfaces, find who founded or leads it before reporting; if you cannot, mention the company in prose instead.

## Style
Sourcing-analyst voice: terse, concrete, honest about gaps. Markdown headings, short paragraphs, bullet lists. No filler, no hype, no exclamation marks. If a search angle comes up empty, say so in one line and move on. If nothing real is found, say that plainly and propose reformulations — never pad results.`;
}

interface ChatRequestBody {
  messages?: unknown;
  thesis?: unknown;
}

/**
 * The conversational sourcing agent. Streams a UI-message response: markdown
 * narration (left panel), live web/GitHub/internal-base tool activity, and
 * one `report_candidate` tool call per real person found (right panel cards).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ChatRequestBody | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ message: "messages are required." }, { status: 400 });
  }

  const model = resolveModel("research");
  if (!model) {
    return NextResponse.json(
      { message: "No AI provider is configured. Set ANTHROPIC_API_KEY to enable the sourcing agent." },
      { status: 503 },
    );
  }

  const thesisParse = ThesisContextSchema.safeParse(body.thesis);
  const thesis = thesisParse.success ? thesisParse.data : null;
  const uiMessages = (body.messages as UIMessage[]).slice(-MAX_HISTORY_MESSAGES);

  const anthropic = resolveAnthropic();
  const catalogRows = await listClayCatalogCompanies();

  const reportedSlugs = new Set<string>();

  // Plain Record + erased call signatures: TypeScript's inference over
  // multi-tool generics recurses deep enough to crash tsc on this codebase
  // (see lib/ai/search-harness.ts). Runtime validation is unaffected — every
  // tool's zod inputSchema still validates at call time.
  const tools: Record<string, unknown> = {
    report_candidate: tool({
      description:
        "Record one REAL person you found as a structured candidate card. Call this immediately each time a person with at least one evidence URL is identified.",
      inputSchema: CandidateReportSchema,
      execute: async (input: z.infer<typeof CandidateReportSchema>) => {
        if (reportedSlugs.has(input.slug)) {
          return { recorded: false, reason: "duplicate_slug" };
        }
        reportedSlugs.add(input.slug);
        return { recorded: true, slug: input.slug, totalReported: reportedSlugs.size };
      },
    }),
    search_registered_founders: tool({
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
    }),
    search_internal_catalog: tool({
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
    }),
    search_github: tool({
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
    }),
  };

  if (anthropic) {
    tools.web_search = anthropic.tools.webSearch_20250305({ maxUses: 10 });
  }

  // Same tsc-recursion erasure as above for the entry points themselves.
  const toModelMessages = convertToModelMessages as (messages: unknown, options?: unknown) => ModelMessage[];
  const stream = streamText as (options: unknown) => {
    toUIMessageStreamResponse: (init?: unknown) => Response;
  };

  const result = stream({
    model,
    system: systemPrompt(thesis),
    messages: toModelMessages(uiMessages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: stepCountIs(16),
    maxOutputTokens: 8000,
    abortSignal: request.signal,
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
    onError: (error: unknown) => {
      console.error("[agent/chat]", error);
      return "The sourcing agent hit an upstream error. Try sending your message again.";
    },
  });
}
