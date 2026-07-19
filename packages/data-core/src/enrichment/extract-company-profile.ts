import { load } from "cheerio";
import type { CapturedPage } from "../web/types.js";
import type { ExtractedCompanyProfile, FounderWebCandidate } from "./types.js";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  return [];
}

function nodes(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(value)) return value.flatMap(nodes);
  return [record, ...nodes(record["@graph"])];
}

function jsonLd($: ReturnType<typeof load>): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  $("script[type='application/ld+json']").each((_index, element) => {
    try { results.push(...nodes(JSON.parse($(element).text()))); } catch { /* Ignore invalid vendor JSON-LD. */ }
  });
  return results;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function extractCompanyProfile(pages: CapturedPage[]): ExtractedCompanyProfile {
  let name: string | null = null;
  let description: string | null = null;
  const linkedIn: string[] = [];
  const github: string[] = [];
  const x: string[] = [];
  const pricing: string[] = [];
  const changelog: string[] = [];
  const product: string[] = [];
  const founders: FounderWebCandidate[] = [];

  for (const page of pages) {
    const $ = load(page.html);
    description ??= $("meta[name='description']").attr("content")?.trim() || null;
    name ??= $("title").text().trim() || null;
    for (const node of jsonLd($)) {
      const types = strings(node["@type"]);
      if (types.includes("Organization")) {
        name = typeof node.name === "string" ? node.name : name;
        description = typeof node.description === "string" ? node.description : description;
        const founderValues = Array.isArray(node.founder) ? node.founder : node.founder ? [node.founder] : [];
        for (const founder of founderValues) {
          if (!founder || typeof founder !== "object") continue;
          const person = founder as Record<string, unknown>;
          if (typeof person.name !== "string") continue;
          founders.push({
            name: person.name,
            role: typeof person.jobTitle === "string" ? person.jobTitle : "Founder",
            profileUrls: unique([...strings(person.url), ...strings(person.sameAs)]),
            evidenceUrl: page.url,
            extractionMethod: "json_ld",
            state: "candidate_only",
          });
        }
      }
      if (types.includes("Person") && typeof node.name === "string" && /(?:co-?)?founder/i.test(String(node.jobTitle ?? ""))) {
        founders.push({ name: node.name, role: String(node.jobTitle), profileUrls: unique([...strings(node.url), ...strings(node.sameAs)]), evidenceUrl: page.url, extractionMethod: "json_ld", state: "candidate_only" });
      }
    }
    $("a[href]").each((_index, element) => {
      try {
        const url = new URL($(element).attr("href") ?? "", page.url);
        const value = url.toString();
        const host = url.hostname.toLowerCase().replace(/^www\./, "");
        if (host === "linkedin.com") linkedIn.push(value);
        if (host === "github.com" && url.pathname.split("/").filter(Boolean).length === 1) github.push(value);
        if (host === "x.com" || host === "twitter.com") x.push(value);
        const clue = `${url.pathname} ${$(element).text()}`.toLowerCase();
        if (clue.includes("pricing")) pricing.push(value);
        if (/changelog|release notes|updates/.test(clue)) changelog.push(value);
        if (/product|platform|solution/.test(clue) && url.origin === new URL(page.url).origin) product.push(value);
      } catch { /* Ignore malformed links. */ }
    });
  }

  const founderMap = new Map(founders.map((founder) => [`${founder.name}|${founder.evidenceUrl}`, founder]));
  return {
    name,
    description,
    socialLinks: { linkedIn: unique(linkedIn), github: unique(github), x: unique(x) },
    signalLinks: { pricing: unique(pricing), changelog: unique(changelog), product: unique(product) },
    founderCandidates: [...founderMap.values()],
  };
}
