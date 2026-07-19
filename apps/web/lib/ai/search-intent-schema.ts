import { z } from "zod";
import { CRITERION_FIELDS, CRITERION_OPERATORS, CRITERION_PRIORITIES } from "../domain";

/**
 * Structured-output contract for the LLM. Deliberately looser than
 * `SearchCriterion` (e.g. `value` accepts any JSON-safe scalar/array) —
 * `toSearchCriterion` in `parse-search-intent-ai.ts` re-validates every
 * candidate against `isSearchCriterion` before it can reach the matcher.
 */
export const AiCriterionSchema = z.object({
  field: z.enum(CRITERION_FIELDS),
  operator: z.enum(CRITERION_OPERATORS),
  // Kept loose on purpose: the real shape check is `isSearchCriterion` in
  // parse-search-intent-ai.ts. A precise union here made `generateObject`'s
  // type inference blow up ("Type instantiation is excessively deep").
  value: z.union([z.boolean(), z.number(), z.string(), z.array(z.string())]),
  priority: z.enum(CRITERION_PRIORITIES),
  label: z.string().min(1).max(80),
});

export const AiSearchIntentSchema = z.object({
  criteria: z.array(AiCriterionSchema).max(20),
  sourceScope: z.enum(["internal", "internal_then_public"]),
});

export type AiSearchIntentOutput = z.infer<typeof AiSearchIntentSchema>;
