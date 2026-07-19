import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export interface StructuredOneLiner {
  problem: string;
  solution: string;
}

const schema = z.object({
  problem: z.string(),
  solution: z.string(),
});

const SYSTEM_PROMPT =
  "You split a startup founder's one-line description into a short problem statement and a short " +
  "solution statement. Rules: use only facts, names, and numbers that literally appear in the founder's " +
  "text. Never invent metrics, customers, funding, or team details. If the one-liner does not clearly " +
  "separate a problem from a solution, it is acceptable for the two statements to overlap or restate the " +
  "same sentence — do not pad them with invented detail. Each statement must be one or two sentences. " +
  'Reply with ONLY a JSON object shaped exactly {"problem": string, "solution": string} — no prose, no markdown fences.';

/**
 * Structures a founder's raw one-liner into separate problem/solution
 * statements using a real LLM call. Returns `null` on any failure (no
 * network, no API key, rate limit, timeout, bad/unparseable output) so
 * callers can fall back to using the founder's own words verbatim — this
 * feature is additive, never load-bearing for correctness.
 */
export async function structureOneLiner(oneLiner: string): Promise<StructuredOneLiner | null> {
  const trimmed = oneLiner.trim();
  if (!trimmed) return null;
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      system: SYSTEM_PROMPT,
      prompt: `Founder's one-liner: "${trimmed}"`,
      abortSignal: AbortSignal.timeout(8_000),
    });

    const raw = result.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;

    const problem = parsed.data.problem.trim();
    const solution = parsed.data.solution.trim();
    return problem && solution ? { problem, solution } : null;
  } catch {
    return null;
  }
}
