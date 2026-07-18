import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sign-in prototype bypass", () => {
  it("links directly to onboarding without collecting credentials", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

    expect(source).toContain('href="/onboarding/role"');
    expect(source).toContain("Continue without signing in");
    expect(source).not.toContain("<input");
    expect(source).not.toContain('type="email"');
    expect(source).not.toContain("Work email");
  });
});
