import { describe, expect, it } from "vitest";
import {
  createSearchSession,
  criteriaFingerprint,
  isSearchSession,
  refineSearchSession,
  searchIntentForSession,
  searchFingerprint,
} from "./search-session";
import { createActiveThesis } from "../domain";

const requiredFintech = {
  id: "fintech-required",
  field: "sector" as const,
  operator: "includes_any" as const,
  value: ["fintech"],
  priority: "required" as const,
  label: "Fintech",
};

describe("SearchSession", () => {
  it("validates an exact saved-search criteria snapshot, including an empty one", () => {
    const saved = createSearchSession({
      query: "Fintech founders in Argentina",
      criteria: [requiredFintech],
      source: "saved_search",
      sourceId: "search-1",
    }, "2026-07-18T12:00:00.000Z");
    const empty = createSearchSession({
      query: "Unstructured sourcing note",
      criteria: [],
      source: "saved_search",
      sourceId: "search-2",
    }, "2026-07-18T12:00:00.000Z");

    expect(isSearchSession(saved)).toBe(true);
    expect(isSearchSession(empty)).toBe(true);
    expect(empty.criteria).toEqual([]);
  });

  it("fingerprints semantics instead of criterion ids or labels", () => {
    const renamed = { ...requiredFintech, id: "other", label: "Financial technology" };
    expect(criteriaFingerprint([requiredFintech])).toBe(criteriaFingerprint([renamed]));
    expect(searchFingerprint(" Same query ", [requiredFintech]))
      .toBe(searchFingerprint("same   query", [renamed]));
    expect(searchFingerprint("same query", [requiredFintech]))
      .not.toBe(searchFingerprint("same query", [{ ...requiredFintech, priority: "exclude" }]));
  });

  it("rejects malformed stored criteria", () => {
    const session = createSearchSession({
      query: "Fintech",
      criteria: [requiredFintech],
      source: "saved_search",
    }, "2026-07-18T12:00:00.000Z");
    expect(isSearchSession({
      ...session,
      criteria: [{ ...requiredFintech, field: "future_field" }],
    })).toBe(false);
    expect(isSearchSession({
      ...session,
      criteria: [{ ...requiredFintech, value: ["fintech", 2] }],
    })).toBe(false);
  });

  it("restores a saved snapshot without recalculating it against the current thesis", () => {
    const activeThesis = createActiveThesis({
      brief: "Developer tools",
      sectors: ["Developer tools"],
      stages: [],
      geographies: [],
      signals: [],
      exclusions: [],
      checkRange: { currency: "USD", min: 100_000, max: 750_000 },
      riskPosture: "balanced",
    }, "2026-07-18T12:00:00.000Z");
    const saved = createSearchSession({
      query: "The same text",
      criteria: [requiredFintech],
      source: "saved_search",
      sourceId: "saved-fintech",
    }, "2026-07-18T12:00:00.000Z");

    const restored = searchIntentForSession(saved, activeThesis);
    expect(restored.criteria).toEqual([requiredFintech]);

    const refined = refineSearchSession(
      saved,
      "The same text with a working demo",
      restored.criteria,
      "2026-07-18T12:01:00.000Z",
    );
    expect(refined.sourceId).toBe("saved-fintech");
    expect(refined.criteria).toEqual(expect.arrayContaining([
      requiredFintech,
      expect.objectContaining({ field: "working_demo", priority: "required" }),
    ]));
  });

  it("adds only newly introduced refinements instead of reparsing omitted snapshot criteria", () => {
    const saved = createSearchSession({
      query: "Fintech founders",
      criteria: [],
      source: "saved_search",
      sourceId: "saved-empty-snapshot",
    }, "2026-07-18T12:00:00.000Z");

    const refined = refineSearchSession(
      saved,
      "Fintech founders with a working demo",
      [],
      "2026-07-18T12:01:00.000Z",
    );

    expect(refined.criteria).toEqual([
      expect.objectContaining({ field: "working_demo", priority: "required" }),
    ]);
    expect(refined.criteria).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "sector" }),
    ]));
  });
});
