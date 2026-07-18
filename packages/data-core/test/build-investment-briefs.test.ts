import { describe, expect, it } from "vitest";
import {
  buildInvestmentBriefs,
  type BuildInvestmentBriefsDependencies,
  type BuildInvestmentBriefsInput,
} from "../src/briefs/build-investment-briefs.js";
import type {
  CompanyEvaluation,
  CompanyEvidenceBundle,
  FundThesis,
  InvestmentBrief,
} from "../src/briefs/types.js";
import type { StableCompanySeed } from "../src/types.js";
import {
  BriefCliUsageError,
  parseBriefCliArgs,
  runBriefCli,
} from "../scripts/build-investment-briefs.js";

const generatedAt = "2026-07-18T22:00:00.000Z";
const thesis: FundThesis = {
  thesisId: "thesis-1",
  originalQuery: "US software companies",
  generatedAt,
  promptVersion: "test-v1",
  criteria: [{
    criterionId: "country",
    category: "geography",
    label: "US",
    requirement: "required",
    weight: 5,
    operator: "equals",
    expectedValue: "US",
  }],
};

function company(index: number): StableCompanySeed {
  const id = `company-${index.toString().padStart(2, "0")}`;
  return {
    stableId: id,
    name: id,
    description: "Workflow software",
    primaryIndustry: "Software",
    sizeBand: "1-10",
    organizationType: "Private",
    location: "New York",
    countryCode: "US",
    domain: `${id}.test`,
    linkedInUrl: null,
    dedupeKey: `${id}.test`,
    source: {
      sourceType: "clay_csv",
      rowNumber: index + 2,
      verification: "unverified",
      raw: {},
    },
  };
}

function brief(bundle: CompanyEvidenceBundle, evaluation: CompanyEvaluation): InvestmentBrief {
  return {
    companyId: bundle.companyId,
    thesisId: thesis.thesisId,
    recommendation: evaluation.recommendation,
    thesisFit: evaluation.thesisFit,
    evidenceCoverage: evaluation.evidenceCoverage,
    axes: evaluation.axes,
    summary: [],
    strengths: [],
    risks: [],
    evidenceGaps: [],
    diligenceQuestions: [],
    generatedAt,
    promptVersion: "test-v1",
  };
}

function setup(count = 5): {
  input: BuildInvestmentBriefsInput;
  dependencies: BuildInvestmentBriefsDependencies;
  calls: { parsed: number; extracted: string[]; drafted: string[] };
} {
  const calls = { parsed: 0, extracted: [] as string[], drafted: [] as string[] };
  return {
    input: {
      companies: Array.from({ length: count }, (_, index) => company(index)),
      enrichments: [],
      thesis: thesis.originalQuery,
      thesisConfirmed: true,
    },
    dependencies: {
      now: () => new Date(generatedAt),
      parseThesis: async () => {
        calls.parsed += 1;
        return thesis;
      },
      extractClaimCandidates: async (bundle) => {
        calls.extracted.push(bundle.companyId);
        return [];
      },
      draftInvestmentBrief: async ({ bundle, evaluation }) => {
        calls.drafted.push(bundle.companyId);
        return brief(bundle, evaluation);
      },
    },
    calls,
  };
}

