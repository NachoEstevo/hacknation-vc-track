"use server";

import { isSearchCriterion, type SearchCriterion } from "@/lib/domain";
import { searchFingerprint } from "@/lib/search";
import type { NewSavedSearch, SavedSearch, WorkspaceMutationResult } from "@/components/workspace-provider";
import { getAuthedContext } from "./workspace-context";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function criteriaFromParsedIntent(parsedIntent: unknown): SearchCriterion[] | undefined {
  const intent = isRecord(parsedIntent) ? parsedIntent : {};
  const candidate = intent.criteria;
  if (!Array.isArray(candidate) || !candidate.every(isSearchCriterion)) return undefined;
  return candidate;
}

function labelFromParsedIntent(parsedIntent: unknown, fallback: string): string {
  const intent = isRecord(parsedIntent) ? parsedIntent : {};
  return typeof intent.label === "string" && intent.label.trim() ? intent.label : fallback;
}

/** Reads the caller's searches with `status = 'saved'`, the real analogue of the browser-only saved-search list. */
export async function loadSavedSearchesAction(): Promise<SavedSearch[]> {
  const ctx = await getAuthedContext();
  if (!ctx) return [];
  const { supabase, userId } = ctx;

  const { data, error } = await supabase
    .from("searches")
    .select("id, query, parsed_intent, created_at, updated_at")
    .eq("owner_user_id", userId)
    .eq("status", "saved")
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    query: row.query,
    label: labelFromParsedIntent(row.parsed_intent, row.query),
    criteria: criteriaFromParsedIntent(row.parsed_intent),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Persists a `searches` row with `status = 'saved'`. Re-saving the same
 * query/criteria fingerprint (or the same search id) updates the existing
 * row instead of creating a duplicate, mirroring the browser-only behavior
 * in `workspace-provider.tsx`.
 */
export async function saveSearchAction(input: NewSavedSearch): Promise<string> {
  const ctx = await getAuthedContext();
  if (!ctx) return "";
  const { supabase, userId } = ctx;

  const query = input.query.trim();
  if (!query) return "";
  if (input.criteria !== undefined && !input.criteria.every(isSearchCriterion)) return "";

  const parsedIntent = { label: input.label?.trim() || query, criteria: input.criteria ?? [] };
  const now = new Date().toISOString();

  if (input.id) {
    const { data } = await supabase
      .from("searches")
      .update({ query, parsed_intent: parsedIntent, status: "saved", completed_at: now })
      .eq("owner_user_id", userId)
      .eq("id", input.id)
      .select("id")
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const fingerprint = searchFingerprint(query, input.criteria);
  const { data: existingRows } = await supabase
    .from("searches")
    .select("id, query, parsed_intent")
    .eq("owner_user_id", userId)
    .eq("status", "saved");
  const match = (existingRows ?? []).find(
    (row) => searchFingerprint(row.query, criteriaFromParsedIntent(row.parsed_intent)) === fingerprint,
  );

  if (match) {
    const { error } = await supabase
      .from("searches")
      .update({ query, parsed_intent: parsedIntent, status: "saved", completed_at: now })
      .eq("id", match.id);
    return error ? "" : match.id;
  }

  const { data, error } = await supabase
    .from("searches")
    .insert({
      owner_user_id: userId,
      query,
      parsed_intent: parsedIntent,
      status: "saved",
      started_at: now,
      completed_at: now,
      result_count: 0,
    })
    .select("id")
    .single();
  return error ? "" : data?.id ?? "";
}

export async function removeSavedSearchAction(searchId: string): Promise<WorkspaceMutationResult> {
  const ctx = await getAuthedContext();
  if (!ctx) return "failed";
  const { supabase, userId } = ctx;

  const { data, error } = await supabase
    .from("searches")
    .delete()
    .eq("owner_user_id", userId)
    .eq("id", searchId)
    .eq("status", "saved")
    .select("id");
  if (error) return "failed";
  return (data?.length ?? 0) > 0 ? "saved" : "no_change";
}
