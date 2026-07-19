"use client";

import { ChevronRight, ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";
import styles from "./evidence-row.module.css";
import { ConfidenceBadge, DataBadge, type EvidenceTone } from "./badges";

export interface EvidenceRowProps {
  claim: string;
  status: EvidenceTone;
  statusLabel?: string;
  quote?: string;
  /** Pass an already-rendered icon element (e.g. `<Github aria-hidden />`), never a bare component reference — this crosses the server/client boundary. */
  sourceIcon: ReactNode;
  sourceLabel: string;
  sourceMeta?: string | number;
  capturedAt: string;
  confidenceLevel: "high" | "medium" | "low";
  sourceUrl?: string;
}

/** Port of Pencil `Row / Evidence` — one inspectable, sourced claim. Expands to show the exact excerpt. */
export function EvidenceRow({
  claim,
  status,
  statusLabel,
  quote,
  sourceIcon,
  sourceLabel,
  sourceMeta,
  capturedAt,
  confidenceLevel,
  sourceUrl,
}: EvidenceRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.row}>
      <button type="button" className={styles.top} onClick={() => setExpanded((value) => !value)}>
        <span className={styles.claim}>{claim}</span>
        <DataBadge tone={status} label={statusLabel} />
        <ChevronRight className={styles.chevron} aria-hidden="true" style={{ transform: expanded ? "rotate(90deg)" : undefined }} />
      </button>

      {expanded && quote ? (
        <div className={styles.quote}>
          <p className={styles.quoteText}>&ldquo;{quote}&rdquo;</p>
        </div>
      ) : null}

      <div className={styles.meta}>
        <span className={styles.sourceChip}>
          {sourceIcon}
          {sourceLabel}
          {sourceMeta !== undefined ? ` · ${sourceMeta}` : ""}
        </span>
        <span className={styles.date}>{capturedAt}</span>
        <ConfidenceBadge level={confidenceLevel} />
        {sourceUrl ? (
          <a className={styles.link} href={sourceUrl} target="_blank" rel="noreferrer">
            <span className={styles.linkText}>View in source</span>
            <ExternalLink aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
