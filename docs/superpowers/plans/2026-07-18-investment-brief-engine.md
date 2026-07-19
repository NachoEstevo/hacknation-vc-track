# Investment Brief Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a backend-only engine that parses an investor thesis, evaluates all 50 seed companies with deterministic evidence-aware scoring, ranks them, and generates citation-valid briefs for the top three.

**Architecture:** Extend `@hacknation/data-core` with focused TypeScript modules for evidence normalization, trust scoring, thesis matching, assessments, recommendations, OpenAI structured tasks, citation validation, and orchestration. OpenAI proposes structured language outputs; pure application code recalculates all scores, rejects unsupported citations, and writes one reproducible JSON artifact for the UI.

**Tech Stack:** TypeScript 5.9, Node.js 22, Vitest, official OpenAI JavaScript SDK, Responses API Structured Outputs, existing CSV and enrichment snapshots

## Global Constraints

- Work only in `packages/data-core`, `data/briefs`, and directly related documentation.
- Use `gpt-5.6-luna` with reasoning `none` for high-volume extraction and thesis parsing; use `gpt-5.6-sol` with reasoning `low` for the top-three brief drafts.
- Allow model overrides through `OPENAI_EXTRACTION_MODEL` and `OPENAI_BRIEF_MODEL`; never persist `OPENAI_API_KEY`.
- Do not add a generic LLM provider interface or Anthropic implementation in this slice.
- The model never supplies a trusted numeric score, recommendation, verification state, or evidence ID.
- Missing evidence reduces coverage and never contributes negative points.
- Every material generated fact must cite an existing evidence ID.
- Do not scrape LinkedIn or X, write to Supabase, add UI code, or modify unrelated files.
- Keep files below 300 lines when reasonable and use TDD for every behavior change.
- Commit each independently testable task and push only after the complete main-branch verification.

---

### Task 1: Domain contracts and stable evidence index

**Files:**
- Create: `packages/data-core/src/briefs/types.ts`
- Create: `packages/data-core/src/briefs/build-evidence-index.ts`
- Create: `packages/data-core/test/build-evidence-index.test.ts`
- Modify: `packages/data-core/src/index.ts`

**Interfaces:**
- Consumes: `StableCompanySeed[]`, `CompanyEnrichmentResult[]`
- Produces: `buildEvidenceIndex(companies, enrichments): CompanyEvidenceBundle[]`
- Produces: `EvidenceRecord`, `CompanyEvidenceBundle`, `ClaimCandidate`, `ClaimTrustBreakdown`, `FundThesis`, `ThesisCriterion`, `CriterionEvaluation`, `AssessmentAxis`, and `InvestmentBrief`

- [ ] **Step 1: Add a failing evidence-index test**

Create a fixture with one Clay company, one website profile, one GitHub result, and one missing-domain company. Assert deterministic IDs, source types, visibility, capture times, and no raw HTML:

```ts
const first = buildEvidenceIndex([company], [enrichment])[0]!;
expect(first.companyId).toBe(company.stableId);
expect(first.evidence.map((item) => item.sourceType)).toEqual([
  "clay_csv", "company_website", "github_public",
]);
expect(first.evidence.every((item) => !JSON.stringify(item).includes("<html"))).toBe(true);
expect(buildEvidenceIndex([company], [enrichment])).toEqual(
  buildEvidenceIndex([company], [enrichment]),
);
```

- [ ] **Step 2: Run the focused test and observe the missing module failure**

Run: `npx vitest run test/build-evidence-index.test.ts`

Expected: FAIL because `build-evidence-index.ts` does not exist.

- [ ] **Step 3: Define the exact domain types**

Define the unions and fields from the approved spec. Include this strict evidence contract:

