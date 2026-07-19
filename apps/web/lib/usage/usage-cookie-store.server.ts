import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { usageSigningSecret } from "./usage-identity.server";
import {
  InMemoryUsageStore,
  type OwnerUsageSnapshot,
  type ReserveInput,
  type ReserveResult,
  type UsageStatus,
  type UsageStore,
} from "./usage-limits";

/**
 * Stateless usage backend for serverless deployments: the whole per-browser
 * ledger travels in ONE signed, HttpOnly cookie. Every route instance (each
 * Vercel lambda, each dev worker) reads the cookie, replays it through the
 * reference in-memory store, applies the operation, and writes the updated
 * snapshot back — so counters survive reloads and are identical no matter
 * which instance answers. The HMAC makes the ledger tamper-proof; clearing
 * cookies resets the free tier, which is the accepted trade-off for an
 * anonymous, infra-free tier.
 *
 * Known limit: cookie writes only work while the response is still open, so
 * refunds fired from stream-error callbacks are best-effort here (the
 * Supabase backend refunds durably). Idempotent replays keep the net charge
 * correct either way.
 */

// .v2: the "search" unit changed from runs to candidate cards — a fresh
// cookie name starts everyone on a clean ledger under the new semantics.
const STATE_COOKIE = "undr_usage_state.v2";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 3; // outlives the 48h window

/** Long idempotency keys and chat ids are hashed to keep the cookie small. */
function digest(value: string): string {
  return createHash("sha256").update(value).digest("base64url").slice(0, 12);
}

function mac(payload: string): string {
  return createHmac("sha256", usageSigningSecret()).update(payload).digest("base64url");
}

function encode(ownerId: string, snapshot: OwnerUsageSnapshot): string {
  const payload = Buffer.from(JSON.stringify({ o: digest(ownerId), s: snapshot })).toString("base64url");
  return `${payload}.${mac(payload)}`;
}

function decode(value: string, ownerId: string): OwnerUsageSnapshot | null {
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(mac(payload));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      o?: string;
      s?: OwnerUsageSnapshot;
    };
    if (parsed.o !== digest(ownerId) || !parsed.s) return null;
    return parsed.s;
  } catch {
    return null;
  }
}

async function withCookieLedger<T>(
  ownerId: string,
  operate: (store: InMemoryUsageStore) => Promise<T>,
): Promise<T> {
  const jar = await cookies();
  const raw = jar.get(STATE_COOKIE)?.value;
  const snapshot = raw ? decode(raw, ownerId) : null;

  const store = new InMemoryUsageStore();
  if (snapshot) store.importOwnerState(ownerId, snapshot);

  const result = await operate(store);

  const next = store.exportOwnerState(ownerId);
  try {
    if (next) {
      jar.set(STATE_COOKIE, encode(ownerId, next), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: COOKIE_MAX_AGE_SECONDS,
      });
    }
  } catch {
    // Response already streaming (or render context): the write is lost but
    // the previous cookie still holds a valid ledger.
  }
  return result;
}

export const cookieUsageStore: UsageStore = {
  reserve(input: ReserveInput): Promise<ReserveResult> {
    const hashed: ReserveInput = {
      ...input,
      idempotencyKey: digest(input.idempotencyKey),
      chatId: input.chatId ? digest(input.chatId) : undefined,
    };
    return withCookieLedger(input.ownerId, (store) => store.reserve(hashed));
  },

  refund(ownerId: string, idempotencyKey: string): Promise<void> {
    return withCookieLedger(ownerId, (store) => store.refund(ownerId, digest(idempotencyKey)));
  },

  statusFor(ownerId: string, chatId?: string): Promise<UsageStatus> {
    return withCookieLedger(ownerId, (store) => store.statusFor(ownerId, chatId ? digest(chatId) : undefined));
  },
};
