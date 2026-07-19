import type { AssessmentAxis, AssessmentDimension, ClaimCandidate, CompanyEvidenceBundle, EvidenceRecord } from "./types.js";

function payload(record: EvidenceRecord): Record<string, unknown> {
  return record.payload ?? {};
}

function evidenceBySource(bundle: CompanyEvidenceBundle, sourceType: EvidenceRecord["sourceType"]): EvidenceRecord[] {
  return bundle.evidence.filter((record) => record.sourceType === sourceType);
}

function citedSupportedClaims(bundle: CompanyEvidenceBundle, claims: ClaimCandidate[]): ClaimCandidate[] {
  const evidenceIds = new Set(bundle.evidence.map((record) => record.evidenceId));
  return claims
    .filter((claim) => claim.companyId === bundle.companyId && claim.state === "supported" && claim.evidenceIds.some((id) => evidenceIds.has(id)))
    .map((claim) => ({ ...claim, evidenceIds: claim.evidenceIds.filter((id) => evidenceIds.has(id)) }));
}

function dimension(
  dimensionId: string,
  possiblePoints: number,
  known: boolean,
  evidenceIds: string[],
  reason: string,
  points = known ? possiblePoints : 0,
): AssessmentDimension {
  return { dimensionId, points, possiblePoints, known, reason, evidenceIds: [...new Set(evidenceIds)] };
}

function isPositive(value: ClaimCandidate["value"]): boolean {
  if (typeof value === "number") return value > 0;
  if (typeof value === "boolean") return value;
  return value.trim() !== "" && !["0", "no", "none", "false", "unknown"].includes(value.trim().toLocaleLowerCase());
}

function founderIdentity(bundle: CompanyEvidenceBundle): AssessmentDimension {
  const records = evidenceBySource(bundle, "company_website").filter((record) => Array.isArray(payload(record).founderCandidates));
  const ids = records.filter((record) => (payload(record).founderCandidates as unknown[]).length > 0).map((record) => record.evidenceId);
  return dimension("founder_identity", 5, ids.length > 0, ids, ids.length > 0 ? "Named founder candidate is present." : "No named founder candidate is evidenced.");
}

function founderProof(bundle: CompanyEvidenceBundle): AssessmentDimension {
  const ids = bundle.evidence
    .filter((record) => record.sourceType === "founder_document" || record.sourceType === "founder_assertion")
    .map((record) => record.evidenceId);
  return dimension("founder_proof", 5, ids.length > 0, ids, ids.length > 0 ? "Founder-provided proof is available." : "No founder-provided proof is available.");
}

function marketCategory(bundle: CompanyEvidenceBundle): AssessmentDimension {
  const ids = evidenceBySource(bundle, "clay_csv").map((record) => record.evidenceId);
  const known = bundle.normalizedCompany.primaryIndustry !== null && ids.length > 0;
  return dimension("market_category", 3, known, ids, known ? "A company category is identified." : "No company category is identified.");
}

function problemClarity(bundle: CompanyEvidenceBundle): AssessmentDimension {
  const clayIds = evidenceBySource(bundle, "clay_csv").map((record) => record.evidenceId);
  const websiteRecords = evidenceBySource(bundle, "company_website").filter((record) => {
      const description = payload(record).description;
      return typeof description === "string" && description.trim() !== "";
    });
  const ids = [
    ...(bundle.normalizedCompany.description !== null ? clayIds : []),
    ...websiteRecords.map((record) => record.evidenceId),
  ];
  const hasDescription = ids.length > 0;
  return dimension("problem_clarity", 3, hasDescription, ids, hasDescription ? "A product or problem description is available." : "No product or problem description is available.");
}

function directMarketEvidence(bundle: CompanyEvidenceBundle, claims: ClaimCandidate[]): AssessmentDimension {
  const matches = citedSupportedClaims(bundle, claims).filter((claim) => /market|customer|buyer/i.test(claim.predicate));
  const ids = matches.flatMap((claim) => claim.evidenceIds);
  const known = ids.length > 0;
  const positive = matches.some((claim) => isPositive(claim.value));
  return dimension("direct_market_evidence", 4, known, ids, known ? positive ? "Positive cited market or customer evidence is available." : "Cited market or customer evidence is non-positive." : "No direct market evidence is available.", positive ? 4 : 0);
}

function liveProduct(bundle: CompanyEvidenceBundle): AssessmentDimension {
  const ids = evidenceBySource(bundle, "company_website").map((record) => record.evidenceId);
  return dimension("live_product_surface", 4, ids.length > 0, ids, ids.length > 0 ? "A live company website is available." : "No live product surface is available.");
}

