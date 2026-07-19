import type { EvidenceRecord } from "./types.js";

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
  return relevant.length === 0 || relevant.every((word) => text.includes(word));
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

function relation(record: EvidenceRecord, predicate: string, value: string | number | boolean, unit: string | null): Relation {
  const text = evidenceText(record);
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
