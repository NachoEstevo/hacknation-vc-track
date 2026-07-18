import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "./route";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("Supabase email confirmation callback", () => {
  it("bypasses auth and redirects to the investor app in demo mode", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";

    const response = await GET(
      new NextRequest("https://undr.test/auth/confirm?token_hash=secret&type=email"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://undr.test/investor");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("accepts a same-origin relative next path", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";

    const response = await GET(
      new NextRequest(
        "https://undr.test/auth/confirm?next=%2Finvestor%2Fthesis%3Fstep%3D2",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://undr.test/investor/thesis?step=2",
    );
  });

  it("rejects protocol-relative external redirects", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";

    const response = await GET(
      new NextRequest(
        "https://undr.test/auth/confirm?next=%2F%2Fevil.example%2Fsteal",
      ),
    );

    expect(response.headers.get("location")).toBe("https://undr.test/investor");
  });
});
