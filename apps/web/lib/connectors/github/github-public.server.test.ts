import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GitHubConfigurationError,
  GitHubHttpError,
  GitHubPayloadError,
  GitHubRateLimitError,
  GitHubTimeoutError,
} from "./errors";
import { enrichGitHubPublicAccount } from "./github-public.server";
import { GITHUB_API_VERSION } from "./types";
import { isValidGitHubLogin, parseGitHubLogin } from "./validation";

const CAPTURED_AT = "2026-07-18T12:34:56.000Z";

function accountFixture(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    login: "octocat",
    id: 1,
    node_id: "MDQ6VXNlcjE=",
    type: "User",
    name: "The Octocat",
    bio: "Public profile text",
    company: "@github",
    location: "San Francisco",
    blog: "https://github.blog",
    avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
    public_repos: 8,
    followers: 17_000,
    following: 9,
    created_at: "2011-01-25T18:44:36Z",
    updated_at: "2026-07-01T10:00:00Z",
    ...overrides,
  };
}

function repositoryFixture(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 1_296_269,
    node_id: "MDEwOlJlcG9zaXRvcnkxMjk2MjY5",
    name: "Hello-World",
    full_name: "octocat/Hello-World",
    owner: { login: "octocat" },
    private: false,
    description: "A public example repository",
    homepage: "https://example.com",
    fork: false,
    archived: false,
    language: "TypeScript",
    topics: ["demo", "typescript"],
    license: { spdx_id: "MIT" },
    default_branch: "main",
    stargazers_count: 42,
    forks_count: 7,
    open_issues_count: 3,
    created_at: "2011-01-26T19:01:12Z",
    updated_at: "2026-07-10T10:00:00Z",
    pushed_at: "2026-07-09T10:00:00Z",
    ...overrides,
  };
}

function jsonResponse(
  data: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function deterministicNow(): Date {
  return new Date(CAPTURED_AT);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GitHub login validation", () => {
  it.each([
    "a",
    "octocat",
    "OpenAI",
    "hello-world",
    "a23456789012345678901234567890123456789",
  ])("accepts %s", (login) => {
    expect(isValidGitHubLogin(login)).toBe(true);
    expect(parseGitHubLogin(login)).toBe(login);
  });

  it.each([
    "",
    "-octocat",
    "octocat-",
    "hello--world",
    "hello_world",
    "hello.world",
    "octo/cat",
    " octocat",
    "a234567890123456789012345678901234567890",
  ])("rejects %s", (login) => {
    expect(isValidGitHubLogin(login)).toBe(false);

    try {
      parseGitHubLogin(login);
      throw new Error("Expected parseGitHubLogin to reject the input.");
    } catch (error) {
      expect(error).toMatchObject({ code: "invalid_login" });
    }
  });
});

