"use server";

import type { SearchIntent } from "../domain";
import { parseSearchIntentWithAi } from "./parse-search-intent-ai";

export async function parseSearchBriefAction(
  query: string,
): Promise<{ intent: SearchIntent; usedAi: boolean }> {
  return parseSearchIntentWithAi(query);
}
