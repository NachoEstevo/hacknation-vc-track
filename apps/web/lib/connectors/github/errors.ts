import type { GitHubRequestEndpoint } from "./types";

export type GitHubConnectorErrorCode =
  | "invalid_login"
  | "invalid_configuration"
  | "http_status"
  | "rate_limit"
  | "timeout"
  | "network"
  | "invalid_payload";

export class GitHubConnectorError extends Error {
  readonly provider = "github" as const;

  constructor(
    message: string,
    readonly code: GitHubConnectorErrorCode,
  ) {
    super(message);
    this.name = "GitHubConnectorError";
  }
}

export class GitHubLoginValidationError extends GitHubConnectorError {
  constructor() {
    super(
      "GitHub login must be 1-39 alphanumeric characters or single hyphens, without a leading or trailing hyphen.",
      "invalid_login",
    );
    this.name = "GitHubLoginValidationError";
  }
}

export class GitHubConfigurationError extends GitHubConnectorError {
  constructor(message: string) {
    super(message, "invalid_configuration");
    this.name = "GitHubConfigurationError";
  }
}

interface GitHubHttpErrorOptions {
  status: number;
  statusText: string;
  endpoint: GitHubRequestEndpoint;
  requestUrl: string;
  requestId: string | null;
  code?: "http_status" | "rate_limit";
}

export class GitHubHttpError extends GitHubConnectorError {
  readonly status: number;
  readonly statusText: string;
  readonly endpoint: GitHubRequestEndpoint;
  readonly requestUrl: string;
  readonly requestId: string | null;

  constructor(options: GitHubHttpErrorOptions) {
    super(
      `GitHub ${options.endpoint} request failed with HTTP ${options.status}.`,
      options.code ?? "http_status",
    );
    this.name = "GitHubHttpError";
    this.status = options.status;
    this.statusText = options.statusText;
    this.endpoint = options.endpoint;
    this.requestUrl = options.requestUrl;
    this.requestId = options.requestId;
  }
}

export interface GitHubRateLimitDetails {
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
  retryAfterSeconds: number | null;
  resource: string | null;
}

export class GitHubRateLimitError extends GitHubHttpError {
  readonly limit: number | null;
  readonly remaining: number | null;
  readonly resetAt: string | null;
  readonly retryAfterSeconds: number | null;
  readonly resource: string | null;

  constructor(
    options: Omit<GitHubHttpErrorOptions, "code"> & GitHubRateLimitDetails,
  ) {
    super({ ...options, code: "rate_limit" });
    this.name = "GitHubRateLimitError";
    this.limit = options.limit;
    this.remaining = options.remaining;
    this.resetAt = options.resetAt;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.resource = options.resource;
  }
}

export class GitHubTimeoutError extends GitHubConnectorError {
  constructor(
    readonly endpoint: GitHubRequestEndpoint,
    readonly timeoutMs: number,
  ) {
    super(
      `GitHub ${endpoint} request exceeded the ${timeoutMs}ms timeout.`,
      "timeout",
    );
    this.name = "GitHubTimeoutError";
  }
}

export class GitHubNetworkError extends GitHubConnectorError {
  constructor(readonly endpoint: GitHubRequestEndpoint) {
    super(`GitHub ${endpoint} request failed before a response was received.`, "network");
    this.name = "GitHubNetworkError";
  }
}

export class GitHubPayloadError extends GitHubConnectorError {
  constructor(
    readonly endpoint: GitHubRequestEndpoint,
    message: string,
  ) {
    super(`Invalid GitHub ${endpoint} response: ${message}`, "invalid_payload");
    this.name = "GitHubPayloadError";
  }
}

export function isGitHubConnectorError(
  error: unknown,
): error is GitHubConnectorError {
  return error instanceof GitHubConnectorError;
}
