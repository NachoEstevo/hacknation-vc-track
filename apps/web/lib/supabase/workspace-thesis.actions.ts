"use server";

import {
  activeThesisFromStoredCriteria,
  createActiveThesis,
  thesisCriteriaRowsForInput,
  THESIS_SOURCE_SCOPES,
  type ActiveThesis,
  type ActiveThesisInput,
  type ThesisSourceScope,
} from "@/lib/domain";
import { getAuthedContext } from "./workspace-context";

/** Reads the caller's active thesis (`fund_theses.status = 'active'`) and its criteria, or null if none exists yet. */
export async function loadActiveThesisAction(): Promise<ActiveThesis | null> {
  const ctx = await getAuthedContext();
  if (!ctx) return null;
  const { supabase, userId } = ctx;

  const { data: thesis, error: thesisError } = await supabase
    .from("fund_theses")
    .select("id, natural_language_query, source_scope, updated_at")
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (thesisError || !thesis?.natural_language_query) return null;

  const { data: criteriaRows, error: criteriaError } = await supabase
    .from("thesis_criteria")
    .select("id, field, operator, value, priority, label, sort_order")
    .eq("thesis_id", thesis.id)
    .order("sort_order", { ascending: true });
  if (criteriaError) return null;

  return activeThesisFromStoredCriteria({
    brief: thesis.natural_language_query,
    criteria: (criteriaRows ?? []).map((row) => ({
      id: row.id,
      field: row.field,
      operator: row.operator,
      value: row.value,
      priority: row.priority,
      label: row.label,
      sortOrder: row.sort_order,
    })),
    updatedAt: thesis.updated_at,
    sourceScope: thesis.source_scope,
  });
}

/**
 * Flips `fund_theses.source_scope` for the caller's active thesis without
 * touching `thesis_criteria` — a lighter alternative to routing a single
 * toggle through `saveActiveThesisAction`, which would otherwise delete and
 * reinsert every criteria row just to change one column.
 */
export async function setThesisSourceScopeAction(scope: ThesisSourceScope): Promise<boolean> {
  if (!THESIS_SOURCE_SCOPES.includes(scope)) return false;
  const ctx = await getAuthedContext();
  if (!ctx) return false;
  const { supabase, userId } = ctx;

  const { error } = await supabase
    .from("fund_theses")
    .update({ source_scope: scope })
    .eq("owner_user_id", userId)
    .eq("status", "active");
  return !error;
}

/**
 * Validates and normalizes the thesis input using the exact same rules as
 * the browser-only thesis builder (`createActiveThesis`), then persists it
 * as a real `fund_theses` row plus one `thesis_criteria` row per criterion.
 * Replaces the previous criteria set atomically-per-request (not wrapped in
 * a DB transaction, since the Supabase JS client does not expose one for
 * plain table operations — acceptable for this local, single-writer flow,
 * but a candidate for an RPC/transaction if this ever needs stronger
 * guarantees against a failure between the delete and the insert).
 */
export async function saveActiveThesisAction(input: ActiveThesisInput): Promise<ActiveThesis | null> {
  const ctx = await getAuthedContext();
  if (!ctx) return null;
  const { supabase, userId } = ctx;

  let normalized: ActiveThesis;
  try {
    normalized = createActiveThesis(input);
  } catch {
    return null;
  }

  const { brief, sectors, stages, geographies, signals, exclusions, checkRange, riskPosture, sourceScope, summary } = normalized;

  const { data: existing, error: existingError } = await supabase
    .from("fund_theses")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (existingError) return null;

  // `owner_user_id` only has an INSERT-time grant (see the migration's
  // `grant update (name, description, natural_language_query, source_scope,
  // status) on public.fund_theses`) — it must never appear in an UPDATE
  // payload, or PostgREST's generated SET clause is denied outright.
  const mutablePayload = {
    name: brief.slice(0, 120),
    description: summary,
    natural_language_query: brief,
    source_scope: sourceScope,
    status: "active" as const,
  };

  let thesisId: string | null = null;
  if (existing?.id) {
    const { error } = await supabase.from("fund_theses").update(mutablePayload).eq("id", existing.id);
    thesisId = error ? null : existing.id;
  } else {
    const { data, error } = await supabase
      .from("fund_theses")
      .insert({ ...mutablePayload, owner_user_id: userId })
      .select("id")
      .single();
    thesisId = error ? null : data?.id ?? null;
  }
  if (!thesisId) return null;

  const { error: deleteError } = await supabase.from("thesis_criteria").delete().eq("thesis_id", thesisId);
  if (deleteError) return null;

  const rows = thesisCriteriaRowsForInput({ brief, sectors, stages, geographies, signals, exclusions, checkRange, riskPosture })
    .map((row) => ({
      thesis_id: thesisId,
      field: row.field,
      operator: row.operator,
      value: row.value,
      priority: row.priority,
      label: row.label,
      sort_order: row.sortOrder,
    }));

  const { data: insertedRows, error: insertError } = await supabase
    .from("thesis_criteria")
    .insert(rows)
    .select("id, field, operator, value, priority, label, sort_order");
  if (insertError) return null;

  const { data: thesisRow } = await supabase
    .from("fund_theses")
    .select("updated_at")
    .eq("id", thesisId)
    .single();

  return activeThesisFromStoredCriteria({
    brief,
    sourceScope,
    criteria: (insertedRows ?? []).map((row) => ({
      id: row.id,
      field: row.field,
      operator: row.operator,
      value: row.value,
      priority: row.priority,
      label: row.label,
      sortOrder: row.sort_order,
    })),
    updatedAt: thesisRow?.updated_at ?? new Date().toISOString(),
  });
}
