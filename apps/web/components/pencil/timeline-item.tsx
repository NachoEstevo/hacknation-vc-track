import type { ReactNode } from "react";
import styles from "./timeline-item.module.css";
import { SourceChip } from "./badges";

export interface TimelineItemProps {
  date: string;
  title: string;
  /** Pass an already-rendered icon element (e.g. `<Github aria-hidden />`), never a bare component reference — this crosses the server/client boundary. */
  sourceIcon?: ReactNode;
  sourceLabel?: string;
  isLast?: boolean;
}

/** Port of Pencil `Item / Timeline`. */
export function TimelineItem({ date, title, sourceIcon, sourceLabel, isLast = false }: TimelineItemProps) {
  return (
    <div className={styles.item}>
      <div className={styles.rail}>
        <span className={styles.dot} aria-hidden="true" />
        {!isLast ? <span className={styles.line} aria-hidden="true" /> : null}
      </div>
      <div className={styles.body}>
        <span className={styles.date}>{date}</span>
        <span className={styles.title}>{title}</span>
        {sourceIcon && sourceLabel ? <SourceChip icon={sourceIcon} label={sourceLabel} /> : null}
      </div>
    </div>
  );
}
