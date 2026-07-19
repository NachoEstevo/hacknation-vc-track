const RELATIVE_UNITS: readonly { limitMs: number; divisorMs: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { limitMs: 60_000, divisorMs: 1_000, unit: "second" },
  { limitMs: 3_600_000, divisorMs: 60_000, unit: "minute" },
  { limitMs: 86_400_000, divisorMs: 3_600_000, unit: "hour" },
  { limitMs: 2_592_000_000, divisorMs: 86_400_000, unit: "day" },
  { limitMs: 31_536_000_000, divisorMs: 2_592_000_000, unit: "month" },
  { limitMs: Number.POSITIVE_INFINITY, divisorMs: 31_536_000_000, unit: "year" },
];

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Formats a past ISO timestamp as "3 minutes ago" style relative time, for "draft last saved …" labels. */
export function formatRelativeToNow(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "an unknown time ago";

  const diffMs = Math.max(0, now.getTime() - then);
  for (const { limitMs, divisorMs, unit } of RELATIVE_UNITS) {
    if (diffMs < limitMs) {
      const value = Math.max(1, Math.round(diffMs / divisorMs));
      return relativeFormatter.format(-value, unit);
    }
  }
  return relativeFormatter.format(-Math.round(diffMs / 31_536_000_000), "year");
}

// A fixed UTC time zone keeps this deterministic regardless of the host's local time zone —
// otherwise a claim observed at "2026-07-10T00:00:00Z" could render as "Jul 9" or "Jul 10"
// depending on where the server process happens to run.
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "Unknown date" : dateFormatter.format(date);
}
