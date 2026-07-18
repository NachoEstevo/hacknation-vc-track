export type SupabasePublicConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

function readDemoMode(): boolean {
  const value = process.env.NEXT_PUBLIC_DEMO_MODE?.trim().toLowerCase();

  // The app is demo-first. Supabase is enabled only when this flag is
  // explicitly disabled and both public credentials are present.
  return value !== "false";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function decodeJwtPayload(value: string): Record<string, unknown> | null {
  const payload = value.split(".")[1];

  if (!payload || typeof globalThis.atob !== "function") {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(globalThis.atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isPrivilegedKey(value: string): boolean {
  if (value.toLowerCase().startsWith("sb_secret_")) {
    return true;
  }

  const payload = decodeJwtPayload(value);
  return payload?.role === "service_role" || payload?.role === "supabase_admin";
}

export function isDemoMode(): boolean {
  return readDemoMode();
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  if (readDemoMode()) {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (
    !url ||
    !publishableKey ||
    !isHttpUrl(url) ||
    isPrivilegedKey(publishableKey)
  ) {
    return null;
  }

  return { url, publishableKey };
}

export function isSupabaseEnabled(): boolean {
  return getSupabasePublicConfig() !== null;
}
