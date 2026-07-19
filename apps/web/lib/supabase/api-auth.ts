import { NextResponse } from "next/server";
import { isSupabaseEnabled } from "@/lib/env";
import { getAuthedContext } from "./workspace-context";

/**
 * Production gate for API routes that spend third-party quota (LLM calls,
 * Tavily, GitHub). In demo mode Supabase is disabled and the app is a
 * local-only prototype, so these routes stay open. The moment Supabase
 * accounts are enabled (a real deployment), every quota-spending route
 * requires a signed-in user — otherwise anyone on the internet could drain
 * the API keys.
 *
 * Returns `null` when the request may proceed, or a ready 401 response.
 */
export async function requireUserInProduction(): Promise<NextResponse | null> {
  if (!isSupabaseEnabled()) return null;

  const ctx = await getAuthedContext();
  if (ctx) return null;

  return NextResponse.json(
    { message: "Sign in to use this workspace." },
    { status: 401 },
  );
}
