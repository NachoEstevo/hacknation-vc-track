import { describe, expect, it } from "vitest";
import { createActiveThesis, type ActiveThesisInput } from "./active-thesis";
import { isSearchCriterion } from "./types";
import {
  activeThesisFromStoredCriteria,
  thesisCriteriaRowsForInput,
  type StoredThesisCriterion,
} from "./thesis-criteria-rows";

const SAMPLE_INPUT: ActiveThesisInput = {
  brief: "Technical founders building developer infrastructure with a working product.",
  sectors: ["AI Infrastructure", "Developer Tools"],
  stages: ["Pre-seed", "Seed"],
  geographies: ["Latin America", "United States"],
  signals: ["Working product", "Sustained technical activity", "Community traction"],
  exclusions: ["Institutional Series A+", "Crypto / web3"],
  checkRange: { currency: "USD", min: 100_000, max: 750_000 },
  riskPosture: "balanced",
};

function toStoredRows(input: ActiveThesisInput): StoredThesisCriterion[] {
  return thesisCriteriaRowsForInput(input).map((row, index) => ({
    ...row,
    id: `row-${index}`,
  }));
}

describe("thesisCriteriaRowsForInput", () => {
  it("emits one valid SearchCriterion-shaped row per chip, not a joined composite", () => {
    const rows = thesisCriteriaRowsForInput(SAMPLE_INPUT);

    // One row per sector/stage/geography chip (decomposed), not a single
    // joined-label row per field the way the browser-only criteria do. The
    // "Crypto / web3" exclusion also classifies as an extra sector row.
    expect(rows.filter((row) => row.field === "sector" && row.priority === "required")).toHaveLength(2);
    expect(rows.filter((row) => row.field === "stage" && row.priority === "required")).toHaveLength(2);
    expect(rows.filter((row) => row.field === "geography")).toHaveLength(2);

    for (const row of rows) {
      expect(isSearchCriterion({ id: "x", ...row })).toBe(true);
    }
  });

  it("classifies signals and exclusions the same way the local thesis builder does", () => {
    const rows = thesisCriteriaRowsForInput(SAMPLE_INPUT);
    const workingDemo = rows.find((row) => row.field === "working_demo");
    // "Institutional Series A+" has no funding/capital word, so it excludes stages, not funding status.
    const exclusionStage = rows.find((row) => row.priority === "exclude" && row.field === "stage");
    const exclusionSector = rows.find((row) => row.priority === "exclude" && row.field === "sector");

    expect(workingDemo?.value).toBe(true);
    expect(exclusionStage?.value).toEqual(["series_a", "series_b"]);
    expect(exclusionSector?.value).toEqual(["crypto", "web3"]);
  });

  it("always includes exactly one check_size and one acceptable_risk row", () => {
    const rows = thesisCriteriaRowsForInput(SAMPLE_INPUT);
    expect(rows.filter((row) => row.field === "check_size")).toHaveLength(1);
    expect(rows.filter((row) => row.field === "acceptable_risk")).toHaveLength(1);
  });
});

describe("activeThesisFromStoredCriteria", () => {
  it("round-trips the chip lists, check range, and risk posture through storage rows", () => {
    const stored = toStoredRows(SAMPLE_INPUT);
    const reconstructed = activeThesisFromStoredCriteria({
      brief: SAMPLE_INPUT.brief,
      criteria: stored,
      updatedAt: "2026-07-18T00:00:00.000Z",
    });

    expect(reconstructed.brief).toBe(SAMPLE_INPUT.brief);
    expect(reconstructed.sectors).toEqual(SAMPLE_INPUT.sectors);
    expect(reconstructed.stages).toEqual(SAMPLE_INPUT.stages);
    expect(reconstructed.geographies).toEqual(SAMPLE_INPUT.geographies);
    expect(reconstructed.exclusions).toEqual(SAMPLE_INPUT.exclusions);
    expect(reconstructed.checkRange).toEqual(SAMPLE_INPUT.checkRange);
    expect(reconstructed.riskPosture).toBe(SAMPLE_INPUT.riskPosture);
    expect(reconstructed.signals).toContain("Working product");
  });

  it("produces an ActiveThesis whose criteria are all valid SearchCriterion values", () => {
    const stored = toStoredRows(SAMPLE_INPUT);
    const reconstructed = activeThesisFromStoredCriteria({
      brief: SAMPLE_INPUT.brief,
      criteria: stored,
      updatedAt: "2026-07-18T00:00:00.000Z",
    });

    expect(reconstructed.criteria.length).toBe(stored.length);
    for (const criterion of reconstructed.criteria) {
      expect(isSearchCriterion(criterion)).toBe(true);
    }
  });

  it("falls back to safe defaults when check_size or acceptable_risk rows are missing", () => {
    const reconstructed = activeThesisFromStoredCriteria({
      brief: "A minimal thesis with no configuration rows.",
      criteria: [],
      updatedAt: "2026-07-18T00:00:00.000Z",
    });

    expect(reconstructed.checkRange).toEqual({ currency: "USD", min: 100_000, max: 750_000 });
    expect(reconstructed.riskPosture).toBe("balanced");
  });

  it("carries the fund_theses.source_scope column through, defaulting when absent or invalid", () => {
    const withScope = activeThesisFromStoredCriteria({
      brief: "A thesis with an explicit source scope.",
      criteria: [],
      updatedAt: "2026-07-18T00:00:00.000Z",
      sourceScope: "internal",
    });
    expect(withScope.sourceScope).toBe("internal");

    const withoutScope = activeThesisFromStoredCriteria({
      brief: "A thesis with no source scope column value.",
      criteria: [],
      updatedAt: "2026-07-18T00:00:00.000Z",
    });
    expect(withoutScope.sourceScope).toBe("internal_then_public");

    const withInvalidScope = activeThesisFromStoredCriteria({
      brief: "A thesis with a corrupted source scope value.",
      criteria: [],
      updatedAt: "2026-07-18T00:00:00.000Z",
      sourceScope: "everywhere",
    });
    expect(withInvalidScope.sourceScope).toBe("internal_then_public");
  });

  it("stays consistent with createActiveThesis's own validation for the same input", () => {
    const local = createActiveThesis(SAMPLE_INPUT, "2026-07-18T00:00:00.000Z");
    const stored = toStoredRows(SAMPLE_INPUT);
    const reconstructed = activeThesisFromStoredCriteria({
      brief: SAMPLE_INPUT.brief,
      criteria: stored,
      updatedAt: "2026-07-18T00:00:00.000Z",
    });

    expect(reconstructed.summary).toBe(local.summary);
  });
});
