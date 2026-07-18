import type { OpportunityDetail, OpportunityMatch, SearchIntent } from "../domain";
import { matchOpportunity, parseSearchIntent, rankOpportunityMatches } from "../search";
import { COMPARISON_DEMO_OPPORTUNITIES } from "./fixtures/comparison";
import { LATAM_DEMO_OPPORTUNITIES } from "./fixtures/latam";

export const DEMO_OPPORTUNITIES: readonly OpportunityDetail[] = Object.freeze([
  ...LATAM_DEMO_OPPORTUNITIES,
  ...COMPARISON_DEMO_OPPORTUNITIES,
]);

export function getOpportunity(id: string): OpportunityDetail | null {
  return DEMO_OPPORTUNITIES.find((opportunity) => opportunity.id === id) ?? null;
}

export function searchOpportunities(query: string): OpportunityMatch[];
export function searchOpportunities(intent: SearchIntent): OpportunityMatch[];
export function searchOpportunities(queryOrIntent: string | SearchIntent): OpportunityMatch[] {
  const intent = typeof queryOrIntent === "string"
    ? parseSearchIntent(queryOrIntent)
    : queryOrIntent;
  return rankOpportunityMatches(
    DEMO_OPPORTUNITIES.map((opportunity) => matchOpportunity(opportunity, intent)),
  );
}
