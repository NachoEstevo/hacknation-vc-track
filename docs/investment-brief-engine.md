# Investment brief engine

## Purpose and boundary

The engine turns a reviewed fund query and cited company evidence into deterministic evaluations, a stable ranking, and concise model-drafted briefs. Models may propose evidence indexes and draft prose; they do not set scores, directness, corroboration, contradictions, ranking, recommendations, verification states, or trusted evidence IDs.

The demo uses the committed 50-row US/UK Clay discovery snapshot internally and publishes only its public website/GitHub enrichment. Clay values remain unverified and `investor_private`; they may influence deterministic normalization and ranking but their records, normalized payloads, and evidence IDs are excluded from the public artifact. No Rely, Stripe, founder document, founder assertion, connected analytics, pitch-deck, or raw HTML data is used. The output is a research aid, not investment advice or a recommendation to transact.

## Environment and model roles

Run from `packages/data-core` with `OPENAI_API_KEY` set in the process environment. The CLI never writes the key, and persisted provider failures use fixed safe messages.

| Variable | Role | Default in this run | Reasoning |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | API authentication | required; never persisted | n/a |
| `OPENAI_EXTRACTION_MODEL` | thesis parsing and per-company claim extraction | `gpt-5.6-luna` | `none` |
| `OPENAI_BRIEF_MODEL` | top-company brief drafting | `gpt-5.6-sol` | `low` |

The live artifact used both defaults shown above. Thesis `generatedAt` and `promptVersion` are replaced with trusted runtime values after schema validation so model-authored metadata cannot misdate the artifact. Every provider response persists its actual and requested model, response ID, token usage, prompt version, trusted generation time, task, company, and thesis context. API keys and raw prompts are never part of that metadata.

## Runbook

With npm 11.6.2 in PowerShell, use the verified double separator. The first `--` ends npm's own options; npm forwards the second separator literally to the script, and this CLI intentionally consumes that leading separator. The commands below therefore work as written.

First parse only:

```powershell
Set-Location packages/data-core
npm run briefs:build -- -- --companies ../../data/source/clay-us-uk-early-software.csv --enrichment ../../data/enriched/company-web-profiles.json --thesis "Early US or UK B2B software companies with teams below 10 people and visible execution signals" --top 3 --output ../../data/briefs/demo-investment-briefs.json
```

