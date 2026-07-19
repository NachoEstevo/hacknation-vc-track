import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./server";

export interface AuthedContext {
  supabase: SupabaseClient;
  userId: string;
  email: string | null;
}

/**
 * Every workspace server action needs the same two things: a cookie-bound
 * Supabase client and the caller's own `auth.uid()`. Centralizing the lookup
 * keeps every action honest about failing closed (returning `null`) instead
 * of guessing a user id when Supabase is disabled or the session is missing.
 */
export async function getAuthedContext(): Promise<AuthedContext | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return { supabase, userId: data.user.id, email: data.user.email ?? null };
}
