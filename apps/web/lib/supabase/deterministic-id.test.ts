import { describe, expect, it } from "vitest";
import { deterministicUuid } from "./deterministic-id";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("deterministicUuid", () => {
  it("always returns a syntactically valid uuid", () => {
    const id = deterministicUuid("undr:synthetic_demo:project", "quanta-forge");
    expect(id).toMatch(UUID_PATTERN);
  });

  it("is deterministic for the same namespace and key", () => {
    const first = deterministicUuid("undr:synthetic_demo:claim", "quanta-forge:claim-problem");
    const second = deterministicUuid("undr:synthetic_demo:claim", "quanta-forge:claim-problem");
    expect(first).toBe(second);
  });

  it("differs when the key differs", () => {
    const a = deterministicUuid("undr:synthetic_demo:project", "quanta-forge");
    const b = deterministicUuid("undr:synthetic_demo:project", "patch-pilot");
    expect(a).not.toBe(b);
  });

  it("differs when only the namespace differs (no cross-entity collisions)", () => {
    const asProject = deterministicUuid("undr:synthetic_demo:project", "quanta-forge");
    const asFounder = deterministicUuid("undr:synthetic_demo:founder", "quanta-forge");
    expect(asProject).not.toBe(asFounder);
  });
});
