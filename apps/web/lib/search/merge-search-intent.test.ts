import { describe, expect, it } from "vitest";
import { createActiveThesis } from "../domain";
import { mergeSearchCriteria, mergeThesisWithSearchIntent } from "./merge-search-intent";
import { parseSearchIntent } from "./parse-search-intent";

describe("mergeThesisWithSearchIntent", () => {
  it("keeps configured criteria visible while adding query refinements", () => {
    const thesis = createActiveThesis({
      brief: "Developer tools before seed.",
      sectors: ["Developer tools"],
      stages: ["Pre-seed", "Seed"],
      geographies: ["Latin America"],
      signals: ["Working product"],
      exclusions: [],
      checkRange: { currency: "USD", min: 100_000, max: 750_000 },
      riskPosture: "balanced",
    }, "2026-07-18T12:00:00.000Z");

    const merged = mergeThesisWithSearchIntent(
      parseSearchIntent("Technical founders in Argentina"),
      thesis,
    );

    expect(merged.criteria).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "thesis-sectors", field: "sector" }),
      expect.objectContaining({ field: "acceptable_risk" }),
      expect.objectContaining({ field: "technical_founder", priority: "required" }),
      expect.objectContaining({ field: "geography", value: ["AR"] }),
    ]));
  });

  it("promotes a repeated preferred thesis signal instead of scoring it twice", () => {
    const thesis = createActiveThesis({
      brief: "Developer tools with a working product.",
      sectors: ["Developer tools"],
      stages: [],
      geographies: [],
      signals: ["Working product"],
      exclusions: [],
      checkRange: { currency: "USD", min: 100_000, max: 750_000 },
      riskPosture: "balanced",
    }, "2026-07-18T12:00:00.000Z");

    const merged = mergeThesisWithSearchIntent(
      parseSearchIntent("Developer tools with a working demo"),
      thesis,
    );
    const workingDemo = merged.criteria.filter((criterion) => criterion.field === "working_demo");

    expect(workingDemo).toHaveLength(1);
    expect(workingDemo[0]?.priority).toBe("required");
  });

  it("preserves an explicit query that conflicts with a configured exclusion", () => {
    const merged = mergeSearchCriteria(
      [{
        id: "exclude-crypto",
        field: "sector",
        operator: "includes_any",
        value: ["crypto"],
        priority: "exclude",
        label: "Exclude crypto",
      }],
      [{
        id: "seek-crypto",
        field: "sector",
        operator: "includes_any",
        value: ["crypto"],
        priority: "required",
        label: "Crypto",
      }],
    );

    expect(merged).toHaveLength(2);
    expect(merged.map((criterion) => criterion.priority)).toEqual(["exclude", "required"]);
  });
});
