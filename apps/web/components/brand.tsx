import Link from "next/link";
import type { Route } from "next";
import clsx from "clsx";
import type { HTMLAttributes } from "react";
import styles from "./brand.module.css";

export interface BrandProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  href?: string;
  compact?: boolean;
  tone?: "default" | "inverse";
}

function BrandLockup({
  compact = false,
  tone = "default",
  className,
  ...props
}: Omit<BrandProps, "href">) {
  return (
    <span
      className={clsx(styles.brand, styles[tone], compact && styles.compact, className)}
      {...props}
    >
      <span className={styles.mark} aria-hidden="true">
        <span className={styles.markCore}>u</span>
      </span>
      {!compact && (
        <span className={styles.wordmark} aria-hidden="true">
          undr<span className={styles.period}>.</span>
        </span>
      )}
      <span className="sr-only">undr</span>
    </span>
  );
}

/** The canonical undr wordmark. Pass `href` when it should act as home navigation. */
export function Brand({ href, ...props }: BrandProps) {
  if (!href) return <BrandLockup {...props} />;

  return (
    <Link href={href as Route} className={styles.link} aria-label="undr home">
      <BrandLockup {...props} />
    </Link>
  );
}
