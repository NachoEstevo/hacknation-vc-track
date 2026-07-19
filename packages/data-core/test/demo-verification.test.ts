import { describe, expect, it } from "vitest";
import {
  buildRelyDemoVerification,
  simulateGitHubVerification,
  simulateStripeVerification,
} from "../src/demo-verification.js";

const verifiedAt = "2026-07-19T03:00:00.000Z";

describe("simulateStripeVerification", () => {
  it("shows one-time paying customers without inventing MRR", () => {
    const result = simulateStripeVerification({
      companyId: "demo-rely-founder-submitted",
      verifiedAt,
      uniquePayingCustomers: 55,
    });

    expect(result).toMatchObject({
      provider: "stripe",
      mode: "simulation",
      status: "completed",
      badge: "Demo verified",
      canPromoteToVerified: false,
      metrics: {
        uniquePayingCustomers: 55,
        revenueModel: "one_time_payments",
        subscriptionMrr: null,
      },
    });
    expect(result.claims.map((claim) => claim.metric)).not.toContain("mrr");
    expect(result.disclaimer.toLowerCase()).toContain("simulated");
  });
});

describe("simulateGitHubVerification", () => {
  it("models control signals without claiming legal code ownership", () => {
    const result = simulateGitHubVerification({
      companyId: "demo-rely-founder-submitted",
      verifiedAt,
      organization: "relycompany",
      founderUsernames: ["NachoEstevo", "frxnnk"],
      privateRepositoryCount: 6,
      commitsLast90Days: 284,
    });

    expect(result).toMatchObject({
      provider: "github",
      mode: "simulation",
      status: "completed",
      metrics: {
        organization: "relycompany",
        privateRepositoryCount: 6,
        commitsLast90Days: 284,
        matchedFounderUsernames: ["NachoEstevo", "frxnnk"],
        repositoryAccess: "admin_access_simulated",
        legalOwnershipVerified: false,
      },
    });
    expect(result.disclaimer).toContain("does not prove legal ownership");
  });
});

describe("buildRelyDemoVerification", () => {
  it("returns a frontend-ready connection timeline and evidence-safe snapshots", () => {
    const artifact = buildRelyDemoVerification(verifiedAt);

    expect(artifact.companyName).toBe("Rely");
    expect(artifact.connectors.map((connector) => connector.provider)).toEqual(["github", "stripe"]);
    expect(artifact.connectors.every((connector) => connector.mode === "simulation")).toBe(true);
    expect(artifact.timeline.map((event) => event.status)).toEqual([
      "ready",
      "connected",
      "analyzing",
      "completed",
    ]);
    expect(JSON.stringify(artifact)).not.toMatch(/sk_live|ghp_|access_token|customer_email/i);
  });
});