This writes `data/briefs/demo-investment-briefs.thesis.json` and performs no per-company extraction or brief calls. Review every criterion. Geography is canonicalized to seed codes (`US`/`GB`); team size remains an executable numeric boundary; a composite B2B-software criterion remains one executable criterion with the model-assigned weight unchanged. It matches only when cited evidence supports both B2B and owned software, is partial when only one side is supported, conflicts on explicit negative evidence, and is otherwise missing. For this demo, accept a B2B software company, a maximum of 9 people, early stage, and visible execution signals; reject any invented revenue or founder constraint.

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
if ($summary.generationMetadata.count -ne $artifact.generationMetadata.Count) { throw "Generation metadata mismatch" }
if ($summary.generationMetadata.responseIdsPresent -ne $artifact.generationMetadata.Count) { throw "Missing response IDs" }
if (@($artifact.evidence.evidence | Where-Object visibility -ne "public").Count) { throw "Non-public evidence published" }
if (@($artifact.briefs | Where-Object { $_.generatedAt -lt $artifact.generatedAt }).Count) { throw "Invalid brief timestamp" }
```

## Deterministic scoring and ranking

- Thesis fit is `100 * fit points / known criterion weight`. A match earns its full weight, partial earns half, and missing/conflict earns zero. It is `null` when no criterion is known. `Self-employed` derives a 1-1 range; numeric bands derive minimum/maximum values. A band overlapping a boundary is partial, while an incomparable band is missing rather than conflict.
- Evidence coverage is `100 * known criterion weight / total criterion weight`.
- Each assessment axis scores `100 * earned points / known possible points`; axis coverage is known possible points divided by all possible points.
- Claim trust adds source reliability (20-40), provenance-derived directness (8, 18, or 25), genuinely independent corroboration (0, 10, or 20), and recency (0, 5, 10, or 15). Recency uses the trusted run clock, not an evidence timestamp chosen from the bundle. A claim is supported at 70 or above.
- Application code retains only proposed citations whose company-local excerpts or payloads deterministically ground the claim field and value. Duplicate records and multiple pages controlled by the same authority cannot self-corroborate; uncertain independence earns zero. Grounded contrary values force `conflicted`. Model-authored directness, independence lists, and conflict booleans are absent from the request schema and ignored if a legacy fake supplies them.
- Canonical country codes are authoritative when present. The composite B2B-software criterion preserves one criterion and its original weight. Explicit evidence must support both the business model and an owned SaaS, software product, API, app, or ERP for a match; one supported side is partial; clear negative evidence is conflict; taxonomy or a model claim alone cannot establish it.
- Visible execution requires a concrete product, pricing, changelog, or public GitHub signal; a bare homepage or model claim is insufficient.
- Ranking uses exactly four deterministic keys: descending raw Thesis Fit, descending Evidence Coverage, descending Product/Execution axis score, then ascending stable company ID. No other evaluation field participates in the comparator.
- Public website/GitHub enrichment is excluded when both its resolved domain and profile-name identity disagree with the seed company. Internal Clay evidence remains available, but mismatched public evidence cannot influence claims, axes, ranking, or briefs.
- A blocking required/excluded conflict yields `pass_for_thesis`; under 30% coverage or unknown fit yields `needs_evidence`; at least 70% fit and 60% coverage yields `investigate`; other cases yield `watch`.

## Citation rejection and retries

Every fact and analysis statement must cite known public evidence IDs. Uncited facts/analysis, unknown IDs, and numeric values in facts or analysis that are absent from cited evidence invalidate the brief. A contextual policy rejects deterministic decision labels, scored evaluation metadata, criterion states, and ranking claims while allowing ordinary product prose such as credit scores, customer ratings, candidate matching, and watching training videos. Invalid briefs are omitted and recorded as failures; the engine never fabricates replacements.

Requests retry HTTP 429, 500, 502, 503, and 504 at most twice, after 500 ms and 1.5 seconds. Invalid JSON/schema output gets one immediate retry. Refusals, non-retryable request errors, and citation-validation failures do not retry. Up to four companies are processed concurrently, and one company failure does not abort the other evaluations.

## Live demo result and known gaps

The final accepted run generated at `2026-07-19T01:20:12.171Z` is `partial`: 50 evaluations, 50 ranked companies, three requested briefs, two citation-valid briefs, and one sanitized `draft_investment_brief` failure for Steal These Thoughts!. The exact approved comparator selects Icon, Steal These Thoughts!, and Julian Jewel's AI Bot. Icon and Steal These Thoughts! each have 100% known fit and 60.870% coverage and are `investigate`; Julian has 100% known fit and 43.478% coverage and is `watch`. Valid briefs were published for Icon and Julian. The artifact contains 35 website records and one GitHub record, all public.

The five executable criterion distributions are: geography 50 match; composite B2B software 2 conflict, 7 partial, and 41 missing; team size 5 match and 45 partial; stage 50 missing; visible execution 22 match and 28 missing. RunRex and Tech On Toast contain explicit negative evidence for the composite; no company has enough cited evidence for both sides to reach a composite match. The fit distribution remains non-degenerate: five companies scored 100%, 15 scored 82.143%, 21 scored 75%, four scored 73.684%, three scored 66.667%, one scored 60.526%, and one scored 50%.

The run mechanically retained 53 generation records: 50 claim-extraction responses from `gpt-5.6-luna` and three brief responses from `gpt-5.6-sol`. All 53 have response IDs and task/company/thesis context; aggregate usage is 59,945 input, 9,199 output, and 69,144 total tokens. Steal These Thoughts!' draft failed after bounded handling, so the run remains honestly partial rather than fabricating a brief. Stage evidence remains unsupported throughout the catalog.

Use the sanitized summary for demos and the full artifact for operator review. Do not treat either file as diligence completion or investment advice.
