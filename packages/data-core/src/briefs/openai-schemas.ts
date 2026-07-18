type JsonSchema = Record<string, unknown>;

function objectSchema(properties: Record<string, JsonSchema>): JsonSchema {
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

const text = { type: "string", minLength: 1 };
const scalar = { anyOf: [{ type: "string", minLength: 1 }, { type: "number" }, { type: "boolean" }] };
const evidenceIndexes = { type: "array", items: { type: "integer", minimum: 0 }, minItems: 1 };

const criterion = objectSchema({
  criterionId: text,
  category: { type: "string", enum: ["geography", "industry", "company_size", "stage", "founder", "market", "product", "traction", "exclusion", "custom"] },
  label: text,
  requirement: { type: "string", enum: ["required", "preferred", "excluded"] },
  weight: { type: "integer", minimum: 1, maximum: 5 },
  operator: { type: "string", enum: ["equals", "one_of", "contains", "gte", "lte", "exists", "not_exists"] },
  expectedValue: { anyOf: [scalar, { type: "array", items: text, minItems: 1 }] },
});

const citedStatement = objectSchema({
  text,
  statementKind: { type: "string", enum: ["fact", "analysis", "uncertainty"] },
  evidenceIndexes: { type: "array", items: { type: "integer", minimum: 0 } },
});

export const fundThesisSchema = objectSchema({
  thesisId: text,
  originalQuery: text,
  criteria: { type: "array", items: criterion, minItems: 1 },
  generatedAt: text,
  promptVersion: text,
});

export const claimCandidatesSchema = objectSchema({
  candidates: {
    type: "array",
    items: objectSchema({
      claimId: text,
      subject: text,
      predicate: text,
      value: scalar,
      unit: { type: ["string", "null"] },
      claimKind: { type: "string", enum: ["observed_fact", "first_party_claim", "analysis"] },
      evidenceIndexes,
      directness: { type: "string", enum: ["direct_measurement", "primary_document", "first_party_statement", "proxy_signal", "inference_only"] },
      independentSupportingEvidenceIndexes: { type: "array", items: { type: "integer", minimum: 0 } },
      hasConflict: { type: "boolean" },
    }),
  },
});

export const investmentBriefSchema = objectSchema({
  summary: { type: "array", items: citedStatement },
  strengths: { type: "array", items: citedStatement },
  risks: { type: "array", items: citedStatement },
  evidenceGaps: { type: "array", items: objectSchema({ field: text, reason: text }) },
  diligenceQuestions: { type: "array", items: text },
});
