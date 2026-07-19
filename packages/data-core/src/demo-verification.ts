export type DemoProvider = "github" | "stripe";

export interface DemoClaim {
  metric: string;
  value: string | number | boolean;
  verificationState: "simulated";
  evidenceLabel: "Demo fixture";
}

interface DemoConnectorBase {
  connectionId: string;
  companyId: string;
  provider: DemoProvider;
  mode: "simulation";
  status: "completed";
  badge: "Demo verified";
  canPromoteToVerified: false;
  verifiedAt: string;
  disclaimer: string;
  claims: DemoClaim[];
}

export interface StripeDemoVerification extends DemoConnectorBase {
  provider: "stripe";
  metrics: {
    uniquePayingCustomers: number;
    revenueModel: "one_time_payments";
    subscriptionMrr: null;
  };
}

export interface GitHubDemoVerification extends DemoConnectorBase {
  provider: "github";
  metrics: {
    organization: string;
    privateRepositoryCount: number;
    commitsLast90Days: number;
    matchedFounderUsernames: string[];
    repositoryAccess: "admin_access_simulated";
    legalOwnershipVerified: false;
  };
}

export interface DemoVerificationArtifact {
  schemaVersion: "1.0";
  companyId: string;
  companyName: string;
  generatedAt: string;
  demoOnly: true;
  timeline: Array<{
    event: "ready_to_connect" | "oauth_connected" | "signals_analyzed" | "brief_updated";
    status: "ready" | "connected" | "analyzing" | "completed";
    label: string;
  }>;
  connectors: [GitHubDemoVerification, StripeDemoVerification];
}

export function simulateStripeVerification(input: {
  companyId: string;
  verifiedAt: string;
  uniquePayingCustomers: number;
}): StripeDemoVerification {
  if (!Number.isInteger(input.uniquePayingCustomers) || input.uniquePayingCustomers < 0) {
    throw new Error("uniquePayingCustomers must be a non-negative integer");
  }

  return {
    connectionId: `${input.companyId}:stripe:demo`,
    companyId: input.companyId,
    provider: "stripe",
    mode: "simulation",
    status: "completed",
    badge: "Demo verified",
    canPromoteToVerified: false,
    verifiedAt: input.verifiedAt,
    disclaimer: "Simulated Stripe verification for the hackathon demo; no Stripe account was connected.",
    metrics: {
      uniquePayingCustomers: input.uniquePayingCustomers,
      revenueModel: "one_time_payments",
      subscriptionMrr: null,
    },
    claims: [{
      metric: "unique_paying_customers",
      value: input.uniquePayingCustomers,
      verificationState: "simulated",
      evidenceLabel: "Demo fixture",
    }],
  };
}

export function simulateGitHubVerification(input: {
  companyId: string;
  verifiedAt: string;
  organization: string;
  founderUsernames: string[];
  privateRepositoryCount: number;
  commitsLast90Days: number;
}): GitHubDemoVerification {
  return {
    connectionId: `${input.companyId}:github:demo`,
    companyId: input.companyId,
    provider: "github",
    mode: "simulation",
    status: "completed",
    badge: "Demo verified",
    canPromoteToVerified: false,
    verifiedAt: input.verifiedAt,
    disclaimer: "Simulated GitHub connection; repository access is not live and does not prove legal ownership of code or IP.",
    metrics: {
      organization: input.organization,
      privateRepositoryCount: input.privateRepositoryCount,
      commitsLast90Days: input.commitsLast90Days,
      matchedFounderUsernames: [...input.founderUsernames],
      repositoryAccess: "admin_access_simulated",
      legalOwnershipVerified: false,
    },
    claims: [
      {
        metric: "matched_founders",
        value: input.founderUsernames.length,
        verificationState: "simulated",
        evidenceLabel: "Demo fixture",
      },
      {
        metric: "commits_last_90_days",
        value: input.commitsLast90Days,
        verificationState: "simulated",
        evidenceLabel: "Demo fixture",
      },
    ],
  };
}

export function buildRelyDemoVerification(verifiedAt: string): DemoVerificationArtifact {
  const companyId = "demo-rely-founder-submitted";
  return {
    schemaVersion: "1.0",
    companyId,
    companyName: "Rely",
    generatedAt: verifiedAt,
    demoOnly: true,
    timeline: [
      { event: "ready_to_connect", status: "ready", label: "Founder chooses data sources" },
      { event: "oauth_connected", status: "connected", label: "Demo accounts connected" },
      { event: "signals_analyzed", status: "analyzing", label: "Safe aggregates generated" },
      { event: "brief_updated", status: "completed", label: "VC brief refreshed" },
    ],
    connectors: [
      simulateGitHubVerification({
        companyId,
        verifiedAt,
        organization: "relycompany",
        founderUsernames: ["NachoEstevo", "frxnnk"],
        privateRepositoryCount: 6,
        commitsLast90Days: 284,
      }),
      simulateStripeVerification({ companyId, verifiedAt, uniquePayingCustomers: 55 }),
    ],
  };
}
