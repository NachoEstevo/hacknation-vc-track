"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchCheck } from "lucide-react";
import { Button, ButtonLink } from "@/components/pencil";
import { useWorkspace } from "@/components/workspace-provider";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseEnabled } from "@/lib/env";
import { saveInvestorRoleAction } from "@/lib/supabase/workspace-role.actions";
import styles from "./page.module.css";

export function PendingBriefSummary() {
  const { pendingBrief, hasHydrated } = useWorkspace();
  if (!hasHydrated || !pendingBrief) return null;

  return (
    <aside className={styles.brief} aria-labelledby="carried-brief-heading">
      <span className={styles.briefIcon}>
        <SearchCheck size={18} aria-hidden="true" />
      </span>
      <div className={styles.briefBody}>
        <p id="carried-brief-heading" className={styles.briefLabel}>
          Your first brief is coming with you
        </p>
        <blockquote className={styles.briefQuote}>“{pendingBrief}”</blockquote>
      </div>
      <span className={styles.briefTag}>Private to this browser tab</span>
    </aside>
  );
}

/**
 * Records the self-selected investor role (`user_roles`, `is_primary = true`)
 * before continuing into thesis setup, when Supabase is configured. In demo
 * mode there is no account to attach a role to, so this stays a plain link.
 */
export function ContinueAsInvestorButton({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  if (!isSupabaseEnabled()) {
    if (disabled) {
      return <Button disabled>Continue as investor</Button>;
    }
    return (
      <ButtonLink href="/onboarding/investor">Continue as investor</ButtonLink>
    );
  }

  async function handleClick() {
    setIsPending(true);
    await saveInvestorRoleAction();
    router.push("/onboarding/investor");
  }

  return (
    <Button onClick={handleClick} disabled={disabled || isPending}>
      {isPending ? "Setting up…" : "Continue as investor"}
    </Button>
  );
}

/**
 * Real founders get a real role. When Supabase is configured, this claims the
 * `founder` role for the signed-in user before leaving — the founder onboarding
 * page itself re-checks the session, so this is a convenience, not the only guard.
 */
export function ContinueAsFounderButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    const supabase = createClient();

    if (supabase) {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (userId) {
        // `authenticated` can only ever UPDATE the `is_primary` column on this table (by design),
        // so an upsert that touches every column on conflict would be denied — insert, then fall
        // back to a targeted update if the founder role row already exists.
        await supabase.from("user_roles").update({ is_primary: false }).eq("user_id", userId).neq("role", "founder");
        const { error: roleInsertError } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: "founder", is_primary: true });
        if (roleInsertError) {
          await supabase.from("user_roles").update({ is_primary: true }).eq("user_id", userId).eq("role", "founder");
        }
      }
    }

    router.push("/founder/onboarding" as Route);
  }

  return (
    <Button variant="secondary" onClick={handleClick} disabled={isPending}>
      {isPending ? "Setting up…" : "Continue as founder"}
    </Button>
  );
}
