import { describe, expect, it } from "vitest";
import { assertSafePublicUrl } from "../src/web/safe-url.js";

describe("assertSafePublicUrl", () => {
  it("accepts a public host", async () => {
    await expect(
      assertSafePublicUrl(new URL("https://example.com/about"), async () => ["93.184.216.34"]),
    ).resolves.toBeUndefined();
  });

  it("does not block public 192.0.x addresses", async () => {
    await expect(
      assertSafePublicUrl(new URL("https://wordpress.example"), async () => ["192.0.78.12"]),
    ).resolves.toBeUndefined();
  });

  it.each(["127.0.0.1", "10.0.0.1", "169.254.1.1", "::1", "fc00::1"])(
    "blocks private or local address %s",
    async (address) => {
      await expect(
        assertSafePublicUrl(new URL("https://example.com"), async () => [address]),
      ).rejects.toThrow("public internet");
    },
  );

  it("blocks credentials and non-http protocols", async () => {
    await expect(assertSafePublicUrl(new URL("https://a:b@example.com"))).rejects.toThrow(
      "credentials",
    );
    await expect(assertSafePublicUrl(new URL("file:///tmp/a"))).rejects.toThrow("HTTP");
  });
});
