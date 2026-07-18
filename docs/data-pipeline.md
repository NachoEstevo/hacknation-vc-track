# Data pipeline

## Purpose

The Data Core turns sparse company records into provenance-bearing inputs for the VC product. It deliberately stops before UI, investment scoring, or automated founder verification.

## Provisional Clay source

`data/source/clay-companies.csv` contains 50 company rows even though the expected upstream base was described as approximately 350 companies. The usable columns are name, description, primary industry, size band, organization type, location, country, domain, and LinkedIn company URL.

Current quality report:

| Metric | Value |
| --- | ---: |
| Rows | 50 |
| Accepted normalized companies | 50 |
| Duplicate normalized domains | 0 |
| Missing domains | 5 |
| US companies | 17 |
| UK companies | 33 |
| LinkedIn company URL coverage | 100% |

Run the report with:

```powershell
npm --prefix packages/data-core run analyze:seed -- ../../data/source/clay-companies.csv
```

The importer ignores the empty export-title column, preserves the raw row, records its row number, and labels every value `unverified`. Deduplication uses normalized domain first, LinkedIn company slug second, and normalized name plus country only when neither URL is available. Conflicting duplicate rows are reported rather than silently merged.

## Clay MCP findings

The connected Clay MCP exposes public company/contact search and enrichment tools. Its Audiences API is not enabled for this workspace, so saved audiences cannot currently be queried through MCP. Only a Clay workspace administrator enabling Audiences can change that state.

The browser-visible `Acelera` audience is not suitable as the VC seed:

- 181,148 records;
- 33 total columns, with 7 visible in the current view;
- fields include domain, headquarters, LinkedIn URL, origin source, and technographics;
- the current population is broad LATAM/education data rather than the US/UK early-stage universe.

It is useful as a schema reference, but its records must not be mixed into the VC dataset without a new, explicit selection thesis.

## Founder profile pilot

Clay public contact search accepts up to ten company domains or LinkedIn company URLs in one request. A three-domain pilot used `icon.com`, `thectojournal.com`, and `careerprinciples.com` with founder/co-founder profile keywords.

The pilot returned:

- Kennan Frost at Icon: accepted as a candidate because current domain and founder title match;
- Kenji Farré at Career Principles: accepted as a candidate for the same reason;
- Kevin Miller at GR0: rejected because the current domain does not match Icon;
- Ronak Shah at Obvi: rejected because the current domain does not match Icon;
- The CTO Journal: no accepted founder candidate.

The public snapshot is stored at `data/enriched/clay-founder-pilot.json`. These are candidates, not verified founders.

## Candidate-resolution rules

1. Missing LinkedIn person URL is rejected.
2. A current company domain different from the target company is rejected.
3. Exact current-domain match plus an explicit founder title becomes an `accepted_candidate` with 0.9 confidence.
4. Exact company-name match plus founder title but no current domain requires review.
5. CEO alone does not prove founder status and requires review even when the domain matches.
6. Founder or admin confirmation is stored separately from the discovery confidence.

This distinction prevents a search result from becoming an asserted employment or ownership fact.

## Safe batch proposal

For the remaining seed companies:

1. Send at most ten domains per Clay contact-search task.
2. Preserve the task capture time and raw public result.
3. Apply `resolveFounderCandidate` to every returned contact.
4. Import accepted candidates and review cases into a review queue.
5. Keep rejected matches as audit records, not visible founder relationships.
6. Ask founders to confirm their company and connect GitHub before raising verification state.

A full 45-domain run is deliberately not triggered until the team confirms acceptable Clay credit usage and reviews pilot precision.

## Production integration boundary

The Clay connector available inside Codex is an operator tool, not automatically a callable backend API for the deployed application. The application therefore consumes normalized snapshots or a future explicitly authenticated Clay API integration. It must not claim continuous Clay synchronization based on this MCP connection.

LinkedIn is never scraped by the application. Clay-provided or founder-provided LinkedIn URLs are stored with source provenance and linked outward.

## Storage contract

The first migration creates:

- `companies`: canonical normalized company record;
- `company_sources`: immutable source snapshots and verification state;
- `founders`: person identity independent from a company;
- `founder_identities`: LinkedIn, GitHub, and other profile identities;
- `company_founders`: explicit relationship state, confidence, and resolution reason;
- `evidence`: public or private provenance-bearing artifacts;
- `enrichment_runs`: connector execution status and failures.

Row-level security is enabled with no end-user policies in this slice, which means authenticated application users have no direct table access until the role-specific application policies are implemented. Backend service-role access must remain server-side and must never be committed.

## Next data work

The next safe slice is GitHub enrichment for founder-confirmed usernames or organization URLs. It should record repository activity, contributors, releases, and timestamps as evidence signals without treating activity volume as code quality, commercial traction, or company ownership.

