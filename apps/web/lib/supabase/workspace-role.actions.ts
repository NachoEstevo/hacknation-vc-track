"use server";

import { getAuthedContext } from "./workspace-context";

/**
 * Records the self-selected investor role from `/onboarding/role`. This app
 * only self-serves the investor path today (the founder role and its own
 * onboarding are owned by a separate in-progress workspace under
 * `app/founder/*`), so this only ever writes `role = 'investor'`.
 *
 * Per the schema's own comment, `user_roles` is a product-mode signal, not a
 * privileged authorization source — every downstream check still relies on
 * `owner_user_id = auth.uid()` / `created_by = auth.uid()`.
 *
 * This deliberately avoids `.upsert()`: PostgREST's merge-duplicates upsert
 * issues `ON CONFLICT (...) DO UPDATE SET <every column> = EXCLUDED.<column>`,
 * including the conflict-key columns (`user_id`, `role`) — and only
 * `is_primary` has a column-level UPDATE grant for `authenticated` (see the
 * migration's `grant update (is_primary) on public.user_roles`). Selecting
 * first and updating only `is_primary` stays within that grant.
 */
export async function saveInvestorRoleAction(): Promise<boolean> {
  const ctx = await getAuthedContext();
  if (!ctx) return false;
  const { supabase, userId } = ctx;

  const { data: existing, error: selectError } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "investor")
    .maybeSingle();
  if (selectError) return false;

  if (existing) {
    const { error } = await supabase
      .from("user_roles")
      .update({ is_primary: true })
      .eq("user_id", userId)
      .eq("role", "investor");
    return !error;
  }

  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role: "investor", is_primary: true });
  return !error;
}
