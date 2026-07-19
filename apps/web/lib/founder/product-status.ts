import type { GitHubPublicRepository } from "../connectors/github";
import { formatDate } from "./format";

type RepoFacts = Pick<
  GitHubPublicRepository,
  "fullName" | "description" | "starCount" | "openIssueCount" | "pushedAt" | "primaryLanguage"
>;

/**
 * Builds a product-status claim statement using only fields the GitHub public
 * connector actually returned. Nothing here is estimated or invented — a
 * repository with no stars, no pushes, and no description simply contributes
 * fewer facts to the sentence.
 */
export function buildProductStatusStatement(repo: RepoFacts): string {
  const facts: string[] = [];
  if (repo.primaryLanguage) facts.push(`built in ${repo.primaryLanguage}`);
  if (typeof repo.starCount === "number") facts.push(`${repo.starCount} GitHub star${repo.starCount === 1 ? "" : "s"}`);
  if (typeof repo.openIssueCount === "number") {
    facts.push(`${repo.openIssueCount} open issue${repo.openIssueCount === 1 ? "" : "s"}`);
  }
  if (repo.pushedAt) facts.push(`last pushed ${formatDate(repo.pushedAt)}`);

  const factsText = facts.length > 0 ? ` (${facts.join(", ")})` : "";
  const description = repo.description ? ` — ${repo.description}` : "";
  return `Repository ${repo.fullName}${description}${factsText}.`;
}

export function buildProductStatusSourceNote(repo: RepoFacts): string {
  const parts: string[] = [];
  if (typeof repo.starCount === "number") parts.push(`${repo.starCount} stars`);
  if (repo.pushedAt) parts.push(`pushed ${formatDate(repo.pushedAt)}`);
  return `Drafted from repo activity${parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}`;
}
