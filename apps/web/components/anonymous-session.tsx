"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Silent first-visit identity: when Supabase is configured and the browser
 * has no session, create an anonymous one — no form, no login screen. If the
 * anonymous provider is disabled (or the call fails) the app still works:
 * usage accounting falls back to the signed `undr_usage_id` cookie.
 */
export function AnonymousSession() {
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) return;
        return supabase.auth.signInAnonymously().then(() => undefined);
      })
      .catch(() => {
        // Fall back to the cookie identity.
      });
  }, []);

  return null;
}
