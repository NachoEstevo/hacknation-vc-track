"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import clsx from "clsx";
import { Brand } from "@/components/brand";
import styles from "./founder-nav.module.css";
import { Avatar } from "./avatar";

export interface FounderNavProps {
  projectId: string;
  userName: string;
}

/** Port of Pencil's founder top nav (frames 15/16) — a distinct pattern from the investor `Sidebar`. */
export function FounderNav({ projectId, userName }: FounderNavProps) {
  const pathname = usePathname();

  const tabs = [
    { label: "My project", href: `/founder/projects/${projectId}/edit` },
    { label: "Preview", href: `/founder/projects/${projectId}/preview` },
    { label: "Evidence", href: `/founder/projects/${projectId}/edit#evidence` },
    { label: "Settings", href: `/founder/projects/${projectId}/settings` },
  ];

  return (
    <nav className={styles.nav} aria-label="Founder workspace navigation">
      <Brand href="/founder/onboarding" compact className={styles.brand} />
      <div className={styles.tabs}>
        {tabs.map((tab) => {
          const active = pathname === tab.href.split("#")[0];
          return (
            <Link
              key={tab.label}
              href={tab.href as Route}
              className={clsx(styles.tab, active && styles.tabActive)}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.iconButton} aria-label="Notifications">
          <Bell size={17} aria-hidden="true" />
        </button>
        <Avatar name={userName} size="sm" />
      </div>
    </nav>
  );
}
