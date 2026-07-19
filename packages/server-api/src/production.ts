import { createClient } from "@supabase/supabase-js";
import { createSupabaseAuthenticator } from "./auth.js";
import { createApi } from "./router.js";
import { createOpenAISearchEngine } from "./search-engine.js";
import { createServices } from "./services.js";
import { createSupabaseRepository } from "./supabase-repository.js";

function requiredEnv(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} must be configured`);
  return value;
}

export function createProductionApi(env: Record<string, string | undefined> = process.env) {
  const url = requiredEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = requiredEnv(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = requiredEnv(env, "SUPABASE_SECRET_KEY");
  const serverClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return createApi({
    authenticate: createSupabaseAuthenticator(url, publishableKey),
    services: createServices(createSupabaseRepository(serverClient), createOpenAISearchEngine(env)),
  });
}
