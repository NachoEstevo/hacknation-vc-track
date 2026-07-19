import type {
  CompanyEvidenceBundle,
  EvidenceRecord,
  FundThesis,
  RankedCompany,
  StableCompanySeed,
} from "@hacknation/data-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./errors.js";
import type { ApiRepository, FounderEvidenceInput, StoredFounderEvidenceInput, WatchlistInput } from "./types.js";

type Row = Record<string, any>;

function required<T>(result: { data: T | null; error: { message: string; code?: string } | null }, operation: string): T {
  if (result.error || result.data === null) throw new ApiError(500, "internal_error", `${operation} failed.`);
  return result.data;
}

function coreEvidence(company: Row, source: Row): EvidenceRecord {
  return {
    evidenceId: source.id,
    companyId: company.id,
    sourceType: "clay_csv",
    sourceUrl: source.source_url,
    snapshotPath: null,
    capturedAt: source.captured_at,
    excerpt: company.description,
    payload: source.raw_payload,
    verificationState: source.verification_state,
    visibility: "public",
  };
}

function privateEvidence(row: Row): EvidenceRecord {
  const sourceType: EvidenceRecord["sourceType"] = row.evidence_type.includes("github")
    ? "github_public"
    : row.evidence_type.includes("stripe")
      ? "stripe_private"
      : row.evidence_type.includes("document")
        ? "founder_document"
        : "founder_assertion";
  return {
    evidenceId: row.id,
    companyId: row.company_id,
    sourceType,
    sourceUrl: row.source_url,
    snapshotPath: row.private_object_path,
    capturedAt: row.captured_at,
    excerpt: row.excerpt,
    payload: row.structured_payload,
    verificationState: row.verification_state,
    visibility: row.visibility,
  };
}

function normalizedCompany(company: Row): StableCompanySeed {
  return {
    stableId: company.stable_key,
    name: company.name,
    description: company.description,
    primaryIndustry: company.primary_industry,
    sizeBand: company.size_band,
    organizationType: company.organization_type,
    location: company.location,
    countryCode: company.country_code,
    domain: company.normalized_domain,
    linkedInUrl: company.linkedin_url,
    dedupeKey: company.stable_key,
    source: {
      sourceType: "clay_csv",
      rowNumber: 0,
      verification: "unverified",
      raw: {
        Name: company.name,
        Description: company.description ?? undefined,
        "Primary Industry": company.primary_industry ?? undefined,
        Size: company.size_band ?? undefined,
        Location: company.location ?? undefined,
        Country: company.country_code ?? undefined,
        Domain: company.normalized_domain ?? undefined,
        "LinkedIn URL": company.linkedin_url ?? undefined,
      },
    },
  };
}

function toBundle(company: Row, source: Row, evidence: Row[]): CompanyEvidenceBundle {
  return {
    companyId: company.id,
    companyName: company.name,
    normalizedCompany: normalizedCompany(company),
    evidence: [coreEvidence(company, source), ...evidence.map(privateEvidence)],
  };
}

