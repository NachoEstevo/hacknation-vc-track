import { afterEach, describe, expect, it } from "vitest";

import {
  getSupabasePublicConfig,
  isDemoMode,
  isSupabaseEnabled,
} from "./env";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function configureSupabase() {
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
}

describe("public environment", () => {
  it("defaults to demo mode and bypasses Supabase", () => {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(isDemoMode()).toBe(true);
    expect(isSupabaseEnabled()).toBe(false);
    expect(getSupabasePublicConfig()).toBeNull();
  });

  it("keeps Supabase disabled while demo mode is active", () => {
    configureSupabase();
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";

    expect(getSupabasePublicConfig()).toBeNull();
  });

  it("returns the public configuration only when explicitly enabled", () => {
    configureSupabase();

    expect(getSupabasePublicConfig()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
    });
  });

  it("rejects missing or invalid project URLs", () => {
    configureSupabase();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";

    expect(getSupabasePublicConfig()).toBeNull();
  });

  it("rejects secret and service-role keys", () => {
    configureSupabase();
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_secret_test";
    expect(getSupabasePublicConfig()).toBeNull();

    const payload = Buffer.from(
      JSON.stringify({ role: "service_role" }),
    ).toString("base64url");
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = `header.${payload}.signature`;
    expect(getSupabasePublicConfig()).toBeNull();
  });
});