```ts
export interface EvidenceRecord {
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

export interface CompanyEvidenceBundle {
  companyId: string;
  companyName: string;
  normalizedCompany: StableCompanySeed;
  evidence: EvidenceRecord[];
}

export interface ThesisCriterion {
  criterionId: string;
  category: "geography" | "industry" | "company_size" | "stage" |
    "founder" | "market" | "product" | "traction" | "exclusion" | "custom";
  label: string;
  requirement: "required" | "preferred" | "excluded";
  weight: 1 | 2 | 3 | 4 | 5;
  operator: "equals" | "one_of" | "contains" | "gte" | "lte" | "exists" | "not_exists";
  expectedValue: string | number | boolean | string[];
}

export interface FundThesis {
  thesisId: string;
  originalQuery: string;
  criteria: ThesisCriterion[];
  generatedAt: string;
  promptVersion: string;
}

export interface ClaimCandidate {
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

Use SHA-256 over `companyId|sourceType|sourceUrl|contentHashInput`, truncated to 24 hex characters, for stable evidence IDs.

Define the downstream contracts in the same file so later tasks share one vocabulary:

```ts
export interface ClaimTrustBreakdown {
  sourceReliability: number;
  directness: number;
  corroboration: number;
  recency: number;
  total: number;
  state: "supported" | "unverified" | "conflicted";
}

export interface CriterionEvaluation {
  criterionId: string;
  state: "match" | "partial" | "missing" | "conflict";
  weight: number;
  reason: string;
  evidenceIds: string[];
}

export interface AssessmentDimension {
  dimensionId: string;
  points: number;
  possiblePoints: number;
  known: boolean;
  reason: string;
  evidenceIds: string[];
}

export interface AssessmentAxis {
  axis: "founder" | "market" | "product_execution" | "traction";
  score: number | null;
  coverage: number;
  dimensions: AssessmentDimension[];
}

export interface CompanyEvaluation {
  companyId: string;
  companyName: string;
  thesisFit: number | null;
  evidenceCoverage: number;
  criteria: CriterionEvaluation[];
  axes: AssessmentAxis[];
  recommendation: "investigate" | "watch" | "pass_for_thesis" | "needs_evidence";
}

export interface CitedStatement {
  text: string;
  statementKind: "fact" | "analysis" | "uncertainty";
  evidenceIds: string[];
}

export interface InvestmentBrief {
  companyId: string;
  thesisId: string;
  recommendation: CompanyEvaluation["recommendation"];
  thesisFit: number | null;
  evidenceCoverage: number;
  axes: AssessmentAxis[];
  summary: CitedStatement[];
  strengths: CitedStatement[];
  risks: CitedStatement[];
  evidenceGaps: Array<{ field: string; reason: string }>;
  diligenceQuestions: string[];
  generatedAt: string;
  promptVersion: string;
}
```

- [ ] **Step 4: Implement evidence conversion**

Create one Clay evidence record per company, one website record when `profile` exists, and one record per resolved GitHub profile. Website payloads may contain extracted profile fields and signal links but not page HTML. A missing source produces an empty evidence bundle, not invented evidence.

- [ ] **Step 5: Export the contracts and run verification**

Modify `src/index.ts`, then run:

```powershell
npx vitest run test/build-evidence-index.test.ts
npm run typecheck
```

Expected: focused tests PASS and TypeScript reports no errors.

- [ ] **Step 6: Commit Task 1**

```powershell
git add packages/data-core/src/briefs packages/data-core/test/build-evidence-index.test.ts packages/data-core/src/index.ts
git commit -m "feat(briefs): build stable evidence index"
```

### Task 2: Claim trust, conflicts, and citation validation

**Files:**
- Create: `packages/data-core/src/briefs/calculate-claim-trust.ts`
- Create: `packages/data-core/src/briefs/validate-brief-citations.ts`
- Create: `packages/data-core/test/calculate-claim-trust.test.ts`
- Create: `packages/data-core/test/validate-brief-citations.test.ts`
- Modify: `packages/data-core/src/index.ts`

**Interfaces:**
- Consumes: `EvidenceRecord[]`, claim directness, independent supporting evidence IDs, and evaluation time
- Produces: `calculateClaimTrust(input): ClaimTrustBreakdown`
- Produces: `validateBriefCitations(brief, evidence): BriefValidationResult`

`BriefValidationResult` is exactly:

```ts
export type BriefValidationResult =
  | { valid: true; errors: [] }
  | { valid: false; errors: Array<{
      code: "fact_missing_citation" | "analysis_missing_citation" |
        "unknown_evidence_id" | "unsupported_numeric_value";
      section: "summary" | "strengths" | "risks";
      statementIndex: number;
    }> };
