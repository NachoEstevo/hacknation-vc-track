import { describe, expect, it } from "vitest";
import { extractCompanyProfile } from "../src/enrichment/extract-company-profile";

describe("extractCompanyProfile", () => {
  it("extracts company facts, social links, and explicit founder candidates", () => {
    const pages = [{
      url: "https://acme.test/about",
      status: 200,
      html: `<html><head><title>Acme AI</title><meta name="description" content="AI for logistics"></head><body>
        <script type="application/ld+json">{"@type":"Organization","name":"Acme AI","founder":{"@type":"Person","name":"Ada Founder","jobTitle":"Co-Founder & CEO","sameAs":"https://github.com/ada"}}</script>
        <a href="https://linkedin.com/company/acme">LinkedIn</a><a href="https://github.com/acme">GitHub</a>
        <a href="/pricing">Pricing</a><a href="/changelog">Changelog</a>
      </body></html>`,
    }];
    const result = extractCompanyProfile(pages);
    expect(result.name).toBe("Acme AI");
    expect(result.description).toBe("AI for logistics");
    expect(result.socialLinks.github).toContain("https://github.com/acme");
    expect(result.founderCandidates[0]).toMatchObject({
      name: "Ada Founder",
      role: "Co-Founder & CEO",
      state: "candidate_only",
    });
    expect(result.signalLinks.pricing).toEqual(["https://acme.test/pricing"]);
  });
});
