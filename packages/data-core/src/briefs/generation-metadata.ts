export type GenerationTask = "parse_thesis" | "extract_claim_candidates" | "draft_investment_brief";

export interface GenerationTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface GenerationMetadataRecord {
  task: GenerationTask;
  companyId: string | null;
  thesisId: string | null;
  model: string;
  requestedModel: string;
  responseId: string | null;
  tokenUsage: GenerationTokenUsage | null;
  promptVersion: string;
  generatedAt: string;
}

export type GenerationMetadataSink = (record: GenerationMetadataRecord) => void;

export interface GenerationMetadataCollector {
  sink: GenerationMetadataSink;
  snapshot(): GenerationMetadataRecord[];
}

export function createGenerationMetadataCollector(): GenerationMetadataCollector {
  const records: GenerationMetadataRecord[] = [];
  return {
    sink: (record) => { records.push(structuredClone(record)); },
    snapshot: () => records.map((record) => structuredClone(record)),
  };
}
