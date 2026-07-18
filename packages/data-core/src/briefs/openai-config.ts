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

export function loadOpenAIConfig(env: Record<string, string | undefined>): OpenAIConfig {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new OpenAIConfigError();

  return {
    apiKey,
    extractionModel: env.OPENAI_EXTRACTION_MODEL ?? "gpt-5.6-luna",
    briefModel: env.OPENAI_BRIEF_MODEL ?? "gpt-5.6-sol",
    extractionReasoning: "none",
    briefReasoning: "low",
  };
}
