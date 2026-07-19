import { describe, expect, it } from "vitest";
import { formatDate, formatRelativeToNow } from "./format";

describe("formatRelativeToNow", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");

  it("formats seconds", () => {
    expect(formatRelativeToNow("2026-07-18T11:59:50.000Z", now)).toBe("10 seconds ago");
  });

  it("formats minutes", () => {
    expect(formatRelativeToNow("2026-07-18T11:55:00.000Z", now)).toBe("5 minutes ago");
  });

  it("formats hours", () => {
    expect(formatRelativeToNow("2026-07-18T09:00:00.000Z", now)).toBe("3 hours ago");
  });

  it("formats days", () => {
    expect(formatRelativeToNow("2026-07-16T12:00:00.000Z", now)).toBe("2 days ago");
  });

  it("falls back gracefully for invalid input", () => {
    expect(formatRelativeToNow("not-a-date", now)).toBe("an unknown time ago");
  });
});

describe("formatDate", () => {
  it("formats an ISO date for display", () => {
    expect(formatDate("2026-07-18T12:00:00.000Z")).toBe("Jul 18, 2026");
  });

  it("falls back gracefully for invalid input", () => {
    expect(formatDate("nope")).toBe("Unknown date");
  });
});
