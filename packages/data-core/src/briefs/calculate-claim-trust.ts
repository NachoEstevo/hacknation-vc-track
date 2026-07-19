import { createHash } from "node:crypto";
import type { ClaimTrustBreakdown, EvidenceRecord } from "./types.js";

const SOURCE_POINTS: Record<EvidenceRecord["sourceType"], number> = {
  stripe_private: 40,
  founder_document: 40,
  company_website: 30,
  github_public: 30,
  clay_csv: 20,
  founder_assertion: 20,
};

const DIRECTNESS_POINTS: Record<EvidenceRecord["sourceType"], number> = {
  stripe_private: 25,
  founder_document: 25,
  company_website: 18,
  founder_assertion: 18,
  github_public: 8,
  clay_csv: 8,
};

export interface CalculateClaimTrustInput {
  supportingEvidence: EvidenceRecord[];
  contradictingEvidence: EvidenceRecord[];
  evaluatedAt: string;
}

function calculateRecency(capturedAt: string, evaluatedAt: string): number {
  const ageInDays = (Date.parse(evaluatedAt) - Date.parse(capturedAt)) / 86_400_000;
  if (!Number.isFinite(ageInDays) || ageInDays < 0) return 0;
  if (ageInDays <= 30) return 15;
  if (ageInDays <= 180) return 10;
  if (ageInDays <= 365) return 5;
  return 0;
}

function normalizedHost(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;
  try {
    return new URL(sourceUrl).hostname.toLocaleLowerCase("en-US").replace(/^www\./u, "");
  } catch {
    return null;
  }
}

function sourceAuthority(record: EvidenceRecord): string {
  const host = normalizedHost(record.sourceUrl);
  if (record.sourceType === "company_website") return `website:${host ?? record.companyId}`;
  if (record.sourceType === "github_public") {
    try {
      const owner = record.sourceUrl ? new URL(record.sourceUrl).pathname.split("/").filter(Boolean)[0] : null;
      return `github:${owner?.toLocaleLowerCase("en-US") ?? record.companyId}`;
    } catch {
      return `github:${record.companyId}`;
    }
  }
  return `${record.sourceType}:${host ?? record.companyId}`;
}

function evidenceContent(record: EvidenceRecord): string {
  return `${record.excerpt ?? ""}|${record.payload === null ? "" : JSON.stringify(record.payload)}`
    .trim().toLocaleLowerCase("en-US").replace(/\s+/gu, " ");
}

function independentAuthorityCount(records: EvidenceRecord[]): number {
  const contentHashes = new Set<string>();
  const authorities = new Set<string>();
  for (const record of records) {
    const content = evidenceContent(record);
    const hash = createHash("sha256").update(content || record.evidenceId).digest("hex");
    if (contentHashes.has(hash)) continue;
    contentHashes.add(hash);
    authorities.add(sourceAuthority(record));
  }
  return authorities.size;
}

export function calculateClaimTrust(input: CalculateClaimTrustInput): ClaimTrustBreakdown {
  const sourceReliability = Math.max(0, ...input.supportingEvidence.map((item) => SOURCE_POINTS[item.sourceType]));
  const directness = Math.max(0, ...input.supportingEvidence.map((item) => DIRECTNESS_POINTS[item.sourceType]));
  const authorityCount = independentAuthorityCount(input.supportingEvidence);
  const corroboration = authorityCount >= 3 ? 20 : authorityCount === 2 ? 10 : 0;
  const recency = Math.max(
    0,
    ...input.supportingEvidence.map((item) => calculateRecency(item.capturedAt, input.evaluatedAt)),
  );
  const total = sourceReliability + directness + corroboration + recency;
  const state = input.contradictingEvidence.length > 0
    ? "conflicted"
    : total >= 70 ? "supported" : "unverified";

  return { sourceReliability, directness, corroboration, recency, total, state };
}
