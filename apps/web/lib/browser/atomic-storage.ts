export type StorageWriter = Pick<Storage, "setItem">;

export type AtomicStorageResult =
  | { ok: true }
  | { ok: false; error: unknown };

/**
 * Serializes and writes before React state is mutated. Callers may publish the
 * new state only after this returns `ok: true`.
 */
export function writeJsonAtomically(
  storage: StorageWriter,
  key: string,
  value: unknown,
): AtomicStorageResult {
  try {
    storage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
