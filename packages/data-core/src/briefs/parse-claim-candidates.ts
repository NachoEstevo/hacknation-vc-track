import { calculateClaimTrust } from "./calculate-claim-trust";
import { groundClaimEvidence } from "./ground-claim-evidence";
import type { ClaimCandidate, CompanyEvidenceBundle, FundThesis } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validIndexes(value: unknown, records: CompanyEvidenceBundle["evidence"]): number[] {
  if (!Array.isArray(value) || !value.every((index) => Number.isInteger(index) && index >= 0 && index < records.length)) {
    throw new Error("Invalid evidence indexes");
  }
  return [...new Set(value as number[])];
}

export function parseClaimCandidates(
  value: unknown,
  bundle: CompanyEvidenceBundle,
  evaluatedAt: string,
  thesis?: FundThesis,
): ClaimCandidate[] {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Array.isArray(value.candidates)) {
    throw new Error("Claim candidates must be a strict object containing candidates");
  }
  const ids = new Set<string>();
  return value.candidates.flatMap((candidate): ClaimCandidate[] => {
    if (!isRecord(candidate) || typeof candidate.claimId !== "string" || candidate.claimId.trim() === "" || ids.has(candidate.claimId)
      || typeof candidate.subject !== "string" || typeof candidate.predicate !== "string"
      || !["string", "number", "boolean"].includes(typeof candidate.value)
      || (candidate.unit !== null && typeof candidate.unit !== "string")
      || !["observed_fact", "first_party_claim", "analysis"].includes(candidate.claimKind as string)
    ) throw new Error("Invalid claim candidate");
    ids.add(candidate.claimId);
    const indexes = validIndexes(candidate.evidenceIndexes, bundle.evidence);
    if (indexes.length === 0) throw new Error("Claims require evidence");
    const groundingPredicate = thesis?.criteria.find(({ criterionId }) => criterionId === candidate.predicate)?.label
      ?? candidate.predicate;
    const grounded = groundClaimEvidence({
      predicate: groundingPredicate,
      value: candidate.value as string | number | boolean,
      unit: candidate.unit as string | null,
      proposedEvidence: indexes.map((index) => bundle.evidence[index]!),
      companyEvidence: bundle.evidence,
    });
    if (grounded.supportingEvidence.length === 0) return [];
    const trust = calculateClaimTrust({
      supportingEvidence: grounded.supportingEvidence,
      contradictingEvidence: grounded.contradictingEvidence,
      evaluatedAt,
    });
    return [{
      claimId: candidate.claimId,
      companyId: bundle.companyId,
      subject: candidate.subject,
      predicate: candidate.predicate,
      value: candidate.value as string | number | boolean,
      unit: candidate.unit as string | null,
      claimKind: candidate.claimKind as ClaimCandidate["claimKind"],
      evidenceIds: [...new Set([...grounded.supportingEvidence, ...grounded.contradictingEvidence]
        .map(({ evidenceId }) => evidenceId))],
      trust,
      state: trust.state,
    }];
  });
}
