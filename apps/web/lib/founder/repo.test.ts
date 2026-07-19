import { describe, expect, it } from "vitest";
import { parseGitHubRepoUrl } from "./repo";

describe("parseGitHubRepoUrl", () => {
  it("parses a standard repository URL", () => {
    expect(parseGitHubRepoUrl("https://github.com/acme/relay")).toEqual({
      owner: "acme",
      repo: "relay",
      canonicalUrl: "https://github.com/acme/relay",
    });
  });

  it("strips a trailing .git suffix and extra path segments", () => {
    expect(parseGitHubRepoUrl("https://github.com/acme/relay.git/tree/main")).toEqual({
      owner: "acme",
      repo: "relay",
      canonicalUrl: "https://github.com/acme/relay",
    });
  });

  it("rejects non-GitHub hosts", () => {
    expect(parseGitHubRepoUrl("https://gitlab.com/acme/relay")).toBeNull();
  });

  it("rejects a bare account URL with no repo segment", () => {
    expect(parseGitHubRepoUrl("https://github.com/acme")).toBeNull();
  });

  it("rejects malformed input without throwing", () => {
    expect(parseGitHubRepoUrl("not a url")).toBeNull();
    expect(parseGitHubRepoUrl("")).toBeNull();
  });

  it("rejects an invalid GitHub login segment", () => {
    expect(parseGitHubRepoUrl("https://github.com/-bad-/relay")).toBeNull();
  });
});
