import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BriefCliUsageError,
  createStructuredTasks,
  runBriefCli,
  type BriefCliRuntime,
} from "../scripts/build-investment-briefs.js";
import type { FundThesis } from "../src/briefs/types.js";

const generatedAt = "2026-07-18T22:00:00.000Z";
const validCsv = [
  "Name,Description,Primary Industry,Size,Type,Location,Country,Domain,LinkedIn URL",
  "Acme,Workflow software,Software,1-10,Private,New York,US,acme.test,",
].join("\n");
const thesis: FundThesis = {
  thesisId: "thesis-1",
  originalQuery: "US software",
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

const baseArgs = [
  "--companies", "companies.csv",
  "--enrichment", "enrichment.json",
  "--thesis", thesis.originalQuery,
  "--output", "briefs.json",
];

interface FileEvent {
  operation: "write" | "rename" | "remove";
  path: string;
  destination?: string;
}

function setupRuntime(csv = validCsv): {
  runtime: BriefCliRuntime & {
    rename(source: string, destination: string): Promise<void>;
    removeFile(path: string): Promise<void>;
  };
  events: FileEvent[];
  calls: { reads: number; parsed: number };
} {
  const events: FileEvent[] = [];
  const calls = { reads: 0, parsed: 0 };
  return {
    events,
    calls,
    runtime: {
      cwd: "/demo",
      readFile: async (path) => {
        calls.reads += 1;
        return path.toLocaleLowerCase().endsWith(".csv") ? csv : JSON.stringify({ results: [] });
      },
      writeFile: async (path) => { events.push({ operation: "write", path }); },
      mkdir: async () => undefined,
      realpath: async (path) => path,
      rename: async (path, destination) => { events.push({ operation: "rename", path, destination }); },
      removeFile: async (path) => { events.push({ operation: "remove", path }); },
      structuredTasks: {
        now: () => new Date(generatedAt),
        parseThesis: async () => { calls.parsed += 1; return thesis; },
        extractClaimCandidates: async () => [],
        draftInvestmentBrief: async () => { throw new Error("not reached"); },
      },
    },
  };
}

describe("investment brief CLI filesystem safety", () => {
  it.each([
    { label: "companies", args: [...baseArgs.slice(0, -1), "COMPANIES.CSV"] },
    { label: "normalized companies path", args: [...baseArgs.slice(0, -1), "nested/../companies.csv"] },
    { label: "enrichment", args: [...baseArgs.slice(0, -1), "ENRICHMENT.JSON"] },
    {
      label: "derived thesis artifact",
      args: [
        "--companies", "briefs.json.thesis.json",
        "--enrichment", "enrichment.json",
        "--thesis", thesis.originalQuery,
        "--output", "briefs.json",
      ],
    },
    {
      label: "thesis file",
      args: [
        "--companies", "companies.csv",
        "--enrichment", "enrichment.json",
        "--thesis-file", "reviewed-thesis.json",
        "--output", "REVIEWED-THESIS.JSON",
      ],
    },
  ])("rejects case-insensitive output collision with $label", async ({ args }) => {
    const { runtime, calls } = setupRuntime();

    await expect(runBriefCli(args, runtime)).rejects.toBeInstanceOf(BriefCliUsageError);
    expect(calls.reads).toBe(0);
    expect(calls.parsed).toBe(0);
  });

  it("writes through a temporary file in the destination directory then renames", async () => {
    const { runtime, events } = setupRuntime();
    const destination = resolve(runtime.cwd, "briefs.json.thesis.json");

    await runBriefCli(baseArgs, runtime);

    expect(events).toHaveLength(2);
    expect(events[0]!.operation).toBe("write");
    expect(dirname(events[0]!.path)).toBe(dirname(destination));
    expect(events[0]!.path).not.toBe(destination);
    expect(events[0]!.path).toMatch(/\.tmp$/);
    expect(events[1]).toEqual({
      operation: "rename",
      path: events[0]!.path,
      destination,
    });
  });

  it("removes the temporary file when atomic replacement fails", async () => {
    const { runtime, events } = setupRuntime();
    runtime.rename = async (path, destination) => {
      events.push({ operation: "rename", path, destination });
      throw new Error("rename failed");
    };

    await expect(runBriefCli(baseArgs, runtime)).rejects.toThrow("rename failed");

    expect(events.map(({ operation }) => operation)).toEqual(["write", "rename", "remove"]);
    expect(events[2]!.path).toBe(events[0]!.path);
  });
});

describe("investment brief CLI empty imports", () => {
  it.each([
    { label: "header-only", csv: validCsv.split("\n")[0]! },
    { label: "fully quarantined", csv: "Name,Country,Domain\n,," },
  ])("rejects a $label CSV before OpenAI or output writes", async ({ csv }) => {
    const { runtime, calls, events } = setupRuntime(csv);

    await expect(runBriefCli(baseArgs, runtime)).rejects.toThrow("No accepted companies");
    expect(calls.parsed).toBe(0);
    expect(events).toEqual([]);
  });
});

describe("investment brief CLI confirmed run", () => {
  it("uses real config-backed tasks, isolates a draft failure, and persists only the safe artifact", async () => {
    const apiKeySentinel = "sk-CONFIG_SENTINEL_DO_NOT_PERSIST";
    const rawCsvSentinel = "RAW_CSV_SENTINEL_DO_NOT_PERSIST";
    const csv = [
      "Name,Description,Primary Industry,Size,Type,Location,Country,Domain,Investor Secret",
      `Acme,Workflow software,Software,1-10,Private,New York,US,acme.test,${rawCsvSentinel}`,
      `Beta,Workflow software,Software,1-10,Private,Boston,US,beta.test,${rawCsvSentinel}`,
    ].join("\n");
    let responseCalls = 0;
    const structuredTasks = createStructuredTasks(
      { OPENAI_API_KEY: apiKeySentinel },
      async (request) => {
        responseCalls += 1;
        const format = request.text?.format;
        const name = format && "name" in format ? format.name : undefined;
        if (name === "claim_candidates") return { output_text: JSON.stringify({ candidates: [] }) };
        if (name === "investment_brief" && String(request.input).includes("Beta")) {
          throw new Error(`provider failed with ${apiKeySentinel}`);
        }
        return {
          output_text: JSON.stringify({
            summary: [], strengths: [], risks: [], evidenceGaps: [], diligenceQuestions: [],
          }),
        };
      },
    );
    const writes: Array<{ path: string; contents: string }> = [];
    const renames: Array<{ source: string; destination: string }> = [];
    const runtime: BriefCliRuntime = {
      cwd: "/demo",
      readFile: async (path) => {
        if (path.endsWith("companies.csv")) return csv;
        if (path.endsWith("thesis.json")) return JSON.stringify(thesis);
        return JSON.stringify({ results: [] });
      },
      writeFile: async (path, contents) => { writes.push({ path, contents }); },
      mkdir: async () => undefined,
      realpath: async (path) => path,
      rename: async (source, destination) => { renames.push({ source, destination }); },
      removeFile: async () => undefined,
      structuredTasks,
    };

    const run = await runBriefCli([
      "--companies", "companies.csv",
      "--enrichment", "enrichment.json",
      "--thesis-file", "thesis.json",
      "--accept-parsed-thesis",
      "--output", "briefs.json",
    ], runtime);

    expect(responseCalls).toBe(4);
    expect(run.status).toBe("partial");
    expect(run.evaluations).toHaveLength(2);
    expect(run.briefs).toHaveLength(1);
    expect(run.failures).toHaveLength(1);
    expect(writes).toHaveLength(1);
    expect(renames).toEqual([{
      source: writes[0]!.path,
      destination: resolve(runtime.cwd, "briefs.json"),
    }]);
    const persisted = JSON.parse(writes[0]!.contents) as Record<string, unknown>;
    const serialized = JSON.stringify(persisted);
    expect(serialized).not.toContain(apiKeySentinel);
    expect(serialized).not.toContain(rawCsvSentinel);
    expect(persisted).toMatchObject({
      status: "partial",
      failures: [{
        stage: "draft_investment_brief",
        message: "Investment brief drafting failed",
      }],
    });
  });
});
