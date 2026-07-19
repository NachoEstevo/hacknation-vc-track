import type { GitHubEvidence } from "./types";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface GitHubOptions { fetcher?: Fetcher; token?: string }

export async function enrichGitHubProfile(profileUrl: string, options: GitHubOptions = {}): Promise<GitHubEvidence> {
  const sourceUrl = profileUrl;
  let login: string;
  try {
    const url = new URL(profileUrl);
    if (url.hostname.toLowerCase().replace(/^www\./, "") !== "github.com") throw new Error();
    login = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!login) throw new Error();
  } catch {
    return { status: "error", sourceUrl, note: "invalid_github_profile_url" };
  }
  const fetcher = options.fetcher ?? fetch;
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "HackNationVCResearch/0.1" };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  try {
    let accountType: "organization" | "user" = "organization";
    let account = await fetcher(`https://api.github.com/orgs/${login}`, { headers });
    if (account.status === 404) {
      accountType = "user";
      account = await fetcher(`https://api.github.com/users/${login}`, { headers });
    }
    if (account.status === 403 || account.status === 429) return { status: "rate_limited", sourceUrl, note: "github_api_rate_limited" };
    if (account.status === 404) return { status: "not_found", sourceUrl, note: "github_account_not_found" };
    if (!account.ok) return { status: "error", sourceUrl, note: `github_http_${account.status}` };
    const metadata = await account.json() as Record<string, unknown>;
    const repoPath = accountType === "organization" ? `orgs/${login}` : `users/${login}`;
    const reposResponse = await fetcher(`https://api.github.com/${repoPath}/repos?sort=pushed&per_page=20`, { headers });
    const repos = reposResponse.ok ? await reposResponse.json() as Array<Record<string, unknown>> : [];
    const activeRepos = repos.filter((repo) => repo.fork !== true);
    return {
      status: "ok", sourceUrl, accountType, login,
      publicRepos: typeof metadata.public_repos === "number" ? metadata.public_repos : undefined,
      followers: typeof metadata.followers === "number" ? metadata.followers : undefined,
      createdAt: typeof metadata.created_at === "string" ? metadata.created_at : undefined,
      latestPushAt: activeRepos.map((repo) => repo.pushed_at).filter((v): v is string => typeof v === "string").sort().at(-1) ?? null,
      latestRepositoryUpdateAt: activeRepos.map((repo) => repo.updated_at).filter((v): v is string => typeof v === "string").sort().at(-1) ?? null,
      totalStarsSampled: activeRepos.reduce((sum, repo) => sum + (typeof repo.stargazers_count === "number" ? repo.stargazers_count : 0), 0),
      note: "Public GitHub activity only; not proof of company ownership or traction.",
    };
  } catch (error) {
    return { status: "error", sourceUrl, note: error instanceof Error ? error.message : "github_fetch_failed" };
  }
}
