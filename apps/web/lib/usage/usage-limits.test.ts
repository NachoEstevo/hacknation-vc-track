import { describe, expect, it } from "vitest";
import { InMemoryUsageStore, USAGE_LIMITS, USAGE_WINDOW_MS } from "./usage-limits";

const T0 = 1_750_000_000_000;

function store() {
  return new InMemoryUsageStore();
}

describe("InMemoryUsageStore", () => {
  it("charges each pool independently up to its limit", async () => {
    const usage = store();
    for (let index = 0; index < USAGE_LIMITS.prospect_search; index += 1) {
      const result = await usage.reserve({ ownerId: "a", kind: "prospect_search", idempotencyKey: `s${index}`, now: T0 });
      expect(result.allowed).toBe(true);
    }
    const blocked = await usage.reserve({ ownerId: "a", kind: "prospect_search", idempotencyKey: "s-extra", now: T0 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("limit_reached");

    // Searches being exhausted does not touch the profile pool.
    const profile = await usage.reserve({ ownerId: "a", kind: "profile_completion", idempotencyKey: "p0", now: T0 });
    expect(profile.allowed).toBe(true);
    expect(profile.status.searchesUsed).toBe(5);
    expect(profile.status.profilesUsed).toBe(1);
  });

  it("keeps chat message pools separate per chat", async () => {
    const usage = store();
    for (let index = 0; index < USAGE_LIMITS.chat_message; index += 1) {
      const result = await usage.reserve({ ownerId: "a", kind: "chat_message", chatId: "chat-1", idempotencyKey: `m${index}`, now: T0 });
      expect(result.allowed).toBe(true);
    }
    const eleventh = await usage.reserve({ ownerId: "a", kind: "chat_message", chatId: "chat-1", idempotencyKey: "m10", now: T0 });
    expect(eleventh.allowed).toBe(false);

    const otherChat = await usage.reserve({ ownerId: "a", kind: "chat_message", chatId: "chat-2", idempotencyKey: "n0", now: T0 });
    expect(otherChat.allowed).toBe(true);
  });

  it("replays the same idempotency key without double-charging (retry, double click)", async () => {
    const usage = store();
    const first = await usage.reserve({ ownerId: "a", kind: "profile_completion", idempotencyKey: "dossier-x", now: T0 });
    const retry = await usage.reserve({ ownerId: "a", kind: "profile_completion", idempotencyKey: "dossier-x", now: T0 + 5_000 });
    expect(first.allowed).toBe(true);
    expect(retry.allowed).toBe(true);
    expect(retry.status.profilesUsed).toBe(1);
  });

  it("lets the last slot go to exactly one of two concurrent distinct requests", async () => {
    const usage = store();
    for (let index = 0; index < USAGE_LIMITS.profile_completion - 1; index += 1) {
      await usage.reserve({ ownerId: "a", kind: "profile_completion", idempotencyKey: `p${index}`, now: T0 });
    }
    const [left, right] = await Promise.all([
      usage.reserve({ ownerId: "a", kind: "profile_completion", idempotencyKey: "race-left", now: T0 }),
      usage.reserve({ ownerId: "a", kind: "profile_completion", idempotencyKey: "race-right", now: T0 }),
    ]);
    expect([left.allowed, right.allowed].filter(Boolean)).toHaveLength(1);
  });

  it("refunds exactly once and lets the same key re-reserve afterwards", async () => {
    const usage = store();
    await usage.reserve({ ownerId: "a", kind: "profile_completion", idempotencyKey: "d1", now: T0 });
    await usage.refund("a", "d1", T0 + 1_000);
    await usage.refund("a", "d1", T0 + 2_000); // double refund is a no-op
    let status = await usage.statusFor("a", undefined, T0 + 3_000);
    expect(status.profilesUsed).toBe(0);

    const again = await usage.reserve({ ownerId: "a", kind: "profile_completion", idempotencyKey: "d1", now: T0 + 4_000 });
    expect(again.allowed).toBe(true);
    status = await usage.statusFor("a", undefined, T0 + 5_000);
    expect(status.profilesUsed).toBe(1);
  });

  it("resets every pool together when the 48h window expires", async () => {
    const usage = store();
    await usage.reserve({ ownerId: "a", kind: "prospect_search", idempotencyKey: "s0", now: T0 });
    await usage.reserve({ ownerId: "a", kind: "profile_completion", idempotencyKey: "p0", now: T0 + 1_000 });
    await usage.reserve({ ownerId: "a", kind: "chat_message", chatId: "c", idempotencyKey: "m0", now: T0 + 2_000 });

    const before = await usage.statusFor("a", "c", T0 + USAGE_WINDOW_MS - 1);
    expect(before.searchesUsed).toBe(1);
    expect(before.chatMessagesUsed).toBe(1);

    const after = await usage.statusFor("a", "c", T0 + USAGE_WINDOW_MS + 1);
    expect(after).toMatchObject({ searchesUsed: 0, profilesUsed: 0, chatMessagesUsed: 0, windowEndsAt: null });
  });

  it("opens the window at the first consumption, not at first sight", async () => {
    const usage = store();
    const idle = await usage.statusFor("a", undefined, T0);
    expect(idle.windowEndsAt).toBeNull();

    const first = await usage.reserve({ ownerId: "a", kind: "prospect_search", idempotencyKey: "s0", now: T0 + 60_000 });
    expect(first.status.windowEndsAt).toBe(new Date(T0 + 60_000 + USAGE_WINDOW_MS).toISOString());
  });

  it("isolates owners from each other", async () => {
    const usage = store();
    await usage.reserve({ ownerId: "a", kind: "prospect_search", idempotencyKey: "s0", now: T0 });
    const other = await usage.statusFor("b", undefined, T0);
    expect(other.searchesUsed).toBe(0);
  });
});
