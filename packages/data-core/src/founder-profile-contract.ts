export const FOUNDER_PROFILE_SCHEMA_VERSION = "1.0" as const;

export type FounderRelationshipState = "candidate" | "needs_review" | "founder_confirmed" | "admin_confirmed";
export type ProfileVerificationState = "publicly_supported" | "founder_asserted" | "integration_verified" | "unverified";

export interface ProfileEvidence {
  evidenceId: string;
  label: string;
  sourceUrl: string | null;
  sourceType: "company_website" | "public_registry" | "public_profile" | "founder_assertion" | "connected_integration";
  verificationState: ProfileVerificationState;
  visibility: "public" | "founder_private" | "investor_private";
  capturedAt: string;
  note: string;
}

export interface FounderSignal {
  label: string;
  value: string;
  evidenceIds: string[];
}

export interface DemoFounder {
  founderId: string;
  name: string;
  role: string;
  relationshipState: FounderRelationshipState;
  relationshipConfidence: number;
  location: string | null;
  linkedInUrl: string | null;
  xUrl: string | null;
  githubUrl: string | null;
  bio: string;
  trackRecord: FounderSignal[];
  evidenceIds: string[];
}

export interface DemoFounderProfile {
  companyId: string;
  companyName: string;
  domain: string;
  profileOrigin: "directory_discovery" | "founder_submitted";
  demoRole: "golden_public" | "golden_founder_submitted" | "review_queue";
  oneLiner: string;
  headquarters: string | null;
  companyLinkedInUrl: string | null;
  founders: DemoFounder[];
  companySignals: FounderSignal[];
  evidence: ProfileEvidence[];
  openQuestions: string[];
}

export interface DemoFounderProfileArtifact {
  schemaVersion: typeof FOUNDER_PROFILE_SCHEMA_VERSION;
  generatedAt: string;
  profiles: DemoFounderProfile[];
}

export function validateDemoFounderProfiles(artifact: DemoFounderProfileArtifact): void {
  if (artifact.schemaVersion !== FOUNDER_PROFILE_SCHEMA_VERSION) throw new Error("Unsupported founder profile schema");
  if (!artifact.profiles.length) throw new Error("At least one founder profile is required");

  const companyIds = new Set<string>();
  for (const profile of artifact.profiles) {
    if (companyIds.has(profile.companyId)) throw new Error(`Duplicate companyId: ${profile.companyId}`);
    companyIds.add(profile.companyId);
    if (!profile.founders.length) throw new Error(`${profile.companyName} has no founder candidates`);

    const evidenceIds = new Set(profile.evidence.map((item) => item.evidenceId));
    if (evidenceIds.size !== profile.evidence.length) throw new Error(`${profile.companyName} has duplicate evidence IDs`);

    for (const founder of profile.founders) {
      if (founder.relationshipConfidence < 0 || founder.relationshipConfidence > 1) {
        throw new Error(`${founder.name} has invalid relationship confidence`);
      }
      assertEvidenceReferences(founder.evidenceIds, evidenceIds, founder.name);
      for (const signal of founder.trackRecord) {
        assertEvidenceReferences(signal.evidenceIds, evidenceIds, `${founder.name}: ${signal.label}`);
      }
    }

    for (const signal of profile.companySignals) {
      assertEvidenceReferences(signal.evidenceIds, evidenceIds, `${profile.companyName}: ${signal.label}`);
    }
  }
}

function assertEvidenceReferences(references: string[], evidenceIds: Set<string>, subject: string): void {
  if (!references.length) throw new Error(`${subject} has no evidence references`);
  for (const reference of references) {
    if (!evidenceIds.has(reference)) throw new Error(`${subject} cites unknown evidence: ${reference}`);
  }
}
