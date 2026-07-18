import { describe, expect, it } from "vitest";
import { discoverCompanyPages } from "../src/web/discover-company-pages.js";

describe("discoverCompanyPages", () => {
  it("keeps three prioritized same-origin company pages", () => {
    const html = `
      <a href="/blog">Blog</a><a href="/team">Our team</a>
      <a href="https://elsewhere.test/about">About elsewhere</a>
      <a href="/company">Company</a><a href="/about-us">About us</a><a href="/pricing">Pricing</a>
    `;
    expect(discoverCompanyPages(html, new URL("https://acme.test"))).toEqual([
      "https://acme.test/about-us",
      "https://acme.test/team",
      "https://acme.test/company",
    ]);
  });
});
