import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { isSupabaseEnabled } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Who is spending quota. A Supabase user (including auto-created anonymous
 * sessions) wins so limits follow the account; otherwise a signed, HttpOnly
 * first-party cookie identifies the browser. No form, no login screen —
 * the id is minted silently on the first quota-spending request.
 */

const COOKIE_NAME = "undr_usage_id";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function signingSecret(): string {
  return (
    process.env.USAGE_SIGNING_SECRET?.trim()
    || process.env.SUPABASE_SECRET_KEY?.trim()
    // Demo mode fallback: this is abuse throttling, not access control.
    || "undr-demo-usage-signing"
  );
}

function sign(id: string): string {
  return createHmac("sha256", signingSecret()).update(id).digest("base64url");
}

function verify(value: string): string | null {
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const id = value.slice(0, separator);
  const mac = value.slice(separator + 1);
  const expected = Buffer.from(sign(id));
  const provided = Buffer.from(mac);
  if (expected.length !== provided.length) return null;
  return timingSafeEqual(expected, provided) ? id : null;
}

export async function resolveUsageOwnerId(): Promise<string> {
  if (isSupabaseEnabled()) {
    const supabase = await createClient();
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (data.user) return `user:${data.user.id}`;
    }
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  const existing = raw ? verify(raw) : null;
  if (existing) return `anon:${existing}`;

  const id = randomUUID();
  try {
    cookieStore.set(COOKIE_NAME, `${id}.${sign(id)}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  } catch {
    // Non-route-handler render contexts cannot write cookies; the next
    // API request will mint the cookie. The returned id still works for
    // this request's accounting.
  }
  return `anon:${id}`;
}