```

- [ ] **Step 1: Write failing trust-table tests**

Cover direct Stripe evidence, company website statements, Clay imports, proxy GitHub activity, recency boundaries, independent corroboration, and conflict override:

```ts
expect(calculateClaimTrust({
  evidence: [stripeEvidence],
  directness: "direct_measurement",
  independentSupportingEvidenceIds: [],
  evaluatedAt: "2026-07-18T00:00:00.000Z",
  hasConflict: false,
})).toMatchObject({ sourceReliability: 40, directness: 25, corroboration: 0, recency: 15, total: 80, state: "supported" });
```

Assert a total above 70 with `hasConflict: true` returns state `conflicted`.

- [ ] **Step 2: Run the focused test and observe failure**

Run: `npx vitest run test/calculate-claim-trust.test.ts`

Expected: FAIL because the calculator is missing.

- [ ] **Step 3: Implement the approved deterministic table**

Use explicit maps, not model judgment:

```ts
const SOURCE_POINTS = {
  stripe_private: 40,
  founder_document: 40,
  company_website: 30,
  github_public: 30,
  clay_csv: 20,
  founder_assertion: 20,
} as const;
```

Directness is 25/18/8/0, corroboration is 0/10/20, and recency is 15/10/5/0 at 30/180/365-day boundaries. `supported` requires total >= 70 and no conflict.

- [ ] **Step 4: Write failing citation-gate tests**

Test valid facts, unknown IDs, uncited facts, analysis introducing an uncited dollar value, uncertainty describing missing evidence, and all-or-nothing rejection:

```ts
expect(validateBriefCitations(uncitedFactBrief, evidence)).toEqual({
  valid: false,
  errors: [expect.objectContaining({ code: "fact_missing_citation" })],
});
```

- [ ] **Step 5: Implement citation validation**

Validate every `summary`, `strengths`, and `risks` statement. Facts require an existing evidence ID; analyses require evidence IDs and reject new numeric tokens not found in cited excerpts/payloads; uncertainties may be uncited only when they name a missing field. Return every validation error and never mutate the brief.

- [ ] **Step 6: Run focused and package verification**

```powershell
npx vitest run test/calculate-claim-trust.test.ts test/validate-brief-citations.test.ts
npm test
npm run typecheck
```

Expected: all tests PASS.

- [ ] **Step 7: Commit Task 2**

```powershell
git add packages/data-core/src/briefs packages/data-core/test packages/data-core/src/index.ts
git commit -m "feat(briefs): enforce evidence trust and citations"
```

### Task 3: Thesis validation, deterministic matching, assessments, and recommendations

**Files:**
- Create: `packages/data-core/src/briefs/validate-thesis.ts`
- Create: `packages/data-core/src/briefs/evaluate-company.ts`
- Create: `packages/data-core/src/briefs/assess-company.ts`
- Create: `packages/data-core/src/briefs/recommend-company.ts`
- Create: `packages/data-core/test/validate-thesis.test.ts`
- Create: `packages/data-core/test/evaluate-company.test.ts`
- Create: `packages/data-core/test/assess-company.test.ts`
- Create: `packages/data-core/test/recommend-company.test.ts`
- Modify: `packages/data-core/src/index.ts`

**Interfaces:**
- Produces: `validateFundThesis(value): FundThesis`
- Produces: `evaluateCompany(thesis, bundle, claims): CompanyEvaluation`
- Produces: `assessCompany(bundle, claims): AssessmentAxis[]`
- Produces: `recommendCompany(evaluation, axes): InvestmentBrief["recommendation"]`

- [ ] **Step 1: Test thesis validation failures**

Reject empty criteria, weights outside 1-5, unsupported operators, empty `one_of`, numeric operators with string values, and duplicate criterion IDs. Accept the exact approved union.

- [ ] **Step 2: Implement the smallest validator**

Use focused type guards and throw `ThesisValidationError` containing path-specific issues. Do not add a schema library.

- [ ] **Step 3: Test fit and coverage independently**

Use four criteria weighted 5, 3, 2, and 1 with states `match`, `partial`, `missing`, and `conflict`. Assert:

```ts
expect(result.thesisFit).toBeCloseTo((5 + 1.5 + 0) / (5 + 3 + 1) * 100);
expect(result.evidenceCoverage).toBeCloseTo((5 + 3 + 1) / 11 * 100);
```

Also assert no known criteria returns `thesisFit: null` and `coverage: 0`.

- [ ] **Step 4: Implement executable criterion evaluators**

Support the approved operators over normalized company fields and cited claims. Every result includes state, reason, and evidence IDs. Unknown values return `missing`. Exclusion evidence returns `conflict`.

- [ ] **Step 5: Test the four assessment axes**

Create fixtures for founder candidate only, live website plus pricing, recent GitHub activity, explicit customer/revenue evidence, and absent traction. Assert each dimension returns `points`, `possiblePoints`, `evidenceIds`, and `reason`; unknown dimensions reduce coverage without adding zero-quality points.

- [ ] **Step 6: Implement assessment rules as simple functions**

Keep one function per dimension inside `assess-company.ts`. Do not introduce a rule-class hierarchy. Return Founder, Market, Product/Execution, and Traction axes in a stable order.

- [ ] **Step 7: Test and implement recommendation precedence**

Assert:

1. required conflict or evidenced exclusion -> `pass_for_thesis`;
2. coverage below 30 or no known criterion -> `needs_evidence`;
3. fit >= 70 and coverage >= 60 -> `investigate`;
4. every other evaluated company -> `watch`.

- [ ] **Step 8: Run full verification and commit Task 3**

```powershell
npm test
npm run typecheck
git add packages/data-core/src/briefs packages/data-core/test packages/data-core/src/index.ts
git commit -m "feat(briefs): evaluate thesis and company evidence"
```

### Task 4: OpenAI structured thesis, claims, and brief drafting

**Files:**
- Modify: `packages/data-core/package.json`
- Modify: `packages/data-core/package-lock.json`
- Create: `packages/data-core/src/briefs/openai-config.ts`
- Create: `packages/data-core/src/briefs/openai-structured-tasks.ts`
- Create: `packages/data-core/src/briefs/openai-schemas.ts`
- Create: `packages/data-core/test/openai-structured-tasks.test.ts`
- Modify: `packages/data-core/src/index.ts`

**Interfaces:**
- Produces: `loadOpenAIConfig(env): OpenAIConfig`
- Produces: `parseThesis(query, dependencies): Promise<FundThesis>`
- Produces: `extractClaimCandidates(bundle, dependencies): Promise<ClaimCandidate[]>`
- Produces: `draftInvestmentBrief(input, dependencies): Promise<InvestmentBrief>`

`OpenAIConfig` is exactly:

```ts
export interface OpenAIConfig {
  apiKey: string;
  extractionModel: string;
  briefModel: string;
  extractionReasoning: "none";
  briefReasoning: "low";
}
```

- [ ] **Step 1: Resolve the credential gate without exposing secrets**

Check only presence:

```powershell
if ($env:OPENAI_API_KEY) { "OPENAI_API_KEY_PRESENT" } else { "OPENAI_API_KEY_MISSING" }
```

If missing, stop live API work and ask the user to configure it. Do not read or print `.env` values.

- [ ] **Step 2: Install the official SDK with justification**

Run: `npm install openai`

Justification: the official SDK provides typed Responses API requests and avoids maintaining authentication, retries, and response parsing manually.

- [ ] **Step 3: Write failing configuration tests**

Assert missing key errors, model overrides, and defaults:

```ts
expect(loadOpenAIConfig({ OPENAI_API_KEY: "test" })).toMatchObject({
  extractionModel: "gpt-5.6-luna",
  briefModel: "gpt-5.6-sol",
  extractionReasoning: "none",
  briefReasoning: "low",
});
```

- [ ] **Step 4: Define strict JSON schemas**

Add JSON Schema constants for parsed thesis, claim candidates, and brief drafts. Set every object to `additionalProperties: false`, list every required property, and reuse only local schema-building functions with at least three consumers.

- [ ] **Step 5: Write fake-client tests before implementation**

Inject a single `createResponse(request)` dependency. Test request model, reasoning, `text.format.type === "json_schema"`, `strict === true`, prompt version, one schema retry, and permanent typed failure. Fake responses return `output_text` JSON; tests make no network calls.

- [ ] **Step 6: Implement the three direct OpenAI tasks**

Use `OpenAI().responses.create()` through the injected dependency. Prompts must state outcome, evidence-only constraints, required citations, and stop rules. Keep dynamic evidence after a stable instruction prefix. Validate parsed JSON through Task 1/3 guards and recalculate claim trust through Task 2.

- [ ] **Step 7: Add bounded retries**

Retry invalid schema once. Retry status 429, 500, 502, 503, or 504 at most twice with 500ms then 1500ms delay. Do not retry refusals, authentication errors, or citation validation failures.

- [ ] **Step 8: Run package verification and commit Task 4**

```powershell
npm test
npm run typecheck
git add packages/data-core/package.json packages/data-core/package-lock.json packages/data-core/src packages/data-core/test
git commit -m "feat(briefs): add OpenAI structured analysis"
```

### Task 5: Ranking pipeline and CLI artifact

**Files:**
- Create: `packages/data-core/src/briefs/build-investment-briefs.ts`
- Create: `packages/data-core/src/briefs/rank-companies.ts`
- Create: `packages/data-core/scripts/build-investment-briefs.ts`
- Create: `packages/data-core/test/rank-companies.test.ts`
- Create: `packages/data-core/test/build-investment-briefs.test.ts`
- Modify: `packages/data-core/package.json`
- Modify: `packages/data-core/src/index.ts`

**Interfaces:**
- Produces: `rankCompanies(evaluations): RankedCompany[]`
- Produces: `buildInvestmentBriefs(input, dependencies): Promise<InvestmentBriefRun>`
- CLI consumes `--companies`, `--enrichment`, `--thesis` or `--thesis-file`, `--accept-parsed-thesis`, `--top`, and `--output`

Define the orchestration outputs as:

```ts
export interface RankedCompany {
  rank: number;
  evaluation: CompanyEvaluation;
}

