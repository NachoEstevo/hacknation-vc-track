import type { FundThesis, ThesisCriterion } from "./types";
import { validateFundThesis } from "./validate-thesis";

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

function isB2BSoftwareCriterion(criterion: ThesisCriterion): boolean {
  if (criterion.category !== "industry") return false;
  const expected = typeof criterion.expectedValue === "string" ? criterion.expectedValue : "";
  return /\bb2b\b/iu.test(`${criterion.label} ${expected}`) && /\bsoftware\b/iu.test(`${criterion.label} ${expected}`);
}

function canonicalCriterion(criterion: ThesisCriterion): ThesisCriterion {
  if (criterion.category === "geography") {
    const expectedValue = Array.isArray(criterion.expectedValue)
      ? criterion.expectedValue.map(canonicalCountry)
      : typeof criterion.expectedValue === "string" ? canonicalCountry(criterion.expectedValue) : criterion.expectedValue;
    return { ...criterion, expectedValue };
  }
  if (isB2BSoftwareCriterion(criterion)) {
    return {
      ...criterion,
      category: "industry",
      label: "B2B software",
      operator: "equals",
      expectedValue: true,
    };
  }
  return criterion;
}

export function canonicalizeFundThesis(value: unknown): FundThesis {
  const thesis = validateFundThesis(value);
  return { ...thesis, criteria: thesis.criteria.map(canonicalCriterion) };
}
