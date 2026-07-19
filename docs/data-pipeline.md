# Data pipeline

## Cohort

The VC prototype now uses only the user's latest Clay company search. No Acelera or LATAM records are mixed in.

Exact search constraints:

- country: United States or United Kingdom;
- size: self-employed or 2-10 employees;
- annual revenue: $0-$500K;
- AI industry: Software and IT;
- AI subindustries: AI and ML Platforms, Renewable Energy and Clean Tech, Blockchain and Web3, Financial Services Software, and Enterprise Software Solutions.

Clay contains a dedicated table named `Small Software IT Companies US UK` with a 400-result limit. The reproducible local snapshot is the original 50-row export at `data/source/clay-us-uk-early-software.csv`. It contains 17 US and 33 UK companies, with 45 domains and 50 LinkedIn company URLs. All source fields remain `unverified`.

Authenticated Clay table: <https://app.clay.com/workspaces/1276708/w/enrich-companies?conversationId=cc_0tidy3j2rHFpJKJyPyd&tableId=t_0tidz84SYzwFzmxqfGs&viewId=gv_0tidz8aq3N5BXDRgDhA&workbookId=wb_0tidz84opu4UNxCFU5z>

No paid Clay enrichment was run. Clay's browser download was blocked by Brave when the 400-row export redirected to its S3 download, so the committed source stays at 50 rows rather than silently substituting a different search.

## Public-web enrichment

`packages/data-core` enriches each company from its public website and optional public GitHub organization or user profile.

The crawler:

- accepts only HTTP(S) public-internet destinations and validates every redirect;
- blocks credentials, localhost, private, loopback, link-local, reserved, and documentation networks;
- checks robots.txt with a recognizable user agent;
- accepts HTML only, caps responses at 2 MB, uses an eight-second page timeout, and processes at most four companies concurrently;
- captures the homepage plus up to three prioritized same-origin About, Team, Company, Leadership, or Founder pages;
- persists extracted facts and evidence URLs, never raw HTML;
- never requests LinkedIn or X pages; it only records outbound profile links published by the company;
- calls the public GitHub REST API only for GitHub profile links published on company-controlled pages.

GitHub activity is an execution signal, not proof of ownership, product quality, revenue, users, or investability. Founder records extracted from explicit JSON-LD founder/co-founder properties remain `candidate_only`.

## Current run

The 2026-07-18 run over all 50 companies produced:

| Metric | Value |
| --- | ---: |
| Complete website profiles | 37 |
| Partial website profiles | 1 |
| Failed or domainless profiles | 12 |
| Evidence pages retained | 86 |
| Company-published LinkedIn links | 61 |
| Explicit founder candidates | 3 |
| GitHub profiles resolved | 1 |

Failures remain visible per company, including missing domains, DNS failures, timeouts, non-HTML responses, and response-size limits. They are not backfilled with guesses.

Outputs:

- `data/enriched/company-web-profiles.json`: per-company evidence and failures;
- `data/enriched/company-web-profiles-summary.json`: run-level coverage;
- `data/enriched/clay-founder-pilot.json`: earlier three-company founder-search pilot, kept as a separate provenance snapshot.

## Investment brief run

The brief engine consumes only `data/source/clay-us-uk-early-software.csv` and `data/enriched/company-web-profiles.json` for the demo run. It parses the human thesis into a reviewable file and stops before company-level model calls. An operator must inspect and explicitly accept that file before the 50-company analysis can start.

The final accepted run generated at `2026-07-19T00:34:58.756Z` evaluated and ranked all 50 companies. It requested three briefs, generated two citation-valid briefs, and retained one sanitized draft failure, so the result is honestly `partial`. The composite B2B-software thesis is represented as separate predicates: B2B is missing for all 50; explicit software-product evidence yields 2 matches, 47 missing states, and one clear negative conflict. Visible execution is deterministic from product, pricing, changelog, or GitHub signals. Ranking prioritizes non-blocking recommendations and then coverage-adjusted fit. The top three are Icon, Steal These Thoughts!, and Zendr Business; all are `investigate`, with 60.870-69.565% coverage. Public enrichment with both a resolved-domain and profile-name mismatch is excluded before evaluation; Clay remains internal and unpublished.

Outputs:

- `data/briefs/demo-investment-briefs.thesis.json`: reviewed thesis;
- `data/briefs/demo-investment-briefs.json`: allowlisted evidence, deterministic evaluations and ranking, cited briefs, and sanitized failures;
- `data/briefs/demo-investment-briefs-summary.json`: compact live-run counts and limitations.

The source CSV is an unverified owner-provided discovery export used internally for normalization and ranking. Its `investor_private` evidence records and normalized payloads are excluded from the published artifact. Public evaluations/axes have private evidence IDs removed, brief drafting receives only public evidence, and publication fails if any brief would retain a private or dangling citation. No Rely, Stripe, founder document, or founder assertion data was used. Full operation and scoring details are in `docs/investment-brief-engine.md`.

## Run locally

```powershell
Set-Location packages/data-core
npm test
npm run typecheck
npm run analyze:seed -- ../../data/source/clay-us-uk-early-software.csv
npx tsx scripts/enrich-seed.ts
```

Optional positional arguments are input CSV, output JSON, maximum companies, and concurrency. Concurrency is capped at four:

```powershell
npx tsx scripts/enrich-seed.ts ../../data/source/clay-us-uk-early-software.csv ../../data/enriched/company-web-profiles.json 50 4
```

Set `GITHUB_TOKEN` only to increase GitHub API rate limits; the pipeline works without it.

## Product boundary

These snapshots feed a reviewable VC brief. They do not produce an investment recommendation or claim that a founder, company, revenue figure, customer count, or codebase is verified. Founder confirmation, connected analytics, and private pitch-deck evidence must be stored as separate higher-confidence sources.
