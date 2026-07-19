import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildImportBatch,
  buildInvestmentBriefs,
  createInvestmentBriefSummary,
  createOpenAIResponse,
  draftInvestmentBrief,
  extractClaimCandidates,
  loadOpenAIConfig,
  openAIModelNames,
  parseClayCsv,
  parseThesis,
  toInvestmentBriefArtifact,
  type BuildInvestmentBriefsDependencies,
  type CompanyEnrichmentResult,
  type FundThesis,
  type InvestmentBriefRun,
  type OpenAIStructuredTaskDependencies,
} from "../src/index.js";

export const BRIEF_CLI_USAGE = [
  "Usage: npm run briefs:build --",
  "  --companies <csv> --enrichment <json>",
  "  (--thesis <query> | --thesis-file <json>)",
  "  [--accept-parsed-thesis] [--top <positive-integer>] --output <json>",
].join(" ");

export class BriefCliUsageError extends Error {
  constructor(message: string) {
    super(`${message}\n${BRIEF_CLI_USAGE}`);
    this.name = "BriefCliUsageError";
  }
}

export interface BriefCliArgs {
  companies: string;
  enrichment: string;
  thesis: string | undefined;
  thesisFile: string | undefined;
  acceptParsedThesis: boolean;
  top: number;
  output: string;
}

const VALUE_FLAGS: ReadonlyMap<string, string> = new Map([
  ["--companies", "companies"],
  ["--enrichment", "enrichment"],
  ["--thesis", "thesis"],
  ["--thesis-file", "thesisFile"],
  ["--top", "top"],
  ["--output", "output"],
]);

