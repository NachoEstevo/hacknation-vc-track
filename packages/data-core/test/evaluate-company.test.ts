import { describe, expect, it } from "vitest";
import { evaluateCompany } from "../src/briefs/evaluate-company.js";
import type { ClaimCandidate, CompanyEvidenceBundle, FundThesis } from "../src/briefs/types.js";

const bundle: CompanyEvidenceBundle = {
  companyId: "acme",
  companyName: "Acme",
  normalizedCompany: {
    stableId: "acme", name: "Acme", description: "Workflow software for finance teams", primaryIndustry: "Software",
    sizeBand: "1-10", organizationType: "Private", location: "New York", countryCode: "US", domain: "acme.test",
    linkedInUrl: null, dedupeKey: "acme.test", source: { sourceType: "clay_csv", rowNumber: 2, verification: "unverified", raw: {} },
  },
  evidence: [{
    evidenceId: "clay", companyId: "acme", sourceType: "clay_csv", sourceUrl: null, snapshotPath: null,
    capturedAt: "2026-07-18T00:00:00.000Z", excerpt: null, payload: null, verificationState: "unverified", visibility: "investor_private",
  }, {
    evidenceId: "claim-evidence", companyId: "acme", sourceType: "founder_document", sourceUrl: null, snapshotPath: null,
    capturedAt: "2026-07-18T00:00:00.000Z", excerpt: null, payload: null, verificationState: "verified", visibility: "founder_private",
  }],
};

function thesis(criteria: FundThesis["criteria"]): FundThesis {
  return { thesisId: "thesis", originalQuery: "Test", criteria, generatedAt: "2026-07-18T00:00:00.000Z", promptVersion: "v1" };
}

function criterion(overrides: Partial<FundThesis["criteria"][number]> = {}): FundThesis["criteria"][number] {
  return { criterionId: "country", category: "geography", label: "US", requirement: "required", weight: 5, operator: "equals", expectedValue: "US", ...overrides };
}

function claim(predicate: string, value: string | number | boolean, state: ClaimCandidate["state"] = "supported"): ClaimCandidate {
  return {
    claimId: predicate, companyId: "acme", subject: "Acme", predicate, value, unit: null, claimKind: "observed_fact", evidenceIds: ["claim-evidence"], state,
    trust: { sourceReliability: 40, directness: 25, corroboration: 0, recency: 15, total: 80, state: state === "conflicted" ? "conflicted" : "supported" },
  };
}

