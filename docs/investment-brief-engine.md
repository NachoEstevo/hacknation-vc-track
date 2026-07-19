# Investment brief engine

## Purpose and boundary

The engine turns a reviewed fund query and cited company evidence into deterministic evaluations, a stable ranking, and concise model-drafted briefs. Models extract or phrase evidence; they do not set scores, ranking, recommendations, verification states, or evidence IDs.

The demo uses the committed 50-row US/UK Clay discovery snapshot internally and publishes only its public website/GitHub enrichment. Clay values remain unverified and `investor_private`; they may influence deterministic normalization and ranking but their records, normalized payloads, and evidence IDs are excluded from the public artifact. No Rely, Stripe, founder document, founder assertion, connected analytics, pitch-deck, or raw HTML data is used. The output is a research aid, not investment advice or a recommendation to transact.

## Environment and model roles

Run from `packages/data-core` with `OPENAI_API_KEY` set in the process environment. The CLI never writes the key, and persisted provider failures use fixed safe messages.

| Variable | Role | Default in this run | Reasoning |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | API authentication | required; never persisted | n/a |
| `OPENAI_EXTRACTION_MODEL` | thesis parsing and per-company claim extraction | `gpt-5.6-luna` | `none` |
| `OPENAI_BRIEF_MODEL` | top-company brief drafting | `gpt-5.6-sol` | `low` |

The live artifact used both defaults shown above. Thesis `generatedAt` and `promptVersion` are replaced with trusted runtime values after schema validation so model-authored metadata cannot misdate the artifact.

## Runbook

With npm 11.6.2 in PowerShell, use the verified double separator. The first `--` ends npm's own options; npm forwards the second separator literally to the script, and this CLI intentionally consumes that leading separator. The commands below therefore work as written.

First parse only:

```powershell
Set-Location packages/data-core
npm run briefs:build -- -- --companies ../../data/source/clay-us-uk-early-software.csv --enrichment ../../data/enriched/company-web-profiles.json --thesis "Early US or UK B2B software companies with teams below 10 people and visible execution signals" --top 3 --output ../../data/briefs/demo-investment-briefs.json
```

This writes `data/briefs/demo-investment-briefs.thesis.json` and performs no per-company extraction or brief calls. Review every criterion. Geography is canonicalized to seed codes (`US`/`GB`); team size remains an executable numeric boundary; a composite B2B-software criterion is split into separately executable B2B and software predicates without changing its total weight. For this demo, accept a B2B business model, a software product, a maximum of 9 people, early stage, and visible execution signals; reject any invented revenue or founder constraint.

Then accept the reviewed file:

```powershell
npm run briefs:build -- -- --companies ../../data/source/clay-us-uk-early-software.csv --enrichment ../../data/enriched/company-web-profiles.json --thesis-file ../../data/briefs/demo-investment-briefs.thesis.json --accept-parsed-thesis --top 3 --output ../../data/briefs/demo-investment-briefs.json
```

The accepted run writes the artifact and `demo-investment-briefs-summary.json` from the same in-memory result. Verify their invariants, not only JSON syntax:

```powershell
Get-Content ../../data/briefs/demo-investment-briefs.json -Raw | ConvertFrom-Json | Out-Null
Get-Content ../../data/briefs/demo-investment-briefs-summary.json -Raw | ConvertFrom-Json | Out-Null
$artifact = Get-Content ../../data/briefs/demo-investment-briefs.json -Raw | ConvertFrom-Json -Depth 100
$summary = Get-Content ../../data/briefs/demo-investment-briefs-summary.json -Raw | ConvertFrom-Json -Depth 30
if ($summary.generatedAt -ne $artifact.generatedAt) { throw "Summary run mismatch" }
if ($summary.counts.evaluatedCompanies -ne $artifact.evaluations.Count) { throw "Evaluation count mismatch" }
if ($summary.counts.validBriefs -ne $artifact.briefs.Count) { throw "Brief count mismatch" }
if (@($artifact.evidence.evidence | Where-Object visibility -ne "public").Count) { throw "Non-public evidence published" }
if (@($artifact.briefs | Where-Object { $_.generatedAt -lt $artifact.generatedAt }).Count) { throw "Invalid brief timestamp" }
```

## Deterministic scoring and ranking

