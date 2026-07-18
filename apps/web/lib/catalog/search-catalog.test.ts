import { describe, expect, it } from "vitest";
import type { ClayCatalogCompany } from "./types";
import { catalogTermForQuery, searchClayCatalogRows } from "./search-catalog";

function company(input: Partial<ClayCatalogCompany> & Pick<ClayCatalogCompany, "stableId" | "name">): ClayCatalogCompany {
  return {
    dedupeKey: input.stableId,
    description: null,
    primaryIndustry: null,
    sizeBand: null,
    organizationType: null,
    location: null,
    countryCode: null,
    domain: null,
    linkedInUrl: null,
    sourceType: "clay_csv",
    verification: "unverified",
    sourceRow: 2,
    ...input,
  };
}

describe("client catalog search", () => {
  it("selects a safe source-field term from a conversational query", () => {
    expect(catalogTermForQuery("Fintech founders in Argentina with traction")).toBe("fintech");
    expect(catalogTermForQuery("founders who care deeply about trust and craft")).toBe("");
  });

  it("ranks only explicit source-field matches and caps results at six", () => {
    const rows = [
      company({ stableId: "exact", name: "Fintech", primaryIndustry: "Software" }),
      ...Array.from({ length: 8 }, (_, index) => company({
        stableId: `row-${index}`,
        name: `Company ${index}`,
        primaryIndustry: "Fintech",
      })),
      company({ stableId: "unknown", name: "Unknown Co" }),
    ];

    const result = searchClayCatalogRows(rows, "Fintech founders in Argentina");
    expect(result.results).toHaveLength(6);
    expect(result.results[0]?.stableId).toBe("exact");
    expect(result.results.some((row) => row.stableId === "unknown")).toBe(false);
  });
});
