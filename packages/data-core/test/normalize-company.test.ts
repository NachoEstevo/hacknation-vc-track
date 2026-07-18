import { describe, expect, it } from "vitest";
import {
  normalizeClayCompany,
  normalizeDomain,
  normalizeLinkedInCompanyUrl,
} from "../src/index.js";

describe("normalizeDomain", () => {
  it("removes protocol, www, paths, and trailing dots", () => {
    expect(normalizeDomain("https://www.Example.com/about/"))
      .toBe("example.com");
  });

  it("rejects missing and malformed domains", () => {
    expect(normalizeDomain("—")).toBeNull();
    expect(normalizeDomain("not a domain")).toBeNull();
  });
});

describe("normalizeLinkedInCompanyUrl", () => {
  it("keeps only a normalized company slug", () => {
    expect(normalizeLinkedInCompanyUrl(
      "https://linkedin.com/company/Example-Co/?trk=foo",
    )).toBe("https://www.linkedin.com/company/example-co");
  });
});

describe("normalizeClayCompany", () => {
  it("preserves source values and marks them unverified", () => {
    const result = normalizeClayCompany({
      Name: " Example ",
      Description: "A product",
      "Primary Industry": "Software Development",
      Size: "2-10 employees",
      Type: "Privately Held",
      Location: "London, England, United Kingdom",
      Country: "United Kingdom of Great Britain and Northern Ireland",
      Domain: "https://example.com",
      "LinkedIn URL": "https://linkedin.com/company/example",
    }, 2);

    expect(result.kind).toBe("company");
    if (result.kind === "company") {
      expect(result.company.countryCode).toBe("GB");
      expect(result.company.source.verification).toBe("unverified");
      expect(result.company.dedupeKey).toBe("domain:example.com");
    }
  });
});