describe("evaluateCompany", () => {
  it("evaluates real seed country and size shapes without representation conflicts", () => {
    const realSeedBundle = {
      ...bundle,
      normalizedCompany: {
        ...bundle.normalizedCompany,
        countryCode: "US" as const,
        location: "North Carolina, United States",
        sizeBand: "2-10 employees",
      },
    };
    const result = evaluateCompany(thesis([
      criterion({ operator: "one_of", expectedValue: ["US", "GB"] }),
      criterion({ criterionId: "team", category: "company_size", label: "Below 10", operator: "lte", expectedValue: 9 }),
      criterion({ criterionId: "b2b", category: "industry", label: "B2B software", expectedValue: "B2B software" }),
      criterion({ criterionId: "stage", category: "stage", label: "Early", expectedValue: "early" }),
      criterion({ criterionId: "execution", category: "traction", label: "Execution", operator: "exists", expectedValue: true }),
    ]), realSeedBundle, [
      claim("b2b", "B2B software"),
      claim("stage", "early"),
      claim("execution", true),
    ]);

    expect(result.criteria.map(({ state }) => state)).toEqual(["match", "partial", "match", "match", "match"]);
    expect(result.thesisFit).toBe(90);
    expect(result.recommendation).toBe("investigate");
  });

  it("keeps Drivenly geography matched when a model claim is marked conflicted", () => {
    const result = evaluateCompany(thesis([
      criterion({ criterionId: "geography-1", operator: "one_of", expectedValue: ["US", "GB"] }),
    ]), {
      ...bundle,
      companyName: "Drivenly | AI Growth Partner",
      normalizedCompany: {
        ...bundle.normalizedCompany,
        name: "Drivenly | AI Growth Partner",
        countryCode: "US",
        location: "Salt Lake City, Utah, United States",
        primaryIndustry: "Advertising Services",
        sizeBand: "2-10 employees",
      },
    }, [claim("geography-1", "GB", "conflicted")]);

    expect(result.criteria[0]!.state).toBe("match");
  });

  it("matches Zendr Business on supported B2B and authoritative software taxonomy", () => {
    const result = evaluateCompany(thesis([
      criterion({ criterionId: "industry-1-b2b", category: "market", label: "B2B business model", expectedValue: true }),
      criterion({ criterionId: "industry-1-software", category: "industry", label: "Software product", expectedValue: true }),
    ]), {
      ...bundle,
      companyName: "Zendr Business",
      normalizedCompany: {
        ...bundle.normalizedCompany,
        name: "Zendr Business",
        description: "Zendr helps businesses manage sales with a mobile-first ERP suite.",
        primaryIndustry: "Mobile Computing Software Products",
      },
      evidence: [{
        ...bundle.evidence[0]!,
        excerpt: "Zendr helps businesses manage sales with a mobile-first ERP suite.",
      }, bundle.evidence[1]!],
    }, [claim("industry-1-b2b", true)]);

    expect(result.criteria.map(({ state }) => state)).toEqual(["match", "match"]);
  });

  it("conflicts Tech On Toast software despite a positive model claim", () => {
    const description = "We are a hospitality technology marketplace and community. We're not a tech company; we recommend partner tools.";
    const result = evaluateCompany(thesis([
      criterion({ criterionId: "industry-1-software", category: "industry", label: "Software product", expectedValue: true }),
    ]), {
      ...bundle,
      companyName: "Tech On Toast",
      normalizedCompany: { ...bundle.normalizedCompany, name: "Tech On Toast", description, primaryIndustry: "Hospitality" },
      evidence: [{ ...bundle.evidence[0]!, excerpt: description }],
    }, [claim("industry-1-software", true)]);

    expect(result.criteria[0]!.state).toBe("conflict");
  });

  it.each([
    "We develop and operate a SaaS platform for finance teams.",
    "Our API product lets businesses automate settlement workflows.",
  ])("matches explicit proprietary software evidence: %s", (description) => {
    const result = evaluateCompany(thesis([
      criterion({ criterionId: "industry-1-software", category: "industry", label: "Software product", expectedValue: true }),
    ]), {
      ...bundle,
      normalizedCompany: { ...bundle.normalizedCompany, description, primaryIndustry: "Technology" },
      evidence: [{ ...bundle.evidence[0]!, excerpt: description }],
    }, []);

    expect(result.criteria[0]!.state).toBe("match");
  });

  it("does not let a model software claim bypass explicit product grounding", () => {
    const description = "A community and training service for technology leaders.";
    const result = evaluateCompany(thesis([
      criterion({ criterionId: "industry-1-software", category: "industry", label: "Software product", expectedValue: true }),
    ]), {
      ...bundle,
      normalizedCompany: { ...bundle.normalizedCompany, description, primaryIndustry: "Software" },
      evidence: [{ ...bundle.evidence[0]!, excerpt: description }],
    }, [claim("industry-1-software", true)]);

    expect(result.criteria[0]!.state).toBe("missing");
  });

  it("treats a marketplace/community without proprietary product evidence as missing", () => {
    const description = "A marketplace and community connecting buyers with a third-party software product and partner vendors.";
    const result = evaluateCompany(thesis([
      criterion({ criterionId: "industry-1-software", category: "industry", label: "Software product", expectedValue: true }),
    ]), {
      ...bundle,
      normalizedCompany: { ...bundle.normalizedCompany, description, primaryIndustry: "Technology" },
      evidence: [{ ...bundle.evidence[0]!, excerpt: description }],
    }, []);

    expect(result.criteria[0]!.state).toBe("missing");
  });

  it("requires a concrete product, pricing, changelog, or GitHub signal for visible execution", () => {
    const executionCriterion = criterion({
      criterionId: "traction-1", category: "traction", label: "Visible execution signals", operator: "exists", expectedValue: true,
    });
    const websiteEvidence = {
      ...bundle.evidence[1]!, sourceType: "company_website" as const, visibility: "public" as const,
      payload: { description: "An official company homepage.", signalLinks: { pricing: [], changelog: [], product: [] } },
    };
    const withoutSignal = evaluateCompany(thesis([executionCriterion]), {
      ...bundle, evidence: [bundle.evidence[0]!, websiteEvidence],
    }, [{ ...claim("traction-1", true), evidenceIds: [websiteEvidence.evidenceId] }]);
    const withPricing = evaluateCompany(thesis([executionCriterion]), {
      ...bundle,
      evidence: [bundle.evidence[0]!, {
        ...websiteEvidence,
        payload: { description: "An official company homepage.", signalLinks: { pricing: ["https://acme.test/pricing"], changelog: [], product: [] } },
      }],
    }, []);

    expect(withoutSignal.criteria[0]!.state).toBe("missing");
    expect(withPricing.criteria[0]!.state).toBe("match");
  });

  it("treats a non-software taxonomy as unknown without supported negative evidence", () => {
    const result = evaluateCompany(thesis([
      criterion({ criterionId: "industry-1-software", category: "industry", label: "Software product", expectedValue: true }),
    ]), {
      ...bundle,
      normalizedCompany: { ...bundle.normalizedCompany, primaryIndustry: "Education" },
    }, []);

    expect(result.criteria[0]!.state).toBe("missing");
  });

  it.each(["Julian Jewel's AI Bot", "Steal These Thoughts!"])(
    "does not treat a model-only negative as software conflict for %s",
    (companyName) => {
      const result = evaluateCompany(thesis([
        criterion({ criterionId: "industry-1-b2b", category: "market", label: "B2B business model", expectedValue: true }),
        criterion({ criterionId: "industry-1-software", category: "industry", label: "Software product", expectedValue: true }),
      ]), {
        ...bundle,
        companyName,
        normalizedCompany: { ...bundle.normalizedCompany, name: companyName, primaryIndustry: "Education" },
      }, [claim("industry-1-b2b", false), claim("industry-1-software", false)]);

      expect(result.criteria.map(({ state }) => state)).toEqual(["conflict", "missing"]);
    },
  );

  it("marks an incomparable team-size representation missing rather than conflicting", () => {
    const result = evaluateCompany(thesis([
      criterion({ category: "company_size", operator: "lte", expectedValue: 9 }),
    ]), {
      ...bundle,
      normalizedCompany: { ...bundle.normalizedCompany, sizeBand: "Not reported" },
    }, []);

    expect(result.criteria[0]!.state).toBe("missing");
    expect(result.thesisFit).toBeNull();
  });

  it("matches a self-employed seed against a below-ten team criterion", () => {
    const result = evaluateCompany(thesis([
      criterion({ category: "company_size", operator: "lte", expectedValue: 9 }),
    ]), {
      ...bundle,
      normalizedCompany: { ...bundle.normalizedCompany, sizeBand: "Self-employed" },
    }, []);

    expect(result.criteria[0]!.state).toBe("match");
    expect(result.thesisFit).toBe(100);
  });

  it("calculates thesis fit over known criteria separately from weighted coverage", () => {
    const result = evaluateCompany(thesis([
      criterion(),
      criterion({ criterionId: "industry", category: "industry", label: "SaaS", requirement: "preferred", weight: 3, expectedValue: "SaaS" }),
      criterion({ criterionId: "stage", category: "stage", label: "Seed", requirement: "preferred", weight: 2, expectedValue: "Seed" }),
      criterion({ criterionId: "excluded", category: "exclusion", label: "Excluded", requirement: "excluded", weight: 1, expectedValue: true }),
    ]), bundle, [claim("excluded", true)]);

    expect(result.criteria.map((item) => item.state)).toEqual(["match", "missing", "missing", "conflict"]);
    expect(result.thesisFit).toBeCloseTo((5 + 0) / (5 + 1) * 100);
    expect(result.evidenceCoverage).toBeCloseTo((5 + 1) / 11 * 100);
    expect(result.criteria.every((item) => item.reason.length > 0 && Array.isArray(item.evidenceIds))).toBe(true);
  });

  it("returns null fit and zero coverage when no criterion has known evidence", () => {
    const result = evaluateCompany(thesis([criterion({ category: "stage", expectedValue: "Seed" })]), bundle, []);

    expect(result.thesisFit).toBeNull();
    expect(result.evidenceCoverage).toBe(0);
  });

  it("does not treat normalized fields as known without Clay evidence", () => {
    const result = evaluateCompany(thesis([criterion()]), { ...bundle, evidence: [] }, []);

    expect(result.criteria[0]!.state).toBe("missing");
    expect(result.thesisFit).toBeNull();
    expect(result.evidenceCoverage).toBe(0);
    expect(result.recommendation).toBe("needs_evidence");
  });

  it("makes a confirmed required mismatch a blocking conflict", () => {
    const result = evaluateCompany(thesis([criterion({ expectedValue: "GB" })]), bundle, []);

    expect(result.criteria[0]!.state).toBe("conflict");
    expect(result.recommendation).toBe("pass_for_thesis");
  });

  it("conflicts on an excluded match and treats a known excluded nonmatch as a fit match", () => {
    const matching = evaluateCompany(thesis([criterion({ requirement: "excluded", expectedValue: "US" })]), bundle, []);
    const nonmatching = evaluateCompany(thesis([criterion({ requirement: "excluded", expectedValue: "GB" })]), bundle, []);

    expect(matching.criteria[0]!.state).toBe("conflict");
    expect(matching.recommendation).toBe("pass_for_thesis");
    expect(nonmatching.criteria[0]!.state).toBe("match");
    expect(nonmatching.thesisFit).toBe(100);
    expect(nonmatching.recommendation).toBe("investigate");
  });

  it("ignores a foreign-company claim", () => {
    const foreignClaim = { ...claim("country", "US"), companyId: "other-company" };
    const result = evaluateCompany(thesis([criterion({ category: "stage" })]), bundle, [foreignClaim]);

    expect(result.criteria[0]!.state).toBe("missing");
  });

  it("emits only claim evidence IDs that exist in the company bundle", () => {
    const mixedIdsClaim = { ...claim("country", "US"), evidenceIds: ["claim-evidence", "ghost"] };
    const result = evaluateCompany(thesis([criterion({ category: "stage" })]), bundle, [mixedIdsClaim]);

    expect(result.criteria[0]!.state).toBe("match");
    expect(result.criteria[0]!.evidenceIds).toEqual(["claim-evidence"]);
  });

  it("treats an unverified claim as missing evidence", () => {
    const result = evaluateCompany(thesis([criterion({ category: "stage", expectedValue: "Seed" })]), bundle, [
      claim("country", "US", "unverified"),
    ]);

    expect(result.criteria[0]!.state).toBe("missing");
  });

  it("executes every approved operator against normalized fields and cited claims", () => {
    const result = evaluateCompany(thesis([
      criterion({ criterionId: "country", operator: "one_of", expectedValue: ["US", "GB"] }),
      criterion({ criterionId: "description", category: "product", label: "Workflow", operator: "contains", expectedValue: "workflow" }),
      criterion({ criterionId: "revenue-min", category: "traction", label: "Revenue", operator: "gte", expectedValue: 100 }),
      criterion({ criterionId: "revenue-max", category: "traction", label: "Revenue cap", operator: "lte", expectedValue: 100 }),
      criterion({ criterionId: "customers", category: "traction", label: "Customers", operator: "exists", expectedValue: true }),
      criterion({ criterionId: "churn", category: "traction", label: "Churn", operator: "not_exists", expectedValue: false }),
    ]), bundle, [claim("revenue-min", 100), claim("revenue-max", 100), claim("customers", 4), claim("churn", false)]);

    expect(result.criteria.map((item) => item.state)).toEqual(["match", "match", "match", "match", "match", "match"]);
  });
});
