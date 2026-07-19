export interface OpenAIConfig {
  apiKey: string;
  extractionModel: string;
  briefModel: string;
  extractionReasoning: "none";
  briefReasoning: "low";
}

export class OpenAIConfigError extends Error {
  constructor() {
    super("OPENAI_API_KEY must be configured");
    this.name = "OpenAIConfigError";
  }
}

export function openAIModelNames(env: Record<string, string | undefined>): { extraction: string; brief: string } {
  return {
    extraction: env.OPENAI_EXTRACTION_MODEL ?? "gpt-5.6-luna",
    brief: env.OPENAI_BRIEF_MODEL ?? "gpt-5.6-sol",
  };
}

export function loadOpenAIConfig(env: Record<string, string | undefined>): OpenAIConfig {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new OpenAIConfigError();

  const models = openAIModelNames(env);
  return {
    apiKey,
    extractionModel: models.extraction,
    briefModel: models.brief,
    extractionReasoning: "none",
    briefReasoning: "low",
  };
}
