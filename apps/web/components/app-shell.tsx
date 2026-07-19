"use client";

import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sidebar } from "./pencil";
import { Brand } from "./brand";
import { Chip } from "./ui/chip";
import { useWorkspace } from "./workspace-provider";
import styles from "./app-shell.module.css";

export interface AppShellProps {
  children: ReactNode;
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  headerAside?: ReactNode;
  hideHeader?: boolean;
  className?: string;
  contentClassName?: string;
  userName?: string;
  userRole?: string;
}

/** Shared chrome for every `/investor/*` route: the Pencil `Nav / Sidebar` (+ collapsed variant) and the page header. */
export function AppShell({
  children,
  title,
  eyebrow,
  actions,
  headerAside,
  hideHeader = false,
  className,
  contentClassName,
  userName = "Demo investor",
  userRole = "Investor",
}: AppShellProps) {
  const router = useRouter();
  const {
    sidebarCollapsed,
    toggleSidebarCollapsed,
    savedSearches,
    clearSearchSession,
    startSearchSession,
    hasHydrated,
    storageAvailable,
    persistenceError,
    profileName,
  } = useWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const persistenceWarning = hasHydrated && (storageAvailable === false || persistenceError)
    ? persistenceError ?? "Browser storage is unavailable. Changes will last only for this session."
    : null;
  // "Recent" only ever reflects searches this workspace actually saved—never a placeholder.
  const recentSearches = hasHydrated
    ? savedSearches.slice(0, 3).map((search) => ({ id: search.id, label: search.label }))
    : [];
  // The name edited in Settings wins over the per-page server default once hydrated.
  const displayName = (hasHydrated && profileName) || userName;

  function startNewSearch() {
    clearSearchSession();
    setMobileOpen(false);
    router.push("/investor");
  }

  // Reopening from "Recent" restores the archived conversation in the search
  // workspace when one exists (source: "recent"), instead of re-running it.
  function openRecentSearch(searchId: string) {
    const saved = savedSearches.find((search) => search.id === searchId);
    if (!saved) return;
    if (!startSearchSession({
      query: saved.query,
      criteria: saved.criteria ?? [],
      source: "recent",
      sourceId: saved.id,
    })) {
      return;
    }
    setMobileOpen(false);
    router.push("/investor/search");
  }

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
      <div
        className={styles.desktopSidebar}
        aria-hidden={mobileOpen || undefined}
        inert={mobileOpen || undefined}
      >
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
          onNewSearch={startNewSearch}
          recentSearches={recentSearches}
          onOpenRecent={openRecentSearch}
          userName={displayName}
          userRole={userRole}
        />
      </div>

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
          <div
            id="mobile-workspace-navigation"
            ref={mobileDrawerRef}
            className={styles.mobileDrawer}
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            tabIndex={-1}
          >
            <button
              type="button"
              className={styles.mobileClose}
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X aria-hidden="true" />
            </button>
            <Sidebar
              collapsed={false}
              onToggleCollapsed={toggleSidebarCollapsed}
              onNewSearch={startNewSearch}
              recentSearches={recentSearches}
              onOpenRecent={openRecentSearch}
              userName={displayName}
              userRole={userRole}
            />
          </div>
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
