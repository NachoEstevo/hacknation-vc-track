import type { CitedStatement, EvidenceRecord, InvestmentBrief } from "./types.js";

export type BriefValidationResult =
  | { valid: true; errors: [] }
  | { valid: false; errors: Array<{
      code: "fact_missing_citation" | "analysis_missing_citation" |
        "unknown_evidence_id" | "unsupported_numeric_value";
      section: "summary" | "strengths" | "risks";
      statementIndex: number;
    }> };

type ValidationError = Exclude<BriefValidationResult, { valid: true }>["errors"][number];

const NUMERIC_TOKEN = /(?<![\p{L}\p{N}$€£+\-.,])(?<sign>[+-]?)(?<currency>[$€£])?(?<value>\d+(?:[.,]\d+)*|\.\d+)(?<exponent>e[+-]?\d+)?(?<suffix>%|[kmb])?(?![\p{L}\p{N}])/giu;
const PERCENT_RANGE = /(?<![\p{L}\p{N}.,])(\d+(?:[.,]\d+)*|\.\d+)(e[+-]?\d+)?\s*-\s*(\d+(?:[.,]\d+)*|\.\d+)(e[+-]?\d+)?%(?![\p{L}\p{N}])/giu;

const MAGNITUDE_POWER = { k: 3n, m: 6n, b: 9n } as const;

function expandPercentageRanges(value: string): string {
  return value.replace(
    PERCENT_RANGE,
    (_range, left, leftExponent = "", right, rightExponent = "") =>
      `${left}${leftExponent}% ${right}${rightExponent}%`,
  );
}

function canonicalDecimal(sign: string, value: string, exponent: string, magnitudePower: bigint): string {
  const [whole = "", fraction = ""] = value.replace(/,/g, "").split(".");
  let digits = `${whole}${fraction}`.replace(/^0+/, "");
  if (digits === "") return "0e0";

  let power = (exponent === "" ? 0n : BigInt(exponent.slice(1)))
    + magnitudePower - BigInt(fraction.length);
  while (digits.endsWith("0")) {
    digits = digits.slice(0, -1);
    power += 1n;
  }
  return `${sign === "-" ? "-" : ""}${digits}e${power}`;
}

function numericTokens(value: string): string[] {
  return [...expandPercentageRanges(value).matchAll(NUMERIC_TOKEN)].map((match) => {
    const sign = match.groups?.sign ?? "";
    const currency = match.groups?.currency;
    const exponent = match.groups?.exponent ?? "";
    const suffix = match.groups?.suffix?.toLowerCase();
    const numericValue = match.groups?.value;
    if (numericValue === undefined) throw new Error("Numeric token is missing its value");
    const magnitudePower = suffix && suffix in MAGNITUDE_POWER
      ? MAGNITUDE_POWER[suffix as keyof typeof MAGNITUDE_POWER]
      : 0n;
    const normalizedValue = canonicalDecimal(sign, numericValue, exponent, magnitudePower);
    const unit = currency ?? (suffix === "%" ? "%" : "unitless");
    return `${unit}:${normalizedValue}`;
  });
}

function evidenceText(item: EvidenceRecord): string {
  return `${item.excerpt ?? ""} ${item.payload ? JSON.stringify(item.payload) : ""}`;
}

function namesMissingField(statement: CitedStatement, brief: InvestmentBrief): boolean {
  const text = statement.text.toLocaleLowerCase();
  return brief.evidenceGaps.some(({ field }) => text.includes(field.trim().toLocaleLowerCase()));
}

export function validateBriefCitations(
  brief: InvestmentBrief,
  evidence: EvidenceRecord[],
): BriefValidationResult {
  const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
  const errors: ValidationError[] = [];
  const sections = ["summary", "strengths", "risks"] as const;

  for (const section of sections) {
    brief[section].forEach((statement, statementIndex) => {
      if (statement.evidenceIds.length === 0) {
        if (statement.statementKind === "fact") {
          errors.push({ code: "fact_missing_citation", section, statementIndex });
        } else if (
          statement.statementKind === "analysis" ||
          !namesMissingField(statement, brief)
        ) {
          errors.push({ code: "analysis_missing_citation", section, statementIndex });
        }
      }

      const citedEvidence = statement.evidenceIds
        .map((evidenceId) => evidenceById.get(evidenceId))
        .filter((item): item is EvidenceRecord => item !== undefined);

      if (citedEvidence.length !== statement.evidenceIds.length) {
        errors.push({ code: "unknown_evidence_id", section, statementIndex });
      }

      if (statement.statementKind === "analysis") {
        const supportedTokens = new Set(citedEvidence.flatMap((item) => numericTokens(evidenceText(item))));
        const hasUnsupportedNumber = numericTokens(statement.text)
          .some((token) => !supportedTokens.has(token));
        if (hasUnsupportedNumber) {
          errors.push({ code: "unsupported_numeric_value", section, statementIndex });
        }
      }
    });
  }

  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}
