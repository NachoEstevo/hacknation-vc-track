import { describe, expect, it } from "vitest";
import {
  normalizeClayCompany,
  resolveFounderCandidate,
  type CompanySeed,
} from "../src/index.js";

const normalized = normalizeClayCompany({
  Name: "Icon",
  Country: "United States",
  Domain: "icon.com",
  "LinkedIn URL": "https://linkedin.com/company/icon",
}, 2);

if (normalized.kind !== "company") throw new Error("Invalid company fixture");
const icon: CompanySeed = normalized.company;

describe("resolveFounderCandidate", () => {
  it("accepts an exact current-domain founder match as a candidate", () => {
    expect(resolveFounderCandidate(icon, {
      name: "Kennan Frost",
      latestExperienceCompany: "Icon",
      latestExperienceTitle: "Founder",
      domain: "icon.com",
      linkedInUrl: "https://www.linkedin.com/in/kennandavison/",
      profileId: "341713197",
    })).toMatchObject({
      state: "accepted_candidate",
      confidence: 0.9,
      reason: "exact_domain_and_founder_title",
    });
  });

  it("rejects a founder whose current company domain differs", () => {
    expect(resolveFounderCandidate(icon, {
      name: "Kevin Miller",
      latestExperienceCompany: "GR0",
      latestExperienceTitle: "Co-Founder and CEO",
      domain: "gr0.com",
      linkedInUrl: "https://www.linkedin.com/in/kevinmichaelmiller3/",
      profileId: "776458348",
    })).toMatchObject({ state: "rejected", reason: "domain_mismatch" });
  });

  it("requires review when only company name and founder title match", () => {
    expect(resolveFounderCandidate(icon, {
      name: "Possible Founder",
      latestExperienceCompany: "ICON",
      latestExperienceTitle: "Co-Founder",
      domain: null,
      linkedInUrl: "https://www.linkedin.com/in/possible-founder/",
      profileId: "possible",
    })).toMatchObject({
      state: "needs_review",
      confidence: 0.6,
      reason: "company_name_and_founder_title",
    });
  });

  it("does not treat CEO alone as proof of founder status", () => {
    expect(resolveFounderCandidate(icon, {
      name: "Executive",
      latestExperienceCompany: "Icon",
      latestExperienceTitle: "CEO",
      domain: "icon.com",
      linkedInUrl: "https://www.linkedin.com/in/executive/",
      profileId: "executive",
    })).toMatchObject({ state: "needs_review", reason: "non_founder_title" });
  });

  it("rejects contacts without a LinkedIn URL", () => {
    expect(resolveFounderCandidate(icon, {
      name: "No Profile",
      latestExperienceCompany: "Icon",
      latestExperienceTitle: "Founder",
      domain: "icon.com",
      linkedInUrl: null,
      profileId: "none",
    })).toMatchObject({ state: "rejected", reason: "missing_linkedin_url" });
  });
});
