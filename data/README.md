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