export function createSupabaseRepository(supabase: SupabaseClient<any>): ApiRepository {
  return {
    async listSearchBundles() {
      const [companiesResult, sourcesResult, evidenceResult] = await Promise.all([
        supabase.from("companies").select("*").order("name"),
        supabase.from("company_sources").select("*").order("captured_at", { ascending: false }),
        supabase.from("evidence").select("*").in("visibility", ["public", "investor_private"]),
      ]);
      const companies = required(companiesResult, "Loading companies") as Row[];
      const sources = required(sourcesResult, "Loading company sources") as Row[];
      const evidence = required(evidenceResult, "Loading evidence") as Row[];
      const latestSource = new Map<string, Row>();
      for (const source of sources) if (!latestSource.has(source.company_id)) latestSource.set(source.company_id, source);
      const evidenceByCompany = new Map<string, Row[]>();
      for (const item of evidence) evidenceByCompany.set(item.company_id, [...(evidenceByCompany.get(item.company_id) ?? []), item]);
      return companies.flatMap((company) => {
        const source = latestSource.get(company.id);
        return source ? [toBundle(company, source, evidenceByCompany.get(company.id) ?? [])] : [];
      });
    },

    async persistSearch(userId, query, thesis: FundThesis, ranked: RankedCompany[]) {
      const search = required(await supabase.from("search_runs").insert({ user_id: userId, query, thesis }).select("id").single(), "Persisting search") as Row;
      if (ranked.length === 0) return search.id;
      const rows = ranked.map(({ evaluation, rank, score, confidenceAdjustedFit, tier, signals }) => ({
        search_id: search.id,
        company_id: evaluation.companyId,
        rank,
        score,
        confidence_adjusted_fit: confidenceAdjustedFit,
        tier,
        signals,
        evaluation,
      }));
      const result = await supabase.from("search_results").insert(rows);
      if (result.error) {
        await supabase.from("search_runs").delete().eq("id", search.id);
        throw new ApiError(500, "internal_error", "Persisting search results failed.");
      }
      return search.id;
    },

    async getBrief(userId, companyId, searchId) {
      const search = await supabase.from("search_runs").select("id, query, thesis, created_at").eq("id", searchId).eq("user_id", userId).maybeSingle();
      if (search.error) throw new ApiError(500, "internal_error", "Loading search failed.");
      if (!search.data) return null;
      const [result, company, relations, evidence] = await Promise.all([
        supabase.from("search_results").select("rank, score, confidence_adjusted_fit, tier, signals, evaluation").eq("search_id", searchId).eq("company_id", companyId).maybeSingle(),
        supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
        supabase.from("company_founders").select("current_title, relationship_state, confidence, founders(id, display_name, founder_identities(provider, profile_url, username, verification_state))").eq("company_id", companyId),
        supabase.from("evidence").select("id, founder_id, evidence_type, source_url, excerpt, structured_payload, visibility, verification_state, captured_at").eq("company_id", companyId).in("visibility", ["public", "investor_private"]).order("captured_at", { ascending: false }),
      ]);
      if (result.error || company.error || relations.error || evidence.error) throw new ApiError(500, "internal_error", "Loading company brief failed.");
      if (!result.data || !company.data) return null;
      return {
        search: { id: search.data.id, query: search.data.query, thesis: search.data.thesis, createdAt: search.data.created_at },
        company: company.data,
        ranking: {
          rank: result.data.rank,
          score: result.data.score,
          confidenceAdjustedFit: result.data.confidence_adjusted_fit,
          tier: result.data.tier,
          signals: result.data.signals,
          evaluation: result.data.evaluation,
        },
        founders: relations.data,
        evidence: evidence.data,
      };
    },

    async companyExists(companyId) {
      const result = await supabase.from("companies").select("id").eq("id", companyId).maybeSingle();
      if (result.error) throw new ApiError(500, "internal_error", "Checking company failed.");
      return result.data !== null;
    },

    async upsertWatchlist(userId, companyId, input: WatchlistInput) {
      return required(await supabase.from("watchlist_entries").upsert({
        user_id: userId,
        company_id: companyId,
        status: input.status,
        note: input.note,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,company_id" }).select("company_id, status, note, created_at, updated_at").single(), "Saving watchlist entry");
    },

    async findVerifiedFounderMembership(userId, companyId) {
      const result = await supabase.from("company_memberships").select("founder_id").eq("user_id", userId).eq("company_id", companyId).eq("role", "founder").eq("status", "verified").maybeSingle();
      if (result.error) throw new ApiError(500, "internal_error", "Checking founder access failed.");
      return result.data?.founder_id ? { founderId: result.data.founder_id as string } : null;
    },

    async insertFounderEvidence(userId, companyId, founderId, input: StoredFounderEvidenceInput) {
      const row = {
        company_id: companyId,
        founder_id: founderId,
        evidence_type: input.evidenceType,
        source_url: input.sourceUrl,
        excerpt: input.excerpt,
        structured_payload: input.structuredPayload,
        visibility: input.visibility,
        verification_state: input.verificationState,
        captured_at: new Date().toISOString(),
        content_hash: input.contentHash,
        submitted_by: userId,
      };
      const inserted = await supabase.from("evidence").insert(row).select("id, company_id, founder_id, evidence_type, visibility, verification_state, captured_at").single();
      if (!inserted.error) return inserted.data;
      if (inserted.error.code !== "23505") throw new ApiError(500, "internal_error", "Registering founder evidence failed.");
      return required(await supabase.from("evidence").select("id, company_id, founder_id, evidence_type, visibility, verification_state, captured_at").eq("company_id", companyId).eq("evidence_type", input.evidenceType).eq("content_hash", input.contentHash).single(), "Loading existing evidence");
    },
  };
}