describe("buildInvestmentBriefs", () => {
  it("parses a thesis once and stops at the explicit confirmation boundary", async () => {
    const { input, dependencies, calls } = setup();

    const result = await buildInvestmentBriefs(
      { ...input, thesisConfirmed: false },
      dependencies,
    );

    expect(result).toMatchObject({
      status: "awaiting_thesis_confirmation",
      generatedAt,
      thesis,
      evaluations: [],
      ranking: [],
      briefs: [],
      failures: [],
    });
    expect(result.evidence).toHaveLength(5);
    expect(calls).toEqual({ parsed: 1, extracted: [], drafted: [] });
  });

  it("evaluates every company with extraction concurrency capped at four", async () => {
    const { input, dependencies, calls } = setup(50);
    let active = 0;
    let maximumActive = 0;
    dependencies.extractClaimCandidates = async (bundle) => {
      calls.extracted.push(bundle.companyId);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return [];
    };

    const result = await buildInvestmentBriefs(input, dependencies);

    expect(result.status).toBe("completed");
    expect(result.evaluations).toHaveLength(50);
    expect(result.ranking).toHaveLength(50);
    expect(calls.extracted).toHaveLength(50);
    expect(maximumActive).toBe(4);
  });

  it("provides the reviewed thesis to every claim-extraction task", async () => {
    const { input, dependencies } = setup(2);
    const received: unknown[] = [];
    dependencies.extractClaimCandidates = (async (...args: unknown[]) => {
      received.push(args[1]);
      return [];
    }) as BuildInvestmentBriefsDependencies["extractClaimCandidates"];

    await buildInvestmentBriefs(input, dependencies);

    expect(received).toEqual([thesis, thesis]);
  });

  it("drafts only the default top three plus explicitly requested companies", async () => {
    const { input, dependencies, calls } = setup(10);

    const result = await buildInvestmentBriefs(
      { ...input, requestedCompanyIds: ["company-09", "company-01"] },
      dependencies,
    );

    expect(result.ranking.slice(0, 3).map(({ evaluation }) => evaluation.companyId)).toEqual([
      "company-00",
      "company-01",
      "company-02",
    ]);
    expect(calls.drafted).toEqual(["company-00", "company-01", "company-02", "company-09"]);
    expect(result.briefs.map((item) => item.companyId)).toEqual(calls.drafted);
  });

  it("provides only public evidence to brief drafting", async () => {
    const { input, dependencies } = setup(1);
    let visibilities: string[] = [];
    dependencies.draftInvestmentBrief = async ({ bundle, evaluation }) => {
      visibilities = bundle.evidence.map(({ visibility }) => visibility);
      return brief(bundle, evaluation);
    };

    await buildInvestmentBriefs(input, dependencies);

    expect(visibilities).toEqual([]);
  });

  it("honors a requested top count without skipping evaluation of lower-ranked companies", async () => {
    const { input, dependencies, calls } = setup(10);

    const result = await buildInvestmentBriefs({ ...input, top: 1 }, dependencies);

    expect(result.evaluations).toHaveLength(10);
    expect(calls.extracted).toHaveLength(10);
    expect(calls.drafted).toEqual(["company-00"]);
  });

  it("isolates and types one-company extraction failures without cancelling evaluation", async () => {
    const { input, dependencies } = setup(4);
    const extract = dependencies.extractClaimCandidates;
    dependencies.extractClaimCandidates = async (bundle, reviewedThesis) => {
      if (bundle.companyId === "company-01") throw new Error("provider unavailable");
      return extract(bundle, reviewedThesis);
    };

    const result = await buildInvestmentBriefs(input, dependencies);

    expect(result.status).toBe("partial");
    expect(result.evaluations).toHaveLength(4);
    expect(result.failures).toContainEqual({
      companyId: "company-01",
      stage: "extract_claim_candidates",
      message: "provider unavailable",
    });
  });

  it("excludes invalid briefs and surfaces their citation errors", async () => {
    const { input, dependencies } = setup(1);
    dependencies.draftInvestmentBrief = async ({ bundle, evaluation }) => ({
      ...brief(bundle, evaluation),
      summary: [{ text: "Uncited company fact", statementKind: "fact", evidenceIds: [] }],
    });

    const result = await buildInvestmentBriefs(input, dependencies);

    expect(result.status).toBe("partial");
    expect(result.briefs).toEqual([]);
    expect(result.failures).toEqual([{
      companyId: "company-00",
      stage: "validate_brief_citations",
      message: "fact_missing_citation:summary:0",
    }]);
  });

  it("uses a reviewed thesis without reparsing it", async () => {
    const { input, dependencies, calls } = setup(1);

    const result = await buildInvestmentBriefs({ ...input, thesis }, dependencies);

    expect(result.thesis).toEqual(thesis);
    expect(calls.parsed).toBe(0);
  });
});

describe("investment brief CLI", () => {
  const requiredArgs = [
    "--companies", "companies.csv",
    "--enrichment", "enrichment.json",
    "--thesis", "US software",
    "--output", "briefs.json",
  ];

  it("strictly parses supported arguments and defaults top to three", () => {
    expect(parseBriefCliArgs(requiredArgs)).toEqual({
      companies: "companies.csv",
      enrichment: "enrichment.json",
      thesis: "US software",
      thesisFile: undefined,
      acceptParsedThesis: false,
      top: 3,
      output: "briefs.json",
    });
  });

  it.each([
    { args: [...requiredArgs, "--unknown"] },
    { args: ["--companies", "--enrichment", "data.json", "--thesis", "x", "--output", "out.json"] },
    { args: [...requiredArgs, "--top", "0"] },
    { args: [...requiredArgs, "--top", "1.5"] },
    { args: [...requiredArgs, "--thesis-file", "thesis.json"] },
  ])("rejects invalid argument combinations with usage text", ({ args }) => {
    expect(() => parseBriefCliArgs(args)).toThrow(BriefCliUsageError);
    expect(() => parseBriefCliArgs(args)).toThrow(/Usage:/);
  });

  it("writes the parsed thesis artifact and performs no company analysis before confirmation", async () => {
    const writes: Array<{ path: string; contents: string }> = [];
    const renames: Array<{ source: string; destination: string }> = [];
    let extractionCalls = 0;
    const result = await runBriefCli(requiredArgs, {
      cwd: "C:\\demo",
      readFile: async (path) => path.endsWith("companies.csv")
        ? "Name,Description,Primary Industry,Size,Type,Location,Country,Domain,LinkedIn URL\nAcme,Software,Software,1-10,Private,New York,US,acme.test,"
        : JSON.stringify({ results: [] }),
      writeFile: async (path, contents) => { writes.push({ path, contents }); },
      mkdir: async () => undefined,
      realpath: async (path) => path,
      rename: async (source, destination) => { renames.push({ source, destination }); },
      removeFile: async () => undefined,
      structuredTasks: {
        now: () => new Date(generatedAt),
        parseThesis: async () => thesis,
        extractClaimCandidates: async () => { extractionCalls += 1; return []; },
        draftInvestmentBrief: async ({ bundle, evaluation }) => brief(bundle, evaluation),
      },
    });

    expect(result.status).toBe("awaiting_thesis_confirmation");
    expect(extractionCalls).toBe(0);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toMatch(/\.tmp$/);
    expect(writes[0]!.contents).toBe(`${JSON.stringify(thesis, null, 2)}\n`);
    expect(renames).toEqual([{
      source: writes[0]!.path,
      destination: "C:\\demo\\briefs.thesis.json",
    }]);
  });
});
