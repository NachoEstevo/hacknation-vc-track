import { createHash } from "node:crypto";

/**
 * Deterministic, RFC-4122-shaped v5-style UUID derived from a stable text
 * key. Used only to give the `synthetic_demo` catalog seed (see
 * `scripts/seed-synthetic-demo-catalog.ts`) and the server actions that read
 * it the *same* primary key for the *same* fixture, without a database round
 * trip and without ever generating random ids that would drift between the
 * seed run and the app's own lookups.
 *
 * This is not used for anything security-sensitive — invitation tokens use
 * `crypto.randomBytes` (see `workspace-invitations.actions.ts`).
 */
export function deterministicUuid(namespace: string, key: string): string {
  const hash = createHash("sha256").update(`${namespace}:${key}`).digest("hex");
  const bytes = hash.slice(0, 32);
  return [
    bytes.slice(0, 8),
    bytes.slice(8, 12),
    // Version nibble forced to "5" so this reads as a valid UUID variant, matching RFC 4122 v5 conventions.
    `5${bytes.slice(13, 16)}`,
    // Variant bits forced to the RFC 4122 "10xx" pattern.
    `${((parseInt(bytes[16] ?? "8", 16) & 0x3) | 0x8).toString(16)}${bytes.slice(17, 20)}`,
    bytes.slice(20, 32),
  ].join("-");
}
