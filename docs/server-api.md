# UNDR server API

`packages/server-api` contains framework-neutral handlers built on the standard `Request` and `Response` APIs. A Next.js, Vercel, or other Node server can mount the exported `createProductionApi()` function without duplicating business logic.

All routes require `Authorization: Bearer <supabase-access-token>`. The token is verified against Supabase Auth on every request. Database reads and writes use the server-only secret key; the browser receives neither that key nor direct table privileges.

## Routes

### `POST /v1/search`

Parses a natural-language fund thesis, evaluates the current company evidence, ranks the companies, and persists the result snapshot under the authenticated user.

```json
{ "query": "US B2B AI companies with teams under 20", "limit": 10 }
```

The response includes `searchId`, the executable thesis, and ranked summaries. Keep `searchId`: it is required to open a company in the same evaluation context.

### `GET /v1/companies/:companyId/brief?searchId=:searchId`

Returns the company profile, founders and public identities, visible evidence, deterministic evaluation, ranking signals, and the original thesis. The route returns `404` when the search does not belong to the authenticated user or the company was not part of that result set.

### `PUT /v1/watchlist/:companyId`

Idempotently creates or updates the authenticated user's follow-up state.

```json
{ "status": "watching", "note": "Review retention after the next update" }
```

Allowed states are `watching`, `contacted`, and `passed`.

### `POST /v1/companies/:companyId/founder-evidence`

Registers evidence for a user with a verified founder membership in that company.

```json
{
  "evidenceType": "stripe_metrics",
  "excerpt": "Current customer snapshot",
  "structuredPayload": { "uniquePayingCustomers": 55 },
  "visibility": "investor_private"
}
```

New evidence is always stored as `unverified`; the API rejects any client-supplied verification field. Repeated submissions with identical canonical content are idempotent.

## Mounting

Create the production handler once and delegate incoming requests to it:

```ts
import { createProductionApi } from "@hacknation/server-api";

const handle = createProductionApi(process.env);

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
```

The frontend deployment must provide `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `OPENAI_API_KEY`. Only the first two may be present in browser bundles.

## Security boundaries

- RLS is enabled on operational tables and `anon`/`authenticated` table grants are revoked.
- Search ownership is checked server-side; IDs from the client are never treated as authorization.
- Founder evidence requires a `verified` `company_memberships` record.
- `founder_private` evidence is excluded from investor search and brief responses.
- Input sizes, UUIDs, URLs, statuses, and unknown fields are validated before persistence.
- The OpenAI query is treated as untrusted input and model output is schema-validated by the data core.
