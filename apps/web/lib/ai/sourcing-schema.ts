import { z } from "zod";

/**
 * The structured card the sourcing agent emits (via the `report_candidate`
 * tool) for every real person it finds while researching. Shared by the chat
 * route (tool input schema), the search workspace (card rendering), and the
 * profile page (dossier seed) — client-safe, zod only.
 */
export const CandidateReportSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-case slug")
    .describe("Stable kebab-case id derived from the person's name, e.g. 'maria-gonzalez'"),
  name: z.string().min(2).max(120).describe("The person's full name as found in sources"),
  role: z.string().max(120).describe("Current role, e.g. 'Co-founder & CTO'"),
  company: z.string().max(120).describe("Current company or project name; empty string if unknown"),
  location: z.string().max(120).describe("City/country if known; empty string if unknown"),
  stage: z.string().max(60).describe("Company stage if known (e.g. 'Pre-seed'); empty string if unknown"),
  summary: z.string().max(280).describe("One sentence on what the person/company is actually doing, grounded in sources"),
  whyMatch: z.string().max(280).describe("One sentence on why this person fits the investor's request and thesis"),
  tags: z.array(z.string().max(40)).max(4).describe("Up to 4 short tags: sector, tech, geography"),
  score: z.number().min(1).max(99).describe("Fit score vs the request+thesis, 1-99; be conservative"),
  confidence: z.enum(["high", "medium", "low"]).describe("How solid the evidence trail is"),
  unknowns: z
    .string()
    .max(160)
    .nullable()
    .describe("What key facts are still unverified (funding, team, traction), or null"),
  links: z
    .array(
      z.object({
        url: z.string().url().describe("Evidence URL actually seen in tool results — never invented"),
        title: z.string().max(160).describe("Short label for the link"),
      }),
    )
    .min(1)
    .max(6)
    .describe("Evidence links from the research; at least one is required"),
  sourceKind: z
    .enum(["web", "github", "registered", "internal_base", "prospect_base"])
    .describe("Primary source the person surfaced from; 'prospect_base' = undr's curated prospect base"),
});

export type CandidateReport = z.infer<typeof CandidateReportSchema>;

export function isCandidateReport(value: unknown): value is CandidateReport {
  return CandidateReportSchema.safeParse(value).success;
}

/** Thesis context the client sends with each chat/profile request. */
export const ThesisContextSchema = z.object({
  brief: z.string().max(1200),
  summary: z.string().max(600).optional(),
  criteria: z.array(z.string().max(120)).max(24),
  riskPosture: z.string().max(30).optional(),
  checkRange: z.string().max(80).optional(),
});

export type ThesisContext = z.infer<typeof ThesisContextSchema>;

/** Composer-selected search controls: which data source the agent may use and where it may look. */
export const SearchControlsSchema = z.object({
  dataSource: z
    .enum(["undr_engine", "web_search", "internal_catalog", "registered_founders", "github"])
    .optional(),
  geography: z
    .object({
      kind: z.enum(["all", "region", "country"]),
      label: z.string().max(80),
    })
    .optional(),
  /** How many candidate cards the agent must deliver before concluding. */
  targetCandidates: z.number().int().min(1).max(10).optional(),
});

export type SearchControls = z.infer<typeof SearchControlsSchema>;

/** Builds the thesis payload the client sends along with agent requests. */
export function thesisContextFor(thesis: {
  brief: string;
  summary?: string;
  criteria: { label: string; priority: string }[];
  riskPosture?: string;
  checkRange?: { currency: string; min: number; max: number };
} | null): ThesisContext | null {
  if (!thesis) return null;
  return {
    brief: thesis.brief.slice(0, 1200),
    summary: thesis.summary?.slice(0, 600),
    criteria: thesis.criteria.slice(0, 24).map((criterion) => `${criterion.label} (${criterion.priority})`),
    riskPosture: thesis.riskPosture,
    checkRange: thesis.checkRange
      ? `${thesis.checkRange.currency} ${thesis.checkRange.min.toLocaleString("en-US")}–${thesis.checkRange.max.toLocaleString("en-US")}`
      : undefined,
  };
}
