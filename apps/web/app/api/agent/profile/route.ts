import { NextResponse, type NextRequest } from "next/server";
import { streamText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { resolveAnthropic, resolveModel } from "@/lib/ai/model";
import { CandidateReportSchema, ThesisContextSchema } from "@/lib/ai/sourcing-schema";
import { searchGitHubRepositories } from "@/lib/connectors/github/github-search.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PROFILE_SYSTEM = `You are undr's diligence writer. You produce a grounded dossier on ONE person for an investor, researching them live on the web. You never invent facts or URLs; everything you state is either cited from a tool result this conversation, provided in the candidate seed, or explicitly labeled as unverified.

Procedure:
1. Research first, silently: run several focused web searches on the person (name + company, name + role, funding announcements, talks/podcasts, GitHub/LinkedIn presence). Use search_github when they are technical. Follow the evidence links given in the seed. Do not narrate the searching.
2. Then write the dossier as one clean markdown document, in the structure below. Reply in the language of the investor's original request; keep proper nouns as-is.

Structure (use exactly these ### headings, translated to the reply language):
### Overview — who they are, what they are building, in 3-4 sentences.
### Background — career and education trail, dated where possible.
### Current venture — what the company/project does, stage, traction signals, team context.
### Evidence — a bullet list of the sources you actually used: [title](url) — one line on what each shows. Only URLs from tool results or the provided seed.
### Thesis fit — how they map to the investor's thesis and original request: what matches, what does not, and the strongest reason to take the meeting.
### Risks & unknowns — what you could not verify, contradictions found, and honest confidence in this dossier (high/medium/low with one line why).
### Suggested approach — 2-3 bullets: the outreach angle, what to ask first, what evidence to request.

Rules:
- Sourcing-analyst voice: terse, concrete, no hype, no exclamation marks.
- If the web turns up little or nothing about the person, say so plainly in Overview and keep the dossier short rather than padding it — a thin honest dossier beats a fabricated rich one.
- Distinguish clearly between verified facts (cited), the seed data you were given, and your inference — label inference as such inline ("likely", "appears to").`;

interface ProfileRequestBody {
  candidate?: unknown;
  thesis?: unknown;
  query?: unknown;
}

/**
 * Streams a full, freshly researched markdown dossier for one reported
 * candidate. The client caches the result per slug, so this only runs when
 * a profile is first opened (or explicitly refreshed).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ProfileRequestBody | null;
  const candidateParse = CandidateReportSchema.safeParse(body?.candidate);
  if (!candidateParse.success) {
    return NextResponse.json({ message: "A valid candidate seed is required." }, { status: 400 });
  }
  const candidate = candidateParse.data;

  const model = resolveModel("research");
  if (!model) {
    return NextResponse.json(
      { message: "No AI provider is configured. Set ANTHROPIC_API_KEY to enable dossiers." },
      { status: 503 },
    );
  }

  const thesisParse = ThesisContextSchema.safeParse(body?.thesis);
  const thesis = thesisParse.success ? thesisParse.data : null;
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 1000) : "";

  const anthropic = resolveAnthropic();

  const tools: Record<string, unknown> = {
    search_github: tool({
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
    tools.web_search = anthropic.tools.webSearch_20250305({ maxUses: 8 });
  }

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
    system: PROFILE_SYSTEM,
    messages,
    tools,
    stopWhen: stepCountIs(8),
    maxOutputTokens: 6000,
    abortSignal: request.signal,
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
    onError: (error: unknown) => {
      console.error("[agent/profile]", error);
      return "The dossier writer hit an upstream error. Refresh to retry.";
    },
  });
}
