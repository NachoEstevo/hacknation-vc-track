import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/env";
import { cookieUsageStore } from "./usage-cookie-store.server";
import {
  InMemoryUsageStore,
  USAGE_LIMITS,
  type ReserveInput,
  type ReserveResult,
  type UsageStatus,
  type UsageStore,
} from "./usage-limits";

/**
 * Storage backend selection, in order:
 *  1. Supabase RPCs (configured + secret key): durable, shared, refundable.
 *  2. Signed-cookie ledger: stateless, so it works identically on Vercel
 *     lambdas, dev workers, and reloads — no shared memory required.
 *  3. Per-process memory: last resort when no cookie jar exists (background
 *     callbacks after the response closed).
 * Failures degrade down the list — a broken usage ledger must never take
 * the product down.
 */

// Survives Next dev hot reloads so counters don't reset on every recompile.
const globalScope = globalThis as { __undrUsageMemoryStore?: InMemoryUsageStore };
const memoryStore = (globalScope.__undrUsageMemoryStore ??= new InMemoryUsageStore());

function serviceClient(): SupabaseClient | null {
  const config = getSupabasePublicConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!config || !secretKey) return null;
  return createServiceClient(config.url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

interface StatusPayload {
  searchesUsed?: number;
  profilesUsed?: number;
  chatMessagesUsed?: number;
  windowEndsAt?: string | null;
  allowed?: boolean;
  reason?: string;
}

function statusFromPayload(payload: StatusPayload): UsageStatus {
  return {
    searchesUsed: payload.searchesUsed ?? 0,
    profilesUsed: payload.profilesUsed ?? 0,
    chatMessagesUsed: payload.chatMessagesUsed ?? 0,
    limits: { ...USAGE_LIMITS },
    windowEndsAt: payload.windowEndsAt
      ? new Date(payload.windowEndsAt).toISOString()
      : null,
  };
}

class SupabaseUsageStore implements UsageStore {
  constructor(private readonly client: SupabaseClient) {}

  async reserve(input: ReserveInput): Promise<ReserveResult> {
    const { data, error } = await this.client.rpc("usage_reserve", {
      p_owner: input.ownerId,
      p_kind: input.kind,
      p_chat_id: input.chatId ?? null,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw error;
    const payload = (data ?? {}) as StatusPayload;
    return {
      allowed: payload.allowed === true,
      reason: payload.allowed === true ? undefined : "limit_reached",
      status: statusFromPayload(payload),
    };
  }

  async refund(ownerId: string, idempotencyKey: string): Promise<void> {
    const { error } = await this.client.rpc("usage_refund", {
      p_owner: ownerId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
  }

  async statusFor(ownerId: string, chatId?: string): Promise<UsageStatus> {
    const { data, error } = await this.client.rpc("usage_status_payload", {
      p_owner: ownerId,
      p_chat_id: chatId ?? null,
    });
    if (error) throw error;
    return statusFromPayload((data ?? {}) as StatusPayload);
  }
}

function supabaseStore(): SupabaseUsageStore | null {
  const client = serviceClient();
  return client ? new SupabaseUsageStore(client) : null;
}

async function withFallbacks<T>(
  operation: string,
  run: (store: UsageStore) => Promise<T>,
): Promise<T> {
  const durable = supabaseStore();
  if (durable) {
    try {
      return await run(durable);
    } catch (error) {
      console.warn(`[usage] Supabase ${operation} failed; falling back to cookie ledger`, error);
    }
  }
  try {
    return await run(cookieUsageStore);
  } catch (error) {
    console.warn(`[usage] cookie ${operation} unavailable; using in-memory limits`, error);
    return run(memoryStore);
  }
}

export async function reserveUsage(input: ReserveInput): Promise<ReserveResult> {
  return withFallbacks("reserve", (store) => store.reserve(input));
}

export async function refundUsage(ownerId: string, idempotencyKey: string): Promise<void> {
  return withFallbacks("refund", (store) => store.refund(ownerId, idempotencyKey));
}

export async function usageStatusFor(ownerId: string, chatId?: string): Promise<UsageStatus> {
  return withFallbacks("status", (store) => store.statusFor(ownerId, chatId));
}
