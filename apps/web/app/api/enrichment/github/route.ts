import { NextResponse } from "next/server";
import { z } from "zod";
import {
  GitHubHttpError,
  GitHubRateLimitError,
  isGitHubConnectorError,
} from "@/lib/connectors/github";
import { enrichGitHubPublicAccount } from "@/lib/connectors/github/github-public.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  login: z.string().trim().min(1).max(39),
  maxRepositories: z.number().int().min(0).max(20).optional(),
});

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return noStoreJson(
      { error: { code: "invalid_request", message: "Expected a JSON request body." } },
      400,
    );
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return noStoreJson(
      {
        error: {
          code: "invalid_request",
          message: "Provide a valid public GitHub login and up to 20 repositories.",
        },
      },
      400,
    );
  }

  try {
    const enrichment = await enrichGitHubPublicAccount(parsed.data.login, {
      maxRepositories: parsed.data.maxRepositories,
      token: process.env.GITHUB_TOKEN,
    });

    return noStoreJson({
      data: enrichment,
      interpretationBoundary:
        "Public GitHub observations only. This does not verify founder identity, company ownership, traction, or code quality.",
    });
  } catch (error) {
    if (error instanceof GitHubRateLimitError) {
      return noStoreJson(
        {
          error: {
            code: error.code,
            message: "GitHub rate limited this public-source check.",
            resetAt: error.resetAt,
            retryAfterSeconds: error.retryAfterSeconds,
          },
        },
        429,
      );
    }

    if (error instanceof GitHubHttpError) {
      const status = error.status === 404 ? 404 : 502;
      return noStoreJson(
        {
          error: {
            code: error.code,
            message:
              error.status === 404
                ? "That public GitHub account was not found."
                : "GitHub could not complete this public-source check.",
          },
        },
        status,
      );
    }

    if (isGitHubConnectorError(error)) {
      const status = error.code === "invalid_login" || error.code === "invalid_configuration"
        ? 400
        : 502;
      return noStoreJson(
        { error: { code: error.code, message: error.message } },
        status,
      );
    }

    return noStoreJson(
      { error: { code: "source_unavailable", message: "The public source is unavailable." } },
      502,
    );
  }
}
