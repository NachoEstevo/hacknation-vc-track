import { describe, expect, it } from "vitest";
import { isSearchCriterion } from "../domain";
import { parseSearchIntentWithAi } from "./parse-search-intent-ai";

const hasApiKey = Boolean(
  process.env.ANTHROPIC_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim(),
);

describe.runIf(hasApiKey)("parseSearchIntentWithAi (live LLM call)", () => {
  it("extracts structured criteria from a natural-language brief", async () => {
    const { intent, usedAi } = await parseSearchIntentWithAi(
      "Pre-seed AI infrastructure teams in Latin America with technical founders, a working demo, and no institutional funding.",
    );

    expect(usedAi).toBe(true);
    expect(intent.criteria.length).toBeGreaterThan(0);
    for (const criterion of intent.criteria) {
      expect(isSearchCriterion(criterion)).toBe(true);
    }

    const fields = intent.criteria.map((criterion) => criterion.field);
    expect(fields).toContain("sector");
    expect(fields).toContain("technical_founder");
  }, 15000);

  it("returns an intent with no fabricated criteria for a vague brief", async () => {
    const { intent } = await parseSearchIntentWithAi("Something interesting, surprise me.");
    expect(intent.criteria.every((criterion) => isSearchCriterion(criterion))).toBe(true);
  }, 15000);
});

describe("parseSearchIntentWithAi (fallback)", () => {
  it("falls back to the deterministic parser when no API key is configured", async () => {
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const { intent, usedAi } = await parseSearchIntentWithAi(
        "Pre-seed AI infrastructure teams with technical founders.",
      );
      expect(usedAi).toBe(false);
      expect(intent.criteria.some((criterion) => criterion.field === "sector")).toBe(true);
    } finally {
      if (originalAnthropicKey) process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
      if (originalOpenAiKey) process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
  });
});
