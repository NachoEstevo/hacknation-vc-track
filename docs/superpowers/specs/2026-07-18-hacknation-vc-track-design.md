# HackNation VC-Track — Product Design

## Summary

HackNation VC-Track is an evidence-first early-stage investment workspace for investors who currently rely on company databases such as Crunchbase but want to evaluate smaller and earlier companies. It turns a sparse company record, a pitch deck, public technical signals, and founder-provided proof into a cited investment brief.

The product is not a general founder social network and does not claim to predict startup success. Its job is to find potentially overlooked companies, show why they match a fund thesis, distinguish claims from verified evidence, expose uncertainty, and help a human investor decide what to investigate next.

The working product and repository name is `hacknation-vc-track`.

## Problem

Traditional company databases are strongest after a company becomes visible: it has announced funding, built a public team, generated press, or accumulated enough commercial data. That creates a cold-start problem for investors moving earlier. First-time founders, technical builders, stealth companies, and teams without strong networks may have little structured information even when they have strong execution signals.

The judges need a platform they can use to:

- discover early companies from sparse inputs;
- apply their own investment thesis instead of accepting a generic ranking;
- inspect pitch decks and public evidence;
- receive a solid, concise, and explainable investment brief;
- follow prospects before investing and see meaningful changes;
- inspect a company and its founders in more depth;
- request missing proof or arrange a call.

## Track alignment

The design supports sourcing, screening, diligence, and human decision-making. It keeps Founder, Market, and Idea-vs-Market assessments separate, assigns provenance and confidence to individual claims, flags contradictions, and produces an actionable brief.

The watchlist is strictly a pre-investment prospect watchlist. Portfolio monitoring, fund operations, and exit management remain out of scope.

## Users and roles

### Investor

An investor creates a thesis, searches and filters candidates, reviews explanations and evidence, saves prospects, receives change summaries, and starts founder outreach.

### Founder

A founder creates or claims a company profile, uploads a deck, adds the founding team, connects or confirms public technical profiles, submits evidence, corrects inaccurate data, and sees which unresolved questions are preventing a confident evaluation.

### Admin

For the hackathon, an admin imports source data, resolves ambiguous company claims, and can rerun enrichment. Admin is an operational permission, not a third product experience.

## Product principles

1. **Evidence before polish.** A polished deck or large public audience is not treated as proof.
2. **Missing is not negative.** Unknown information lowers confidence; it does not automatically lower company quality.
3. **Thesis fit is contextual.** A company can be a strong match for one fund and a poor match for another without receiving a universal ranking.
4. **Every important claim is inspectable.** Users can see its source, capture time, confidence, and contradiction state.
5. **The investor decides.** The system recommends the next action but does not make an autonomous investment decision.
6. **Founders can correct the record.** Founder-submitted evidence is labeled and can increase confidence when independently corroborated.
7. **Low visibility is not low potential.** The interface explicitly surfaces companies with strong evidence but weak conventional visibility.

## Provisional dataset

The repository contains `data/source/clay-companies.csv` as the initial catalog.

The received export contains 50 rows, not 350. It has ten columns, one of which is entirely empty. The usable fields are company name, description, primary industry, employee-size band, organization type, location, country, domain, and LinkedIn company URL. Domain coverage is 90%; the other usable fields are complete. The data contains 33 UK companies and 17 US companies.

This source is discovery data, not verified investment evidence. The import process will:

- ignore the empty export-title column;
- normalize country, domain, company type, and employee-size values;
- use normalized domain as the primary deduplication key;
- fall back to normalized LinkedIn company URL and company name plus country when no domain exists;
- preserve the original row and import timestamp for auditability;
- be idempotent so the 50-row file can later be replaced by the complete export;
- label every imported value as `source: clay_csv` and `verification: unverified`.

## Core experience

### 1. Thesis-driven discovery

The investor describes a thesis in natural language, for example:

> Find B2B software companies in the US or UK with teams below 10 people, technical founders, early traction signals, and no obvious institutional funding.

AI converts the request into a visible structured thesis containing geography, sector, stage, team size, traction requirements, founder attributes, exclusions, and risk preferences. The investor confirms or edits the structure before search. Deterministic matching then evaluates candidates against explicit criteria.

Results show:

- thesis match;
- evidence confidence;
- the strongest matching evidence;
- missing information;
- why the company may be overlooked;
- the recommended next diligence action.

### 2. Evidence-first company brief

The company page combines imported data, website evidence, deck claims, GitHub signals, founder-provided proof, and prior snapshots. Its central artifact is the Evidence Graph: a claim-oriented view that makes support, uncertainty, and contradictions visible.

The brief contains:

- company overview and source provenance;
- thesis fit with pass, partial, missing, or conflict states per criterion;
- Founder assessment;
- Market assessment;
- Idea-vs-Market assessment;
- traction signals without silently converting proxies into revenue or users;
- claims and their supporting evidence;
- contradictions and stale information;
- unresolved questions ranked by information value;
- a concise recommendation: investigate, watch, pass for thesis reasons, or needs evidence;
- a human-readable memo with citations to evidence records.

