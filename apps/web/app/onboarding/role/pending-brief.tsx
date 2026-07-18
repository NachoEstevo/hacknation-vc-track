"use client";

import { ArrowRight, SearchCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import styles from "./page.module.css";

export function PendingBriefSummary() {
  const { pendingBrief, hasHydrated } = useWorkspace();
  if (!hasHydrated || !pendingBrief) return null;

  return (
    <aside className={styles.brief} aria-labelledby="carried-brief-heading">
      <div className={styles.briefIcon}>
        <SearchCheck size={19} aria-hidden="true" />
      </div>
      <div>
        <p id="carried-brief-heading">Your first brief is coming with you</p>
        <blockquote>“{pendingBrief}”</blockquote>
      </div>
      <span>Private to this browser tab</span>
    </aside>
  );
}

export function ContinueAsInvestorButton() {
  return (
    <ButtonLink
      href="/onboarding/investor"
      fullWidth
      size="lg"
      trailingIcon={<ArrowRight size={17} aria-hidden="true" />}
    >
      Continue as investor
    </ButtonLink>
  );
}
