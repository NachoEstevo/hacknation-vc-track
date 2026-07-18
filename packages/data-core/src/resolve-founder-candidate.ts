import { normalizeDomain, normalizeTextKey } from "./normalize-company";
import type {
  ClayContact,
  CompanySeed,
  FounderResolution,
} from "./types";

const FOUNDER_TITLE = /\b(co[- ]?founder|founder|founding partner)\b/i;

export function resolveFounderCandidate(
  company: CompanySeed,
  contact: ClayContact,
): FounderResolution {
  if (!contact.linkedInUrl?.includes("linkedin.com/in/")) {
    return { state: "rejected", confidence: 0, reason: "missing_linkedin_url", contact };
  }

  const contactDomain = normalizeDomain(contact.domain ?? "");
  const companyNameMatches = contact.latestExperienceCompany
    ? normalizeTextKey(contact.latestExperienceCompany) === normalizeTextKey(company.name)
    : false;
  const founderTitleMatches = FOUNDER_TITLE.test(contact.latestExperienceTitle ?? "");

  if (company.domain && contactDomain && company.domain !== contactDomain) {
    return { state: "rejected", confidence: 0.05, reason: "domain_mismatch", contact };
  }

  if (company.domain && contactDomain === company.domain) {
    if (founderTitleMatches) {
      return {
        state: "accepted_candidate",
        confidence: 0.9,
        reason: "exact_domain_and_founder_title",
        contact,
      };
    }
    return { state: "needs_review", confidence: 0.45, reason: "non_founder_title", contact };
  }

  if (companyNameMatches && founderTitleMatches) {
    return {
      state: "needs_review",
      confidence: 0.6,
      reason: "company_name_and_founder_title",
      contact,
    };
  }

  if (companyNameMatches) {
    return { state: "needs_review", confidence: 0.3, reason: "non_founder_title", contact };
  }

  return { state: "rejected", confidence: 0.1, reason: "insufficient_company_match", contact };
}
