import type { FundThesis, ThesisCriterion } from "./types.js";
import { validateFundThesis } from "./validate-thesis.js";

const COUNTRY_CODES: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  us: "US",
  "united kingdom": "GB",
  "great britain": "GB",
  uk: "GB",
  gb: "GB",
};

function canonicalCountry(value: string): string {
  return COUNTRY_CODES[value.trim().toLocaleLowerCase("en-US")] ?? value.trim().toUpperCase();
}

function canonicalCriterion(criterion: ThesisCriterion): ThesisCriterion {
  if (criterion.category !== "geography") return criterion;
  const expectedValue = Array.isArray(criterion.expectedValue)
    ? criterion.expectedValue.map(canonicalCountry)
    : typeof criterion.expectedValue === "string"
      ? canonicalCountry(criterion.expectedValue)
      : criterion.expectedValue;
  return { ...criterion, expectedValue };
}

function isB2BSoftwareCriterion(criterion: ThesisCriterion): boolean {
  if (criterion.category !== "industry") return false;
  const text = `${criterion.label} ${typeof criterion.expectedValue === "string" ? criterion.expectedValue : ""}`;
  return /\bb2b\b/iu.test(text) && /\bsoftware\b/iu.test(text);
}

function canonicalCriteria(criterion: ThesisCriterion): ThesisCriterion[] {
  if (!isB2BSoftwareCriterion(criterion)) return [canonicalCriterion(criterion)];
  const softwareWeight = Math.max(1, Math.floor(criterion.weight / 2)) as ThesisCriterion["weight"];
  const b2bWeight = Math.max(1, criterion.weight - softwareWeight) as ThesisCriterion["weight"];
  return [
    {
      ...criterion,
      criterionId: `${criterion.criterionId}-b2b`,
      category: "market",
      label: "B2B business model",
      operator: "equals",
      expectedValue: true,
      weight: b2bWeight,
    },
    {
      ...criterion,
      criterionId: `${criterion.criterionId}-software`,
      label: "Software product",
      operator: "equals",
      expectedValue: true,
      weight: softwareWeight,
    },
  ];
}

export function canonicalizeFundThesis(value: unknown): FundThesis {
  const thesis = validateFundThesis(value);
  return { ...thesis, criteria: thesis.criteria.flatMap(canonicalCriteria) };
}