### 3. Founder proof loop

An authenticated founder can claim a company through a matching-domain email or an admin-reviewed claim. GitHub authorization proves control of a GitHub account, not company ownership. The UI states this distinction explicitly.

The founder can upload a pitch deck, confirm team members, connect a GitHub identity or organization, add public profile links, and submit a link, document, or short answer for a specific unresolved question. The system extracts new claims, attaches provenance, reruns affected assessments, and shows the before-and-after change.

### 4. Prospect watchlist

An investor can follow a company and add a private note. Re-enrichment creates timestamped snapshots and a change feed. The MVP tracks public website changes, GitHub activity summaries, newly submitted founder evidence, and assessment changes caused by new evidence.

The product does not imply continuous real-time monitoring. A timestamp states when each source was last checked. For the live demo, the passage of time may be simulated transparently, but the compared snapshots and evidence must originate from real captured data.

### 5. Deep dive and outreach

The investor can inspect individual founders, source links, deck pages, technical activity, evidence history, and unresolved questions. A “Request intro / schedule call” action opens a configured Calendly or contact link and records the intended next action. The MVP does not send automated messages on behalf of investors.

## Scoring and trust model

The product must not expose a single universal startup score.

### Thesis Match

Thesis Match is query-specific. Every criterion receives one of four states: match, partial match, missing, or conflict. Its percentage summarizes confirmed criteria only and is always shown beside evidence coverage.

### Assessment axes

Founder, Market, and Idea-vs-Market are separate 0–100 assessments. Each axis displays the dimensions that contributed to it and the amount of missing evidence. The values represent the strength of currently available evidence against explicit evaluation criteria, not the probability of company success.

### Claim Trust Score

Each claim receives a deterministic 0–100 Trust Score composed of:

- source reliability: 0–40;
- directness of evidence: 0–25;
- corroboration by independent evidence: 0–20;
- recency: 0–15.

The scoring service stores every component. A contradiction adds an explicit conflict state and prevents the claim from being presented as verified. Founder assertions can be valuable but do not become verified solely because a founder submitted them.

### AI boundary

AI may extract claims, propose entity matches, map a thesis into a schema, identify possible contradictions, rank evidence gaps, and draft the brief. Deterministic application code owns permissions, deduplication, scoring, match aggregation, evidence state, citations, and persistence. A generated brief is rejected if a material sentence cannot be mapped to an evidence record or explicitly labeled as analysis or uncertainty.

## Data sources and integrations

### Supported in the MVP

- Clay CSV import.
- Founder and hackathon-user self-registration.
- Pitch deck PDF upload and structured extraction through the OpenAI Responses API.
- Public GitHub user and organization data through the GitHub REST API.
- Company website metadata and selected public pages, fetched on demand and cached.
- Founder-provided LinkedIn and X profile URLs.
- Configurable Calendly or contact link.

### Explicit constraints

- LinkedIn is not scraped. The product stores source-provided or user-provided URLs and displays them as outbound links.
- X is not a critical data dependency. A profile URL can be stored, and API-based enrichment can be added only if credentials and terms permit it.
- GitHub activity is an execution signal, not automatic proof of founder status, commercial traction, code quality, or company ownership.
- Website fetching is restricted to public HTTP(S) destinations, blocks private network addresses and redirects to them, uses strict timeouts, limits response size, and stores capture timestamps.
- Private revenue, user, or customer evidence is never inferred from public proxies.

## Architecture

The hackathon implementation is a single Next.js TypeScript application deployed to Vercel. A monolith keeps the vertical workflow fast to build and easy to demo; separate services are unnecessary at this stage.

### Application boundaries

- **UI routes and components:** discovery, shortlist, company brief, watchlist, founder onboarding, and admin import.
- **Use cases:** import companies, parse thesis, match companies, enrich company, process deck, submit proof, generate brief, and refresh watched company.
- **Domain services:** entity resolution, trust scoring, thesis matching, assessment calculation, citation validation, and snapshot differencing.
- **Connectors:** OpenAI, GitHub, website fetcher, file storage, and calendar links.
- **Persistence:** Supabase Postgres, Supabase Auth, and private Supabase Storage for decks and submitted documents.

Route handlers and server actions remain thin. Business rules live in focused services and use cases. Files should remain below 300 lines when reasonable, and new abstractions require at least three real consumers.

### Main entities

- `users` and `user_roles`;
- `companies` and `company_sources`;
- `founders`, `founder_identities`, and `company_founders`;
- `fund_theses` and `thesis_criteria`;
- `claims`, `evidence`, and `claim_evidence`;
- `decks` and `deck_pages`;
- `assessments` and `assessment_dimensions`;
- `watchlist_entries`, `company_snapshots`, and `change_events`;
- `company_claim_requests` and `proof_submissions`.

Every evidence record includes source type, source URL or private object reference, captured timestamp, excerpt or structured payload, visibility, and content hash. Private evidence is excluded from public or cross-investor views unless the founder explicitly grants access.

## Authentication, authorization, and privacy