export function parseBriefCliArgs(argv: string[]): BriefCliArgs {
  const values = new Map<string, string>();
  let acceptParsedThesis = false;

  for (let index = argv[0] === "--" ? 1 : 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    if (flag === "--accept-parsed-thesis") {
      if (acceptParsedThesis) throw new BriefCliUsageError(`Duplicate flag: ${flag}`);
      acceptParsedThesis = true;
      continue;
    }
    const field = VALUE_FLAGS.get(flag);
    if (!field) throw new BriefCliUsageError(`Unknown flag: ${flag}`);
    if (values.has(field)) throw new BriefCliUsageError(`Duplicate flag: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new BriefCliUsageError(`Missing value for ${flag}`);
    values.set(field, value);
    index += 1;
  }

  for (const field of ["companies", "enrichment", "output"]) {
    if (!values.has(field)) throw new BriefCliUsageError(`Missing required --${field}`);
  }
  const thesis = values.get("thesis");
  const thesisFile = values.get("thesisFile");
  if (!thesis && !thesisFile) throw new BriefCliUsageError("Provide --thesis or --thesis-file");
  if (thesis && thesisFile) throw new BriefCliUsageError("Use only one of --thesis or --thesis-file");
  const topValue = values.get("top") ?? "3";
  const top = Number(topValue);
  if (!Number.isInteger(top) || top < 1) throw new BriefCliUsageError("--top must be a positive integer");

  return {
    companies: values.get("companies")!,
    enrichment: values.get("enrichment")!,
    thesis,
    thesisFile,
    acceptParsedThesis,
    top,
    output: values.get("output")!,
  };
}

export interface BriefCliRuntime {
  cwd: string;
  readFile(path: string): Promise<string>;
  writeFile(path: string, contents: string): Promise<void>;
  mkdir(path: string): Promise<unknown>;
  realpath(path: string): Promise<string>;
  rename(source: string, destination: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  structuredTasks: BuildInvestmentBriefsDependencies;
  modelNames?: { extraction: string; brief: string };
}

function parseEnrichments(value: string): CompanyEnrichmentResult[] {
  const parsed: unknown = JSON.parse(value);
  if (Array.isArray(parsed)) return parsed as CompanyEnrichmentResult[];
  if (typeof parsed === "object" && parsed !== null && "results" in parsed && Array.isArray(parsed.results)) {
    return parsed.results as CompanyEnrichmentResult[];
  }
  throw new Error("Enrichment JSON must be an array or an object containing results");
}

function canonicalPath(path: string): string {
  return path.replaceAll("\\", "/").toLocaleLowerCase("en-US");
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function canonicalTarget(path: string, runtime: BriefCliRuntime): Promise<string> {
  try {
    return await runtime.realpath(path);
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }

  const missingSegments: string[] = [];
  let cursor = path;
  while (true) {
    missingSegments.unshift(basename(cursor));
    const parent = dirname(cursor);
    try {
      return join(await runtime.realpath(parent), ...missingSegments);
    } catch (error) {
      if (!isMissingPath(error) || parent === cursor) throw error;
      cursor = parent;
    }
  }
}

interface CanonicalCliPaths {
  companies: string;
  enrichment: string;
  thesisFile: string | undefined;
  output: string;
  thesisOutput: string;
  summaryOutput: string;
}

function derivedJsonPath(output: string, suffix: string, separator = "."): string {
  const extension = extname(output);
  return extension.toLocaleLowerCase("en-US") === ".json"
    ? `${output.slice(0, -extension.length)}${separator}${suffix}.json`
    : `${output}${separator}${suffix}.json`;
}

async function canonicalizeCliPaths(
  args: BriefCliArgs,
  runtime: BriefCliRuntime,
): Promise<CanonicalCliPaths> {
  const companies = await runtime.realpath(resolve(runtime.cwd, args.companies));
  const enrichment = await runtime.realpath(resolve(runtime.cwd, args.enrichment));
  const thesisFile = args.thesisFile
    ? await runtime.realpath(resolve(runtime.cwd, args.thesisFile))
    : undefined;
  const requestedOutput = resolve(runtime.cwd, args.output);
  const output = await canonicalTarget(requestedOutput, runtime);
  const thesisOutput = await canonicalTarget(derivedJsonPath(requestedOutput, "thesis"), runtime);
  const summaryOutput = await canonicalTarget(derivedJsonPath(requestedOutput, "summary", "-"), runtime);
  const inputs = [companies, enrichment, thesisFile]
    .filter((path): path is string => path !== undefined)
    .map(canonicalPath);
  const destinations = args.acceptParsedThesis ? [output, summaryOutput] : [output, thesisOutput];
  if (destinations.some((path) => inputs.includes(canonicalPath(path)))) {
    throw new BriefCliUsageError("--output must not overwrite an input file");
  }
  return { companies, enrichment, thesisFile, output, thesisOutput, summaryOutput };
}

async function atomicWrite(
  destination: string,
  contents: string,
  runtime: BriefCliRuntime,
): Promise<void> {
  const directory = dirname(destination);
  const temporary = join(directory, `.${basename(destination)}.${randomUUID()}.tmp`);
  await runtime.mkdir(directory);
  try {
    await runtime.writeFile(temporary, contents);
    await runtime.rename(temporary, destination);
  } catch (error) {
    try {
      await runtime.removeFile(temporary);
    } catch {
      // The temporary file may not exist if its creation failed.
    }
    throw error;
  }
}

export async function runBriefCli(
  argv: string[],
  runtime: BriefCliRuntime,
): Promise<InvestmentBriefRun> {
  const args = parseBriefCliArgs(argv);
  const paths = await canonicalizeCliPaths(args, runtime);
  const [companiesCsv, enrichmentJson, thesis] = await Promise.all([
    runtime.readFile(paths.companies),
    runtime.readFile(paths.enrichment),
    paths.thesisFile
      ? runtime.readFile(paths.thesisFile).then((value) => JSON.parse(value) as FundThesis)
      : Promise.resolve(args.thesis!),
  ]);
  const companies = buildImportBatch(parseClayCsv(companiesCsv)).companies;
  const run = await buildInvestmentBriefs({
    companies,
    enrichments: parseEnrichments(enrichmentJson),
    thesis,
    thesisConfirmed: args.acceptParsedThesis,
    top: args.top,
  }, runtime.structuredTasks);
  if (run.status === "awaiting_thesis_confirmation") {
    await atomicWrite(paths.thesisOutput, `${JSON.stringify(run.thesis, null, 2)}\n`, runtime);
    return run;
  }
  const artifact = toInvestmentBriefArtifact(run);
  await atomicWrite(paths.output, `${JSON.stringify(artifact, null, 2)}\n`, runtime);
  const summary = createInvestmentBriefSummary(artifact, {
    modelNames: runtime.modelNames ?? { extraction: "unknown", brief: "unknown" },
    requestedBriefs: args.top,
    rankingSeed: basename(paths.companies),
    publishedEvidence: basename(paths.enrichment),
  });
  await atomicWrite(paths.summaryOutput, `${JSON.stringify(summary, null, 2)}\n`, runtime);
  return run;
}

export function createStructuredTasks(
  env: Record<string, string | undefined>,
  injectedCreateResponse?: OpenAIStructuredTaskDependencies["createResponse"],
): BuildInvestmentBriefsDependencies {
  let tasks: OpenAIStructuredTaskDependencies | undefined;
  function configuredTasks(): OpenAIStructuredTaskDependencies {
    if (!tasks) {
      const config = loadOpenAIConfig(env);
      tasks = { config, createResponse: injectedCreateResponse ?? createOpenAIResponse(config) };
    }
    return tasks;
  }
  return {
    parseThesis: (query) => parseThesis(query, configuredTasks()),
    extractClaimCandidates: (bundle, thesis) => extractClaimCandidates(bundle, configuredTasks(), thesis),
    draftInvestmentBrief: (input) => draftInvestmentBrief(input, configuredTasks()),
  };
}

function safeMessage(error: unknown, apiKey: string | undefined): string {
  const message = error instanceof Error ? error.message : String(error);
  return apiKey ? message.replaceAll(apiKey, "[REDACTED]") : message;
}

async function main(): Promise<void> {
  await runBriefCli(process.argv.slice(2), {
    cwd: process.cwd(),
    readFile: (path) => readFile(path, "utf8"),
    writeFile: (path, contents) => writeFile(path, contents, "utf8"),
    mkdir: (path) => mkdir(path, { recursive: true }),
    realpath: (path) => realpath(path),
    rename: (source, destination) => rename(source, destination),
    removeFile: (path) => unlink(path),
    structuredTasks: createStructuredTasks(process.env),
    modelNames: openAIModelNames(process.env),
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(safeMessage(error, process.env.OPENAI_API_KEY));
    process.exitCode = 1;
  });
}
