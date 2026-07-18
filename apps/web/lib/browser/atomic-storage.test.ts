import { describe, expect, it, vi } from "vitest";
import { writeJsonAtomically } from "./atomic-storage";

describe("writeJsonAtomically", () => {
  it("reports success only after the storage write returns", () => {
    const setItem = vi.fn();
    expect(writeJsonAtomically({ setItem }, "workspace", { value: 1 })).toEqual({ ok: true });
    expect(setItem).toHaveBeenCalledWith("workspace", '{"value":1}');
  });

  it("reports failure without publishing a success result", () => {
    const cause = new Error("quota exceeded");
    const setItem = vi.fn(() => { throw cause; });
    expect(writeJsonAtomically({ setItem }, "workspace", { value: 1 })).toEqual({
      ok: false,
      error: cause,
    });
  });
});
