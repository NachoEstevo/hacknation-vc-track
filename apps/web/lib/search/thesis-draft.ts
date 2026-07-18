import type { SearchCriterion } from "../domain";
import { parseSearchIntent } from "./parse-search-intent";

export interface ThesisChipDraft {
  sectors: string[];
  stages: string[];
  geographies: string[];
  signals: string[];
  exclusions: string[];
}

function uniqueLabels(criteria: SearchCriterion[]): string[] {
  return [...new Set(criteria.map((criterion) => criterion.label.trim()).filter(Boolean))];
}

/**
 * Derives only thesis-builder chips that the deterministic parser recognized.
 * An absent field stays absent; onboarding must not fill gaps with unrelated defaults.
 */
export function thesisChipDraftFromQuery(query: string): ThesisChipDraft {
  const { criteria } = parseSearchIntent(query);
  const sectors = uniqueLabels(criteria.filter((criterion) =>
    criterion.field === "sector" && criterion.priority !== "exclude"));
  const stages = uniqueLabels(criteria.filter((criterion) => criterion.field === "stage"));
  const geographies = uniqueLabels(criteria.filter((criterion) => criterion.field === "geography"));
  const signals = uniqueLabels(criteria.filter((criterion) =>
    criterion.priority !== "exclude"
    && ["working_demo", "technical_founder", "traction"].includes(criterion.field)));
  const exclusions = uniqueLabels(criteria.filter((criterion) =>
    criterion.priority === "exclude"
    && (criterion.field === "institutional_funding" || criterion.field === "sector")));

  return { sectors, stages, geographies, signals, exclusions };
}
