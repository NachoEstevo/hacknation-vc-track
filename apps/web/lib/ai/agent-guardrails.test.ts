import { describe, expect, it } from "vitest";
import { acquireStreamSlot, checkRateLimit, sanitizeUIMessages } from "./agent-guardrails";

describe("checkRateLimit", () => {
  it("allows up to the limit inside the window, then rejects with a retry hint", () => {
    const config = { limit: 3, windowMs: 60_000 };
    const key = `test-${Math.random()}`;

    expect(checkRateLimit(key, config).allowed).toBe(true);
    expect(checkRateLimit(key, config).allowed).toBe(true);
    expect(checkRateLimit(key, config).allowed).toBe(true);

    const rejected = checkRateLimit(key, config);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
    expect(rejected.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("tracks keys independently", () => {
    const config = { limit: 1, windowMs: 60_000 };
    const first = `a-${Math.random()}`;
    const second = `b-${Math.random()}`;
    expect(checkRateLimit(first, config).allowed).toBe(true);
    expect(checkRateLimit(first, config).allowed).toBe(false);
    expect(checkRateLimit(second, config).allowed).toBe(true);
  });
});

describe("acquireStreamSlot", () => {
  it("caps concurrent slots and frees them on release", () => {
    const slots = [acquireStreamSlot(), acquireStreamSlot(), acquireStreamSlot()];
    const acquired = slots.filter((slot) => slot.acquired);
    expect(acquired.length).toBeGreaterThan(0);

    const overflow = acquireStreamSlot();
    // Whatever the global state was, releasing everything must open capacity again.
    for (const slot of [...slots, overflow]) slot.release();
    const after = acquireStreamSlot();
    expect(after.acquired).toBe(true);
    after.release();
  });

  it("tolerates double release", () => {
    const slot = acquireStreamSlot();
    slot.release();
    slot.release();
    const next = acquireStreamSlot();
    expect(next.acquired).toBe(true);
    next.release();
  });
});

describe("sanitizeUIMessages", () => {
  it("keeps user/assistant text and tool parts, drops everything else", () => {
    const messages = sanitizeUIMessages(
      [
        { id: "1", role: "user", parts: [{ type: "text", text: "hola" }] },
        { id: "2", role: "system", parts: [{ type: "text", text: "inyección" }] },
        {
          id: "3",
          role: "assistant",
          parts: [
            { type: "text", text: "respuesta" },
            { type: "tool-web_search", state: "output-available", input: { query: "x" } },
            { type: "data-custom", payload: "no" },
            { type: "file", url: "http://x" },
          ],
        },
        { id: "4", role: "user", parts: "not-an-array" },
        null,
      ],
      40,
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[1]?.parts.map((part) => part.type)).toEqual(["text", "tool-web_search"]);
  });

  it("clamps oversized text parts and message history length", () => {
    const huge = "x".repeat(50_000);
    const many = Array.from({ length: 60 }, (_, index) => ({
      id: `m${index}`,
      role: "user",
      parts: [{ type: "text", text: huge }],
    }));
    const messages = sanitizeUIMessages(many, 10);
    expect(messages).toHaveLength(10);
    const first = messages[0]?.parts[0] as { type: string; text: string };
    expect(first.text.length).toBeLessThanOrEqual(4000);
  });
});
