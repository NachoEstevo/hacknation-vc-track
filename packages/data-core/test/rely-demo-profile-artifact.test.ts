import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildRelyDemoProfile } from "../src/rely-demo-profile.js";

const artifactPath = fileURLToPath(new URL("../../../data/enriched/rely-demo-profile.json", import.meta.url));

describe("Rely demo profile artifact", () => {
  it("matches the typed founder-provided profile", () => {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    expect(artifact).toEqual(buildRelyDemoProfile());
  });
});
