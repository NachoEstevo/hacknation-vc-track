import { describe, expect, it } from "vitest";
import {
  buildThesisChipLabel,
  createActiveThesis,
  describeSourceScope,
  isActiveThesis,
  parseCurrencyAmount,
} from "./active-thesis";

const baseInput = {
  brief: "Technical founders building developer tools before seed.",
  sectors: ["Developer tools", "Robotics"],
  stages: ["Pre-seed", "Seed"],
  geographies: ["Latin America"],
  signals: ["Working product", "Unmodeled founder signal"],
  exclusions: ["Institutional Series A+"],
  checkRange: { currency: "USD" as const, min: 100_000, max: 750_000 },
  riskPosture: "balanced" as const,
};

describe("active thesis", () => {
  it("normalizes currency-like values and rejects unsafe ranges", () => {
    expect(parseCurrencyAmount("$100k")).toBe(100_000);
    expect(parseCurrencyAmount("1.5m")).toBe(1_500_000);
    expect(parseCurrencyAmount("0")).toBeNull();
    expect(parseCurrencyAmount("100 dollars")).toBeNull();
    expect(() => createActiveThesis({
      ...baseInput,
      checkRange: { currency: "USD", min: 800_000, max: 750_000 },
    })).toThrow(/minimum/i);
  });

  it("creates a validated lens with unsupported parameters kept neutral", () => {
    const thesis = createActiveThesis(baseInput, "2026-07-18T12:00:00.000Z");

    expect(isActiveThesis(thesis)).toBe(true);
    expect(thesis.criteria).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "sector", priority: "required" }),
      expect.objectContaining({ field: "working_demo", priority: "preferred" }),
      expect.objectContaining({ field: "valued_signal_types", priority: "preferred" }),
      expect.objectContaining({
        field: "team_preferences",
        priority: "required",
        label: expect.stringContaining("Robotics"),
      }),
      expect.objectContaining({ field: "check_size", operator: "between" }),
      expect.objectContaining({ field: "acceptable_risk" }),
    ]));
  });

  it("rejects a malformed persisted thesis at the runtime boundary", () => {
    const thesis = createActiveThesis(baseInput, "2026-07-18T12:00:00.000Z");
    expect(isActiveThesis({
      ...thesis,
      checkRange: { currency: "USD", min: 900_000, max: 100_000 },
    })).toBe(false);
  });

  it("defaults sourceScope to internal_then_public and accepts an explicit override", () => {
    const defaulted = createActiveThesis(baseInput, "2026-07-18T12:00:00.000Z");
    expect(defaulted.sourceScope).toBe("internal_then_public");

    const scoped = createActiveThesis({ ...baseInput, sourceScope: "internal" }, "2026-07-18T12:00:00.000Z");
    expect(scoped.sourceScope).toBe("internal");
  });

  it("keeps validating thesis objects persisted before sourceScope existed", () => {
    const thesis = createActiveThesis(baseInput, "2026-07-18T12:00:00.000Z");
    const legacyThesis: Record<string, unknown> = { ...thesis };
    delete legacyThesis.sourceScope;
    expect(isActiveThesis(legacyThesis)).toBe(true);
    expect(isActiveThesis({ ...thesis, sourceScope: "unlimited" })).toBe(false);
  });
});

describe("describeSourceScope", () => {
  it("describes each supported scope in plain language", () => {
    expect(describeSourceScope("internal")).toBe("Internal only");
    expect(describeSourceScope("internal_then_public")).toBe("Internal first + public");
  });
});

describe("buildThesisChipLabel", () => {
  it("reports an unconfigured thesis honestly", () => {
    expect(buildThesisChipLabel(null)).toBe("Thesis not configured yet");
  });

  it("summarizes real geography/stage/sector facts with a remaining-facts count", () => {
    const thesis = createActiveThesis({
      ...baseInput,
      geographies: ["United States", "United Kingdom"],
    }, "2026-07-18T12:00:00.000Z");

    // geographies map to their codes (US/GB), stage/sector stay literal, and
    // the remaining stage/sector/signal/exclusion facts show as "+N".
    expect(buildThesisChipLabel(thesis)).toBe("US/GB · Pre-seed Developer tools · +5");
  });

  it("falls back to a fact count when there are signals/exclusions but no sectors, stages, or geographies", () => {
    const thesis = createActiveThesis({
      ...baseInput,
      sectors: [],
      stages: [],
      geographies: [],
      exclusions: [],
    }, "2026-07-18T12:00:00.000Z");

    expect(buildThesisChipLabel(thesis)).toBe("2 sourcing signals");
  });

  it("reports no criteria at all when the thesis has nothing configured", () => {
    const thesis = createActiveThesis({
      ...baseInput,
      sectors: [],
      stages: [],
      geographies: [],
      signals: [],
      exclusions: [],
    }, "2026-07-18T12:00:00.000Z");

    expect(buildThesisChipLabel(thesis)).toBe("No sourcing criteria yet");
  });
});
