import type { LanguageModel } from "ai";
import { createAnthropic, type AnthropicProvider } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * "fast" powers cheap structured calls (query planning, synthesis).
 * "research" powers the conversational sourcing agent and dossier writer,
 * which orchestrate live web search over many steps and need the stronger tier.
 */
export type ModelTier = "fast" | "research";

const ANTHROPIC_MODEL_BY_TIER: Record<ModelTier, string> = {
  fast: "claude-haiku-4-5",
  research: "claude-haiku-4-5",
};

/** Anthropic provider instance when a key is configured — needed for provider-executed tools (web search). */
export function resolveAnthropic(): AnthropicProvider | null {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!anthropicKey) return null;
  return createAnthropic({ apiKey: anthropicKey });
}

/** Prefers Anthropic, then OpenAI — whichever real key is configured. Returns null if neither is. */
export function resolveModel(tier: ModelTier = "fast"): LanguageModel | null {
  const anthropic = resolveAnthropic();
  if (anthropic) {
    return anthropic(ANTHROPIC_MODEL_BY_TIER[tier]);
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey });
    return openai(tier === "research" ? "gpt-4o" : "gpt-4o-mini");
  }

  return null;
}
