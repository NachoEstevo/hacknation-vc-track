"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import styles from "./page.module.css";

const EXAMPLE_BRIEFS = [
  "Technical founders in Latin America building agent infrastructure before seed",
  "Security projects born at hackathons with a working public demo",
  "Small developer-tool teams showing early enterprise adoption",
] as const;

export function LandingBriefFlow() {
  const router = useRouter();
  const { savePendingBrief } = useWorkspace();
  const [error, setError] = useState("");

  function continueWithBrief(brief: string) {
    setError("");
    if (!savePendingBrief(brief)) {
      setError(
        "This browser blocked private session storage. The brief was not placed in the URL; enable site storage to continue with it.",
      );
      return;
    }
    router.push("/onboarding/role");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    continueWithBrief(String(form.get("brief") ?? ""));
  }

  return (
    <>
      <form className={styles.searchCard} onSubmit={submit}>
        <div className={styles.searchLabel}>
          <Search size={16} strokeWidth={1.8} aria-hidden="true" />
          <label htmlFor="landing-query">Start with a sourcing brief</label>
        </div>
        <textarea
          id="landing-query"
          name="brief"
          rows={4}
          required
          minLength={12}
          maxLength={1000}
          placeholder="Find technical founders in Latin America building infrastructure for AI agents, with a working product and no institutional funding…"
        />
        <div className={styles.searchFooter}>
          <p>Natural language · kept out of the URL</p>
          <Button
            type="submit"
            size="lg"
            trailingIcon={<ArrowRight size={17} aria-hidden="true" />}
          >
            Explore
          </Button>
        </div>
      </form>

      <div className={styles.examples} aria-label="Example sourcing briefs">
        <p>Or begin with a brief</p>
        {EXAMPLE_BRIEFS.map((brief, index) => (
          <button
            key={brief}
            type="button"
            className={styles.exampleLink}
            onClick={() => continueWithBrief(brief)}
          >
            <span>0{index + 1}</span>
            {brief}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        ))}
      </div>
      {error ? <p role="alert" aria-live="assertive">{error}</p> : null}
    </>
  );
}
