"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bookmark,
  ChevronUp,
  Kanban,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import styles from "./sidebar.module.css";
import { Avatar } from "./avatar";

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  { label: "Search", href: "/investor/search", icon: Search },
  { label: "Pipeline", href: "/investor/pipeline", icon: Kanban },
  { label: "Saved searches", href: "/investor/saved-searches", icon: Bookmark },
  { label: "My thesis", href: "/investor/thesis", icon: SlidersHorizontal },
  { label: "Notifications", href: "/investor/notifications", icon: Bell },
];

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNewSearch: () => void;
  recentSearches: string[];
  userName: string;
  userRole: string;
}

function isActive(pathname: string, item: SidebarNavItem) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Port of Pencil `Nav / Sidebar` + `Nav / Sidebar Collapsed`, unified behind one `collapsed` prop. */
export function Sidebar({ collapsed, onToggleCollapsed, onNewSearch, recentSearches, userName, userRole }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={clsx(styles.sidebar, collapsed && styles.collapsed)} aria-label="Workspace sidebar">
      <div className={styles.brandRow}>
        <span className={styles.mark} aria-hidden="true" />
        {!collapsed ? <span className={styles.wordmark}>undr</span> : null}
        {!collapsed ? <span className={styles.spacer} /> : null}
        <button
          type="button"
          className={styles.iconButton}
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
        </button>
      </div>

      <button
        type="button"
        className={clsx(styles.newSearch, collapsed && styles.newSearchCollapsed)}
        onClick={onNewSearch}
        aria-label="New search"
        title={collapsed ? "New search" : undefined}
      >
        <Plus aria-hidden="true" />
        {!collapsed ? <span>New search</span> : null}
      </button>

      <nav className={clsx(styles.items, collapsed && styles.itemsCollapsed)} aria-label="Primary navigation">
        {SIDEBAR_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href as Route}
              className={clsx(styles.item, collapsed && styles.itemCollapsed, active && styles.itemActive)}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
            >
              <Icon aria-hidden="true" />
              {!collapsed ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      {!collapsed && recentSearches.length > 0 ? (
        <div className={styles.recent}>
          <span className={styles.recentLabel}>Recent</span>
          {recentSearches.map((search) => (
            <button key={search} type="button" className={styles.recentItem}>
              {search}
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.footSpacer} aria-hidden="true" />

      <Link
        href={"/investor/settings" as Route}
        className={clsx(styles.item, styles.settingsItem, collapsed && styles.itemCollapsed)}
        aria-label={collapsed ? "Settings" : undefined}
        title={collapsed ? "Settings" : undefined}
      >
        <Settings aria-hidden="true" />
        {!collapsed ? <span>Settings</span> : null}
      </Link>

      <div className={clsx(styles.user, collapsed && styles.userCollapsed)}>
        <Avatar name={userName} />
        {!collapsed ? (
          <>
            <div className={styles.userCol}>
              <span className={styles.userName}>{userName}</span>
              <span className={styles.userRole}>{userRole}</span>
            </div>
            <ChevronUp className={styles.userMore} aria-hidden="true" />
          </>
        ) : null}
      </div>
    </aside>
  );
}
