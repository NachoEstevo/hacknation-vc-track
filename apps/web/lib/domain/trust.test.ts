import { describe, expect, it } from "vitest";
import { calculateClaimTrust } from "./trust";

describe("calculateClaimTrust", () => {
  it("stores every deterministic component and sums to 100", () => {
    expect(calculateClaimTrust({
      sourceReliability: 40,
      directness: 25,
      corroboration: 20,
      recency: 15,
    })).toEqual({
      sourceReliability: 40,
      directness: 25,
      corroboration: 20,
      recency: 15,
      score: 100,
    });
  });

  it("rejects components outside their documented ranges", () => {
    expect(() => calculateClaimTrust({
      sourceReliability: 41,
      directness: 20,
      corroboration: 10,
      recency: 10,
    })).toThrow(RangeError);
  });
});
