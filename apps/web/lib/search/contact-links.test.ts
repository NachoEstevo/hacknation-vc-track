import { describe, expect, it } from "vitest";
import { mergePersonLinks } from "./contact-links";

const PRESS_LINKS = [
  { url: "https://raising.fi/depay-seed", title: "Depay Seed Funding Round" },
  { url: "https://lanacion.com.ar/depay-4m", title: "Depay levanta US$4M seed" },
];

describe("mergePersonLinks", () => {
  it("surfaces LinkedIn from the dossier text ahead of seed press links", () => {
    const markdown = "Per his profile ([LinkedIn](https://www.linkedin.com/in/joaquin-fagalde/)) he founded Depay.";
    const links = mergePersonLinks(PRESS_LINKS, markdown);
    expect(links[0]).toEqual({ url: "https://linkedin.com/in/joaquin-fagalde", title: "LinkedIn", network: "linkedin" });
    expect(links.map((link) => link.title)).toContain("Depay Seed Funding Round");
  });

  it("collapses GitHub repo URLs to the owner profile", () => {
    const markdown = "See https://github.com/alex-reysa/singular-lite and https://github.com/alex-reysa/pm-go.";
    const links = mergePersonLinks([], markdown);
    expect(links).toEqual([{ url: "https://github.com/alex-reysa", title: "GitHub", network: "github" }]);
  });

  it("canonicalizes twitter.com to x.com and drops app plumbing paths", () => {
    const markdown = "On https://twitter.com/jfagalde/status/123 — share via https://x.com/intent/tweet?text=hi.";
    const links = mergePersonLinks([], markdown);
    expect(links).toEqual([{ url: "https://x.com/jfagalde", title: "X", network: "x" }]);
  });

  it("ignores LinkedIn URLs that are not profile or company pages", () => {
    const markdown = "Hiring at https://linkedin.com/jobs/view/123456.";
    expect(mergePersonLinks([], markdown)).toEqual([]);
  });

  it("ignores GitHub product pages", () => {
    const markdown = "Listed on https://github.com/features/copilot and https://github.com/trending.";
    expect(mergePersonLinks([], markdown)).toEqual([]);
  });

  it("dedupes a seed link that is also a harvested contact", () => {
    const seed = [{ url: "https://github.com/alex-reysa", title: "AXON GitHub repo" }];
    const markdown = "Active at https://github.com/alex-reysa/axon.";
    const links = mergePersonLinks(seed, markdown);
    expect(links).toEqual([{ url: "https://github.com/alex-reysa", title: "GitHub", network: "github" }]);
  });

  it("strips trailing punctuation from URLs found in prose", () => {
    const markdown = "Profile: https://linkedin.com/in/maria-perez).";
    expect(mergePersonLinks([], markdown)[0]?.url).toBe("https://linkedin.com/in/maria-perez");
  });

  it("keeps at most two contacts per network and caps the row", () => {
    const markdown = [
      "https://linkedin.com/in/a", "https://linkedin.com/in/b", "https://linkedin.com/in/c",
      "https://github.com/u1", "https://github.com/u2",
      "https://x.com/h1",
    ].join(" ");
    const many = Array.from({ length: 6 }, (_, index) => ({
      url: `https://press-${index}.example.com/story`,
      title: `Story ${index}`,
    }));
    const links = mergePersonLinks(many, markdown, 8);
    expect(links).toHaveLength(8);
    expect(links.filter((link) => link.network === "linkedin")).toHaveLength(2);
    expect(links[0].network).toBe("linkedin");
    expect(links[2].network).toBe("github");
    expect(links[4].network).toBe("x");
  });

  it("returns only seed links untouched when nothing is harvestable", () => {
    const links = mergePersonLinks(PRESS_LINKS, "No profiles anywhere.");
    expect(links).toHaveLength(2);
    expect(links[0].network).toBe("other");
  });
});
