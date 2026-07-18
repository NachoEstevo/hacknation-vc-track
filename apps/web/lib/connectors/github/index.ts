export {
  GitHubConfigurationError,
  GitHubConnectorError,
  GitHubHttpError,
  GitHubLoginValidationError,
  GitHubNetworkError,
  GitHubPayloadError,
  GitHubRateLimitError,
  GitHubTimeoutError,
  isGitHubConnectorError,
  type GitHubConnectorErrorCode,
  type GitHubRateLimitDetails,
} from "./errors";
export {
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
export { isValidGitHubLogin, parseGitHubLogin } from "./validation";

// The executable adapter intentionally is not re-exported here. Import
// `./github-public.server` from server code so credential boundaries stay obvious.
