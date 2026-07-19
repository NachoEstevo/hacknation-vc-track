/**
 * Central usage control for the anonymous free tier. Every model-spending
 * route reserves quota here BEFORE calling the model; the sidebar meter
 * reads the same numbers. Three independent pools per identity:
 *
 *   prospect_search     — sourcing runs (first message of each chat), max 5
 *   profile_completion  — dossier generations/refreshes, max 5
 *   chat_message        — messages inside one chat, max 10 per chat
 *
 * The 48-hour window opens at the first consumption and resets every pool
 * together when it expires. Reservations are idempotent: replaying the same
 * idempotency key (client auto-retry, double click) never double-charges.
 * This module is dependency-free and client-safe; identity and storage
 * backends live in the .server companions.
 */

export type UsageKind = "prospect_search" | "profile_completion" | "chat_message";

export const USAGE_WINDOW_MS = 48 * 60 * 60 * 1000;

export const USAGE_LIMITS: Record<UsageKind, number> = {
  prospect_search: 5,
  profile_completion: 5,
  chat_message: 10,
};

export interface UsageStatus {
  searchesUsed: number;
  profilesUsed: number;
  /** Messages used in the chat the status was asked for; 0 when no chatId given. */
  chatMessagesUsed: number;
  limits: Record<UsageKind, number>;
  /** ISO end of the current window, or null when nothing was consumed yet. */
  windowEndsAt: string | null;
}

export interface ReserveInput {
  ownerId: string;
  kind: UsageKind;
  /** Required for chat_message: the pool is per chat. */
  chatId?: string;
  /** Same key ⇒ same reservation: retries and double clicks charge once. */
  idempotencyKey: string;
  now?: number;
}

export interface ReserveResult {
  allowed: boolean;
  reason?: "limit_reached";
  status: UsageStatus;
}

