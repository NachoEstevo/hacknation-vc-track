import {
  GitHubConfigurationError,
  GitHubHttpError,
  GitHubNetworkError,
  GitHubPayloadError,
  GitHubRateLimitError,
  GitHubTimeoutError,
  type GitHubRateLimitDetails,
} from "./errors";
import {
  DEFAULT_GITHUB_REPOSITORY_LIMIT,
  GITHUB_API_VERSION,
  GITHUB_PUBLIC_ENRICHMENT_SCHEMA_VERSION,
  MAX_GITHUB_REPOSITORY_LIMIT,
  type GitHubAccountKind,
  type GitHubPublicAccount,
  type GitHubPublicEnrichment,
  type GitHubPublicEnrichmentOptions,
  type GitHubPublicRepository,
  type GitHubRequestEndpoint,
  type GitHubSourceReference,
} from "./types";
import { parseGitHubLogin } from "./validation";

const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_WEB_ORIGIN = "https://github.com";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 60_000;

type JsonRecord = Record<string, unknown>;

interface GitHubJsonResponse {
  data: unknown;
  headers: Headers;
}

interface RequestContext {
  controller: AbortController;
  fetchImpl: typeof fetch;
  headers: Headers;
  timeoutMs: number;
}

function normalizeTimeout(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_TIMEOUT_MS;

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new GitHubConfigurationError(
      `GitHub timeoutMs must be an integer from 1 through ${MAX_TIMEOUT_MS}.`,
    );
  }

  return timeoutMs;
}

function normalizeRepositoryLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_GITHUB_REPOSITORY_LIMIT;

  if (
    !Number.isInteger(limit) ||
    limit < 0 ||
    limit > MAX_GITHUB_REPOSITORY_LIMIT
  ) {
    throw new GitHubConfigurationError(
      `GitHub maxRepositories must be an integer from 0 through ${MAX_GITHUB_REPOSITORY_LIMIT}.`,
    );
  }

  return limit;
}

function getCapturedAt(now: (() => Date) | undefined): {
  date: Date;
  iso: string;
} {
  const date = now?.() ?? new Date();

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new GitHubConfigurationError("GitHub now() must return a valid Date.");
  }

  return { date, iso: date.toISOString() };
}

function createRequestHeaders(token: string | undefined): Headers {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "undr-vc-intelligence",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  });
  const normalizedToken = token?.trim();

  if (normalizedToken) {
    headers.set("Authorization", `Bearer ${normalizedToken}`);
  }

  return headers;
}

function parseIntegerHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);

  if (raw === null || !/^\d+$/.test(raw)) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseResetAt(headers: Headers): string | null {
  const resetEpochSeconds = parseIntegerHeader(headers, "x-ratelimit-reset");

  if (resetEpochSeconds === null) {
    return null;
  }

  const date = new Date(resetEpochSeconds * 1_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseRetryAfterSeconds(headers: Headers, capturedAt: Date): number | null {
  const raw = headers.get("retry-after");

  if (raw === null) {
    return null;
  }

  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }

  const retryDate = new Date(raw);

  if (Number.isNaN(retryDate.getTime())) {
    return null;
  }

  return Math.max(0, Math.ceil((retryDate.getTime() - capturedAt.getTime()) / 1_000));
}

function getRateLimitDetails(
  headers: Headers,
  capturedAt: Date,
): GitHubRateLimitDetails {
  return {
    limit: parseIntegerHeader(headers, "x-ratelimit-limit"),
    remaining: parseIntegerHeader(headers, "x-ratelimit-remaining"),
    resetAt: parseResetAt(headers),
    retryAfterSeconds: parseRetryAfterSeconds(headers, capturedAt),
    resource: headers.get("x-ratelimit-resource"),
  };
}

function isRateLimitResponse(response: Response): boolean {
  if (response.status === 429) {
    return true;
  }

  return (
    response.status === 403 &&
    (response.headers.get("x-ratelimit-remaining") === "0" ||
      response.headers.has("retry-after"))
  );
}

async function requestJson(
  url: string,
  endpoint: GitHubRequestEndpoint,
  capturedAt: Date,
  context: RequestContext,
): Promise<GitHubJsonResponse> {
  let response: Response;

  try {
    response = await context.fetchImpl(url, {
      method: "GET",
      headers: context.headers,
      signal: context.controller.signal,
      cache: "no-store",
    });
  } catch {
    if (context.controller.signal.aborted) {
      throw new GitHubTimeoutError(endpoint, context.timeoutMs);
    }

    throw new GitHubNetworkError(endpoint);
  }

  if (!response.ok) {
    const errorOptions = {
      status: response.status,
      statusText: response.statusText,
      endpoint,
      requestUrl: url,
      requestId: response.headers.get("x-github-request-id"),
    };

    if (isRateLimitResponse(response)) {
      throw new GitHubRateLimitError({
        ...errorOptions,
        ...getRateLimitDetails(response.headers, capturedAt),
      });
    }

    throw new GitHubHttpError(errorOptions);
  }

  try {
    return { data: await response.json(), headers: response.headers };
  } catch {
    throw new GitHubPayloadError(endpoint, "response body is not valid JSON.");
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function requiredRecord(
  value: unknown,
  endpoint: GitHubRequestEndpoint,
  field: string,
): JsonRecord {
  const record = asRecord(value);

  if (!record) {
    throw new GitHubPayloadError(endpoint, `${field} must be an object.`);
  }

  return record;
}

function requiredString(
  value: unknown,
  endpoint: GitHubRequestEndpoint,
  field: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new GitHubPayloadError(endpoint, `${field} must be a non-empty string.`);
  }

  return value;
}

function requiredId(
  value: unknown,
  endpoint: GitHubRequestEndpoint,
  field: string,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new GitHubPayloadError(endpoint, `${field} must be a positive integer.`);
  }

  return value as number;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function optionalNonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function optionalTimestamp(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function optionalStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function accountSource(
  login: string,
  apiUrl: string,
  capturedAt: string,
): GitHubSourceReference {
  return {
    provider: "github",
    apiUrl,
    publicUrl: `${GITHUB_WEB_ORIGIN}/${encodePathSegment(login)}`,
    capturedAt,
  };
}

function repositorySource(
  ownerLogin: string,
  name: string,
  capturedAt: string,
): GitHubSourceReference {
  const owner = encodePathSegment(ownerLogin);
  const repository = encodePathSegment(name);

  return {
    provider: "github",
    apiUrl: `${GITHUB_API_ORIGIN}/repos/${owner}/${repository}`,
    publicUrl: `${GITHUB_WEB_ORIGIN}/${owner}/${repository}`,
    capturedAt,
  };
}

function mapAccount(
  data: unknown,
  requestUrl: string,
  capturedAt: string,
): GitHubPublicAccount {
  const account = requiredRecord(data, "account", "account");
  const databaseId = requiredId(account.id, "account", "account.id");
  const nodeId = requiredString(account.node_id, "account", "account.node_id");
  const loginValue = requiredString(account.login, "account", "account.login");
  let login: string;

  try {
    login = parseGitHubLogin(loginValue);
  } catch {
    throw new GitHubPayloadError(
      "account",
      "account.login is not a valid GitHub login.",
    );
  }

  let kind: GitHubAccountKind;

  if (account.type === "User") {
    kind = "user";
  } else if (account.type === "Organization") {
    kind = "organization";
  } else {
    throw new GitHubPayloadError(
      "account",
      "account.type must be User or Organization.",
    );
  }

  return {
    stableId: `github:account:${nodeId}`,
    databaseId,
    nodeId,
    kind,
    login,
    displayName: optionalString(account.name),
    description: optionalString(account.bio ?? account.description),
    companyText: optionalString(account.company),
    locationText: optionalString(account.location),
    websiteText: optionalString(account.blog),
    avatarUrl: optionalHttpUrl(account.avatar_url),
    publicRepositoryCount: optionalNonNegativeInteger(account.public_repos),
    followerCount: optionalNonNegativeInteger(account.followers),
    followingCount: optionalNonNegativeInteger(account.following),
    createdAt: optionalTimestamp(account.created_at),
    updatedAt: optionalTimestamp(account.updated_at),
    source: accountSource(login, requestUrl, capturedAt),
  };
}

function mapRepository(
  value: unknown,
  capturedAt: string,
  index: number,
): GitHubPublicRepository | null {
  const repository = requiredRecord(
    value,
    "repositories",
    `repositories[${index}]`,
  );

  // A token must never make this public-enrichment adapter emit private data.
  if (repository.private !== false) {
    return null;
  }

  const databaseId = requiredId(
    repository.id,
    "repositories",
    `repositories[${index}].id`,
  );
  const nodeId = requiredString(
    repository.node_id,
    "repositories",
    `repositories[${index}].node_id`,
  );
  const name = requiredString(
    repository.name,
    "repositories",
    `repositories[${index}].name`,
  );
  const fullName = requiredString(
    repository.full_name,
    "repositories",
    `repositories[${index}].full_name`,
  );
  const owner = requiredRecord(
    repository.owner,
    "repositories",
    `repositories[${index}].owner`,
  );
  const ownerLoginValue = requiredString(
    owner.login,
    "repositories",
    `repositories[${index}].owner.login`,
  );
  let ownerLogin: string;

  try {
    ownerLogin = parseGitHubLogin(ownerLoginValue);
  } catch {
    throw new GitHubPayloadError(
      "repositories",
      `repositories[${index}].owner.login is not a valid GitHub login.`,
    );
  }

  const license = asRecord(repository.license);

  return {
    stableId: `github:repository:${nodeId}`,
    databaseId,
    nodeId,
    name,
    fullName,
    repositoryOwnerLogin: ownerLogin,
    visibility: "public",
    description: optionalString(repository.description),
    homepageText: optionalString(repository.homepage),
    primaryLanguage: optionalString(repository.language),
    topics: optionalStringArray(repository.topics),
    licenseSpdxId: optionalString(license?.spdx_id),
    defaultBranch: optionalString(repository.default_branch),
    isFork: optionalBoolean(repository.fork),
    isArchived: optionalBoolean(repository.archived),
    starCount: optionalNonNegativeInteger(repository.stargazers_count),
    forkCount: optionalNonNegativeInteger(repository.forks_count),
    openIssueCount: optionalNonNegativeInteger(repository.open_issues_count),
    createdAt: optionalTimestamp(repository.created_at),
    updatedAt: optionalTimestamp(repository.updated_at),
    pushedAt: optionalTimestamp(repository.pushed_at),
    source: repositorySource(ownerLogin, name, capturedAt),
  };
}

function mapRepositories(
  data: unknown,
  capturedAt: string,
): GitHubPublicRepository[] {
  if (!Array.isArray(data)) {
    throw new GitHubPayloadError("repositories", "body must be an array.");
  }

  return data.flatMap((value, index) => {
    const repository = mapRepository(value, capturedAt, index);
    return repository ? [repository] : [];
  });
}

function getRepositoryRequestUrl(
  account: GitHubPublicAccount,
  repositoryLimit: number,
): string {
  const login = encodePathSegment(account.login);
  const path =
    account.kind === "organization"
      ? `/orgs/${login}/repos`
      : `/users/${login}/repos`;
  const url = new URL(path, GITHUB_API_ORIGIN);

  url.searchParams.set("type", account.kind === "organization" ? "public" : "owner");
  url.searchParams.set("sort", "updated");
  url.searchParams.set("direction", "desc");
  url.searchParams.set("per_page", String(repositoryLimit));

  return url.toString();
}

/**
 * Fetches a public GitHub account snapshot and a bounded page of public repos.
 *
 * Server-only contract: pass a token only from server code (for example, a Route
 * Handler or Server Component). The token is never returned or attached to errors.
 */
export async function enrichGitHubPublicAccount(
  loginInput: unknown,
  options: GitHubPublicEnrichmentOptions = {},
): Promise<GitHubPublicEnrichment> {
  const requestedLogin = parseGitHubLogin(loginInput);
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const repositoryLimit = normalizeRepositoryLimit(options.maxRepositories);
  const capturedAt = getCapturedAt(options.now);
  const controller = new AbortController();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new GitHubConfigurationError(
      "A native-compatible fetch implementation is required.",
    );
  }

  const requestContext: RequestContext = {
    controller,
    fetchImpl,
    headers: createRequestHeaders(options.token),
    timeoutMs,
  };
  const accountRequestUrl = `${GITHUB_API_ORIGIN}/users/${encodePathSegment(requestedLogin)}`;
  let activeEndpoint: GitHubRequestEndpoint = "account";
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new GitHubTimeoutError(activeEndpoint, timeoutMs));
    }, timeoutMs);
  });

  const enrichmentPromise = (async (): Promise<GitHubPublicEnrichment> => {
    const accountResponse = await requestJson(
      accountRequestUrl,
      "account",
      capturedAt.date,
      requestContext,
    );
    const account = mapAccount(
      accountResponse.data,
      accountRequestUrl,
      capturedAt.iso,
    );

    let repositories: GitHubPublicRepository[] = [];

    if (repositoryLimit > 0) {
      activeEndpoint = "repositories";
      const repositoriesRequestUrl = getRepositoryRequestUrl(
        account,
        repositoryLimit,
      );
      const repositoriesResponse = await requestJson(
        repositoriesRequestUrl,
        "repositories",
        capturedAt.date,
        requestContext,
      );
      repositories = mapRepositories(repositoriesResponse.data, capturedAt.iso).slice(
        0,
        repositoryLimit,
      );
    }

    return {
      schemaVersion: GITHUB_PUBLIC_ENRICHMENT_SCHEMA_VERSION,
      provider: "github",
      requestedLogin,
      capturedAt: capturedAt.iso,
      account,
      repositories,
      repositoryLimit,
    };
  })();

  try {
    return await Promise.race([enrichmentPromise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
