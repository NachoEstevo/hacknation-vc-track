import { describe, expect, it } from "vitest";
import { thesisChipDraftFromQuery } from "./thesis-draft";

describe("thesisChipDraftFromQuery", () => {
  it("preconfigures only the structured fields recognized in a new fintech brief", () => {
    const draft = thesisChipDraftFromQuery(
      "Fintech founders in Argentina with a working product and no institutional funding",
    );

    expect(draft).toEqual({
      sectors: ["Fintech"],
      stages: [],
      geographies: ["Argentina"],
      signals: ["Working demo"],
      exclusions: ["No institutional funding"],
    });
  });

  it("does not invent chips for fields the parser did not recognize", () => {
    expect(thesisChipDraftFromQuery("A company with thoughtful founders")).toEqual({
      sectors: [],
      stages: [],
      geographies: [],
      signals: [],
      exclusions: [],
    });
  });
});
