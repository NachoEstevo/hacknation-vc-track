"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./route-state.module.css";

export default function InvestorError({ reset }: { reset: () => void }) {
  return (
    <main className={styles.errorPage}>
      <p className={styles.errorEyebrow}>Workspace interrupted</p>
      <h1>The research record is safe.</h1>
      <p>
        This view could not be assembled. Retry it without losing the demo
        pipeline, saved searches, or comparison set stored in this browser.
      </p>
      <Button onClick={reset} leadingIcon={<RotateCcw size={16} />}>
        Retry view
      </Button>
    </main>
  );
}