describe("enrichGitHubPublicAccount", () => {
  it("maps a public user and repositories without requiring a token", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(accountFixture()))
      .mockResolvedValueOnce(
        jsonResponse([
          repositoryFixture(),
          repositoryFixture({
            id: 2,
            node_id: "repo-node-2",
            name: "unknown-fields",
            full_name: "octocat/unknown-fields",
            language: null,
            topics: undefined,
            license: null,
            fork: undefined,
            archived: undefined,
            stargazers_count: undefined,
          }),
        ]),
      );

    const result = await enrichGitHubPublicAccount("octocat", {
      fetchImpl: fetchMock,
      maxRepositories: 2,
      now: deterministicNow,
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      provider: "github",
      requestedLogin: "octocat",
      capturedAt: CAPTURED_AT,
      repositoryLimit: 2,
      account: {
        stableId: "github:account:MDQ6VXNlcjE=",
        kind: "user",
        login: "octocat",
        publicRepositoryCount: 8,
        source: {
          apiUrl: "https://api.github.com/users/octocat",
          publicUrl: "https://github.com/octocat",
          capturedAt: CAPTURED_AT,
        },
      },
    });
    expect(result.repositories).toHaveLength(2);
    expect(result.repositories[0]).toMatchObject({
      stableId: "github:repository:MDEwOlJlcG9zaXRvcnkxMjk2MjY5",
      visibility: "public",
      primaryLanguage: "TypeScript",
      topics: ["demo", "typescript"],
      starCount: 42,
      source: {
        apiUrl: "https://api.github.com/repos/octocat/Hello-World",
        publicUrl: "https://github.com/octocat/Hello-World",
        capturedAt: CAPTURED_AT,
      },
    });
    expect(result.repositories[1]).toMatchObject({
      primaryLanguage: null,
      topics: null,
      licenseSpdxId: null,
      isFork: null,
      isArchived: null,
      starCount: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [accountUrl, accountInit] = fetchMock.mock.calls[0];
    const [repositoriesUrl] = fetchMock.mock.calls[1];
    const headers = new Headers(accountInit?.headers);

    expect(accountUrl).toBe("https://api.github.com/users/octocat");
    expect(repositoriesUrl).toBe(
      "https://api.github.com/users/octocat/repos?type=owner&sort=updated&direction=desc&per_page=2",
    );
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("accept")).toBe("application/vnd.github+json");
    expect(headers.get("x-github-api-version")).toBe(GITHUB_API_VERSION);
    expect(accountInit).toMatchObject({ method: "GET", cache: "no-store" });
    expect(accountInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses the organization repository endpoint and never emits the token", async () => {
    const token = "github_pat_super_secret_value";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          accountFixture({
            login: "github",
            id: 9_919,
            node_id: "org-node-id",
            type: "Organization",
            name: "GitHub",
            bio: "How people build software.",
            company: null,
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          repositoryFixture({
            id: 3,
            node_id: "org-repo-node",
            name: "docs",
            full_name: "github/docs",
            owner: { login: "github" },
          }),
          repositoryFixture({
            id: 4,
            node_id: "private-repo-node",
            name: "private-repo",
            full_name: "github/private-repo",
            owner: { login: "github" },
            private: true,
          }),
        ]),
      );

    const result = await enrichGitHubPublicAccount("github", {
      token,
      fetchImpl: fetchMock,
      maxRepositories: 2,
      now: deterministicNow,
    });

    expect(result.account.kind).toBe("organization");
    expect(result.repositories).toHaveLength(1);
    expect(result.repositories[0].repositoryOwnerLogin).toBe("github");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.github.com/orgs/github/repos?type=public&sort=updated&direction=desc&per_page=2",
    );

    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer ${token}`,
      );
    }

    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("can skip repositories with an explicit zero limit", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(accountFixture()));

    const result = await enrichGitHubPublicAccount("octocat", {
      fetchImpl: fetchMock,
      maxRepositories: 0,
      now: deterministicNow,
    });

    expect(result.repositories).toEqual([]);
    expect(result.repositoryLimit).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects repository limits outside GitHub's page bounds before fetching", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    await expect(
      enrichGitHubPublicAccount("octocat", {
        fetchImpl: fetchMock,
        maxRepositories: 101,
      }),
    ).rejects.toBeInstanceOf(GitHubConfigurationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a typed HTTP status error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(
        { message: "Not Found" },
        {
          status: 404,
          statusText: "Not Found",
          headers: { "x-github-request-id": "request-404" },
        },
      ),
    );

    const request = enrichGitHubPublicAccount("missing-user", {
      fetchImpl: fetchMock,
      now: deterministicNow,
    });

    await expect(request).rejects.toMatchObject({
      name: "GitHubHttpError",
      code: "http_status",
      status: 404,
      statusText: "Not Found",
      endpoint: "account",
      requestId: "request-404",
      requestUrl: "https://api.github.com/users/missing-user",
    });
    await expect(request).rejects.toBeInstanceOf(GitHubHttpError);
  });

  it("returns rate-limit reset and retry data in a typed error", async () => {
    const resetEpochSeconds = 1_768_000_000;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(
        { message: "API rate limit exceeded" },
        {
          status: 403,
          statusText: "Forbidden",
          headers: {
            "retry-after": "60",
            "x-github-request-id": "request-rate",
            "x-ratelimit-limit": "60",
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(resetEpochSeconds),
            "x-ratelimit-resource": "core",
          },
        },
      ),
    );

    const request = enrichGitHubPublicAccount("octocat", {
      fetchImpl: fetchMock,
      now: deterministicNow,
    });

    await expect(request).rejects.toMatchObject({
      name: "GitHubRateLimitError",
      code: "rate_limit",
      status: 403,
      endpoint: "account",
      limit: 60,
      remaining: 0,
      resetAt: new Date(resetEpochSeconds * 1_000).toISOString(),
      retryAfterSeconds: 60,
      resource: "core",
    });
    await expect(request).rejects.toBeInstanceOf(GitHubRateLimitError);
  });

  it("aborts the active request when the total timeout is exceeded", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          observedSignal = init?.signal ?? undefined;
          observedSignal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const request = enrichGitHubPublicAccount("octocat", {
      fetchImpl: fetchMock,
      timeoutMs: 25,
      now: deterministicNow,
    });
    const shapeAssertion = expect(request).rejects.toMatchObject({
      code: "timeout",
      endpoint: "account",
      timeoutMs: 25,
    });
    const classAssertion = expect(request).rejects.toBeInstanceOf(
      GitHubTimeoutError,
    );

    await vi.advanceTimersByTimeAsync(25);

    await Promise.all([shapeAssertion, classAssertion]);
    expect(observedSignal?.aborted).toBe(true);
  });

  it("rejects unsupported GitHub account types instead of inferring a user", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(accountFixture({ type: "Bot" })));

    const request = enrichGitHubPublicAccount("octocat", {
      fetchImpl: fetchMock,
      now: deterministicNow,
    });

    await expect(request).rejects.toBeInstanceOf(GitHubPayloadError);
    await expect(request).rejects.toMatchObject({
      code: "invalid_payload",
      endpoint: "account",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
