import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/env";
import {
  InMemoryUsageStore,
  USAGE_LIMITS,
  type ReserveInput,
  type ReserveResult,
  type UsageStatus,
  type UsageStore,
} from "./usage-limits";

/**
 * Storage backend selection. With Supabase configured AND a secret key, the
 * atomic SECURITY DEFINER RPCs from the usage-limits migration are the
 * source of truth (durable, shared across instances). Otherwise — demo mode,
 * local dev — a per-process in-memory store applies the same rules. Backend
 * errors fall back to the memory store: a broken usage ledger must degrade
 * to demo limits, never take the product down.
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

function pickStore(): UsageStore {
  const client = serviceClient();
  return client ? new SupabaseUsageStore(client) : memoryStore;
}

export async function reserveUsage(input: ReserveInput): Promise<ReserveResult> {
  const store = pickStore();
  if (store === memoryStore) return memoryStore.reserve(input);
  try {
    return await store.reserve(input);
  } catch (error) {
    console.warn("[usage] Supabase reserve failed; using in-memory limits", error);
    return memoryStore.reserve(input);
  }
}

export async function refundUsage(ownerId: string, idempotencyKey: string): Promise<void> {
  const store = pickStore();
  if (store === memoryStore) return memoryStore.refund(ownerId, idempotencyKey);
  try {
    await store.refund(ownerId, idempotencyKey);
  } catch (error) {
    console.warn("[usage] Supabase refund failed; refunding in-memory", error);
    await memoryStore.refund(ownerId, idempotencyKey);
  }
}

export async function usageStatusFor(ownerId: string, chatId?: string): Promise<UsageStatus> {
  const store = pickStore();
  if (store === memoryStore) return memoryStore.statusFor(ownerId, chatId);
  try {
    return await store.statusFor(ownerId, chatId);
  } catch (error) {
    console.warn("[usage] Supabase status failed; using in-memory counters", error);
    return memoryStore.statusFor(ownerId, chatId);
  }
}