- Thesis fit is `100 * fit points / known criterion weight`. A match earns its full weight, partial earns half, and missing/conflict earns zero. It is `null` when no criterion is known. `Self-employed` derives a 1-1 range; numeric bands derive minimum/maximum values. A band overlapping a boundary is partial, while an incomparable band is missing rather than conflict.
- Evidence coverage is `100 * known criterion weight / total criterion weight`.
- Each assessment axis scores `100 * earned points / known possible points`; axis coverage is known possible points divided by all possible points.
- Claim trust adds source reliability (20-40), directness (0-25), corroboration (0, 10, or 20), and recency (0, 5, 10, or 15). A claim is supported at 70 or above. Model-authored conflict flags are ignored; deterministic evaluation derives contradictions only from supported values.
- Canonical country codes are authoritative when present. Software requires explicit cited evidence that the company develops or owns a SaaS, software product, API, app, or ERP in product context; taxonomy or a model claim alone cannot establish it. Clear negative evidence creates a conflict, while a tech audience, marketplace, community, training offer, or non-equal taxonomy remains missing.
- Visible execution requires a concrete product, pricing, changelog, or public GitHub signal; a bare homepage or model claim is insufficient.
- Ranking first places `investigate`, `watch`, and `needs_evidence` ahead of blocking `pass_for_thesis` results. Within a recommendation tier it uses coverage-adjusted fit (`thesis fit * evidence coverage / 100`), followed by coverage, raw thesis fit, product-execution score, and stable company ID.
- Public website/GitHub enrichment is excluded when both its resolved domain and profile-name identity disagree with the seed company. Internal Clay evidence remains available, but mismatched public evidence cannot influence claims, axes, ranking, or briefs.
- A blocking required/excluded conflict yields `pass_for_thesis`; under 30% coverage or unknown fit yields `needs_evidence`; at least 70% fit and 60% coverage yields `investigate`; other cases yield `watch`.

## Citation rejection and retries

Every fact and analysis statement must cite known public evidence IDs. Uncited facts/analysis, unknown IDs, and numeric values in facts or analysis that are absent from cited evidence invalidate the brief. A contextual policy rejects deterministic decision labels, scored evaluation metadata, criterion states, and ranking claims while allowing ordinary product prose such as credit scores, customer ratings, candidate matching, and watching training videos. Invalid briefs are omitted and recorded as failures; the engine never fabricates replacements.

Requests retry HTTP 429, 500, 502, 503, and 504 at most twice, after 500 ms and 1.5 seconds. Invalid JSON/schema output gets one immediate retry. Refusals, non-retryable request errors, and citation-validation failures do not retry. Up to four companies are processed concurrently, and one company failure does not abort the other evaluations.

## Live demo result and known gaps

The final accepted run generated at `2026-07-19T00:34:58.756Z` is `partial`: 50 evaluations, 50 ranked companies, three requested briefs, two citation-valid briefs, and one sanitized `draft_investment_brief` failure for Steal These Thoughts!. The selected companies are Icon, Steal These Thoughts!, and Zendr Business; all three are `investigate`. Icon and Steal These Thoughts! each have 100% known fit, 60.870% coverage, and 60.870% adjusted fit. Zendr has 84.375% known fit, 69.565% coverage, and 58.696% adjusted fit. The published artifact contains 35 website records and one GitHub record, all public.

The six executable criterion distributions are: geography 50 match; B2B 50 missing; software product 2 match, 47 missing, and one explicit conflict; team size 5 match and 45 partial; stage 50 missing; visible execution 22 match and 28 missing. Tech On Toast is the single software conflict because its own internal description explicitly says it is not a tech company; its marketplace/community evidence does not manufacture a product match. Zendr matches on explicit mobile-ERP/platform evidence. The fit distribution is non-degenerate: five companies scored 100%, two 84.375%, 17 scored 82.143%, one 71.875%, and 25 scored 75%.

The persisted evaluator and briefs agree on the shortlist boundary: Icon has visible pricing/product execution but insufficient evidence to call it primarily software; Zendr has explicit software and pricing surfaces; and Steal These Thoughts! has a visible product surface but no supported software classification. Its draft failed after bounded handling, so the run remains honestly partial rather than fabricating a brief. B2B and stage remain unsupported throughout the catalog.

Use the sanitized summary for demos and the full artifact for operator review. Do not treat either file as diligence completion or investment advice.
