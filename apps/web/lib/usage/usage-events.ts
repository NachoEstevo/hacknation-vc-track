/** Client-side signal that quota was (probably) spent — the sidebar meter listens. */

export const USAGE_CHANGED_EVENT = "undr:usage-changed";

export function announceUsageChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(USAGE_CHANGED_EVENT));
}