export interface InvestmentBriefRun {
  status: "awaiting_thesis_confirmation" | "completed" | "partial";
  generatedAt: string;
  thesis: FundThesis;
  evidence: CompanyEvidenceBundle[];
  evaluations: CompanyEvaluation[];
  ranking: RankedCompany[];
  briefs: InvestmentBrief[];
  failures: Array<{ companyId: string | null; stage: string; message: string }>;
}
```

- [ ] **Step 1: Test deterministic ranking**

Assert descending known Thesis Fit, then Evidence Coverage, then Product/Execution score, then stable company ID. Assert a high-fit/low-coverage company does not silently outrank an equal-fit/high-coverage company.

- [ ] **Step 2: Implement ranking as one pure comparator**

Do not use model output order. Normalize `null` fit to `-1` for sorting only.

- [ ] **Step 3: Write failing orchestration tests**

With fake structured tasks, assert:

- thesis parsing happens once;
- without confirmation, the run returns `awaiting_thesis_confirmation` and evaluates zero companies;
- all 50 bundles may be evaluated with concurrency capped at four;
- brief drafting runs only for top N or explicitly requested companies;
- one-company extraction failure remains typed and does not cancel others;
- an invalid brief is excluded with its citation errors.

- [ ] **Step 4: Implement the use case**

Keep orchestration in `build-investment-briefs.ts`. Reuse existing CSV parsing and evidence indexing. Limit company workers to four. Return metadata, thesis, evidence index, evaluations, ranking, valid briefs, and failures.

- [ ] **Step 5: Implement strict CLI argument parsing**

Unknown flags, missing values, `--top < 1`, or both `--thesis` and `--thesis-file` exit with code 1 and usage text. Without `--accept-parsed-thesis`, write `<output>.thesis.json` and exit before paid per-company analysis.

- [ ] **Step 6: Add the package command**

```json
"briefs:build": "tsx scripts/build-investment-briefs.ts"
```

- [ ] **Step 7: Run fake end-to-end verification and commit Task 5**

```powershell
npm test
npm run typecheck
git add packages/data-core/src packages/data-core/scripts packages/data-core/test packages/data-core/package.json
git commit -m "feat(briefs): rank companies and build cited briefs"
```

### Task 6: Live smoke run, generated demo data, and documentation

**Files:**
- Create: `data/briefs/demo-investment-briefs.json`
- Create: `data/briefs/demo-investment-briefs-summary.json`
- Modify: `data/README.md`
- Modify: `docs/data-pipeline.md`
- Create: `docs/investment-brief-engine.md`

**Interfaces:**
- Consumes: completed CLI and configured OpenAI credentials
- Produces: public-data-only top-three demo artifact and operator documentation

- [ ] **Step 1: Run thesis parse only**

```powershell
npm run briefs:build -- -- --companies ../../data/source/clay-us-uk-early-software.csv --enrichment ../../data/enriched/company-web-profiles.json --thesis "Early US or UK B2B software companies with teams below 10 people and visible execution signals" --top 3 --output ../../data/briefs/demo-investment-briefs.json
```

Expected: no per-company calls; writes the proposed thesis file and exits with confirmation instructions.

- [ ] **Step 2: Inspect the proposed thesis**

Verify geography, software category, maximum team size, B2B preference, and execution-signal preference. Reject any invented revenue or founder requirement. Use the reviewed JSON through `--thesis-file`.

- [ ] **Step 3: Run the live public-data analysis**

```powershell
npm run briefs:build -- -- --companies ../../data/source/clay-us-uk-early-software.csv --enrichment ../../data/enriched/company-web-profiles.json --thesis-file ../../data/briefs/demo-investment-briefs.thesis.json --accept-parsed-thesis --top 3 --output ../../data/briefs/demo-investment-briefs.json
```

Expected: 50 evaluations, deterministic ranking, three citation-valid briefs, and no private Rely data.

- [ ] **Step 4: Validate the artifact mechanically**

```powershell
Get-Content -LiteralPath ..\..\data\briefs\demo-investment-briefs.json -Raw | ConvertFrom-Json | Out-Null
Get-Content -LiteralPath ..\..\data\briefs\demo-investment-briefs-summary.json -Raw | ConvertFrom-Json | Out-Null
```

Assert summary counts equal 50 evaluated and 3 valid briefs; if fewer briefs validate, document exact failures rather than fabricating replacements.

- [ ] **Step 5: Document operation and boundaries**

Document environment variables, model roles, commands, score formulas, citation rejection, data provenance, retry behavior, known data gaps, and the fact that model analysis is not investment advice.

- [ ] **Step 6: Run final verification**

```powershell
npm test
npm run typecheck
npm run analyze:seed -- ../../data/source/clay-us-uk-early-software.csv
git -C ../.. diff --check
git -C ../.. status --short
```

Expected: 25 existing tests plus all new tests pass, typecheck passes, seed remains 50 accepted companies, JSON parses, and only scoped files are changed.

- [ ] **Step 7: Review, merge, push, and clean up**

Review the complete diff for unsupported claims, leaked secrets, private evidence, generated absolute paths, and unrelated UI changes. Commit the final docs/data, merge the isolated worktree branch into current `main`, rerun tests on `main`, fetch and incorporate non-conflicting collaborator changes, and push `origin/main` without force.

```powershell
git add data/briefs data/README.md docs/data-pipeline.md docs/investment-brief-engine.md
git commit -m "docs(briefs): publish cited demo analysis"
git push origin main
```