function pricingOrOffer(bundle: CompanyEvidenceBundle): AssessmentDimension {
  const ids = evidenceBySource(bundle, "company_website").filter((record) => {
    const links = payload(record).signalLinks;
    const pricing = typeof links === "object" && links !== null
      ? (links as Record<string, unknown>).pricing
      : undefined;
    return Array.isArray(pricing) && pricing.length > 0;
  }).map((record) => record.evidenceId);
  return dimension("pricing_or_offer", 3, ids.length > 0, ids, ids.length > 0 ? "A pricing or offer surface is available." : "No pricing or offer surface is available.");
}

function recentGithubActivity(bundle: CompanyEvidenceBundle): AssessmentDimension {
  const ids = evidenceBySource(bundle, "github_public").filter((record) => {
    const latestPushAt = payload(record).latestPushAt;
    const pushedAt = typeof latestPushAt === "string" ? Date.parse(latestPushAt) : Number.NaN;
    const capturedAt = Date.parse(record.capturedAt);
    return Number.isFinite(pushedAt) && Number.isFinite(capturedAt) && pushedAt >= capturedAt - 90 * 86_400_000;
  }).map((record) => record.evidenceId);
  return dimension("recent_github_activity", 3, ids.length > 0, ids, ids.length > 0 ? "Recent public GitHub activity is evidenced." : "No recent public GitHub activity is evidenced.");
}

function customerEvidence(bundle: CompanyEvidenceBundle, claims: ClaimCandidate[]): AssessmentDimension {
  const matches = citedSupportedClaims(bundle, claims).filter((claim) => /customer|client|contract/i.test(claim.predicate));
  const ids = matches.flatMap((claim) => claim.evidenceIds);
  const known = ids.length > 0;
  const positive = matches.some((claim) => isPositive(claim.value));
  return dimension("customer_evidence", 4, known, ids, known ? positive ? "Positive cited customer evidence is available." : "Cited customer evidence is zero or negative." : "No customer evidence is available.", positive ? 4 : 0);
}

function revenueEvidence(bundle: CompanyEvidenceBundle, claims: ClaimCandidate[]): AssessmentDimension {
  const matches = citedSupportedClaims(bundle, claims).filter((claim) => /revenue|arr|mrr|payment/i.test(claim.predicate));
  const ids = matches.flatMap((claim) => claim.evidenceIds);
  const known = ids.length > 0;
  const positive = matches.some((claim) => isPositive(claim.value));
  return dimension("revenue_evidence", 4, known, ids, known ? positive ? "Positive cited revenue or payment evidence is available." : "Cited revenue or payment evidence is zero or negative." : "No revenue or payment evidence is available.", positive ? 4 : 0);
}

function usageEvidence(bundle: CompanyEvidenceBundle, claims: ClaimCandidate[]): AssessmentDimension {
  const matches = citedSupportedClaims(bundle, claims).filter((claim) => /usage|retention|active.?user/i.test(claim.predicate));
  const ids = matches.flatMap((claim) => claim.evidenceIds);
  const known = ids.length > 0;
  const positive = matches.some((claim) => isPositive(claim.value));
  return dimension("usage_or_retention", 2, known, ids, known ? positive ? "Positive cited usage or retention evidence is available." : "Cited usage or retention evidence is zero or negative." : "No usage or retention evidence is available.", positive ? 2 : 0);
}

function axis(axis: AssessmentAxis["axis"], dimensions: AssessmentDimension[]): AssessmentAxis {
  const known = dimensions.filter((item) => item.known);
  const possiblePoints = dimensions.reduce((total, item) => total + item.possiblePoints, 0);
  const knownPoints = known.reduce((total, item) => total + item.possiblePoints, 0);
  return {
    axis,
    score: knownPoints === 0 ? null : known.reduce((total, item) => total + item.points, 0) / knownPoints * 100,
    coverage: possiblePoints === 0 ? 0 : knownPoints / possiblePoints * 100,
    dimensions,
  };
}

export function assessCompany(bundle: CompanyEvidenceBundle, claims: ClaimCandidate[]): AssessmentAxis[] {
  return [
    axis("founder", [founderIdentity(bundle), founderProof(bundle)]),
    axis("market", [marketCategory(bundle), problemClarity(bundle), directMarketEvidence(bundle, claims)]),
    axis("product_execution", [liveProduct(bundle), pricingOrOffer(bundle), recentGithubActivity(bundle)]),
    axis("traction", [customerEvidence(bundle, claims), revenueEvidence(bundle, claims), usageEvidence(bundle, claims)]),
  ];
}
