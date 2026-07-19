import { generateObject } from "ai";
import type { ZodType } from "zod";
import type { SearchCriterion, SearchIntent } from "../domain";
import { isSearchCriterion } from "../domain";
import { parseSearchIntent } from "../search/parse-search-intent";
import { resolveModel } from "./model";
import { AiSearchIntentSchema, type AiSearchIntentOutput } from "./search-intent-schema";

// Cast away Zod's deeply-nested structural type: TypeScript's inference blows
// up ("Type instantiation is excessively deep") when `generateObject` tries
// to resolve the full schema shape through its generic. Runtime validation
// is unaffected — this only simplifies what the *type checker* sees.
const searchIntentSchema = AiSearchIntentSchema as ZodType<AiSearchIntentOutput>;

const SYSTEM_PROMPT = `You translate a venture investor's natural-language sourcing brief into structured search criteria.

Rules:
- Only extract what the text actually states or clearly implies. Never invent a criterion that isn't supported by the text.
- "priority" is "required" for hard constraints, "preferred" for nice-to-haves, "exclude" for things the investor wants filtered out.
- If the brief mentions wanting to search public/external sources in addition to the internal database, set sourceScope to "internal_then_public"; if it explicitly says internal-only, use "internal". Default to "internal_then_public".
- Keep each criterion label short and human-readable (e.g. "Technical founder", "Pre-seed", "No institutional funding").
- Return an empty criteria array rather than guessing when the brief is too vague.`;

function toValidCriteria(candidates: unknown[]): SearchCriterion[] {
  const criteria: SearchCriterion[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (!isSearchCriterion(candidate)) continue;
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    criteria.push(candidate);
  }

  return criteria;
}

/**
 * AI-assisted parse of a free-text sourcing brief into a `SearchIntent`.
 * Deterministic matching, scoring, and persistence never touch the model —
 * this function only proposes criteria; `isSearchCriterion` is the real gate.
 * Falls back to the regex-based parser on any failure (missing key, network,
 * malformed output) so search never breaks because the model is unavailable.
 */
export async function parseSearchIntentWithAi(query: string): Promise<{
  intent: SearchIntent;
  usedAi: boolean;
}> {
  const model = resolveModel();
  if (!model) {
    return { intent: parseSearchIntent(query), usedAi: false };
  }

  try {
    // `generateObject`'s generic inference over this schema+model combination
    // makes TypeScript's checker blow up ("Type instantiation is excessively
    // deep"). Runtime behavior is unaffected — `isSearchCriterion` below is
    // the real validation gate, so erasing the type here is safe.
    const generate = generateObject as (options: unknown) => Promise<{ object: unknown }>;
    const result = await generate({
      model,
      schema: searchIntentSchema,
      system: SYSTEM_PROMPT,
      prompt: query,
      abortSignal: AbortSignal.timeout(8000),
    });
    const object = result.object as AiSearchIntentOutput;

    const withIds = object.criteria.map((criterion) => ({
      ...criterion,
      id: `${criterion.field}-${Array.isArray(criterion.value) ? criterion.value.join("-") : criterion.value}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-"),
    }));

    const criteria = toValidCriteria(withIds);

    // A model that returns nothing usable is treated as a failure, not a
    // confident "no criteria" — fall back to the deterministic parser.
    if (criteria.length === 0) {
      return { intent: parseSearchIntent(query), usedAi: false };
    }

    return {
      intent: { query, criteria, sourceScope: object.sourceScope },
      usedAi: true,
    };
  } catch {
    return { intent: parseSearchIntent(query), usedAi: false };
  }
}
