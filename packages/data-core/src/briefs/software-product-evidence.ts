import type { CompanyEvidenceBundle } from "./types.js";

export interface EvidenceSignals {
  positiveEvidenceIds: string[];
  negativeEvidenceIds: string[];
}

const SOFTWARE_OWNERSHIP_EVIDENCE = [
  /\b(?:we|the company)\s+(?:develops?|builds?|owns?|offers?|provides?|operates?|creates?)\b.{0,80}\b(?:saas|software|api|app|application|erp)\b/iu,
  /\bour\s+(?:[\p{L}\d-]+\s+){0,3}(?:saas|software|api|app|application|erp)\b/iu,
];
const SOFTWARE_PRODUCT_EVIDENCE = [
  /\b(?:saas|software)\s+(?:product|platform|application|app|suite|tool|solution|system)\b/iu,
  /\b(?:mobile[- ]first\s+)?erp\s+(?:suite|platform|system|product)\b/iu,
  /\bapi\s+(?:product|platform|service|solution|access)\b/iu,
  /\b(?:white[- ]label|developer|public)\s+api\b/iu,
  /\b(?:mobile|web|desktop)\s+app(?:lication)?\b/iu,
];
const SOFTWARE_NEGATIVE_EVIDENCE = [
  /\bnot\s+(?:a|an)\s+(?:tech|technology|software)\s+company\b/iu,
  /\bdo(?:es)?\s+not\s+(?:develop|build|own|offer|provide|sell)\s+(?:any\s+)?(?:proprietary\s+)?(?:software|saas|api|app|application|erp)\b/iu,
  /\bno\s+(?:proprietary|in[- ]house|owned)\s+(?:software|product|platform|api|app|application|erp)\b/iu,
];

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(stringValues);
  return [];
}

export function softwareProductSignals(bundle: CompanyEvidenceBundle): EvidenceSignals {
  const positiveEvidenceIds: string[] = [];
  const negativeEvidenceIds: string[] = [];
  for (const evidence of bundle.evidence) {
    const text = [evidence.excerpt ?? "", ...stringValues(evidence.payload)].join(" ");
    if (SOFTWARE_NEGATIVE_EVIDENCE.some((pattern) => pattern.test(text))) {
      negativeEvidenceIds.push(evidence.evidenceId);
      continue;
    }
    const ownershipEvidence = SOFTWARE_OWNERSHIP_EVIDENCE.some((pattern) => pattern.test(text));
    const thirdPartyMarketplace = /\b(?:marketplace|community|directory)\b/iu.test(text)
      && /\b(?:third[- ]party|partner|vendor)\b/iu.test(text);
    if (ownershipEvidence || (!thirdPartyMarketplace && SOFTWARE_PRODUCT_EVIDENCE.some((pattern) => pattern.test(text)))) {
      positiveEvidenceIds.push(evidence.evidenceId);
    }
  }
  return { positiveEvidenceIds, negativeEvidenceIds };
}
