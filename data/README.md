# Data

## `source/clay-companies.csv`

This is the provisional Clay export supplied for the HackNation VC track prototype.

- Snapshot received: 2026-07-18
- Rows: 50 companies
- Intended coverage: small Software and IT companies in the United States and United Kingdom
- Usable fields: name, description, primary industry, size, type, location, country, domain, and LinkedIn company URL
- Known limitation: the supplied file contains 50 rows even though the expected source base was described as approximately 350 companies
- Verification status: unverified discovery data

The application must preserve source provenance and must not treat an imported description, employee band, domain, or social URL as verified investment evidence. Importing a later complete export should be idempotent and should update or add records without duplicating normalized domains.

The file contains company-level public business information and is intentionally committed to the public prototype repository at the dataset owner's request.

## `enriched/clay-founder-pilot.json`

This is a public-data pilot from Clay MCP contact search across three company domains. It is committed so candidate-resolution behavior remains reproducible. Every relationship is labeled `candidate_only`; accepted candidates still require founder or admin confirmation before the application may present them as verified founders.
