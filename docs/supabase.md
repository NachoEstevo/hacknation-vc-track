# Supabase

UNDR uses a managed Supabase project as the canonical store for companies, founders, evidence, and enrichment history.

## Project

- Name: `UNDR`
- Project reference: `xdcisgusvswbwklidsqg`
- Region: `us-east-1`
- API URL: `https://xdcisgusvswbwklidsqg.supabase.co`

## Current data

The initial import contains:

- 102 companies
- 102 company source records
- 2 founders
- 4 founder identity candidates
- 2 founder-company relationships
- 1 private traction evidence record

The company set includes the normalized US and UK software cohort plus the founder-submitted Rely profile. Founder identities are stored as candidates until a provider or account-owner flow verifies them.

## Schema

The schema is defined by versioned SQL migrations in `supabase/migrations`:

- `companies`: canonical company records
- `company_sources`: source-specific snapshots and provenance
- `founders`: canonical people
- `founder_identities`: LinkedIn, GitHub, and other identity candidates
- `company_founders`: company-founder relationships
- `evidence`: source-backed claims used by the investment brief engine
- `enrichment_runs`: observable enrichment job history

Generated TypeScript definitions live at `packages/data-core/src/supabase/database.types.ts` and are exported by `@hacknation/data-core`.

## Access model

Direct table privileges for `anon` and `authenticated` are revoked. Row Level Security remains enabled on every application table. The product should read and write this data through trusted server routes, where authorization and evidence visibility can be enforced consistently.

Never expose a Supabase secret or service-role key in browser code. Only variables prefixed with `NEXT_PUBLIC_` may reach the client.

Required environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xdcisgusvswbwklidsqg.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

The publishable key currently has no direct table privileges. `SUPABASE_SECRET_KEY` is server-only and must be configured in the deployment environment.

## Applying schema changes

Create a migration for every schema or permission change:

```bash
npx supabase migration new descriptive_name
```

Review the SQL, apply it to the target project, regenerate `database.types.ts`, and run the package checks before merging.

## Security invariants

- New tables must have RLS enabled.
- Direct client grants are opt-in, not the default.
- Private evidence must never be returned by a public endpoint.
- Identity candidates must not be promoted to verified without provider or owner evidence.
- Raw source payloads should be minimized and kept separate from canonical records.
