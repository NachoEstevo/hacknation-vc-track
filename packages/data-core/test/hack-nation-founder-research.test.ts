import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const artifactPath = fileURLToPath(
  new URL("../../../data/source/hack-nation-founder-research.json", import.meta.url),
);

interface FounderResearchArtifact {
  recordCount: number;
  records: Array<Record<string, string | number | null>>;
}

describe("Hack-Nation founder research artifact", () => {
  it("retains the user-provided lead set and source-backed prioritization", async () => {
    const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as FounderResearchArtifact;

    expect(artifact.recordCount).toBe(47);
    expect(artifact.records).toHaveLength(47);
    expect(artifact.records.filter((record) => record["Priority Tier"] === "Tier 1 - contactar primero"))
      .toHaveLength(4);
    expect(artifact.records.find((record) => record["Verified Company / Startup"] === "ByteAsk"))
      .toMatchObject({
        "Full Name": "Anirudha Kulkarni",
        "Outreach Score": 88,
      });
  });
});