/** "1d 8h", "7h 32m", "45m" — or null when no window is running. */
export function resetsInLabel(windowEndsAt: string | null, now = Date.now()): string | null {
  if (!windowEndsAt) return null;
  const remaining = new Date(windowEndsAt).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export interface UsageStore {
  reserve(input: ReserveInput): Promise<ReserveResult>;
  refund(ownerId: string, idempotencyKey: string, now?: number): Promise<void>;
  statusFor(ownerId: string, chatId?: string, now?: number): Promise<UsageStatus>;
}

interface UsageEvent {
  kind: UsageKind;
  chatId?: string;
  refunded: boolean;
}

interface OwnerUsage {
  windowStart: number;
  windowEnd: number;
  searchesUsed: number;
  profilesUsed: number;
  chatMessages: Map<string, number>;
  events: Map<string, UsageEvent>;
}

/**
 * Serializable per-owner state, so a stateless backend (the signed-cookie
 * store used on serverless deployments) can round-trip the ledger through
 * `importOwnerState`/`exportOwnerState`. Bounded on export: only the newest
 * events and chats survive, keeping the cookie payload small.
 */
export interface OwnerUsageSnapshot {
  windowStart: number;
  windowEnd: number;
  searchesUsed: number;
  profilesUsed: number;
  chatMessages: Record<string, number>;
  events: Record<string, { kind: UsageKind; chatId?: string; refunded: boolean }>;
}

const SNAPSHOT_MAX_EVENTS = 30;
const SNAPSHOT_MAX_CHATS = 6;

function emptyStatus(): UsageStatus {
  return {
    searchesUsed: 0,
    profilesUsed: 0,
    chatMessagesUsed: 0,
    limits: { ...USAGE_LIMITS },
    windowEndsAt: null,
  };
}

/**
 * Reference implementation and demo-mode backend. Node executes each
 * reserve() synchronously on one thread, so check-and-increment is atomic
 * per process — concurrent requests can never both take the last slot.
 */
export class InMemoryUsageStore implements UsageStore {
  private owners = new Map<string, OwnerUsage>();

  private ownerFor(ownerId: string, now: number): OwnerUsage | null {
    const owner = this.owners.get(ownerId);
    if (!owner) return null;
    if (now >= owner.windowEnd) {
      // Window expired: every pool (searches, profiles, all chats) resets together.
      this.owners.delete(ownerId);
      return null;
    }
    return owner;
  }

  private statusOf(owner: OwnerUsage | null, chatId?: string): UsageStatus {
    if (!owner) return emptyStatus();
    return {
      searchesUsed: owner.searchesUsed,
      profilesUsed: owner.profilesUsed,
      chatMessagesUsed: chatId ? owner.chatMessages.get(chatId) ?? 0 : 0,
      limits: { ...USAGE_LIMITS },
      windowEndsAt: new Date(owner.windowEnd).toISOString(),
    };
  }

  private usedFor(owner: OwnerUsage, kind: UsageKind, chatId?: string): number {
    if (kind === "prospect_search") return owner.searchesUsed;
    if (kind === "profile_completion") return owner.profilesUsed;
    return chatId ? owner.chatMessages.get(chatId) ?? 0 : 0;
  }

  private charge(owner: OwnerUsage, kind: UsageKind, delta: 1 | -1, chatId?: string): void {
    if (kind === "prospect_search") owner.searchesUsed = Math.max(0, owner.searchesUsed + delta);
    else if (kind === "profile_completion") owner.profilesUsed = Math.max(0, owner.profilesUsed + delta);
    else if (chatId) owner.chatMessages.set(chatId, Math.max(0, (owner.chatMessages.get(chatId) ?? 0) + delta));
  }

  async reserve(input: ReserveInput): Promise<ReserveResult> {
    const now = input.now ?? Date.now();
    let owner = this.ownerFor(input.ownerId, now);

    const existing = owner?.events.get(input.idempotencyKey);
    if (existing && !existing.refunded) {
      // Replay (retry, double click): already charged, nothing more to pay.
      return { allowed: true, status: this.statusOf(owner, input.chatId) };
    }

    const used = owner ? this.usedFor(owner, input.kind, input.chatId) : 0;
    if (used >= USAGE_LIMITS[input.kind]) {
      return { allowed: false, reason: "limit_reached", status: this.statusOf(owner, input.chatId) };
    }

    if (!owner) {
      owner = {
        windowStart: now,
        windowEnd: now + USAGE_WINDOW_MS,
        searchesUsed: 0,
        profilesUsed: 0,
        chatMessages: new Map(),
        events: new Map(),
      };
      this.owners.set(input.ownerId, owner);
    }

    this.charge(owner, input.kind, 1, input.chatId);
    owner.events.set(input.idempotencyKey, { kind: input.kind, chatId: input.chatId, refunded: false });
    return { allowed: true, status: this.statusOf(owner, input.chatId) };
  }

  async refund(ownerId: string, idempotencyKey: string, now = Date.now()): Promise<void> {
    const owner = this.ownerFor(ownerId, now);
    const event = owner?.events.get(idempotencyKey);
    if (!owner || !event || event.refunded) return;
    event.refunded = true;
    this.charge(owner, event.kind, -1, event.chatId);
  }

  async statusFor(ownerId: string, chatId?: string, now = Date.now()): Promise<UsageStatus> {
    return this.statusOf(this.ownerFor(ownerId, now), chatId);
  }

  importOwnerState(ownerId: string, snapshot: OwnerUsageSnapshot): void {
    this.owners.set(ownerId, {
      windowStart: snapshot.windowStart,
      windowEnd: snapshot.windowEnd,
      searchesUsed: Math.max(0, snapshot.searchesUsed),
      profilesUsed: Math.max(0, snapshot.profilesUsed),
      chatMessages: new Map(Object.entries(snapshot.chatMessages ?? {})),
      events: new Map(Object.entries(snapshot.events ?? {})),
    });
  }

  exportOwnerState(ownerId: string, now = Date.now()): OwnerUsageSnapshot | null {
    const owner = this.ownerFor(ownerId, now);
    if (!owner) return null;
    return {
      windowStart: owner.windowStart,
      windowEnd: owner.windowEnd,
      searchesUsed: owner.searchesUsed,
      profilesUsed: owner.profilesUsed,
      // Map preserves insertion order — the slices keep the newest entries.
      chatMessages: Object.fromEntries([...owner.chatMessages.entries()].slice(-SNAPSHOT_MAX_CHATS)),
      events: Object.fromEntries([...owner.events.entries()].slice(-SNAPSHOT_MAX_EVENTS)),
    };
  }
}
