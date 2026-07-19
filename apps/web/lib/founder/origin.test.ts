import { describe, expect, it } from "vitest";
import {
  decodeOriginNote,
  deriveClaimOrigin,
  encodeOriginNote,
  markOriginNoteConfirmed,
} from "./origin";

describe("origin note encoding", () => {
  it("round-trips an ai_structured tag", () => {
    const note = encodeOriginNote("ai_structured", "Drafted from your one-liner");
    expect(decodeOriginNote(note)).toEqual({
      origin: "ai_structured",
      sourceNote: "Drafted from your one-liner",
      confirmed: false,
    });
  });

  it("round-trips a confirmed external tag", () => {
    const note = encodeOriginNote("external", "Sourced from github.com/acme/relay", true);
    expect(decodeOriginNote(note)).toEqual({
      origin: "external",
      sourceNote: "Sourced from github.com/acme/relay",
      confirmed: true,
    });
  });

  it("returns null for plain human notes with no origin tag", () => {
    expect(decodeOriginNote("just a note")).toBeNull();
    expect(decodeOriginNote(null)).toBeNull();
  });

  it("rejects an unrecognized origin token", () => {
    expect(decodeOriginNote("origin:founder_provided|typed directly")).toBeNull();
  });

  it("marks an existing tag confirmed without losing its source note", () => {
    const note = encodeOriginNote("ai_structured", "Drafted from repo activity");
    const confirmed = markOriginNoteConfirmed(note);
    expect(decodeOriginNote(confirmed)).toEqual({
      origin: "ai_structured",
      sourceNote: "Drafted from repo activity",
      confirmed: true,
    });
  });

  it("leaves a non-origin note untouched when confirming", () => {
    expect(markOriginNoteConfirmed("plain note")).toBe("plain note");
  });
});

describe("deriveClaimOrigin", () => {
  it("treats a claim with no evidence links as founder-provided", () => {
    expect(deriveClaimOrigin([])).toEqual({
      origin: "founder_provided",
      sourceNote: null,
      confirmed: true,
    });
  });

  it("treats a claim whose only links carry no origin tag as founder-provided", () => {
    expect(deriveClaimOrigin([{ note: "an unrelated annotation" }, { note: null }])).toEqual({
      origin: "founder_provided",
      sourceNote: null,
      confirmed: true,
    });
  });

  it("surfaces the first tagged link's origin", () => {
    expect(
      deriveClaimOrigin([
        { note: "unrelated" },
        { note: encodeOriginNote("external", "Sourced from GitHub") },
      ]),
    ).toEqual({ origin: "external", sourceNote: "Sourced from GitHub", confirmed: false });
  });
});
