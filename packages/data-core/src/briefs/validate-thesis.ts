import type { FundThesis, ThesisCriterion } from "./types.js";

const CATEGORIES = new Set<ThesisCriterion["category"]>([
  "geography", "industry", "company_size", "stage", "founder", "market", "product", "traction", "exclusion", "custom",
]);
const REQUIREMENTS = new Set<ThesisCriterion["requirement"]>(["required", "preferred", "excluded"]);
const OPERATORS = new Set<ThesisCriterion["operator"]>([
  "equals", "one_of", "contains", "gte", "lte", "exists", "not_exists",
]);

export class ThesisValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid fund thesis: ${issues.join(", ")}`);
    this.name = "ThesisValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateCriterion(value: unknown, index: number, issues: string[]): void {
  const path = `criteria[${index}]`;
  if (!isRecord(value)) {
    issues.push(path);
    return;
  }

  if (!hasText(value.criterionId)) issues.push(`${path}.criterionId`);
  if (!hasText(value.label)) issues.push(`${path}.label`);
  if (!CATEGORIES.has(value.category as ThesisCriterion["category"])) issues.push(`${path}.category`);
  if (!REQUIREMENTS.has(value.requirement as ThesisCriterion["requirement"])) issues.push(`${path}.requirement`);
  const weight = value.weight;
  if (typeof weight !== "number" || !Number.isInteger(weight) || weight < 1 || weight > 5) issues.push(`${path}.weight`);
  if (!OPERATORS.has(value.operator as ThesisCriterion["operator"])) {
    issues.push(`${path}.operator`);
    return;
  }

  if (value.operator === "one_of") {
    if (!Array.isArray(value.expectedValue) || value.expectedValue.length === 0 || !value.expectedValue.every(hasText)) {
      issues.push(`${path}.expectedValue`);
    }
  } else if (value.operator === "gte" || value.operator === "lte") {
    if (typeof value.expectedValue !== "number" || !Number.isFinite(value.expectedValue)) {
      issues.push(`${path}.expectedValue`);
    }
  } else if (value.operator === "contains") {
    if (!hasText(value.expectedValue)) issues.push(`${path}.expectedValue`);
  } else if (value.operator === "exists" || value.operator === "not_exists") {
    if (typeof value.expectedValue !== "boolean") issues.push(`${path}.expectedValue`);
  } else if (
    typeof value.expectedValue !== "string" &&
    typeof value.expectedValue !== "number" &&
    typeof value.expectedValue !== "boolean"
  ) {
    issues.push(`${path}.expectedValue`);
  }
}

export function validateFundThesis(value: unknown): FundThesis {
  const issues: string[] = [];
  if (!isRecord(value)) throw new ThesisValidationError(["thesis"]);

  if (!hasText(value.thesisId)) issues.push("thesisId");
  if (!hasText(value.originalQuery)) issues.push("originalQuery");
  if (!hasText(value.generatedAt)) issues.push("generatedAt");
  if (!hasText(value.promptVersion)) issues.push("promptVersion");
  if (!Array.isArray(value.criteria) || value.criteria.length === 0) {
    issues.push("criteria");
  } else {
    value.criteria.forEach((criterion, index) => validateCriterion(criterion, index, issues));
    const ids = value.criteria
      .map((criterion) => isRecord(criterion) && hasText(criterion.criterionId) ? criterion.criterionId : null)
      .filter((criterionId): criterionId is string => criterionId !== null);
    ids.forEach((criterionId, index) => {
      if (ids.indexOf(criterionId) !== index) issues.push(`criteria[${index}].criterionId`);
    });
  }

  if (issues.length > 0) throw new ThesisValidationError(issues);
  return value as unknown as FundThesis;
}
