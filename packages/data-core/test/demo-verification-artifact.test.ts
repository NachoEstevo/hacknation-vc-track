import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildRelyDemoVerification } from "../src/demo-verification.js";

const artifactPath = fileURLToPath(new URL("../../../data/enriched/rely-demo-verification.json", import.meta.url));

describe("Rely demo verification artifact", () => {
  it("is reproducible from the typed builder and stays transparently simulated", () => {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

    expect(artifact).toEqual(buildRelyDemoVerification(artifact.generatedAt));
    expect(artifact.demoOnly).toBe(true);
    expect(artifact.connectors.every((connector: { canPromoteToVerified: boolean }) => !connector.canPromoteToVerified)).toBe(true);
  });
});
