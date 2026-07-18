import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { buildImportBatch, enrichCompany, parseClayCsv } from "../src/index.js";
import type { CompanyEnrichmentResult } from "../src/index.js";

const positionals = process.argv.slice(2).filter((value, index, values) => !value.startsWith("--") && !values[index - 1]?.startsWith("--"));

function option(name: string, fallback: string, position: number): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : positionals[position] ?? fallback;
}

const input = resolve(process.cwd(), option("--input", "../../data/source/clay-us-uk-early-software.csv", 0));
const output = resolve(process.cwd(), option("--output", "../../data/enriched/company-web-profiles.json", 1));
const maxCompanies = Math.max(1, Number(option("--max-companies", "50", 2)) || 50);
const concurrency = Math.min(4, Math.max(1, Number(option("--concurrency", "4", 3)) || 4));

const csv = await readFile(input, "utf8");
const companies = buildImportBatch(parseClayCsv(csv)).companies.slice(0, maxCompanies);
const results: CompanyEnrichmentResult[] = new Array(companies.length);
let cursor = 0;

async function worker(): Promise<void> {
  while (cursor < companies.length) {
    const index = cursor++;
    const company = companies[index];
    if (!company) continue;
    console.log(`[${index + 1}/${companies.length}] ${company.name}`);
    results[index] = await enrichCompany(company);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
const completed = results.filter(Boolean);
const summary = {
  generatedAt: new Date().toISOString(),
  source: relative(resolve(process.cwd(), "../.."), input).replaceAll("\\", "/"),
  total: completed.length,
  status: {
    complete: completed.filter((result) => result.status === "complete").length,
    partial: completed.filter((result) => result.status === "partial").length,
    failed: completed.filter((result) => result.status === "failed").length,
  },
  evidence: {
    pages: completed.reduce((sum, result) => sum + result.pages.length, 0),
    founderCandidates: completed.reduce((sum, result) => sum + (result.profile?.founderCandidates.length ?? 0), 0),
    linkedInLinks: completed.reduce((sum, result) => sum + (result.profile?.socialLinks.linkedIn.length ?? 0), 0),
    githubProfiles: completed.reduce((sum, result) => sum + result.github.length, 0),
    githubProfilesResolved: completed.reduce((sum, result) => sum + result.github.filter((profile) => profile.status === "ok").length, 0),
  },
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ generatedAt: summary.generatedAt, results: completed }, null, 2)}\n`);
const summaryPath = output.replace(/\.json$/i, "-summary.json");
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
