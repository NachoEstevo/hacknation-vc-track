import { describe, expect, it } from "vitest";
import { buildEvidenceIndex } from "../src/briefs/build-evidence-index.js";
import type { CompanyEnrichmentResult } from "../src/enrichment/types.js";
import type { StableCompanySeed } from "../src/types.js";

const company: StableCompanySeed = {
  stableId: "acme-stable-id",
  name: "Acme",
  description: "Workflow software",
  primaryIndustry: "Software",
  sizeBand: "1-10",
  organizationType: "Private",
  location: "New York",
  countryCode: "US",
  domain: "acme.test",
  linkedInUrl: "https://linkedin.com/company/acme",
  dedupeKey: "acme.test",
  source: {
    sourceType: "clay_csv",
    rowNumber: 2,
    verification: "unverified",
    raw: { Name: "Acme", Domain: "acme.test" },
  },
};

const missingDomainCompany: StableCompanySeed = {
  ...company,
  stableId: "missing-domain-stable-id",
  name: "No Domain",
  domain: null,
  dedupeKey: "no-domain",
};

const enrichment: CompanyEnrichmentResult = {
  stableId: company.stableId,
  name: company.name,
  domain: company.domain,
  status: "complete",
  capturedAt: "2026-07-18T20:08:54.189Z",
  pages: [{ url: "https://acme.test/", status: 200 }],
  failures: [],
  profile: {
    name: "Acme",
    description: "Workflow software for teams",
    socialLinks: { linkedIn: [], github: ["https://github.com/acme"], x: [] },
    signalLinks: { pricing: ["https://acme.test/pricing"], changelog: [], product: [] },
    founderCandidates: [],
  },
  github: [{
    status: "ok",
    sourceUrl: "https://github.com/acme",
    accountType: "organization",
    login: "acme",
    publicRepos: 3,
    followers: 10,
    createdAt: "2024-01-01T00:00:00Z",
    latestPushAt: "2026-07-01T00:00:00Z",
    latestRepositoryUpdateAt: "2026-07-02T00:00:00Z",
    totalStarsSampled: 12,
    note: "Resolved public organization profile.",
  }],
};

describe("buildEvidenceIndex", () => {
  it("converts Clay, website, and resolved GitHub sources into deterministic safe evidence", () => {
    const first = buildEvidenceIndex([company, missingDomainCompany], [enrichment])[0]!;
    const result = buildEvidenceIndex([company, missingDomainCompany], [enrichment]);

    expect(first.companyId).toBe(company.stableId);
    expect(first.evidence.map((item) => item.sourceType)).toEqual([
      "clay_csv", "company_website", "github_public",
    ]);
    expect(first.evidence.map((item) => item.visibility)).toEqual([
      "investor_private", "public", "public",
    ]);
    expect(first.evidence.map((item) => item.capturedAt)).toEqual([
      enrichment.capturedAt,
      enrichment.capturedAt,
      enrichment.capturedAt,
    ]);
    expect(first.evidence.every((item) => /^[a-f0-9]{24}$/.test(item.evidenceId))).toBe(true);
    expect(first.evidence.every((item) => !JSON.stringify(item).includes("<html"))).toBe(true);
    expect(result[1]?.evidence.map((item) => item.sourceType)).toEqual(["clay_csv"]);
    expect(buildEvidenceIndex([company, missingDomainCompany], [enrichment])).toEqual(result);
  });

  it("excludes public enrichment when both the resolved domain and profile identity mismatch", () => {
    const mismatched = {
      ...enrichment,
      pages: [{ url: "https://other-product.test/", status: 200 }],
      profile: { ...enrichment.profile!, name: "Other Product" },
    };

    expect(buildEvidenceIndex([company], [mismatched])[0]!.evidence.map(({ sourceType }) => sourceType)).toEqual([
      "clay_csv",
    ]);
  });
});
