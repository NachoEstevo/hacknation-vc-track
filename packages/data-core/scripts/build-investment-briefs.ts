import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildImportBatch,
  buildInvestmentBriefs,
  createOpenAIResponse,
  draftInvestmentBrief,
  extractClaimCandidates,
  loadOpenAIConfig,
  parseClayCsv,
  parseThesis,
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

  for (let index = 0; index < argv.length; index += 1) {
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
  structuredTasks: BuildInvestmentBriefsDependencies;
}

function parseEnrichments(value: string): CompanyEnrichmentResult[] {
  const parsed: unknown = JSON.parse(value);
  if (Array.isArray(parsed)) return parsed as CompanyEnrichmentResult[];
  if (typeof parsed === "object" && parsed !== null && "results" in parsed && Array.isArray(parsed.results)) {
    return parsed.results as CompanyEnrichmentResult[];
  }
  throw new Error("Enrichment JSON must be an array or an object containing results");
}

export async function runBriefCli(
  argv: string[],
  runtime: BriefCliRuntime,
): Promise<InvestmentBriefRun> {
  const args = parseBriefCliArgs(argv);
  const companiesPath = resolve(runtime.cwd, args.companies);
  const enrichmentPath = resolve(runtime.cwd, args.enrichment);
  const outputPath = resolve(runtime.cwd, args.output);
  const [companiesCsv, enrichmentJson, thesis] = await Promise.all([
    runtime.readFile(companiesPath),
    runtime.readFile(enrichmentPath),
    args.thesisFile
      ? runtime.readFile(resolve(runtime.cwd, args.thesisFile)).then((value) => JSON.parse(value) as FundThesis)
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
  const destination = run.status === "awaiting_thesis_confirmation"
    ? `${outputPath}.thesis.json`
    : outputPath;
  const output = run.status === "awaiting_thesis_confirmation" ? run.thesis : run;
  await runtime.mkdir(dirname(destination));
  await runtime.writeFile(destination, `${JSON.stringify(output, null, 2)}\n`);
  return run;
}

function createStructuredTasks(env: Record<string, string | undefined>): BuildInvestmentBriefsDependencies {
  let tasks: OpenAIStructuredTaskDependencies | undefined;
  function configuredTasks(): OpenAIStructuredTaskDependencies {
    if (!tasks) {
      const config = loadOpenAIConfig(env);
      tasks = { config, createResponse: createOpenAIResponse(config) };
    }
    return tasks;
  }
  return {
    parseThesis: (query) => parseThesis(query, configuredTasks()),
    extractClaimCandidates: (bundle) => extractClaimCandidates(bundle, configuredTasks()),
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
    structuredTasks: createStructuredTasks(process.env),
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(safeMessage(error, process.env.OPENAI_API_KEY));
    process.exitCode = 1;
  });
}
