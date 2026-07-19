"use client";

import { useCallback, useEffect, useState } from "react";
import { USAGE_CHANGED_EVENT } from "@/lib/usage/usage-events";
import { resetsInLabel, type UsageStatus } from "@/lib/usage/usage-limits";
import styles from "./usage-meter.module.css";

// Written by the search workspace; read here so the Messages row tracks the
// conversation currently on screen.
const CHAT_USAGE_ID_KEY = "undr.chat-usage-id.v1";

/**
 * Permanent free-tier indicator (sidebar, above Settings). Refreshes when
 * any agent flow announces spend, plus once a minute so the reset countdown
 * stays honest. Exhausted pools turn red individually — running out of
 * searches never greys out profiles, and vice versa.
 */
export function UsageMeter() {
  const [status, setStatus] = useState<UsageStatus | null>(null);
  const [, setTick] = useState(0);

  const refresh = useCallback(async () => {
    let chatId = "";
    try {
      chatId = sessionStorage.getItem(CHAT_USAGE_ID_KEY) ?? "";
    } catch {
      // Meter is best-effort.
    }
    try {
      const response = await fetch(
        `/api/usage${chatId ? `?chatId=${encodeURIComponent(chatId)}` : ""}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      setStatus((await response.json()) as UsageStatus);
    } catch {
      // Leave the last known numbers up.
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    // Small delay so the server-side reservation lands before we re-read.
    const onChange = () => window.setTimeout(() => void refresh(), 900);
    const onFocus = () => void refresh();
    window.addEventListener(USAGE_CHANGED_EVENT, onChange);
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => {
      setTick((value) => value + 1);
      void refresh();
    }, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener(USAGE_CHANGED_EVENT, onChange);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [refresh]);

  if (!status) return null;

  const rows = [
    { label: "Candidates", used: status.searchesUsed, limit: status.limits.prospect_search },
    { label: "Profiles", used: status.profilesUsed, limit: status.limits.profile_completion },
    { label: "Messages", used: status.chatMessagesUsed, limit: status.limits.chat_message },
  ];
  const resets = resetsInLabel(status.windowEndsAt);

  return (
    <div className={styles.meter} aria-label="Free plan usage">
      <span className={styles.title}>Free plan</span>
      {rows.map((row) => {
        const exhausted = row.used >= row.limit;
        return (
          <div
            key={row.label}
            className={styles.row}
            data-exhausted={exhausted || undefined}
            title={exhausted ? `${row.label} limit reached — the rest keeps working` : undefined}
          >
            <span className={styles.rowLabel}>{row.label}</span>
            <span className={styles.bar} aria-hidden="true">
              <span
                className={styles.fill}
                style={{ width: `${Math.min(100, Math.round((row.used / row.limit) * 100))}%` }}
              />
            </span>
            <span className={styles.rowCount}>
              {row.used}/{row.limit}
            </span>
          </div>
        );
      })}
      <span className={styles.resets}>
        {resets ? `Resets in ${resets}` : "48h window starts on first use"}
      </span>
    </div>
  );
}
