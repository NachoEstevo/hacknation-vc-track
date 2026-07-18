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

On npm 11 in this Windows environment, use two separators so npm forwards option names. Older npm releases may need only the conventional single separator.

First parse only:

```powershell
Set-Location packages/data-core
npm run briefs:build -- -- --companies ../../data/source/clay-us-uk-early-software.csv --enrichment ../../data/enriched/company-web-profiles.json --thesis "Early US or UK B2B software companies with teams below 10 people and visible execution signals" --top 3 --output ../../data/briefs/demo-investment-briefs.json
```

This writes `data/briefs/demo-investment-briefs.thesis.json` and performs no per-company extraction or brief calls. Review every criterion. Geography is canonicalized to seed codes (`US`/`GB`); team size remains an executable numeric boundary. For this demo, accept B2B software, a maximum of 9 people, early stage, and visible execution signals; reject any invented revenue or founder constraint.

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
- Claim trust adds source reliability (20-40), directness (0-25), corroboration (0, 10, or 20), and recency (0, 5, 10, or 15). A non-conflicted claim is supported at 70 or above.
- Ranking sorts by thesis fit, evidence coverage, product-execution score, and finally stable company ID. This makes ties reproducible.
- A blocking required/excluded conflict yields `pass_for_thesis`; under 30% coverage or unknown fit yields `needs_evidence`; at least 70% fit and 60% coverage yields `investigate`; other cases yield `watch`.

## Citation rejection and retries

Every fact and analysis statement must cite known public evidence IDs. Uncited facts/analysis, unknown IDs, and numeric values in facts or analysis that are absent from cited evidence invalidate the brief. A structural policy also rejects prose containing decision labels or recommendation, rank, fit, coverage, score, axis, or criterion metadata vocabulary. Invalid briefs are omitted and recorded as failures; the engine never fabricates replacements.

Requests retry HTTP 429, 500, 502, 503, and 504 at most twice, after 500 ms and 1.5 seconds. Invalid JSON/schema output gets one immediate retry. Refusals, non-retryable request errors, and citation-validation failures do not retry. Up to four companies are processed concurrently, and one company failure does not abort the other evaluations.

## Live demo result and known gaps

The final 2026-07-18 run is `partial`: 50 evaluations, 50 ranked companies, three requested briefs, two citation-valid briefs, and one sanitized `draft_investment_brief` failure for Julian Jewel's AI Bot. The selected companies were Julian Jewel's AI Bot, Icon, and Steal These Thoughts!. All were `pass_for_thesis` at 66.667% thesis fit and 65.217% evidence coverage. The published artifact contains 38 website records and one GitHub record, all public.

The fit distribution is non-degenerate: four companies scored 66.667%, one 60.870%, one 60.526%, 43 scored 50%, and one 16.667%. Geography is canonical, and team-size bands now evaluate deterministically. Claim extraction receives the reviewed criterion IDs so B2B, stage, and execution claims can map back to the evaluator. In this run the top three matched geography and the self-employed size range, conflicted with B2B software, and lacked supported stage/traction claims. Founder identity, revenue, customers, usage, and ownership remain unverified unless public cited evidence explicitly supports them.

Use the sanitized summary for demos and the full artifact for operator review. Do not treat either file as diligence completion or investment advice.
