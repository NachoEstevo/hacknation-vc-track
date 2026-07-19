import { LoaderCircle } from "lucide-react";
import styles from "./external-search-banner.module.css";

export interface ExternalSearchBannerProps {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  active?: boolean;
}

/** Port of Pencil `Banner / External Search` — shown while enriching from public sources. */
export function ExternalSearchBanner({ text, actionLabel = "Pause", onAction, active = true }: ExternalSearchBannerProps) {
  return (
    <div className={styles.banner}>
      <LoaderCircle aria-hidden="true" className={active ? styles.spinning : undefined} />
      <span className={styles.text}>{text}</span>
      {onAction ? (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
