import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateDemoFounderProfiles, type DemoFounderProfileArtifact } from "../src/founder-profile-contract";

const artifactPath = fileURLToPath(new URL("../../../data/enriched/demo-founder-profiles.json", import.meta.url));

describe("demo founder profiles", () => {
  it("keeps every founder and signal tied to explicit evidence", () => {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as DemoFounderProfileArtifact;
    expect(() => validateDemoFounderProfiles(artifact)).not.toThrow();
    expect(artifact.profiles.map((profile) => profile.demoRole)).toEqual([
      "golden_public",
      "golden_founder_submitted",
      "review_queue",
    ]);
  });

  it("rejects dangling evidence references", () => {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as DemoFounderProfileArtifact;
    artifact.profiles[0]!.founders[0]!.evidenceIds.push("missing-evidence");
    expect(() => validateDemoFounderProfiles(artifact)).toThrow("cites unknown evidence");
  });
});
