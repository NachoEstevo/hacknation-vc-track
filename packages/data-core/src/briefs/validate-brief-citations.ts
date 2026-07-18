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

const NUMERIC_TOKEN = /(?<![\p{L}\p{N}])[$€£]?-?\d+(?:[.,]\d+)*(?:%|[kmb])?(?![\p{L}\p{N}])/giu;

function numericTokens(value: string): string[] {
  return [...value.matchAll(NUMERIC_TOKEN)].map(([token]) =>
    token.toLowerCase().replace(/[$€£,%]/g, "")
  );
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
