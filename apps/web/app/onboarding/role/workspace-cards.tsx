"use client";

import { useState, type KeyboardEvent } from "react";
import clsx from "clsx";
import {
  BadgeCheck,
  Briefcase,
  Building2,
  FileUp,
  History,
  Kanban,
  Rocket,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
import { ContinueAsInvestorButton } from "./pending-brief";
import styles from "./page.module.css";

const INVESTOR_BENEFITS: { icon: LucideIcon; label: string }[] = [
  { icon: ScanSearch, label: "Search by thesis, not rigid filters" },
  { icon: BadgeCheck, label: "Inspect claims, sources, and confidence" },
  { icon: Kanban, label: "Move qualified companies into your pipeline" },
];

const FOUNDER_BENEFITS: { icon: LucideIcon; label: string }[] = [
  { icon: Building2, label: "Create or claim a company profile" },
  { icon: FileUp, label: "Submit decks, links, and proof" },
  { icon: History, label: "See what changed after new evidence" },
];

export function WorkspaceCards() {
  const [selected, setSelected] = useState(false);

  function selectInvestor() {
    setSelected(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectInvestor();
    }
  }

  return (
    <>
      <div className={styles.cards} role="radiogroup" aria-label="Workspace type">
        <article
          className={clsx(styles.card, styles.cardSelectable, selected && styles.cardActive)}
          role="radio"
          aria-checked={selected}
          tabIndex={0}
          onClick={selectInvestor}
          onKeyDown={handleKeyDown}
        >
          <div className={styles.cardTop}>
            <span className={clsx(styles.iconWrap, selected && styles.iconWrapActive)}>
              <Briefcase size={20} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span className={clsx(styles.radio, selected && styles.radioActive)} aria-hidden="true" />
          </div>
          <h2>Investor workspace</h2>
          <p className={styles.cardDesc}>
            Turn your thesis into evidence-backed shortlists, company briefs,
            comparisons, and next actions.
          </p>
          <ul className={styles.benefits}>
            {INVESTOR_BENEFITS.map(({ icon: Icon, label }) => (
              <li key={label}>
                <Icon size={14} color="var(--accent)" aria-hidden="true" />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </article>

        <article
          className={`${styles.card} ${styles.cardDisabled}`}
          role="radio"
          aria-checked={false}
          aria-disabled="true"
        >
          <div className={styles.cardTop}>
            <span className={styles.iconWrap}>
              <Rocket size={20} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span className={styles.comingSoonTag}>Coming soon</span>
          </div>
          <h2>Founder workspace</h2>
          <p className={styles.cardDesc}>
            Claim a company, add founder proof, correct public facts, and
            resolve investor questions.
          </p>
          <ul className={styles.benefits}>
            {FOUNDER_BENEFITS.map(({ icon: Icon, label }) => (
              <li key={label}>
                <Icon size={14} color="var(--text-secondary)" aria-hidden="true" />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className={styles.actions}>
        <div className={styles.actionsRow}>
          <ContinueAsInvestorButton disabled={!selected} />
        </div>
        {!selected ? (
          <p className={styles.signinNote}>Select a workspace to continue.</p>
        ) : null}
      </div>
    </>
  );
}
