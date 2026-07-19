type JsonSchema = Record<string, unknown>;

function objectSchema(properties: Record<string, JsonSchema>): JsonSchema {
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

const text = { type: "string", minLength: 1, maxLength: 500 };
const scalar = { anyOf: [{ type: "string", minLength: 1, maxLength: 500 }, { type: "number" }, { type: "boolean" }] };
const evidenceIndexes = { type: "array", items: { type: "integer", minimum: 0 }, minItems: 1 };

const criterionFields = {
  category: { type: "string", enum: ["geography", "industry", "company_size", "stage", "founder", "market", "product", "traction", "exclusion", "custom"] },
  label: text,
  requirement: { type: "string", enum: ["required", "preferred", "excluded"] },
  weight: { type: "integer", minimum: 1, maximum: 5 },
  operator: { type: "string", enum: ["equals", "one_of", "contains", "gte", "lte", "exists", "not_exists"] },
  expectedValue: { anyOf: [scalar, { type: "array", items: text, minItems: 1, maxItems: 20 }] },
};

const criterion = objectSchema({
  criterionId: text,
  ...criterionFields,
});

const parsedCriterion = objectSchema(criterionFields);

const citedStatement = objectSchema({
  text,
  statementKind: { type: "string", enum: ["fact", "analysis", "uncertainty"] },
  evidenceIndexes: { type: "array", items: { type: "integer", minimum: 0 } },
});

export const fundThesisSchema = objectSchema({
  thesisId: text,
  originalQuery: text,
  criteria: { type: "array", items: criterion, minItems: 1, maxItems: 10 },
  generatedAt: text,
  promptVersion: text,
});

export const parsedFundThesisSchema = objectSchema({
  criteria: { type: "array", items: parsedCriterion, minItems: 1, maxItems: 10 },
});

export const claimCandidatesSchema = objectSchema({
  candidates: {
    type: "array",
    maxItems: 50,
    items: objectSchema({
      claimId: text,
      subject: text,
      predicate: text,
      value: scalar,
      unit: { type: ["string", "null"], maxLength: 50 },
      claimKind: { type: "string", enum: ["observed_fact", "first_party_claim", "analysis"] },
      evidenceIndexes,
    }),
  },
});

export const investmentBriefSchema = objectSchema({
  summary: { type: "array", items: citedStatement, maxItems: 5 },
  strengths: { type: "array", items: citedStatement, maxItems: 5 },
  risks: { type: "array", items: citedStatement, maxItems: 5 },
  evidenceGaps: { type: "array", items: objectSchema({ field: text, reason: text }), maxItems: 8 },
  diligenceQuestions: { type: "array", items: text, maxItems: 8 },
});
