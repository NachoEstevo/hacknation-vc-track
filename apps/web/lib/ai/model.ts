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
  research: "claude-sonnet-5",
};

/** Cross-provider fallback (https://developers.openai.com/api/docs/models/gpt-5.6-luna): takes over a call when the Anthropic request fails. */
const OPENAI_MODEL_BY_TIER: Record<ModelTier, string> = {
  fast: "gpt-5.6-luna",
  research: "gpt-5.6-luna",
};

/**
 * Minimal structural view of a LanguageModelV2 — enough to delegate calls
 * without importing @ai-sdk/provider (whose generics feed the tsc-recursion
 * problem documented in the chat route and search-harness).
 */
interface DirectModel {
  specificationVersion: string;
  provider: string;
  modelId: string;
  supportedUrls: unknown;
  doGenerate(options: unknown): PromiseLike<unknown>;
  doStream(options: unknown): PromiseLike<unknown>;
}

/**
 * Provider-executed tools (Anthropic's web_search) only exist on the primary
 * provider; the fallback call must not carry them or OpenAI rejects the
 * request. Server-executed tools (tavily, GitHub, internal bases) survive.
 */
function withoutProviderTools(options: unknown): unknown {
  if (typeof options !== "object" || options === null) return options;
  const record = options as { tools?: { type?: string }[] };
  if (!Array.isArray(record.tools)) return options;
  return { ...record, tools: record.tools.filter((tool) => tool?.type !== "provider-defined") };
}

/**
 * A model that answers with `primary` and, if that request throws (Anthropic
 * outage, overload, auth failure), transparently retries the same call on
 * `fallback`. Failures after the primary stream has already started emitting
 * are not retried — replaying would duplicate streamed output.
 */
export function withModelFallback(primary: LanguageModel, fallback: LanguageModel): LanguageModel {
  const primaryModel = primary as unknown as DirectModel;
  const fallbackModel = fallback as unknown as DirectModel;

  const wrapped: DirectModel = {
    specificationVersion: primaryModel.specificationVersion,
    provider: primaryModel.provider,
    modelId: primaryModel.modelId,
    get supportedUrls() {
      return primaryModel.supportedUrls;
    },
    async doGenerate(options: unknown) {
      try {
        return await primaryModel.doGenerate(options);
      } catch (error) {
        console.warn(
          `[model] ${primaryModel.provider}/${primaryModel.modelId} failed; falling back to ${fallbackModel.provider}/${fallbackModel.modelId}`,
          error,
        );
        return fallbackModel.doGenerate(withoutProviderTools(options));
      }
    },
    async doStream(options: unknown) {
      try {
        return await primaryModel.doStream(options);
      } catch (error) {
        console.warn(
          `[model] ${primaryModel.provider}/${primaryModel.modelId} failed; falling back to ${fallbackModel.provider}/${fallbackModel.modelId}`,
          error,
        );
        return fallbackModel.doStream(withoutProviderTools(options));
      }
    },
  };

  return wrapped as unknown as LanguageModel;
}

/** Anthropic provider instance when a key is configured — needed for provider-executed tools (web search). */
export function resolveAnthropic(): AnthropicProvider | null {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!anthropicKey) return null;
  return createAnthropic({ apiKey: anthropicKey });
}

function resolveOpenAiModel(tier: ModelTier): LanguageModel | null {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openaiKey) return null;
  const openai = createOpenAI({ apiKey: openaiKey });
  return openai(OPENAI_MODEL_BY_TIER[tier]);
}

/**
 * Claude Sonnet is the default for agent work ("research": sourcing chat and
 * dossiers); Claude Haiku backs the cheap structured calls ("fast"). When
 * both keys are configured the returned model automatically retries failed
 * Anthropic requests on OpenAI's gpt-5.6-luna; with a single key it uses
 * that provider directly. Returns null if neither key is configured.
 */
export function resolveModel(tier: ModelTier = "fast"): LanguageModel | null {
  const anthropic = resolveAnthropic();
  const openaiModel = resolveOpenAiModel(tier);

  if (anthropic) {
    const anthropicModel = anthropic(ANTHROPIC_MODEL_BY_TIER[tier]);
    return openaiModel ? withModelFallback(anthropicModel, openaiModel) : anthropicModel;
  }

  return openaiModel;
}
