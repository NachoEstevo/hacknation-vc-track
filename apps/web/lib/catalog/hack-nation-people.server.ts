import { promises as fs } from "node:fs";
import path from "node:path";
import { listProspects, type ProspectRecord } from "./hack-nation-prospects.server";

/**
 * The HackNation base: every person scraped from hack-nation.ai and flagged
 * with founder signals. Two layers merged by source user id:
 * - the deeply researched cohort (tiers, outreach scores, verified evidence —
 *   same records the undr engine uses), and
 * - the still-queued scraped candidates (profile data only).
 * Powers the "HackNation" search mode, which sources candidates from this
 * base EXCLUSIVELY — when nothing matches, the agent says so instead of
 * quietly going to the web.
 */

export interface HackNationPerson {
  sourceUserId: string;
  fullName: string;
  profileUrl: string | null;
  tagline: string | null;
  professionalSituation: string | null;
  university: string | null;
  fieldOfStudy: string | null;
  academicDegree: string | null;
  location: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  startupSignals: string[];
  /** True when the person is in the researched cohort (record below is set). */
  researched: boolean;
  research: ProspectRecord | null;
}

const CANDIDATES_FILE = path.join(
  process.cwd(),
  "..",
  "..",
  "data",
  "source",
  "hack-nation-startup-research-candidates.json",
);

let cache: HackNationPerson[] | null = null;

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

interface RawCandidate {
  sourceUserId?: unknown;
  publicProfileUrl?: unknown;
  fullName?: unknown;
  startupSignals?: unknown;
  profile?: {
    professionalSituation?: unknown;
    tagline?: unknown;
    university?: unknown;
    fieldOfStudy?: unknown;
    academicDegree?: unknown;
    location?: unknown;
    githubUrl?: unknown;
    linkedinUrl?: unknown;
  };
}

async function loadQueuedCandidates(): Promise<HackNationPerson[]> {
  try {
    const raw = await fs.readFile(CANDIDATES_FILE, "utf8");
    const parsed = JSON.parse(raw) as { candidates?: unknown };
    const rows = Array.isArray(parsed.candidates) ? (parsed.candidates as RawCandidate[]) : [];
    return rows
      .map((row): HackNationPerson | null => {
        const sourceUserId = textOrNull(row.sourceUserId);
        const fullName = textOrNull(row.fullName);
        if (!sourceUserId || !fullName) return null;
        return {
          sourceUserId,
          fullName,
          profileUrl: textOrNull(row.publicProfileUrl),
          tagline: textOrNull(row.profile?.tagline),
          professionalSituation: textOrNull(row.profile?.professionalSituation),
          university: textOrNull(row.profile?.university),
          fieldOfStudy: textOrNull(row.profile?.fieldOfStudy),
          academicDegree: textOrNull(row.profile?.academicDegree),
          location: textOrNull(row.profile?.location),
          githubUrl: textOrNull(row.profile?.githubUrl),
          linkedinUrl: textOrNull(row.profile?.linkedinUrl),
          startupSignals: Array.isArray(row.startupSignals)
            ? row.startupSignals.filter((signal): signal is string => typeof signal === "string")
            : [],
          researched: false,
          research: null,
        };
      })
      .filter((entry): entry is HackNationPerson => entry !== null);
  } catch {
    return [];
  }
}

export async function listHackNationPeople(): Promise<HackNationPerson[]> {
  if (cache) return cache;
  const [queued, researched] = await Promise.all([loadQueuedCandidates(), listProspects()]);

  const byUserId = new Map<string, HackNationPerson>();
  for (const person of queued) byUserId.set(person.sourceUserId, person);

  for (const record of researched) {
    const userId = record.hackNationProfileUrl?.split("/profile/")[1] ?? `research:${record.recordId}`;
    const base = byUserId.get(userId);
    byUserId.set(userId, {
      sourceUserId: userId,
      fullName: record.fullName,
      profileUrl: record.hackNationProfileUrl ?? base?.profileUrl ?? null,
      tagline: record.tagline ?? base?.tagline ?? null,
      professionalSituation: record.professionalSituation ?? base?.professionalSituation ?? null,
      university: record.university ?? base?.university ?? null,
      fieldOfStudy: record.fieldOfStudy ?? base?.fieldOfStudy ?? null,
      academicDegree: record.academicDegree ?? base?.academicDegree ?? null,
      location: [record.city, record.country].filter(Boolean).join(", ") || base?.location || null,
      githubUrl: record.githubUrl ?? base?.githubUrl ?? null,
      linkedinUrl: record.linkedinUrl ?? base?.linkedinUrl ?? null,
      startupSignals: base?.startupSignals ?? (record.startupSignals ? [record.startupSignals] : []),
      researched: true,
      research: record,
    });
  }

  cache = [...byUserId.values()];
  return cache;
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#.]+/u)
    .filter((token) => token.length >= 3);
}

function searchableText(person: HackNationPerson): string {
  return [
    person.tagline,
    person.professionalSituation,
    person.university,
    person.fieldOfStudy,
    person.academicDegree,
    person.location,
    person.startupSignals.join(" "),
    person.research?.sector,
    person.research?.product,
    person.research?.company,
    person.research?.whyRelevant,
    person.research?.traction,
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
}

export interface HackNationSearchResult {
  person: HackNationPerson;
  matchScore: number;
}

/** Deterministic keyword scoring over the merged base; researched people rank above queued ones on ties. */
export async function searchHackNationPeople(query: string, limit = 10): Promise<HackNationSearchResult[]> {
  const people = await listHackNationPeople();
  const tokens = tokenize(query);

  const scored = people.map((person) => {
    const haystack = searchableText(person);
    let hits = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) hits += 1;
    }
    const termScore = tokens.length > 0 ? (hits / tokens.length) * 100 : 0;
    const researchBoost = person.researched ? 15 + (person.research?.outreachScore ?? 0) * 0.2 : 0;
    return { person, matchScore: Math.round(termScore + researchBoost), hits };
  });

  return scored
    .filter((entry) => tokens.length === 0 || entry.hits > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, Math.min(limit, 15))
    .map(({ person, matchScore }) => ({ person, matchScore }));
}

export async function findHackNationPersonByName(name: string): Promise<HackNationPerson | null> {
  const people = await listHackNationPeople();
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  return (
    people.find((person) => person.fullName.toLowerCase() === needle)
    ?? people.find((person) =>
      person.fullName.toLowerCase().includes(needle) || needle.includes(person.fullName.toLowerCase()))
    ?? null
  );
}