- Authentication uses email magic links.
- Users choose founder or investor onboarding; admin permission is configured separately.
- Investor notes and watchlists are private to the investor account.
- Founder-uploaded decks and documents are private storage objects accessed through short-lived signed URLs.
- A founder can view and correct public facts attached to their claimed company but cannot edit investor notes or assessments directly.
- Deleting a founder submission removes private file access and records an auditable tombstone without retaining the private content.
- The UI shows source, recency, and correction controls for potentially damaging or negative claims.
- No protected-class attribute is used as a scoring input.

## Error handling and degraded states

- CSV rows that cannot be normalized are quarantined with a reason instead of silently discarded.
- Ambiguous entity matches remain suggestions until confirmed by an admin or founder.
- GitHub and website failures retain the last successful snapshot and show that the source is stale.
- OpenAI structured-output failures are retried once, then surfaced as a recoverable processing failure.
- Brief generation cannot proceed with invalid citations; the user receives the evidence view instead of an unsupported memo.
- A company with no enrichable source remains searchable from imported fields and displays low evidence coverage.
- Rate limits use caching and backoff. The live demo uses previously captured, timestamped real responses as a fallback.

## Core screens

1. **Sign in and role onboarding.** Real founder and investor accounts.
2. **Discover.** Conversational thesis input, structured thesis confirmation, and shortlist.
3. **Company Brief.** Overview, match explanation, three assessment axes, Evidence Graph, sources, gaps, and actions.
4. **Watchlist.** Saved prospects, last-checked time, changes, private notes, and next actions.
5. **Founder Portal.** Company claim, deck upload, team/profile connections, proof requests, and correction flow.
6. **Admin Import.** CSV preview, validation result, idempotent import, and enrichment trigger.

## Hackathon demo

The two-to-three-minute path is:

1. Sign in as an investor and describe an early-stage thesis.
2. Confirm the parsed criteria and generate a shortlist from the Clay seed data plus hackathon founders.
3. Open a less-visible company that has strong evidence but incomplete conventional data.
4. Inspect one deck claim, its GitHub or website evidence, its Trust Score, and one unresolved contradiction or gap.
5. Switch to the founder role and submit the smallest proof requested by the platform.
6. Return to the investor brief and show the affected claim, assessment, and memo update.
7. Add the company to the watchlist and open the schedule-call action.

The main wow moment is the visible transition from an unsupported claim to a cited, higher-confidence investment view without hiding remaining uncertainty.

### Must be real

- CSV import and normalization;
- natural-language thesis parsing;
- deterministic candidate matching;
- at least one real pitch deck extraction;
- at least one real GitHub or website enrichment;
- evidence records and citations;
- founder proof submission;
- assessment and brief update;
- authentication and watchlist persistence.

### May be simulated transparently

- passage of time between two real snapshots;
- delivery of an external notification;
- final calendar booking confirmation;
- additional companies beyond the available 50-row export.

## Testing strategy

- Unit tests cover CSV normalization, deduplication, trust scoring, thesis matching, assessment calculations, citation validation, and snapshot diffs.
- Integration tests cover database authorization boundaries, idempotent imports, deck-to-claim processing, founder proof updates, and cached connector failures.
- Browser tests cover the complete investor discovery flow and founder proof loop.
- Adversarial fixtures include duplicate companies, ambiguous GitHub identities, a false deck claim, a broken source, no GitHub history, stale evidence, and founder proof that does not resolve the question.
- A production build, database migration check, and the full demo flow must pass before publishing.

## Success criteria

The hackathon MVP succeeds when:

- all valid rows in the provisional CSV import without duplicates;
- an investor can express and confirm a thesis in under one minute;
- each shortlist result explains both matches and missing evidence;
- a company brief contains no unsupported material claim;
- a founder submission produces an inspectable before-and-after update;
- an investor can persist a watchlist entry and next action;
- the central demo completes reliably within three minutes;
- judges can distinguish the product from a company search database or generic chat interface.

## Main risks and mitigations

### Incorrect identity resolution

Attaching the wrong founder or repository would corrupt every downstream conclusion. Automatic matches therefore remain suggestions unless a strong domain, explicit profile link, authenticated GitHub connection, or human confirmation exists.

### False precision

Sparse signals cannot predict investment success. The interface pairs every score with evidence coverage, dimensions, and uncertainty, and never presents a global probability of success.

### Fragile external sources

GitHub rate limits, inaccessible websites, and changing third-party APIs can damage the demo. Connectors cache real timestamped results, degrade independently, and never block access to imported data.

### Founder privacy and reputational harm

Incorrect negative conclusions can harm founders. The system preserves provenance, supports corrections, isolates private evidence, and labels analysis separately from fact.

### Scope pressure

The vertical demo is the priority. Automated outreach, continuous crawling, CRM integrations, team collaboration, portfolio monitoring, mobile apps, proprietary market data, and generalized social scraping are excluded from the MVP.

## Delivery boundary

The first implementation plan will produce one deployable vertical slice: import the provisional catalog, authenticate both roles, create and match a thesis, enrich a selected company, inspect an evidence-first brief, submit founder proof, update the brief, and save the company to a watchlist. Features outside that path are deferred until the slice is working and tested.
