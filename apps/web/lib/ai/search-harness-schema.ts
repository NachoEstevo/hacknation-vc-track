import { z } from "zod";

/** The model composes one focused query per real source — this is the harness's only per-source "decision". */
export const QueryPlanSchema = z.object({
  registeredKeyword: z.string().min(1).max(60),
  catalogTerm: z.string().min(1).max(60),
  githubQuery: z.string().min(1).max(120),
  arxivQuery: z.string().min(1).max(120),
});

export type QueryPlanOutput = z.infer<typeof QueryPlanSchema>;

/**
 * Grounded synthesis contract. The model receives real candidate skeletons
 * (built deterministically from live tool output — see search-harness.ts)
 * and may only add narrative framing over them: it cannot introduce a new
 * candidate id, and every field here is prose/classification, never a fact
 * the app would otherwise treat as verified data.
 */
export const CandidateSynthesisSchema = z.object({
  id: z.string().min(1),
  whyMatch: z.string().min(1).max(220),
  confidenceLevel: z.enum(["high", "medium", "low"]),
  tags: z.array(z.string().min(1).max(28)).max(3),
  unknownNote: z.string().max(90).nullable(),
});

export const SearchSynthesisSchema = z.object({
  assistantMessage: z.string().min(1).max(420),
  candidates: z.array(CandidateSynthesisSchema).max(20),
});

export type CandidateSynthesisOutput = z.infer<typeof CandidateSynthesisSchema>;
export type SearchSynthesisOutput = z.infer<typeof SearchSynthesisSchema>;
