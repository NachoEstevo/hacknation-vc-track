# Website and Founder Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce useful company and founder profiles for the exact US/UK early-stage software cohort selected in Clay, without relying on paid Clay enrichment.

**Architecture:** Extend the existing TypeScript Data Core with a bounded public-web crawler, structured profile extraction, and optional GitHub API enrichment. Every output is a timestamped evidence snapshot. Website links may discover LinkedIn profiles, but the application never requests or scrapes LinkedIn pages.

**Tech Stack:** TypeScript, Node.js fetch/DNS APIs, Cheerio, robots-parser, csv-parse, Vitest, GitHub REST API

## Global Constraints

- Do not create or modify UI files.
- Only process companies from the user's latest Clay search: US/UK, self-employed or 2-10 employees, $0-$500K revenue, and software/AI-related subindustries.
- Never treat a discovered person or social link as a verified founder relationship.
- Never scrape LinkedIn or X pages; only preserve outbound URLs found on company-controlled pages.
- Respect robots.txt, bound requests, block private-network targets, and limit same-origin traversal.
- Persist concise extracted facts and evidence URLs, not complete third-party page copies.
- GitHub activity is an execution signal, not proof of company ownership, product quality, revenue, or users.
- All code paths work without API keys; `GITHUB_TOKEN` is optional.
- Use TDD for behavior changes and run the full package test/typecheck suite before each commit.

---

### Task 1: Exact Clay cohort and reproducible source snapshot

**Files:**
- Use: `C:\Users\nacho\Desktop\Small-Companies,-Software-and-IT,-US-and-UK-Default-view-export-1784401549683.csv`
- Create: `data/source/clay-us-uk-early-software.csv`
- Modify: `data/README.md`

- [ ] Preserve the original 50-row CSV as the runnable local source snapshot.
- [ ] Record the exact search filters and the separate 400-result Clay table URL.
- [ ] Validate row count, countries, size bands, domains, and duplicate identities with the existing import batch.
- [ ] Do not mix in Acelera, LATAM, or a looser industry search.

### Task 2: Safe bounded website crawler

**Files:**
- Create: `packages/data-core/src/web/safe-url.ts`
- Create: `packages/data-core/src/web/fetch-public-page.ts`
- Create: `packages/data-core/src/web/discover-company-pages.ts`
- Create: `packages/data-core/src/web/types.ts`
- Modify: `packages/data-core/src/index.ts`
- Test: `packages/data-core/test/safe-url.test.ts`
- Test: `packages/data-core/test/discover-company-pages.test.ts`

**Interfaces:**
- `assertSafePublicUrl(url: URL, lookup?): Promise<void>` rejects credentials, non-HTTP(S), localhost, private/reserved IPv4/IPv6, and unsafe redirects.
- `fetchPublicPage(url, options): Promise<FetchPageResult>` applies timeout, robots rules, redirect validation, HTML-only response checks, and a 2 MB limit.
- `discoverCompanyPages(homeHtml, homeUrl): URL[]` returns at most three same-origin About/Team/Company/Founder pages.

- [ ] Write URL-safety tests with injected DNS results for public, loopback, RFC1918, link-local, and IPv6-local addresses.
- [ ] Observe the focused tests fail before implementation.
- [ ] Implement safety checks and redirect-by-redirect validation.
- [ ] Write HTML discovery tests that reject external links and prioritize exact About/Team paths.
- [ ] Observe failure, then implement with Cheerio and a hard three-page cap.
- [ ] Add robots-parser and a recognizable crawler user-agent; store skipped/error reasons rather than throwing away the company.
- [ ] Run full tests/typecheck and commit.

### Task 3: Company profile, founder candidate, social, and GitHub extraction

**Files:**
- Create: `packages/data-core/src/enrichment/extract-company-profile.ts`
- Create: `packages/data-core/src/enrichment/extract-json-ld.ts`
- Create: `packages/data-core/src/enrichment/extract-social-links.ts`
- Create: `packages/data-core/src/enrichment/enrich-github-profile.ts`
- Create: `packages/data-core/src/enrichment/types.ts`
- Modify: `packages/data-core/src/index.ts`
- Test: `packages/data-core/test/extract-company-profile.test.ts`
- Test: `packages/data-core/test/enrich-github-profile.test.ts`

**Interfaces:**
- `extractCompanyProfile(pages: CapturedPage[]): ExtractedCompanyProfile`
- `FounderWebCandidate` includes name, role, profile URLs, evidence URL, extraction method, and `candidate_only` state.
- `enrichGitHubProfile(url, fetcher?): Promise<GitHubEvidence>` returns account type, public metadata, repository counts, recent push/release timestamps, and source URLs.

- [ ] Write fixtures containing Organization/Person JSON-LD, About-page founder text, LinkedIn/GitHub/X links, product description, pricing and changelog links.
- [ ] Observe extraction tests fail, then implement deterministic JSON-LD and link extraction.
- [ ] Only accept founder candidates from explicit `founder`, `co-founder`, or Organization founder properties; ambiguous team members remain people candidates.
- [ ] Write GitHub connector tests using a local fake fetcher for organization success, user fallback, rate limit, and missing account.
- [ ] Observe failure, then implement the smallest connector with optional bearer token and no hidden retries.
- [ ] Run full tests/typecheck and commit.

### Task 4: Batch runner, real 50-company enrichment, and documentation

**Files:**
- Create: `packages/data-core/src/enrichment/enrich-company.ts`
- Create: `packages/data-core/scripts/enrich-seed.ts`
- Modify: `packages/data-core/package.json`
- Create: `packages/data-core/test/enrich-company.test.ts`
- Create: `data/enriched/company-web-profiles.json`
- Create: `data/enriched/company-web-profiles-summary.json`
- Modify: `docs/data-pipeline.md`
- Modify: `data/README.md`

**Interfaces:**
- `enrichCompany(company, dependencies): Promise<CompanyEnrichmentResult>` never fails the entire batch for one company.
- CLI options: `--input`, `--output`, `--concurrency`, `--max-companies`, and `--github`.

- [ ] Write a test proving page failures produce a typed partial result while successful pages retain provenance.
- [ ] Observe failure, then implement orchestration with maximum four concurrent companies, three pages per company, eight-second request timeout, and timestamped results.
- [ ] Run the CLI over all 50 primary companies; do not fabricate data for inaccessible sites.
- [ ] Generate a compact summary containing successes, partials, failures, discovered founder candidates, social links, GitHub profiles, and per-company evidence coverage.
- [ ] Document the exact US/UK cohort, crawler policy, output schema, known limitations, and rerun commands.
- [ ] Run full tests, typecheck, seed analysis, JSON validation, and `git diff --check`.
- [ ] Commit, merge into `main`, rerun verification on `main`, push `origin/main`, and remove the worktree/feature branch.

### Task 5: Clay table handoff

**Files:**
- Use: authenticated Clay table `Small Software IT Companies US UK`

- [ ] Keep the dedicated 400-result table created from the user's latest search.
- [ ] Stop before any paid enrichment action; table creation and founder enrichment are separate operations.
- [ ] Record that the first 50 rows are the reproducible local cohort and that the 400-row export remains available in Clay.
