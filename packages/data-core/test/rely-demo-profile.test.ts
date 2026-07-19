import { describe, expect, it } from "vitest";
import { buildRelyDemoProfile } from "../src/rely-demo-profile";

describe("buildRelyDemoProfile", () => {
  it("captures the founder-provided company facts without inventing subscription revenue", () => {
    const profile = buildRelyDemoProfile();

    expect(profile.company).toMatchObject({
      name: "Rely",
      domain: "rely.business",
      launchedAt: "2026-04",
      revenueModel: "one_time_payments",
      uniquePayingCustomers: { value: 55, verificationState: "founder_stated" },
      mrr: null,
    });
    expect(profile.founders).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "Ignacio Estevo",
        role: "Co-founder and CTO",
        occupation: "Software Engineer",
        linkedInUrl: "https://www.linkedin.com/in/ignacio-estevo/",
        githubUrl: "https://github.com/NachoEstevo",
      }),
      expect.objectContaining({
        name: "Franco Ferreira",
        role: "Co-founder and CEO",
        linkedInUrl: "https://www.linkedin.com/in/franco-ferreira",
        githubUrl: "https://github.com/frxnnk",
      }),
    ]));
    expect(profile.founders.every((founder) => founder.otherCompanies.includes("Acelera Agency"))).toBe(true);
  });

  it("labels the private GitHub organization as declared until a live connection exists", () => {
    const profile = buildRelyDemoProfile();

    expect(profile.company.githubOrganization).toEqual({
      url: "https://github.com/relycompany",
      visibility: "private",
      verificationState: "founder_stated",
    });
  });
});
