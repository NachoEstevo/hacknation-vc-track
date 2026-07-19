import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = join(process.cwd(), "app", "investor");

describe("private investor search routing", () => {
  it("never serializes a sourcing query into internal navigation URLs", () => {
    const sources = [
      "page.tsx",
      "home-thesis.tsx",
      "search/page.tsx",
      "search/search-workspace.tsx",
      "saved-searches/saved-searches-workspace.tsx",
    ].map((file) => readFileSync(join(appRoot, file), "utf8")).join("\n");

    expect(sources).not.toMatch(/\/investor\/search\?q=/);
    expect(sources).not.toMatch(/name=["']q["']/);
    expect(sources).not.toMatch(/pathname:\s*["']\/investor\/search["'][\s\S]{0,120}query:/);
    expect(sources).not.toMatch(/searchParams[\s\S]{0,120}(?:params\.)?q/);
    expect(sources).toContain("startSearchSession");
  });
});
