import { describe, expect, it } from "vitest";

import {
  getClayCatalogCompany,
  getClayCatalogSummary,
  listClayCatalogCompanies,
  loadClayCatalog,
  searchClayCatalog,
} from "./clay-catalog.server";

describe("Clay catalog loader", () => {
  it("normalizes the complete checked-in seed without merging or quarantining rows", async () => {
    const catalog = await loadClayCatalog();

    expect(catalog.summary).toMatchObject({
      totalRows: 50,
      acceptedCompanies: 50,
      quarantinedRows: 0,
      duplicateRows: 0,
      missingDomains: 5,
    });
    expect(catalog.companies).toHaveLength(50);
  });

  it("keeps provenance explicit and missing domains unknown", async () => {
    const companies = await listClayCatalogCompanies();
    const missingDomains = companies.filter((company) => company.domain === null);

    expect(missingDomains).toHaveLength(5);
    expect(companies.every((company) => company.sourceType === "clay_csv")).toBe(true);
    expect(companies.every((company) => company.verification === "unverified")).toBe(true);
    expect(companies.every((company) => company.sourceRow >= 2)).toBe(true);
  });

  it("exposes summary, list, and stable-ID lookup through separate server APIs", async () => {
    const summary = await getClayCatalogSummary();
    const companies = await listClayCatalogCompanies();
    const first = companies[0];

    expect(summary.acceptedCompanies).toBe(companies.length);
    expect(first).toBeDefined();
    expect(await getClayCatalogCompany(first!.stableId)).toEqual(first);
    expect(await getClayCatalogCompany("not-a-real-stable-id")).toBeNull();
  });
});

describe("Clay catalog search", () => {
  it("returns identical ranking for identical searches", async () => {
    const input = { text: "AI", country: "GB" as const, limit: 12 };
    const first = await searchClayCatalog(input);
    const second = await searchClayCatalog(input);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((result) => result.countryCode === "GB")).toBe(true);
    expect(first.every((result) => result.sourceType === "clay_csv")).toBe(true);
    expect(first.every((result) => result.verification === "unverified")).toBe(true);
  });

  it("matches exact names first and supports sector and country filters", async () => {
    const exactName = await searchClayCatalog({ text: "Career Principles" });
    const advertisers = await searchClayCatalog({
      sector: "Advertising Services",
      country: "US",
    });

    expect(exactName[0]?.name).toBe("Career Principles");
    expect(advertisers.map((result) => result.name)).toEqual([
      "Drivenly | AI Growth Partner",
      "Icon",
      "RunRex",
    ]);
  });

  it("does not convert an absent field into a searchable claim", async () => {
    const domainless = await searchClayCatalog({ text: "GPT Journal" });

    expect(domainless[0]).toMatchObject({
      name: "GPT Journal",
      domain: null,
      sourceType: "clay_csv",
      verification: "unverified",
    });
  });
});
