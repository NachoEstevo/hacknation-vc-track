import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = join(process.cwd(), "app");

describe("onboarding brief privacy", () => {
  it("does not carry the sourcing brief through onboarding query parameters", () => {
    const sources = [
      "page.tsx",
      "landing-brief-flow.tsx",
      "onboarding/role/page.tsx",
      "onboarding/role/pending-brief.tsx",
      "onboarding/investor/page.tsx",
    ].map((file) => readFileSync(join(appRoot, file), "utf8")).join("\n");

    expect(sources).not.toMatch(/name=["']q["']/);
    expect(sources).not.toMatch(/onboarding\/(?:role|investor)[^\n]*query/);
    expect(sources).not.toContain("?q=");
    expect(sources).toContain("/onboarding/role");
    expect(sources).toContain("/onboarding/investor");
  });
});
