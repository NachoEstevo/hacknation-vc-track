# Investment Brief Engine Design

## Summary

The Investment Brief Engine turns the existing US/UK company catalog and provenance-bearing enrichment snapshots into an explainable shortlist for a specific investor thesis. It uses OpenAI to structure ambiguous language and draft cited analysis, while deterministic TypeScript code owns evidence trust, criterion states, scoring, coverage, ranking, and validation.

This slice is backend-only. It produces stable JSON contracts and real briefs that the UI can consume without waiting for authentication or database integration.

## Goals

- Parse a natural-language investment thesis into visible structured criteria.
- Evaluate all 50 seed companies using `match`, `partial`, `missing`, or `conflict` per criterion.
- Keep Thesis Fit separate from Evidence Coverage.
- Calculate Founder, Market, Product/Execution, and Traction assessments from explicit rules.
- Extract claim candidates from existing evidence without promoting model output to fact.
- Generate cited investment briefs for the highest-ranked companies.
- Reject unsupported material conclusions.
- Produce a reproducible CLI run suitable for the hackathon demo and later UI integration.

## Non-goals

- Predicting startup success or investment returns.
- A universal company score independent of investor thesis.
- Automated investment decisions.
- Pitch-deck upload, OCR, or PDF extraction in this slice.
- Scraping LinkedIn or X.
- Creating an Anthropic abstraction before a second production provider is actually implemented.
- Writing to Supabase or implementing UI routes.
- Treating missing information as negative evidence.

## Inputs

The first implementation consumes:

- `data/source/clay-us-uk-early-software.csv`;
- `data/enriched/company-web-profiles.json`;
- a natural-language thesis supplied through the CLI;
- optional explicit evidence added as JSON for a demo company.

Every fact used downstream must become an `EvidenceRecord` with a stable ID, source type, source URL or local snapshot reference, capture time, excerpt or structured payload, verification state, and visibility.

## Domain contracts

### Structured thesis

```ts
interface FundThesis {
  thesisId: string;
  originalQuery: string;
  criteria: ThesisCriterion[];
  generatedAt: string;
  promptVersion: string;
}

interface ThesisCriterion {
  criterionId: string;
  category: "geography" | "industry" | "company_size" | "stage" |
    "founder" | "market" | "product" | "traction" | "exclusion" | "custom";
  label: string;
  requirement: "required" | "preferred" | "excluded";
  weight: 1 | 2 | 3 | 4 | 5;
  operator: "equals" | "one_of" | "contains" | "gte" | "lte" | "exists" | "not_exists";
  expectedValue: string | number | boolean | string[];
}
```

OpenAI proposes this schema from the investor's words. Deterministic validation rejects unknown categories, operators, invalid weights, empty values, and combinations the matching engine cannot execute. The parsed thesis is always inspectable and editable before it is treated as confirmed.

### Evidence and claims

```ts
interface EvidenceRecord {
  evidenceId: string;
  companyId: string;
  sourceType: "clay_csv" | "company_website" | "github_public" |
    "founder_assertion" | "founder_document" | "stripe_private";
  sourceUrl: string | null;
  snapshotPath: string | null;
  capturedAt: string;
  excerpt: string | null;
  payload: Record<string, unknown> | null;
  verificationState: "unverified" | "candidate_only" | "verified" | "conflicted" | "stale";
  visibility: "public" | "founder_private" | "investor_private";
}

interface ClaimCandidate {
  claimId: string;
  companyId: string;
  subject: string;
  predicate: string;
  value: string | number | boolean;
  unit: string | null;
  claimKind: "observed_fact" | "first_party_claim" | "analysis";
  evidenceIds: string[];
  trust: ClaimTrustBreakdown;
  state: "supported" | "unverified" | "conflicted";
}
```

The model may propose claim candidates only from the provided evidence bundle. Application code removes unknown evidence IDs, rejects empty citations, recalculates trust, and never accepts a model-provided numeric score.

## Deterministic trust scoring

Each claim receives a 0-100 Trust Score with stored components:

- Source reliability: 0-40.
  - authenticated first-party integration or direct private artifact: 40;
  - company-controlled website or public provider API: 30;
  - imported directory or founder assertion: 20;
  - model analysis without direct evidence: 0.
- Directness: 0-25.
  - direct measurement or primary document: 25;
  - explicit first-party statement: 18;
  - proxy signal: 8;
  - inference only: 0.
- Independent corroboration: 0, 10, or 20 for zero, one, or at least two independent supporting sources.
- Recency: 15 within 30 days, 10 within 180 days, 5 within 365 days, otherwise 0.

A claim can be marked `supported` when it scores at least 70 and has no unresolved contradiction. A contradiction forces `conflicted`, regardless of the numeric total. Model analysis remains analysis and cannot become a verified fact.

## Matching and assessment rules

### Thesis Fit

Each confirmed criterion receives:

- `match`: 1.0;
- `partial`: 0.5;
- `conflict`: 0.0;
- `missing`: excluded from the fit denominator.

`Thesis Fit` is the weighted average over known criteria. `Evidence Coverage` is the known criterion weight divided by total criterion weight. A company may therefore show `100% fit / 30% coverage`; the interface must never collapse those values into one number.

Required criteria do not become automatic hard filters unless the investor explicitly confirms that behavior. An exclusion violated by evidence becomes `conflict`, not a hidden removal.

### Assessment axes

The engine calculates four separate axes, each paired with coverage and dimension-level explanations:

- **Founder:** explicit founder identity, relationship confidence, relevant public execution evidence, and founder-provided proof when available.
- **Market:** identifiable customer, problem clarity, category, and direct market evidence. Generic market language does not count as validation.
- **Product/Execution:** live product surface, pricing or offer surface, changelog/release evidence, GitHub activity, and operational artifacts.
- **Traction:** customers, revenue, usage, retention, contracts, and payments. Public proxies never become commercial traction.

Each dimension is a small rule returning points, possible points, evidence IDs, and a reason. Unknown dimensions are omitted from the axis score and reduce coverage. No model call can directly set an axis score.

## OpenAI responsibilities

The engine uses the Responses API with strict JSON Schema outputs in three bounded operations:

1. `parseThesis`: natural language to `FundThesis`.
2. `extractClaimCandidates`: one normalized evidence bundle to cited claims and contradictions.
3. `draftInvestmentBrief`: evaluated company data to a structured, cited brief.

Structured Outputs are supplied through `text.format` with `strict: true`, following the current OpenAI Responses API contract: <https://developers.openai.com/api/docs/guides/migrate-to-responses#6-update-structured-outputs-definitions>.

The first implementation uses one direct OpenAI module and dependency injection for tests. Anthropic support is deferred until it becomes a real second integration, avoiding an abstraction with only one consumer.

The model name, prompt version, request ID, token usage, and generation timestamp are recorded. `OPENAI_API_KEY` remains server-side and is never written to output files. The model is called only after deterministic input validation and receives the minimum evidence required for the operation.

## Brief contract and citation gate

```ts
interface InvestmentBrief {
  companyId: string;
  thesisId: string;
  recommendation: "investigate" | "watch" | "pass_for_thesis" | "needs_evidence";
  thesisFit: number | null;
  evidenceCoverage: number;
  axes: AssessmentAxis[];
  summary: CitedStatement[];
  strengths: CitedStatement[];
  risks: CitedStatement[];
  evidenceGaps: EvidenceGap[];
  diligenceQuestions: string[];
  generatedAt: string;
  promptVersion: string;
}

interface CitedStatement {
  text: string;
  statementKind: "fact" | "analysis" | "uncertainty";
  evidenceIds: string[];
}
```

The citation validator applies these rules:

- every `fact` requires at least one existing evidence ID;
- an `analysis` must cite its inputs and cannot introduce a new factual value;
- `uncertainty` may have no citation only when it explicitly describes missing evidence;
- unknown evidence IDs, conflicting numeric values, or uncited material facts invalidate the brief;
- an invalid generated brief is not partially published.

The deterministic recommendation is produced before prose generation, in this order:

- `pass_for_thesis`: at least one confirmed `required` criterion is in conflict, or an `excluded` condition is evidenced;
- `needs_evidence`: coverage is below 30%, or no criterion has known evidence;
- `investigate`: Thesis Fit is at least 70%, coverage is at least 60%, and no blocking conflict exists;
- `watch`: every other evaluated company, including promising fit with insufficient evidence.

## Processing flow

1. Parse and normalize the Clay CSV.
2. Convert imported and web/GitHub snapshots into stable evidence records.
3. Parse and validate the investor thesis once.
4. Extract cited claim candidates per company.
5. Recalculate trust and resolve contradictions deterministically.
6. Evaluate thesis criteria and the four assessment axes.
7. Rank all companies by confirmed thesis fit, then coverage, then Product/Execution evidence. Missing data never supplies positive or negative points.
8. Generate briefs for the top three companies and any explicitly requested company.
9. Validate every citation and write only valid outputs.

## CLI and outputs

The implementation adds a CLI with explicit inputs:

```powershell
npx tsx scripts/build-investment-briefs.ts `
  --companies ../../data/source/clay-us-uk-early-software.csv `
  --enrichment ../../data/enriched/company-web-profiles.json `
  --thesis "Early US or UK B2B software companies with small teams and visible execution signals" `
  --accept-parsed-thesis `
  --top 3 `
  --output ../../data/briefs/demo-investment-briefs.json
```

For the backend-only demo, `--accept-parsed-thesis` is an explicit substitute for the future UI confirmation step. Without that flag, the command writes the proposed thesis JSON and exits before company evaluation. A reviewed thesis may instead be supplied through `--thesis-file`.

The output contains the confirmed thesis, normalized evidence index, all 50 criterion evaluations and assessments, the ranked shortlist, valid top-three briefs, generation metadata, and typed per-company failures. Raw prompts, secrets, private file contents, and full scraped pages are excluded.

## Failure handling

- Missing API key: stop before paid generation with a clear configuration error; deterministic unit tests and local scoring fixtures remain available.
- Schema refusal or invalid structured output: retry once, then record a typed generation failure.
- Rate limit or transient provider failure: bounded exponential backoff with at most two retries.
- One-company failure: retain other evaluations and mark that company incomplete.
- Unsupported evidence citation: reject the brief and persist the validation errors.
- Empty evidence bundle: produce `needs_evidence` without calling the model.
- Conflicting sources: preserve both, mark the affected claim and criterion `conflict`, and generate a diligence question.

## Testing

Unit tests cover:

- thesis schema validation and executable operators;
- source reliability, directness, corroboration, recency, and conflict rules;
- missing evidence separated from negative evidence;
- weighted thesis fit and independent coverage;
- all four assessment axes;
- unknown or missing citations;
- deterministic recommendation boundaries;
- ranking tie-breakers.

Integration tests use fake OpenAI responses to cover thesis parsing, claim extraction, retry behavior, and brief validation without spending credits. A live smoke test is opt-in and runs only when `OPENAI_API_KEY` is available.

Adversarial fixtures include an impressive but unsupported description, conflicting revenue claims, an unrelated GitHub profile, no founder identity, stale evidence, and a low-visibility company with strong product evidence.

## Demo success criteria

- One investor thesis becomes an inspectable structured schema.
- All 50 companies receive criterion states, four axes, and evidence coverage.
- The top three ranking is reproducible from stored inputs.
- Every material sentence in each generated brief passes the citation gate.
- At least one low-visibility company ranks because of evidence rather than publicity.
- A sparse company receives `needs_evidence`, not a fabricated low-quality judgment.
- The CLI completes without UI or database dependencies and emits a contract the frontend can render directly.

## Deferred work

- Rely pitch-deck creation and ingestion.
- Anthropic provider implementation and cross-model evaluation.
- Supabase persistence and row-level access policies for theses, claims, assessments, and briefs.
- Investor editing and confirmation UI for parsed criteria.
- Background jobs, watchlist refreshes, and snapshot diffs.
- Founder proof submission and before/after brief updates.
