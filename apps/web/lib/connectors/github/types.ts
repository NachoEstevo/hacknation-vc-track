export const GITHUB_API_VERSION = "2026-03-10" as const;
export const GITHUB_PUBLIC_ENRICHMENT_SCHEMA_VERSION = 1 as const;
export const DEFAULT_GITHUB_REPOSITORY_LIMIT = 8;
export const MAX_GITHUB_REPOSITORY_LIMIT = 100;

export type GitHubAccountKind = "user" | "organization";
export type GitHubRequestEndpoint = "account" | "repositories";

export interface GitHubSourceReference {
  provider: "github";
  apiUrl: string;
  publicUrl: string;
  capturedAt: string;
}

/**
 * Public fields returned by GitHub for an account. These values are observations,
 * not founder, employment, ownership, traction, or investment assertions.
 */
export interface GitHubPublicAccount {
  stableId: string;
  databaseId: number;
  nodeId: string;
  kind: GitHubAccountKind;
  login: string;
  displayName: string | null;
  description: string | null;
  companyText: string | null;
  locationText: string | null;
  websiteText: string | null;
  avatarUrl: string | null;
  publicRepositoryCount: number | null;
  followerCount: number | null;
  followingCount: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  source: GitHubSourceReference;
}

/** Raw public repository metadata. No code-quality or traction score is derived. */
export interface GitHubPublicRepository {
  stableId: string;
  databaseId: number;
  nodeId: string;
  name: string;
  fullName: string;
  repositoryOwnerLogin: string;
  visibility: "public";
  description: string | null;
  homepageText: string | null;
  primaryLanguage: string | null;
  topics: string[] | null;
  licenseSpdxId: string | null;
  defaultBranch: string | null;
  isFork: boolean | null;
  isArchived: boolean | null;
  starCount: number | null;
  forkCount: number | null;
  openIssueCount: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  pushedAt: string | null;
  source: GitHubSourceReference;
}

export interface GitHubPublicEnrichment {
  schemaVersion: typeof GITHUB_PUBLIC_ENRICHMENT_SCHEMA_VERSION;
  provider: "github";
  requestedLogin: string;
  capturedAt: string;
  account: GitHubPublicAccount;
  repositories: GitHubPublicRepository[];
  repositoryLimit: number;
}

export interface GitHubPublicEnrichmentOptions {
  /**
   * Optional server-side credential. It is used only to create the Authorization
   * request header and is never copied into results or connector errors.
   */
  token?: string;
  /** Total timeout budget for the account and repository requests. */
  timeoutMs?: number;
  /** Maximum public repositories to retrieve, from 0 through 100. */
  maxRepositories?: number;
  /** Test seam. Production callers should leave this unset to use native fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam used to make capturedAt deterministic. */
  now?: () => Date;
}
