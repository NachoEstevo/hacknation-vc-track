import type { EvidenceRecord } from "./types";

export interface GroundClaimEvidenceInput {
  predicate: string;
  value: string | number | boolean;
  unit: string | null;
  proposedEvidence: EvidenceRecord[];
  companyEvidence: EvidenceRecord[];
}

export interface GroundedClaimEvidence {
  supportingEvidence: EvidenceRecord[];
  contradictingEvidence: EvidenceRecord[];
}

const GENERIC_FIELD_WORDS = new Set([
  "criterion", "criteria", "industry", "market", "product", "traction", "stage", "custom",
  "company", "value", "claim", "true", "false",
]);

function evidenceText(record: EvidenceRecord): string {
  return `${record.excerpt ?? ""} ${record.payload === null ? "" : JSON.stringify(record.payload)}`
    .normalize("NFKC").toLocaleLowerCase("en-US").replace(/[_-]+/gu, " ").replace(/\s+/gu, " ");
}

function words(value: string): string[] {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ?? [];
}

function fieldWords(predicate: string): string[] {
  return words(predicate).filter((word) => word.length > 1 && !/^\d+$/u.test(word) && !GENERIC_FIELD_WORDS.has(word));
}

function mentionsField(text: string, predicate: string): boolean {
  const relevant = fieldWords(predicate);
  return relevant.length > 0 && relevant.every((word) => text.includes(word));
}

function isNegated(text: string, predicate: string, value?: string): boolean {
  const terms = [...fieldWords(predicate), ...(value ? words(value) : [])];
  const distinctive = [...new Set(terms)].filter((term) => term.length > 1);
  if (distinctive.length === 0) return false;
  const target = distinctive.map(escapeRegExp).join(".{0,30}");
  return new RegExp(`(?:\\bno\\b|\\bnot\\b|\\bnever\\b|\\bwithout\\b|does\\s+not|is\\s+not).{0,50}${target}`, "iu").test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function numericValues(text: string): number[] {
  return [...text.matchAll(/(?<![\p{L}\p{N}])[-+]?\d[\d,.]*(?![\p{L}\p{N}])/gu)]
    .map(([value]) => Number(value.replaceAll(",", "")))
    .filter(Number.isFinite);
}

function unitMatches(text: string, unit: string | null): boolean {
  if (!unit) return true;
  const normalized = unit.trim().toLocaleLowerCase("en-US");
  if (normalized === "usd") return /(?:\busd\b|\$)/iu.test(text);
  if (normalized === "%" || normalized === "percent") return /(?:%|\bpercent\b)/iu.test(text);
  return text.includes(normalized);
}

type Relation = "support" | "contradict" | "unrelated";

const MARKET_DEMAND_PATTERNS = [
  /\bcustomer demand\b/iu,
  /\bmarket demand\b/iu,
  /\b(?:customers?|buyers?)\b.{0,50}\bsigned\b.{0,30}\b(?:contracts?|agreements?|deals?|orders?|pilots?)\b/iu,
  /\bsigned\b.{0,30}\b(?:contracts?|agreements?|deals?|orders?|pilots?)\b.{0,50}\b(?:customers?|buyers?)\b/iu,
  /\b(?:customers?|buyers?)\b.{0,50}\brequested\b.{0,30}\b(?:demos?|trials?|quotes?|proposals?|pilots?|product access)\b/iu,
  /\brequested\b.{0,30}\b(?:demos?|trials?|quotes?|proposals?|pilots?|product access)\b.{0,50}\b(?:customers?|buyers?)\b/iu,
  /\b(?:customers?|buyers?)\b.{0,50}\b(?:paid\b.{0,20}\bpilots?|purchased\b.{0,20}\b(?:products?|subscriptions?|orders?))\b/iu,
  /\b(?:paid (?:pilots?|purchases?|customers?)|customer purchases?|buyer purchases?)\b/iu,
];

const NEGATED_MARKET_DEMAND_PATTERNS = [
  /\b(?:no|without)\b.{0,40}\b(?:customers?|buyers?|demand|paid pilots?|contracts?)\b/iu,
  /\b(?:customers?|buyers?|demand)\b.{0,30}\b(?:none|zero|not validated)\b/iu,
];

function explicitDomainRelation(
  text: string,
  predicate: string,
  value: string | number | boolean,
): Relation | null {
  if (predicate.trim().toLocaleLowerCase("en-US") !== "market" || value !== true) return null;
  if (NEGATED_MARKET_DEMAND_PATTERNS.some((pattern) => pattern.test(text))) return "contradict";
  return MARKET_DEMAND_PATTERNS.some((pattern) => pattern.test(text)) ? "support" : "unrelated";
}

function relation(record: EvidenceRecord, predicate: string, value: string | number | boolean, unit: string | null): Relation {
  const text = evidenceText(record);
  const explicitRelation = explicitDomainRelation(text, predicate, value);
  if (explicitRelation !== null) return explicitRelation;
  if (!text.trim() || !mentionsField(text, predicate)) return "unrelated";
  if (typeof value === "boolean") {
    const negative = isNegated(text, predicate);
    return value === !negative ? "support" : "contradict";
  }
  if (typeof value === "number") {
    const values = numericValues(text);
    if (values.includes(value) && unitMatches(text, unit)) return "support";
    return values.length > 0 ? "contradict" : "unrelated";
  }
  const normalizedValue = value.normalize("NFKC").toLocaleLowerCase("en-US");
  if (!text.includes(normalizedValue)) return "unrelated";
  return isNegated(text, predicate, normalizedValue) ? "contradict" : "support";
}

function unique(records: EvidenceRecord[]): EvidenceRecord[] {
  return [...new Map(records.map((record) => [record.evidenceId, record])).values()];
}

export function groundClaimEvidence(input: GroundClaimEvidenceInput): GroundedClaimEvidence {
  const proposedIds = new Set(input.proposedEvidence.map(({ evidenceId }) => evidenceId));
  const supportingEvidence = input.companyEvidence.filter((record) =>
    proposedIds.has(record.evidenceId) && relation(record, input.predicate, input.value, input.unit) === "support");
  if (supportingEvidence.length === 0) return { supportingEvidence: [], contradictingEvidence: [] };
  const contradictingEvidence = input.companyEvidence.filter((record) =>
    relation(record, input.predicate, input.value, input.unit) === "contradict");
  return { supportingEvidence: unique(supportingEvidence), contradictingEvidence: unique(contradictingEvidence) };
}
