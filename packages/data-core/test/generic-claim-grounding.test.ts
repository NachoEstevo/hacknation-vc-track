import { describe, expect, it } from "vitest";
import { assessCompany } from "../src/briefs/assess-company.js";
import { loadOpenAIConfig } from "../src/briefs/openai-config.js";
import { extractClaimCandidates } from "../src/briefs/openai-structured-tasks.js";
import type { CompanyEvidenceBundle, EvidenceRecord } from "../src/briefs/types.js";

const NOW = "2026-07-18T00:00:00.000Z";

function evidence(
  evidenceId: string,
  sourceType: EvidenceRecord["sourceType"],
  sourceUrl: string,
  excerpt: string,
): EvidenceRecord {
  return {
    evidenceId,
    companyId: "acme",
    sourceType,
    sourceUrl,
    snapshotPath: null,
    capturedAt: NOW,
    excerpt,
    payload: null,
    verificationState: "verified",
    visibility: sourceType === "clay_csv" ? "investor_private" : "public",
  };
}

function bundle(records: EvidenceRecord[]): CompanyEvidenceBundle {
  return {
    companyId: "acme",
    companyName: "Acme",
    normalizedCompany: {
      stableId: "acme",
      name: "Acme",
      description: "Workflow software",
      primaryIndustry: "Software",
      sizeBand: "1-10",
      organizationType: "Private",
      location: "New York",
      countryCode: "US",
      domain: "acme.test",
      linkedInUrl: null,
      dedupeKey: "domain:acme.test",
      source: { sourceType: "clay_csv", rowNumber: 2, verification: "unverified", raw: {} },
    },
    evidence: records,
  };
}

async function extractGenericClaim(company: CompanyEvidenceBundle, predicate = "market") {
  return extractClaimCandidates(company, {
    config: loadOpenAIConfig({ OPENAI_API_KEY: "test" }),
    now: () => new Date(NOW),
    createResponse: async () => ({
      output_text: JSON.stringify({ candidates: [{
        claimId: `${predicate}-claim`,
        subject: "Acme",
        predicate,
        value: true,
        unit: null,
        claimKind: "observed_fact",
        evidenceIndexes: [0, 1],
      }] }),
    }),
  });
}

describe("generic claim grounding", () => {
  it("does not ground generic market=true from unrelated Clay and website evidence", async () => {
    const company = bundle([
      evidence("clay", "clay_csv", "https://app.clay.com/tables/acme", "Acme is listed as workflow software."),
      evidence("website", "company_website", "https://acme.test/about", "Acme automates finance workflows."),
    ]);

    const claims = await extractGenericClaim(company);
    const market = assessCompany(company, claims).find(({ axis }) => axis === "market")!;
    const direct = market.dimensions.find(({ dimensionId }) => dimensionId === "direct_market_evidence")!;

    expect(claims).toEqual([]);
    expect(direct).toMatchObject({ known: false, points: 0, evidenceIds: [] });
  });

  it("allowlists explicit customer-demand wording as direct market evidence", async () => {
    const company = bundle([
      evidence("clay", "clay_csv", "https://app.clay.com/tables/acme", "Directory notes report customer demand from enterprise buyers."),
      evidence("website", "company_website", "https://acme.test/customers", "Three enterprise customers signed paid pilots after requesting the product."),
    ]);

    const claims = await extractGenericClaim(company);
    const market = assessCompany(company, claims).find(({ axis }) => axis === "market")!;
    const direct = market.dimensions.find(({ dimensionId }) => dimensionId === "direct_market_evidence")!;

    expect(claims).toMatchObject([{
      predicate: "market",
      state: "supported",
      evidenceIds: ["clay", "website"],
      trust: { total: 73, state: "supported" },
    }]);
    expect(direct).toMatchObject({ known: true, points: 4, evidenceIds: ["clay", "website"] });
  });

  it.each([
    {
      label: "customers signing in",
      clay: "Customers signed in to manage tasks.",
      website: "Customers signed in to manage project tasks.",
    },
    {
      label: "password-reset requests",
      clay: "Customers signed into the portal after requesting password resets.",
      website: "Customers requested password resets, then signed into the portal.",
    },
    {
      label: "cryptographically signed API requests",
      clay: "Customer-signed API requests are verified cryptographically.",
      website: "Cryptographic signed requests from customers protect the API.",
    },
  ])("does not treat $label as market demand across independent sources", async ({ clay, website }) => {
    const company = bundle([
      evidence("clay", "clay_csv", "https://app.clay.com/tables/acme", clay),
      evidence("website", "company_website", "https://acme.test/docs", website),
    ]);

    const claims = await extractGenericClaim(company);
    const market = assessCompany(company, claims).find(({ axis }) => axis === "market")!;
    const direct = market.dimensions.find(({ dimensionId }) => dimensionId === "direct_market_evidence")!;

    expect(claims).toEqual([]);
    expect(direct).toMatchObject({ known: false, points: 0, evidenceIds: [] });
  });

  it.each([
    {
      label: "signed contracts",
      clay: "Enterprise customers signed annual contracts for the service.",
      website: "Three buyers signed pilot agreements after procurement review.",
    },
    {
      label: "requested demos and trials",
      clay: "Customers requested product demos during the launch month.",
      website: "Enterprise buyers requested trials before procurement review.",
    },
    {
      label: "paid customers",
      clay: "The company reports twelve paid customers.",
      website: "Paid customers renewed their subscriptions this quarter.",
    },
  ])("keeps explicit $label as direct market evidence", async ({ clay, website }) => {
    const company = bundle([
      evidence("clay", "clay_csv", "https://app.clay.com/tables/acme", clay),
      evidence("website", "company_website", "https://acme.test/customers", website),
    ]);

    const claims = await extractGenericClaim(company);
    const market = assessCompany(company, claims).find(({ axis }) => axis === "market")!;
    const direct = market.dimensions.find(({ dimensionId }) => dimensionId === "direct_market_evidence")!;

    expect(claims).toMatchObject([{ predicate: "market", state: "supported" }]);
    expect(direct).toMatchObject({ known: true, points: 4, evidenceIds: ["clay", "website"] });
  });

  it.each(["industry", "product", "traction", "stage"])(
    "does not ground the generic-only %s predicate without an explicit rule",
    async (predicate) => {
      const company = bundle([
        evidence("clay", "clay_csv", "https://app.clay.com/tables/acme", "Acme is workflow software."),
        evidence("website", "company_website", "https://acme.test/about", "Acme automates finance workflows."),
      ]);

      await expect(extractGenericClaim(company, predicate)).resolves.toEqual([]);
    },
  );
});
