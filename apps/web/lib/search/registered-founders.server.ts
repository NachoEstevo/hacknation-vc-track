import { createClient } from "@/lib/supabase/server";

/**
 * Real candidates sourced from undr's own registered-founder database
 * (published projects only — RLS enforces this even if the query below
 * didn't). Returns `[]` whenever Supabase is disabled (demo mode) or no
 * authenticated session exists — never fabricated rows.
 */
export interface RegisteredFounderCandidate {
  projectId: string;
  projectName: string;
  tagline: string | null;
  summary: string | null;
  stage: string | null;
  sectorTags: string[];
  location: string | null;
  countryCode: string | null;
  hasWorkingDemo: boolean | null;
  institutionalFunding: boolean | null;
  hackathonOrigin: string | null;
  tractionSummary: string | null;
  founderName: string | null;
  claimCount: number;
  evidenceCount: number;
}

function likeTerm(term: string): string {
  return `%${term.replace(/[%_]/g, "")}%`;
}

/** Best-effort keyword match across name/tagline/summary/sector tags. */
export async function searchRegisteredFounders(
  keywords: string[],
  limit = 10,
): Promise<RegisteredFounderCandidate[]> {
  const client = await createClient();
  if (!client) return [];

  const terms = keywords.map((keyword) => keyword.trim()).filter(Boolean).slice(0, 5);
  if (terms.length === 0) return [];

  const orFilter = terms
    .flatMap((term) => [
      `name.ilike.${likeTerm(term)}`,
      `tagline.ilike.${likeTerm(term)}`,
      `summary.ilike.${likeTerm(term)}`,
    ])
    .join(",");

  const { data: projects, error } = await client
    .from("projects")
    .select(
      "id, name, tagline, summary, stage, sector_tags, location, country_code, has_working_demo, institutional_funding, hackathon_origin, traction_summary",
    )
    .eq("visibility", "published")
    .or(orFilter)
    .limit(limit);

  if (error || !projects || projects.length === 0) return [];

  const projectIds = projects.map((project) => project.id as string);

  const [{ data: founderRows }, { data: claimRows }] = await Promise.all([
    client
      .from("project_founders")
      .select("project_id, is_primary, founders(display_name)")
      .in("project_id", projectIds)
      .in("relationship_state", ["founder_confirmed", "admin_confirmed"]),
    client
      .from("claims")
      .select("project_id, id")
      .in("project_id", projectIds)
      .eq("visibility", "published"),
  ]);

  const founderNameByProject = new Map<string, string>();
  for (const row of founderRows ?? []) {
    const projectId = row.project_id as string;
    if (founderNameByProject.has(projectId) && !row.is_primary) continue;
    const founder = row.founders as { display_name?: string } | null;
    if (founder?.display_name) founderNameByProject.set(projectId, founder.display_name);
  }

  const claimCountByProject = new Map<string, number>();
  for (const row of claimRows ?? []) {
    const projectId = row.project_id as string;
    claimCountByProject.set(projectId, (claimCountByProject.get(projectId) ?? 0) + 1);
  }

  return projects.map((project) => ({
    projectId: project.id as string,
    projectName: project.name as string,
    tagline: project.tagline as string | null,
    summary: project.summary as string | null,
    stage: project.stage as string | null,
    sectorTags: (project.sector_tags as string[] | null) ?? [],
    location: project.location as string | null,
    countryCode: project.country_code as string | null,
    hasWorkingDemo: project.has_working_demo as boolean | null,
    institutionalFunding: project.institutional_funding as boolean | null,
    hackathonOrigin: project.hackathon_origin as string | null,
    tractionSummary: project.traction_summary as string | null,
    founderName: founderNameByProject.get(project.id as string) ?? null,
    claimCount: claimCountByProject.get(project.id as string) ?? 0,
    evidenceCount: 0,
  }));
}
