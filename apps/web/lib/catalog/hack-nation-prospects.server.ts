import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * undr's own prospect base — the curated HackNation founder-research cohort
 * (data/source/hack-nation-founder-research.json, seeded by the data track).
 * Each record is a researched PERSON with priority tier, outreach score,
 * verified evidence status and public profiles. This loader powers the
 * default "undr engine" search mode: the agent builds its bench from here
 * first and only goes to the open web to fill what a record lacks.
 */

export interface ProspectRecord {
  recordId: string;
  fullName: string;
  priorityTier: string;
  outreachScore: number;
  confidence: string;
  evidenceStatus: string;
  city: string | null;
  country: string | null;
  professionalSituation: string | null;
  tagline: string | null;
  startupSignals: string | null;
  university: string | null;
  fieldOfStudy: string | null;
  academicDegree: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  hackNationProfileUrl: string | null;
  company: string | null;
  companyWebsite: string | null;
  companyProfiles: string[];
  founderRole: string | null;
  sector: string | null;
  product: string | null;
  validationSummary: string | null;
  traction: string | null;
  whyRelevant: string | null;
  risks: string | null;
  suggestedNextStep: string | null;
  usBased: string | null;
}

const DATA_FILE = path.join(process.cwd(), "..", "..", "data", "source", "hack-nation-founder-research.json");

let cache: ProspectRecord[] | null = null;

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^no encontrado$/i.test(trimmed)) return null;
  return trimmed;
}

function normalizeRecord(raw: Record<string, unknown>): ProspectRecord | null {
  const fullName = textOrNull(raw["Full Name"]);
  const recordId = textOrNull(raw["Record ID"]);
  if (!fullName || !recordId) return null;
  return {
    recordId,
    fullName,
    priorityTier: textOrNull(raw["Priority Tier"]) ?? "Unranked",
    outreachScore: typeof raw["Outreach Score"] === "number" ? raw["Outreach Score"] : 0,
    confidence: textOrNull(raw["Confidence"]) ?? "Unknown",
    evidenceStatus: textOrNull(raw["Evidence Status"]) ?? "Unverified",
    city: textOrNull(raw["City"]),
    country: textOrNull(raw["Country"]),
    professionalSituation: textOrNull(raw["Professional Situation"]),
    tagline: textOrNull(raw["Tagline"]),
    startupSignals: textOrNull(raw["Startup Signals"]),
    university: textOrNull(raw["University"]),
    fieldOfStudy: textOrNull(raw["Field of Study"]),
    academicDegree: textOrNull(raw["Academic Degree"]),
    linkedinUrl: textOrNull(raw["LinkedIn URL"]),
    githubUrl: textOrNull(raw["GitHub URL"]),
    hackNationProfileUrl: textOrNull(raw["Hack-Nation Profile URL"]),
    company: textOrNull(raw["Verified Company / Startup"]),
    companyWebsite: textOrNull(raw["Company Website"]),
    companyProfiles: (textOrNull(raw["Company Public Profiles"]) ?? "")
      .split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry.startsWith("http")),
    founderRole: textOrNull(raw["Founder Role"]),
    sector: textOrNull(raw["Sector"]),
    product: textOrNull(raw["Product / What They Are Building"]),
    validationSummary: textOrNull(raw["External Validation Summary"]),
    traction: textOrNull(raw["Public Traction / Activity"]),
    whyRelevant: textOrNull(raw["Why Relevant for Founder/Investor Outreach"]),
    risks: textOrNull(raw["Risks / Open Questions"]),
    suggestedNextStep: textOrNull(raw["Suggested Next Step"]),
    usBased: textOrNull(raw["US-Based?"]),
  };
}

export async function listProspects(): Promise<ProspectRecord[]> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as { records?: unknown };
    const records = Array.isArray(parsed.records) ? parsed.records : [];
    cache = records
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map(normalizeRecord)
      .filter((entry): entry is ProspectRecord => entry !== null);
  } catch {
    cache = [];
  }
  return cache;
}

const TIER_BOOST: Record<string, number> = {
  "Tier 1 - contactar primero": 30,
  "Tier 2 - investigar/contactar": 18,
  "Tier 3 - cola fría": 6,
  "Tier 4 - baja prioridad": 0,
};

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#.]+/u)
    .filter((token) => token.length >= 3);
}

function searchableText(record: ProspectRecord): string {
  return [
    record.sector,
    record.product,
    record.tagline,
    record.company,
    record.whyRelevant,
    record.traction,
    record.professionalSituation,
    record.startupSignals,
    record.city,
    record.country,
    record.university,
    record.fieldOfStudy,
    record.founderRole,
    record.usBased ? `us-based ${record.usBased}` : null,
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
}

export interface ProspectSearchResult {
  record: ProspectRecord;
  matchScore: number;
}

/**
 * Deterministic keyword scoring over the curated base: term hits weighted by
 * field coverage, boosted by the researcher-assigned tier and outreach score.
 * The whole base is 47 records, so exhaustive scanning is the right tool.
 */
export async function searchProspects(query: string, limit = 8): Promise<ProspectSearchResult[]> {
  const records = await listProspects();
  const tokens = tokenize(query);

  const scored = records.map((record) => {
    const haystack = searchableText(record);
    let hits = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) hits += 1;
    }
    const termScore = tokens.length > 0 ? (hits / tokens.length) * 100 : 0;
    const tierBoost = TIER_BOOST[record.priorityTier] ?? 0;
    const outreachBoost = record.outreachScore * 0.3;
    return {
      record,
      matchScore: Math.round(termScore + tierBoost + outreachBoost),
      hits,
    };
  });

  return scored
    .filter((entry) => tokens.length === 0 || entry.hits > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, Math.min(limit, 12))
    .map(({ record, matchScore }) => ({ record, matchScore }));
}

/** Exact-ish lookup used by the dossier writer to pull a candidate's base record. */
export async function findProspectByName(name: string): Promise<ProspectRecord | null> {
  const records = await listProspects();
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  return (
    records.find((record) => record.fullName.toLowerCase() === needle)
    ?? records.find((record) => record.fullName.toLowerCase().includes(needle) || needle.includes(record.fullName.toLowerCase()))
    ?? null
  );
}
