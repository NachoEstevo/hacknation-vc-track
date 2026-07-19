import { isValidGitHubLogin } from "../connectors/github";

export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  /** Canonical `https://github.com/<owner>/<repo>` form, independent of what the founder typed. */
  canonicalUrl: string;
}

const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Parses a founder-submitted repository URL into an owner/repo pair, or
 * returns `null` if it is not a well-formed public GitHub repository link.
 * This never guesses at an owner/repo from a bare string — only accepts an
 * actual `github.com/<owner>/<repo>` URL — so we never enrich the wrong repo.
 */
export function parseGitHubRepoUrl(input: string): ParsedGitHubRepo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname.toLowerCase() !== "github.com" && url.hostname.toLowerCase() !== "www.github.com") {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const [ownerRaw, repoRaw] = segments;
  const owner = ownerRaw!;
  const repo = repoRaw!.replace(/\.git$/, "");

  if (!isValidGitHubLogin(owner) || !REPO_NAME_PATTERN.test(repo)) return null;

  return {
    owner,
    repo,
    canonicalUrl: `https://github.com/${owner}/${repo}`,
  };
}
