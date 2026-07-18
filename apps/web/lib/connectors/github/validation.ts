import { GitHubLoginValidationError } from "./errors";

// GitHub logins are at most 39 characters and allow alphanumerics separated by
// single hyphens. Keeping the accepted alphabet narrow also makes URL paths safe.
const GITHUB_LOGIN_PATTERN =
  /^(?!.*--)[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export function isValidGitHubLogin(value: unknown): value is string {
  return typeof value === "string" && GITHUB_LOGIN_PATTERN.test(value);
}

export function parseGitHubLogin(value: unknown): string {
  if (!isValidGitHubLogin(value)) {
    throw new GitHubLoginValidationError();
  }

  return value;
}
