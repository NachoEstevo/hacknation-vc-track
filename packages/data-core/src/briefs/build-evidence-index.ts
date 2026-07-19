import { createHash } from "node:crypto";
import type { CompanyEnrichmentResult, GitHubEvidence } from "../enrichment/types";
import type { StableCompanySeed } from "../types";
import type { CompanyEvidenceBundle, EvidenceRecord } from "./types";

const UNKNOWN_CAPTURE_TIME = "1970-01-01T00:00:00.000Z";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function createEvidenceId(
  companyId: string,
  sourceType: EvidenceRecord["sourceType"],
  sourceUrl: string | null,
  contentHashInput: unknown,
): string {
  return createHash("sha256")
    .update(`${companyId}|${sourceType}|${sourceUrl ?? ""}|${stableJson(contentHashInput)}`)
    .digest("hex")
    .slice(0, 24);
}

function createEvidence(
  companyId: string,
  sourceType: EvidenceRecord["sourceType"],
  sourceUrl: string | null,
  capturedAt: string,
  excerpt: string | null,
  payload: Record<string, unknown> | null,
  verificationState: EvidenceRecord["verificationState"],
  visibility: EvidenceRecord["visibility"],
): EvidenceRecord {
  return {
    evidenceId: createEvidenceId(companyId, sourceType, sourceUrl, payload ?? excerpt),
    companyId,
    sourceType,
    sourceUrl,
    snapshotPath: null,
    capturedAt,
    excerpt,
    payload,
    verificationState,
    visibility,
  };
}

function clayPayload(company: StableCompanySeed): Record<string, unknown> {
  return {
    name: company.name,
    description: company.description,
    primaryIndustry: company.primaryIndustry,
    sizeBand: company.sizeBand,
    organizationType: company.organizationType,
    location: company.location,
    countryCode: company.countryCode,
    domain: company.domain,
    linkedInUrl: company.linkedInUrl,
    sourceRowNumber: company.source.rowNumber,
  };
}

function websitePayload(enrichment: CompanyEnrichmentResult): Record<string, unknown> | null {
  if (!enrichment.profile) return null;
  return {
    name: enrichment.profile.name,
    description: enrichment.profile.description,
    socialLinks: enrichment.profile.socialLinks,
    signalLinks: enrichment.profile.signalLinks,
    founderCandidates: enrichment.profile.founderCandidates,
  };
}

function githubPayload(github: GitHubEvidence): Record<string, unknown> {
  return {
    accountType: github.accountType ?? null,
    login: github.login ?? null,
    publicRepos: github.publicRepos ?? null,
    followers: github.followers ?? null,
    createdAt: github.createdAt ?? null,
    latestPushAt: github.latestPushAt ?? null,
    latestRepositoryUpdateAt: github.latestRepositoryUpdateAt ?? null,
    totalStarsSampled: github.totalStarsSampled ?? null,
    note: github.note,
  };
}

function hostname(value: string): string | null {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(/^www\./iu, "").toLocaleLowerCase("en-US");
  } catch {
    return null;
  }
}

function identityTokens(value: string): Set<string> {
  return new Set(value.normalize("NFKD").toLocaleLowerCase("en-US").match(/[\p{L}\d]+/gu)
    ?.filter((token) => token.length >= 3 && !["company", "business", "limited", "group"].includes(token)) ?? []);
}

function publicIdentityMatches(company: StableCompanySeed, enrichment: CompanyEnrichmentResult): boolean {
  if (!company.domain || !enrichment.profile || !enrichment.pages[0]?.url) return true;
  const expectedHost = hostname(company.domain);
  const resolvedHost = hostname(enrichment.pages[0].url);
  const domainMatches = expectedHost !== null && resolvedHost !== null
    && (expectedHost === resolvedHost || expectedHost.endsWith(`.${resolvedHost}`) || resolvedHost.endsWith(`.${expectedHost}`));
  const companyTokens = identityTokens(company.name);
  const nameMatches = enrichment.profile.name !== null
    && [...identityTokens(enrichment.profile.name)].some((token) => companyTokens.has(token));
  return domainMatches || nameMatches;
}

export function buildEvidenceIndex(
  companies: StableCompanySeed[],
  enrichments: CompanyEnrichmentResult[],
): CompanyEvidenceBundle[] {
  const enrichmentByCompanyId = new Map(enrichments.map((enrichment) => [enrichment.stableId, enrichment]));

  return companies.map((company) => {
    const enrichment = enrichmentByCompanyId.get(company.stableId);
    const publicEnrichment = enrichment && publicIdentityMatches(company, enrichment) ? enrichment : undefined;
    const capturedAt = enrichment?.capturedAt ?? UNKNOWN_CAPTURE_TIME;
    const evidence: EvidenceRecord[] = [createEvidence(
      company.stableId,
      "clay_csv",
      null,
      capturedAt,
      company.description,
      clayPayload(company),
      "unverified",
      "investor_private",
    )];
    const profilePayload = publicEnrichment ? websitePayload(publicEnrichment) : null;

    if (publicEnrichment?.profile && profilePayload) {
      evidence.push(createEvidence(
        company.stableId,
        "company_website",
        publicEnrichment.pages[0]?.url ?? null,
        publicEnrichment.capturedAt,
        publicEnrichment.profile.description,
        profilePayload,
        "candidate_only",
        "public",
      ));
    }

    if (publicEnrichment) {
      for (const github of publicEnrichment.github) {
        if (github.status !== "ok") continue;
        evidence.push(createEvidence(
          company.stableId,
          "github_public",
          github.sourceUrl,
          publicEnrichment.capturedAt,
          github.note,
          githubPayload(github),
          "verified",
          "public",
        ));
      }
    }

    return {
      companyId: company.stableId,
      companyName: company.name,
      normalizedCompany: company,
      evidence,
    };
  });
}
