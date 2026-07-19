import { describe, expect, it } from "vitest";
import { selectHackNationStartupCandidates } from "../src/hack-nation/startup-candidates.js";

describe("selectHackNationStartupCandidates", () => {
  it("keeps complete profiles with an explicit startup-role signal and social links", () => {
    const candidates = selectHackNationStartupCandidates([
      {
        user_id: "person-1",
        first_name: "Ada",
        last_name: "Lovelace",
        university: "University",
        field_of_study: "Computer Science",
        academic_degree: "Master's",
        professional_situation: "Co-founder and CEO at Analytical Engines",
        tagline: "Working on developer tools",
        country: "United Kingdom",
        city: "London",
        github_url: "https://github.com/ada",
        linkedin_url: "https://linkedin.com/in/ada",
      },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      fullName: "Ada Lovelace",
      startupSignals: ["founder", "ceo"],
      researchStatus: "queued",
      profile: {
        githubUrl: "https://github.com/ada",
        linkedinUrl: "https://linkedin.com/in/ada",
      },
    });
  });

  it("excludes generic builder language and incomplete profiles", () => {
    const candidates = selectHackNationStartupCandidates([
      {
        user_id: "person-2",
        display_name: "Builder",
        university: "University",
        field_of_study: "Computer Science",
        academic_degree: "Bachelor's",
        professional_situation: "Student",
        tagline: "Building AI applications",
        country: "Argentina",
        city: "Buenos Aires",
      },
      { user_id: "person-3", display_name: "Founder", professional_situation: "Founder" },
    ]);

    expect(candidates).toEqual([]);
  });
});
