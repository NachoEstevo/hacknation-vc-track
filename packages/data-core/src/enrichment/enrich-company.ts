import type { StableCompanySeed } from "../types";
import { discoverCompanyPages } from "../web/discover-company-pages";
import { fetchPublicPage } from "../web/fetch-public-page";
import type { FetchPageResult } from "../web/types";
import { enrichGitHubProfile } from "./enrich-github-profile";
import { extractCompanyProfile } from "./extract-company-profile";
import type { CompanyEnrichmentResult, GitHubEvidence } from "./types";

interface Dependencies {
  fetchPage?: (url: URL) => Promise<FetchPageResult>;
  enrichGitHub?: (url: string) => Promise<GitHubEvidence>;
  now?: () => string;
}

export async function enrichCompany(
  company: StableCompanySeed,
  dependencies: Dependencies = {},
): Promise<CompanyEnrichmentResult> {
  const capturedAt = dependencies.now?.() ?? new Date().toISOString();
  if (!company.domain) {
    return { stableId: company.stableId, name: company.name, domain: null, status: "failed", capturedAt, pages: [], failures: [{ url: "", reason: "missing_domain" }], profile: null, github: [] };
  }
  const fetchPage = dependencies.fetchPage ?? ((url: URL) => fetchPublicPage(url));
  const pages = [];
  const failures = [];
  const homeUrl = new URL(`https://${company.domain}/`);
  const homeResult = await fetchPage(homeUrl);
  if (homeResult.page) pages.push(homeResult.page);
  if (homeResult.failure) failures.push(homeResult.failure);
  if (homeResult.page) {
    for (const pageUrl of discoverCompanyPages(homeResult.page.html, new URL(homeResult.page.url))) {
      const result = await fetchPage(new URL(pageUrl));
      if (result.page) pages.push(result.page);
      if (result.failure) failures.push(result.failure);
    }
  }
  const profile = pages.length ? extractCompanyProfile(pages) : null;
  const enrichGitHub = dependencies.enrichGitHub ?? ((url: string) => enrichGitHubProfile(url, { token: process.env.GITHUB_TOKEN }));
  const github: GitHubEvidence[] = [];
  for (const url of profile?.socialLinks.github.slice(0, 2) ?? []) github.push(await enrichGitHub(url));
  const status = pages.length === 0 ? "failed" : failures.length ? "partial" : "complete";
  return {
    stableId: company.stableId,
    name: company.name,
    domain: company.domain,
    status,
    capturedAt,
    pages: pages.map(({ url, status: pageStatus }) => ({ url, status: pageStatus })),
    failures,
    profile,
    github,
  };
}
