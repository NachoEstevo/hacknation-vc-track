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

export function canonicalizeFundThesis(value: unknown): FundThesis {
  const thesis = validateFundThesis(value);
  return { ...thesis, criteria: thesis.criteria.map(canonicalCriterion) };
}
