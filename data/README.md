# Data

## `source/clay-us-uk-early-software.csv`

The exact 50-row export from the user's latest Clay search for self-employed or 2-10-person US/UK companies in software/AI-related subindustries with $0-$500K annual revenue. It is committed at the dataset owner's request and every imported value remains unverified discovery data.

The separate authenticated Clay table has a 400-result limit. It is not represented as a local 400-row file because Brave blocked Clay's S3 download; this repository does not fill the gap with Acelera, LATAM, or a different industry search.

## `enriched/company-web-profiles.json`

A timestamped, reproducible public-web evidence snapshot for all 50 companies. It stores concise extracted facts, company-published profile links, GitHub public metadata, evidence URLs, and typed failures. It never stores downloaded HTML or scraped LinkedIn/X content.

## `enriched/company-web-profiles-summary.json`

Coverage counts for the corresponding enrichment run.

## `enriched/clay-founder-pilot.json`

An earlier three-company Clay contact-search pilot. It remains separate from the website run, and every relationship is labeled `candidate_only` until founder or admin confirmation.

## `briefs/demo-investment-briefs.thesis.json`

The reviewed machine-readable thesis for the live demo. The proposed thesis was accepted only after confirming its US/UK, B2B software, below-10-person team, early-stage, and visible-execution criteria and confirming that it did not invent revenue or founder requirements.

## `briefs/demo-investment-briefs.json`

The live analysis generated at `2026-07-19T01:20:12.171Z` from the exact 50-company source snapshot and public-web enrichment. It contains 50 deterministic evaluations and rankings plus two model-drafted, mechanically citation-valid briefs; one top-three draft failure remains explicit. Ranking uses raw Thesis Fit, Evidence Coverage, Product/Execution score, and stable company ID. The artifact also stores 53 safe provider metadata records. It contains only public website/GitHub evidence and sanitized evidence references: no Clay payloads, raw CSV rows, Rely data, founder-private evidence, payment evidence, API key, or raw prompt.

## `briefs/demo-investment-briefs-summary.json`

A CLI-generated summary from the same run with actual model names, trusted timestamps, counts, selected company identities, failures, provenance, response-ID completeness, and aggregate token usage. The 50 committed Clay discovery records are used internally for normalization and ranking but never published; the artifact exposes 35 website records and one GitHub record: 36 public records and 0 private records.

See `docs/investment-brief-engine.md` for commands, scoring, retry behavior, and interpretation limits.
