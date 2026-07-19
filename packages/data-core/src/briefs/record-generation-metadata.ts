import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses.js";
import type {
  GenerationMetadataRecord,
  GenerationMetadataSink,
  GenerationTask,
  GenerationTokenUsage,
} from "./generation-metadata.js";

interface ProviderResponseMetadata {
  id?: string;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
}

function tokenUsage(usage: ProviderResponseMetadata["usage"]): GenerationTokenUsage | null {
  if (!usage || !Number.isFinite(usage.input_tokens) || !Number.isFinite(usage.output_tokens)
    || !Number.isFinite(usage.total_tokens)) return null;
  return {
    inputTokens: usage.input_tokens!,
    outputTokens: usage.output_tokens!,
    totalTokens: usage.total_tokens!,
  };
}

export function recordGenerationMetadata(
  sink: GenerationMetadataSink | undefined,
  task: GenerationTask,
  request: ResponseCreateParamsNonStreaming,
  response: ProviderResponseMetadata,
  context: Pick<GenerationMetadataRecord, "companyId" | "thesisId">,
  generatedAt: string,
  promptVersion: string,
): void {
  if (!sink) return;
  const requestedModel = String(request.model);
  sink({
    task,
    ...context,
    model: response.model ?? requestedModel,
    requestedModel,
    responseId: response.id ?? null,
    tokenUsage: tokenUsage(response.usage),
    promptVersion,
    generatedAt,
  });
}
