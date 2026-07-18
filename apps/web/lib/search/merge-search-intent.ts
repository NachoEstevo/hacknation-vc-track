import {
  isSearchCriterion,
  type ActiveThesis,
  type SearchCriterion,
  type SearchIntent,
} from "../domain";

export function criterionSubjectSignature(criterion: SearchCriterion): string {
  const value = Array.isArray(criterion.value)
    ? [...criterion.value].map(String).sort().join("|")
    : String(criterion.value);
  return [criterion.field, criterion.operator, value].join(":");
}

export function criterionMergeIdentity(criterion: SearchCriterion): string {
  return `${criterionSubjectSignature(criterion)}:${criterion.priority === "exclude" ? "exclude" : "positive"}`;
}

function priorityWeight(priority: SearchCriterion["priority"]): number {
  return priority === "required" ? 2 : priority === "preferred" ? 1 : 0;
}

export function mergeSearchCriteria(
  configured: readonly SearchCriterion[],
  parsed: readonly SearchCriterion[],
): SearchCriterion[] {
  const merged = configured.filter(isSearchCriterion);

  for (const candidate of parsed) {
    if (!isSearchCriterion(candidate)) continue;
    const signature = criterionSubjectSignature(candidate);
    const matchingIndex = merged.findIndex((existing) => {
      if (criterionSubjectSignature(existing) !== signature) return false;
      return (existing.priority === "exclude") === (candidate.priority === "exclude");
    });

    if (matchingIndex < 0) {
      merged.push(candidate);
      continue;
    }

    const existing = merged[matchingIndex];
    if (
      candidate.priority !== "exclude"
      && priorityWeight(candidate.priority) > priorityWeight(existing.priority)
    ) {
      merged[matchingIndex] = candidate;
    }
  }

  const ids = new Set<string>();
  return merged.map((candidate) => {
    let id = candidate.id;
    let suffix = 2;
    while (ids.has(id)) {
      id = `${candidate.id}-${suffix}`;
      suffix += 1;
    }
    ids.add(id);
    return id === candidate.id ? candidate : { ...candidate, id };
  });
}

export function mergeThesisWithSearchIntent(
  intent: SearchIntent,
  thesis: ActiveThesis | null,
): SearchIntent {
  return {
    ...intent,
    criteria: mergeSearchCriteria(thesis?.criteria ?? [], intent.criteria),
  };
}
