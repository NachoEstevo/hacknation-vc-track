"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  ChartNoAxesGantt,
  ChevronsLeft,
  ChevronsRight,
  GitCompareArrows,
  Home,
  Menu,
  Search,
  Settings,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Brand } from "./brand";
import { Chip } from "./ui/chip";
import { useWorkspace } from "./workspace-provider";
import styles from "./app-shell.module.css";

export interface AppNavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const APP_NAVIGATION: AppNavigationItem[] = [
  { label: "Home", href: "/investor", icon: Home, exact: true },
  { label: "Discover", href: "/investor/search", icon: Search },
  { label: "Pipeline", href: "/investor/pipeline", icon: ChartNoAxesGantt },
  { label: "Saved searches", href: "/investor/saved-searches", icon: Bookmark },
  { label: "Compare", href: "/investor/compare", icon: GitCompareArrows },
];

export interface AppShellProps {
  children: ReactNode;
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  headerAside?: ReactNode;
  hideHeader?: boolean;
  className?: string;
  contentClassName?: string;
  workspaceName?: string;
  userName?: string;
}

function isNavigationItemActive(pathname: string, item: AppNavigationItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

interface SidebarContentProps {
  collapsed: boolean;
  mobile?: boolean;
  pathname: string;
  workspaceName: string;
  userName: string;
  compareCount: number;
  pipelineCount: number;
  thesisDescription: string;
  onNavigate?: () => void;
  onClose?: () => void;
}

function SidebarContent({
  collapsed,
  mobile = false,
  pathname,
  workspaceName,
  userName,
  compareCount,
  pipelineCount,
  thesisDescription,
  onNavigate,
  onClose,
}: SidebarContentProps) {
  return (
    <div className={styles.sidebarInner}>
      <div className={styles.sidebarBrandRow}>
        <Brand href="/investor" compact={collapsed && !mobile} />
        {mobile ? (
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close navigation">
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className={styles.workspaceContext}>
        <span className={styles.workspaceGlyph} aria-hidden="true">MF</span>
        {!collapsed || mobile ? (
          <span className={styles.workspaceCopy}>
            <strong>{workspaceName}</strong>
            <span>Investor workspace</span>
          </span>
        ) : null}
      </div>

      <nav className={styles.navigation} aria-label="Primary navigation">
        <span className={clsx(styles.navSectionLabel, collapsed && !mobile && styles.visuallyHidden)}>
          Workspace
        </span>
        {APP_NAVIGATION.map((item) => {
          const Icon = item.icon;
          const active = isNavigationItemActive(pathname, item);
          const count = item.href.endsWith("/compare")
            ? compareCount
            : item.href.endsWith("/pipeline")
              ? pipelineCount
              : 0;
          return (
            <Link
              key={item.href}
              href={item.href as Route}
              className={clsx(styles.navItem, active && styles.navItemActive)}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed && !mobile ? item.label : undefined}
              title={collapsed && !mobile ? item.label : undefined}
              onClick={onNavigate}
            >
              <Icon aria-hidden="true" />
              {!collapsed || mobile ? <span className={styles.navLabel}>{item.label}</span> : null}
              {count > 0 ? <span className={styles.navCount}>{count}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className={styles.sidebarFoot}>
        <Link
          href={"/investor/thesis" as Route}
          className={clsx(styles.thesisCard, collapsed && !mobile && styles.thesisCardCollapsed)}
          aria-label={collapsed && !mobile ? "Open investment thesis" : undefined}
          title={collapsed && !mobile ? "Investment thesis" : undefined}
          onClick={onNavigate}
        >
          <span className={styles.thesisIcon}><Sparkles aria-hidden="true" /></span>
          {!collapsed || mobile ? (
            <span className={styles.thesisCopy}>
              <strong>Investment thesis</strong>
              <span>{thesisDescription}</span>
            </span>
          ) : null}
        </Link>

        <Link
          href={"/investor/settings" as Route}
          className={clsx(styles.account, pathname.startsWith("/investor/settings") && styles.accountActive)}
          aria-label={collapsed && !mobile ? "Open settings" : undefined}
          title={collapsed && !mobile ? "Settings" : undefined}
          onClick={onNavigate}
        >
          <span className={styles.avatar} aria-hidden="true">{userName.slice(0, 2).toUpperCase()}</span>
          {!collapsed || mobile ? (
            <span className={styles.accountCopy}>
              <strong>{userName}</strong>
              <span>Demo workspace</span>
            </span>
          ) : null}
          {!collapsed || mobile ? <Settings className={styles.settingsIcon} aria-hidden="true" /> : null}
        </Link>
      </div>
    </div>
  );
}

export function AppShell({
  children,
  title,
  eyebrow,
  actions,
  headerAside,
  hideHeader = false,
  className,
  contentClassName,
  workspaceName = "Mauro's fund",
  userName = "Demo investor",
}: AppShellProps) {
  const pathname = usePathname();
  const {
    sidebarCollapsed,
    toggleSidebarCollapsed,
    compareIds,
    pipelineItems,
    activeThesis,
    hasHydrated,
    storageAvailable,
    persistenceError,
  } = useWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const thesisDescription = !hasHydrated
    ? "Loading sourcing lens…"
    : activeThesis
      ? `${activeThesis.sectors.length} sectors · ${activeThesis.stages.length} stages`
      : "Not configured yet";
  const persistenceWarning = hasHydrated && (storageAvailable === false || persistenceError)
    ? persistenceError ?? "Browser storage is unavailable. Changes will last only for this session."
    : null;

  useEffect(() => {
    if (!mobileOpen) return;

    const drawer = mobileDrawerRef.current;
    const trigger = mobileTriggerRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : trigger;
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    function focusableElements() {
      return drawer
        ? Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelector))
        : [];
    }

    const firstFocusable = focusableElements()[0];
    (firstFocusable ?? drawer)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusableElements();
      if (!drawer || elements.length === 0) {
        event.preventDefault();
        drawer?.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !drawer.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => {
        if (previouslyFocused?.isConnected) previouslyFocused.focus();
        else trigger?.focus();
      }, 0);
    };
  }, [mobileOpen]);

  return (
    <div className={clsx(styles.shell, sidebarCollapsed && styles.shellCollapsed, className)}>
      <aside
        className={styles.desktopSidebar}
        aria-label="Workspace sidebar"
        aria-hidden={mobileOpen || undefined}
        inert={mobileOpen || undefined}
      >
        <SidebarContent
          collapsed={sidebarCollapsed}
          pathname={pathname}
          workspaceName={workspaceName}
          userName={userName}
          compareCount={compareIds.length}
          pipelineCount={pipelineItems.length}
          thesisDescription={thesisDescription}
        />
        <button
          type="button"
          className={styles.collapseButton}
          onClick={toggleSidebarCollapsed}
          aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {sidebarCollapsed ? <ChevronsRight aria-hidden="true" /> : <ChevronsLeft aria-hidden="true" />}
        </button>
      </aside>

      <header
        className={styles.mobileHeader}
        aria-hidden={mobileOpen || undefined}
        inert={mobileOpen || undefined}
      >
        <button
          ref={mobileTriggerRef}
          type="button"
          className={styles.iconButton}
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          aria-controls="mobile-workspace-navigation"
        >
          <Menu aria-hidden="true" />
        </button>
        <Brand href="/investor" />
        <Chip tone="accent" size="sm">Demo</Chip>
      </header>

      {mobileOpen ? (
        <div className={styles.mobileLayer}>
          <button
            type="button"
            className={styles.backdrop}
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <aside
            id="mobile-workspace-navigation"
            ref={mobileDrawerRef}
            className={styles.mobileDrawer}
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            tabIndex={-1}
          >
            <SidebarContent
              collapsed={false}
              mobile
              pathname={pathname}
              workspaceName={workspaceName}
              userName={userName}
              compareCount={compareIds.length}
              pipelineCount={pipelineItems.length}
              thesisDescription={thesisDescription}
              onNavigate={() => setMobileOpen(false)}
              onClose={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <main
        className={styles.main}
        aria-hidden={mobileOpen || undefined}
        inert={mobileOpen || undefined}
      >
        {persistenceWarning ? (
          <div className={styles.persistenceWarning} role="status" aria-live="polite">
            {persistenceWarning}
          </div>
        ) : null}
        {!hideHeader ? (
          <header className={styles.pageHeader}>
            <div className={styles.pageHeading}>
              {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
              {title ? <h1>{title}</h1> : null}
            </div>
            {headerAside ? <div className={styles.headerAside}>{headerAside}</div> : null}
            {actions ? <div className={styles.headerActions}>{actions}</div> : null}
          </header>
        ) : null}
        <div className={clsx(styles.content, contentClassName)}>{children}</div>
      </main>
    </div>
  );
}
