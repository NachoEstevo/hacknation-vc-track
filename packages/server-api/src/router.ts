import { ApiError } from "./errors.js";
import type { ApiServices, Authenticate } from "./types.js";
import { founderEvidenceInput, searchInput, uuid, watchlistInput } from "./validation.js";

interface ApiDependencies {
  authenticate: Authenticate;
  services: ApiServices;
}

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "invalid_request", "A valid JSON body is required.");
  }
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } }, error.status);
  return json({ error: { code: "internal_error", message: "The request could not be completed." } }, 500);
}

export function createApi({ authenticate, services }: ApiDependencies): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const currentUser = await authenticate(request);
      if (!currentUser) throw new ApiError(401, "unauthorized", "Authentication required.");
      const url = new URL(request.url);

      if (request.method === "POST" && url.pathname === "/v1/search") {
        return json(await services.searchCompanies(currentUser.userId, searchInput(await jsonBody(request))));
      }

      const brief = url.pathname.match(/^\/v1\/companies\/([^/]+)\/brief$/u);
      if (request.method === "GET" && brief) {
        const searchId = url.searchParams.get("searchId");
        if (!searchId) throw new ApiError(400, "invalid_request", "searchId is required.");
        return json(await services.getCompanyBrief(currentUser.userId, uuid(brief[1]!, "companyId"), uuid(searchId, "searchId")));
      }

      const watchlist = url.pathname.match(/^\/v1\/watchlist\/([^/]+)$/u);
      if (request.method === "PUT" && watchlist) {
        return json(await services.saveWatchlist(currentUser.userId, uuid(watchlist[1]!, "companyId"), watchlistInput(await jsonBody(request))));
      }

      const evidence = url.pathname.match(/^\/v1\/companies\/([^/]+)\/founder-evidence$/u);
      if (request.method === "POST" && evidence) {
        const result = await services.registerFounderEvidence(
          currentUser.userId,
          uuid(evidence[1]!, "companyId"),
          founderEvidenceInput(await jsonBody(request)),
        );
        return json(result, 201);
      }

      throw new ApiError(404, "not_found", "Route was not found.");
    } catch (error) {
      return errorResponse(error);
    }
  };
}
