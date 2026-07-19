import { createClient } from "@supabase/supabase-js";
import type { Authenticate } from "./types.js";

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+([^\s]+)$/iu);
  return match?.[1] ?? null;
}

export function createSupabaseAuthenticator(supabaseUrl: string, publishableKey: string): Authenticate {
  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return async (request) => {
    const token = bearerToken(request);
    if (!token) return null;
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return { userId: data.user.id };
  };
}
