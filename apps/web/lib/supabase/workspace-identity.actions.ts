"use server";

import { getAuthedContext } from "./workspace-context";

export interface InvestorIdentity {
  name: string;
}

/**
 * Reads the caller's own `profiles.display_name`, falling back to the
 * account email's local part when no display name has been set yet. Returns
 * null when there is no authenticated session (e.g. demo mode with Supabase
 * disabled) — callers fall back to a generic, honestly-labeled default
 * rather than inventing a person.
 */
export async function loadInvestorIdentityAction(): Promise<InvestorIdentity | null> {
  const ctx = await getAuthedContext();
  if (!ctx) return null;
  const { supabase, userId, email } = ctx;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  const name = profile?.display_name?.trim() || email?.split("@")[0]?.trim() || "";
  return name ? { name } : null;
}

/**
 * Updates the caller's own `profiles.display_name`. The migration's
 * column-level UPDATE grant covers `display_name`, and RLS restricts the
 * write to `id = auth.uid()`.
 */
export async function saveInvestorNameAction(name: string): Promise<boolean> {
  const normalized = name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!normalized) return false;

  const ctx = await getAuthedContext();
  if (!ctx) return false;
  const { supabase, userId } = ctx;

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: normalized })
    .eq("id", userId);
  return !error;
}
