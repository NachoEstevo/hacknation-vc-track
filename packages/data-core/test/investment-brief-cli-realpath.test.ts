import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, type TestContext } from "vitest";
import {
  BriefCliUsageError,
  runBriefCli,
  type BriefCliRuntime,
} from "../scripts/build-investment-briefs.js";
import type { FundThesis } from "../src/briefs/types.js";

const generatedAt = "2026-07-18T22:00:00.000Z";
const validCsv = [
  "Name,Description,Primary Industry,Size,Type,Location,Country,Domain",
  "Acme,Workflow software,Software,1-10,Private,New York,US,acme.test",
].join("\n");
const thesis: FundThesis = {
  thesisId: "thesis-1",
  originalQuery: "US software",
  generatedAt,
  promptVersion: "test-v1",
  criteria: [{
    criterionId: "country", category: "geography", label: "US", requirement: "required",
    weight: 5, operator: "equals", expectedValue: "US",
  }],
};

async function createDirectoryAlias(root: string, context: TestContext): Promise<{
  realDirectory: string;
  aliasDirectory: string;
} | null> {
  const realDirectory = join(root, "real");
  const aliasDirectory = join(root, "alias");
  await mkdir(realDirectory);
  try {
    await symlink(realDirectory, aliasDirectory, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    if (["EACCES", "EPERM", "ENOSYS", "ENOTSUP"].includes(String(code))) {
      context.skip();
      return null;
    }
    throw error;
  }
  return { realDirectory, aliasDirectory };
}

function tasks(): BriefCliRuntime["structuredTasks"] {
  return {
    now: () => new Date(generatedAt),
    parseThesis: async () => thesis,
    extractClaimCandidates: async () => [],
    draftInvestmentBrief: async () => { throw new Error("not reached"); },
  };
}

describe("investment brief CLI real path safety", () => {
  it("rejects an output that aliases an input through a junction or symlink", async (context) => {
    const root = await mkdtemp(join(tmpdir(), "brief-realpath-"));
    try {
      const directories = await createDirectoryAlias(root, context);
      if (!directories) return;
      const companies = join(directories.realDirectory, "companies.csv");
      const enrichment = join(directories.realDirectory, "enrichment.json");
      await Promise.all([writeFile(companies, validCsv), writeFile(enrichment, JSON.stringify({ results: [] }))]);
      let reads = 0;
      const runtime: BriefCliRuntime = {
        cwd: root,
        realpath,
        readFile: async () => { reads += 1; throw new Error("read should not happen"); },
        writeFile: async () => { throw new Error("write should not happen"); },
        mkdir: async () => undefined,
        rename: async () => { throw new Error("rename should not happen"); },
        removeFile: async () => undefined,
        structuredTasks: tasks(),
      };

      await expect(runBriefCli([
        "--companies", join(directories.aliasDirectory, "companies.csv"),
        "--enrichment", enrichment,
        "--thesis", thesis.originalQuery,
        "--output", companies,
      ], runtime)).rejects.toBeInstanceOf(BriefCliUsageError);
      expect(reads).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it("places the atomic temp file in the canonical output parent", async (context) => {
    const root = await mkdtemp(join(tmpdir(), "brief-realpath-"));
    try {
      const directories = await createDirectoryAlias(root, context);
      if (!directories) return;
      const companies = join(directories.realDirectory, "companies.csv");
      const enrichment = join(directories.realDirectory, "enrichment.json");
      await Promise.all([writeFile(companies, validCsv), writeFile(enrichment, JSON.stringify({ results: [] }))]);
      const writes: string[] = [];
      const renames: Array<{ source: string; destination: string }> = [];
      const runtime: BriefCliRuntime = {
        cwd: root,
        realpath,
        readFile: (path) => readFile(path, "utf8"),
        writeFile: async (path) => { writes.push(path); },
        mkdir: async () => undefined,
        rename: async (source, destination) => { renames.push({ source, destination }); },
        removeFile: async () => undefined,
        structuredTasks: tasks(),
      };

      await runBriefCli([
        "--companies", companies,
        "--enrichment", enrichment,
        "--thesis", thesis.originalQuery,
        "--output", join(directories.aliasDirectory, "briefs.json"),
      ], runtime);

      const canonicalParent = await realpath(directories.realDirectory);
      expect(dirname(writes[0]!)).toBe(canonicalParent);
      expect(renames).toEqual([{
        source: writes[0]!,
        destination: join(canonicalParent, "briefs.json.thesis.json"),
      }]);
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
    }
  });
});
