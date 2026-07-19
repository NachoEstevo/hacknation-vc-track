"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  FileDown,
  Github,
  Globe,
  Linkedin,
  LoaderCircle,
  Radar,
  RefreshCw,
  Twitter,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Avatar, Button, ButtonLink, ConfidenceBadge, FounderScore, SectorTag, StageBadge } from "@/components/pencil";
import { Markdown } from "@/components/markdown";
import { useWorkspace } from "@/components/workspace-provider";
import { isCandidateReport, thesisContextFor, type CandidateReport } from "@/lib/ai/sourcing-schema";
import { mergePersonLinks, type PersonLink } from "@/lib/search/contact-links";
import styles from "./page.module.css";

const CANDIDATES_STORAGE_KEY = "undr.sourcing-candidates.v1";
const DOSSIER_STORAGE_PREFIX = "undr.dossier.v1.";
const USAGE_KEY_PREFIX = "undr.dossier-usage.v1.";

/**
 * One usage key per generation attempt: first open mints it, silent
 * auto-retries reuse it (the server replays the reservation for free), and
 * only a manual Refresh rotates it — which is what makes a refresh cost one
 * profile_completion while retries never double-charge.
 */
function usageKeyFor(slug: string, rotate = false): string {
  try {
    const storageKey = `${USAGE_KEY_PREFIX}${slug}`;
    if (!rotate) {
      const existing = sessionStorage.getItem(storageKey);
      if (existing) return existing;
    }
    const fresh = `${slug}:${crypto.randomUUID()}`;
    sessionStorage.setItem(storageKey, fresh);
    return fresh;
  } catch {
    return slug;
  }
}

function announceUsageChange(): void {
  window.dispatchEvent(new CustomEvent("undr:usage-changed"));
}

type AnyPart = { type: string } & Record<string, unknown>;

interface CandidateStub {
  candidate: CandidateReport;
  query: string;
}

interface StoredDossier {
  markdown: string;
  generatedAt: string;
}

function readCandidateStub(slug: string): CandidateStub | null {
  try {
    const raw = sessionStorage.getItem(CANDIDATES_STORAGE_KEY);
    if (!raw) return null;
    const entry = (JSON.parse(raw) as Record<string, { candidate?: unknown; query?: unknown }>)[slug];
    if (!entry || !isCandidateReport(entry.candidate)) return null;
    return { candidate: entry.candidate, query: typeof entry.query === "string" ? entry.query : "" };
  } catch {
    return null;
  }
}

function readStoredDossier(slug: string): StoredDossier | null {
  try {
    const raw = sessionStorage.getItem(`${DOSSIER_STORAGE_PREFIX}${slug}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDossier;
    return typeof parsed.markdown === "string" && parsed.markdown.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The document starts at its first ### heading — anything the model streamed
 * before it ("I'll research…", "Let me compile…") is process narration, not
 * dossier. Falls through untouched when no heading exists yet (early stream).
 */
function trimToDossier(text: string): string {
  const match = /^###\s/m.exec(text);
  return match && match.index > 0 ? text.slice(match.index) : text;
}

function dossierTextOf(messages: UIMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") continue;
    return trimToDossier(
      (message.parts as AnyPart[])
        .filter((part): part is AnyPart & { text: string } => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n\n"),
    );
  }
  return "";
}

const PROFILE_TOOL_LABELS: Record<string, string> = {
  "tool-lookup_prospect": "undr base",
  "tool-web_search": "Web",
  "tool-tavily_search": "Deep search",
  "tool-read_page": "Reading",
  "tool-search_github": "GitHub",
};

function researchActivityOf(messages: UIMessage[]): { key: string; label: string; running: boolean }[] {
  const rows: { key: string; label: string; running: boolean }[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const [index, part] of (message.parts as AnyPart[]).entries()) {
      const toolLabel = PROFILE_TOOL_LABELS[part.type];
      if (!toolLabel) continue;
      const input = part.input as Record<string, unknown> | undefined;
      const detail = typeof input?.query === "string"
        ? input.query
        : Array.isArray(input?.urls)
          ? (input.urls as unknown[])
              .filter((entry): entry is string => typeof entry === "string")
              .map((entry) => hostnameOf(entry))
              .join(", ")
          : "…";
      rows.push({
        key: `${message.id}-${index}`,
        label: `${toolLabel} — “${detail}”`,
        running: part.state === "input-streaming" || part.state === "input-available",
      });
    }
  }
  return rows;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function LinkIcon({ link }: { link: PersonLink }) {
  if (link.network === "linkedin") return <Linkedin aria-hidden="true" />;
  if (link.network === "x") return <Twitter aria-hidden="true" />;
  if (link.network === "github" || hostnameOf(link.url) === "github.com") return <Github aria-hidden="true" />;
  return <Globe aria-hidden="true" />;
}

function MissingProfile({ slug }: { slug: string }) {
  return (
    <div className={styles.missing}>
      <h1>This profile isn’t in the current session</h1>
      <p>
        Researched profiles are generated from a sourcing conversation and kept
        private to this browser tab. The candidate “{slug}” isn’t part of the
        current session — run a search and open the card again.
      </p>
      <ButtonLink href={"/investor/search" as Route}>Back to search</ButtonLink>
    </div>
  );
}

export function PersonProfileWorkspace({ slug }: { slug: string }) {
  const { hasHydrated } = useWorkspace();

  if (!hasHydrated) {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        Loading this browser session…
      </div>
    );
  }

  return <HydratedProfile slug={slug} />;
}

function HydratedProfile({ slug }: { slug: string }) {
  const { activeThesis, addToRadar, removeFromRadar, isOnRadar } = useWorkspace();
  const [stub] = useState<CandidateStub | null>(() => readCandidateStub(slug));
  const [cached, setCached] = useState<StoredDossier | null>(() => readStoredDossier(slug));

  const [transport] = useState(() => new DefaultChatTransport({ api: "/api/agent/profile" }));
  const [emptyRun, setEmptyRun] = useState(false);
  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    id: `dossier-${slug}`,
    transport,
    onFinish: ({ message }) => {
      announceUsageChange();
      const markdown = dossierTextOf([message]);
      if (!markdown) {
        setEmptyRun(true);
        return;
      }
      const stored: StoredDossier = { markdown, generatedAt: new Date().toISOString() };
      try {
        sessionStorage.setItem(`${DOSSIER_STORAGE_PREFIX}${slug}`, JSON.stringify(stored));
      } catch {
        // Losing the cache only means a regeneration on next open.
      }
      setCached(stored);
    },
  });

  const requestedRef = useRef(false);
  const thesisContext = useMemo(() => thesisContextFor(activeThesis), [activeThesis]);

  const streamedDossier = dossierTextOf(messages);
  const activity = researchActivityOf(messages);
  const isBusy = status === "submitted" || status === "streaming";
  // Older cached dossiers may still carry pre-dossier narration — trim on read.
  const dossier = cached?.markdown && !isBusy && !streamedDossier ? trimToDossier(cached.markdown) : streamedDossier;

  function requestDossier() {
    if (!stub) return;
    requestedRef.current = true;
    setEmptyRun(false);
    setMessages([]);
    void sendMessage(
      { text: `Research and write the dossier for ${stub.candidate.name}.` },
      { body: { candidate: stub.candidate, thesis: thesisContext, query: stub.query, usageKey: usageKeyFor(slug) } },
    );
    announceUsageChange();
  }

  // Generate on first open; afterwards the cached dossier renders instantly.
  useEffect(() => {
    if (requestedRef.current || cached || !stub) return;
    requestedRef.current = true;
    requestDossier();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One silent retry when a run errors out or ends with no dossier text —
  // transient upstream failures resolve on a second attempt far more often
  // than a user finds the Retry button.
  const autoRetriedRef = useRef(false);
  useEffect(() => {
    if ((!error && !emptyRun) || isBusy || autoRetriedRef.current || !stub) return;
    autoRetriedRef.current = true;
    const timer = setTimeout(() => requestDossier(), 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, emptyRun, isBusy]);

  useEffect(() => () => {
    void stop();
  }, [stop]);

  if (!stub) {
    return <MissingProfile slug={slug} />;
  }

  const { candidate } = stub;
  const subline = [candidate.role, candidate.company, candidate.location].filter(Boolean).join(" · ");

  function refreshDossier() {
    try {
      sessionStorage.removeItem(`${DOSSIER_STORAGE_PREFIX}${slug}`);
    } catch {
      // Ignore: regenerating overwrites it anyway.
    }
    usageKeyFor(slug, true);
    setCached(null);
    requestDossier();
  }

  // Deterministic PDF export: the browser's print engine renders the print
  // stylesheet — no model involved. The temporary title becomes the
  // suggested filename in the save dialog.
  function exportPdf() {
    const previousTitle = document.title;
    document.title = `${candidate.name} — undr dossier`;
    window.print();
    document.title = previousTitle;
  }

  return (
    <div className={styles.page}>
      <p className={styles.printProvenance}>
        undr · researched dossier
        {cached ? ` · generated ${new Date(cached.generatedAt).toLocaleDateString("en-US")}` : ""}
      </p>
      <div className={styles.topBar}>
        <Link href={"/investor/search" as Route} className={styles.backLink}>
          <ArrowLeft aria-hidden="true" />
          <span>Back to search</span>
        </Link>
        <span className={styles.topBarSpacer} aria-hidden="true" />
        <Button
          variant={isOnRadar(candidate.slug) ? "secondary" : "primary"}
          onClick={() => {
            if (isOnRadar(candidate.slug)) removeFromRadar(candidate.slug);
            else addToRadar(candidate, stub.query);
          }}
          leadingIcon={isOnRadar(candidate.slug) ? <Check aria-hidden="true" /> : <Radar aria-hidden="true" />}
        >
          {isOnRadar(candidate.slug) ? "On radar" : "Save to radar"}
        </Button>
        <Button
          variant="secondary"
          onClick={refreshDossier}
          disabled={isBusy}
          leadingIcon={<RefreshCw aria-hidden="true" />}
        >
          {isBusy ? "Researching…" : "Refresh dossier"}
        </Button>
        <Button
          variant="secondary"
          onClick={exportPdf}
          disabled={isBusy || !dossier}
          leadingIcon={<FileDown aria-hidden="true" />}
          aria-label="Export this dossier as a PDF"
        >
          Export PDF
        </Button>
      </div>

      <header className={styles.hero}>
        <Avatar name={candidate.name} tone={candidate.sourceKind === "registered" ? "accent" : "external"} />
        <div className={styles.heroText}>
          <h1>{candidate.name}</h1>
          <p className={styles.heroSubline}>{subline || "Details pending"}</p>
          <div className={styles.heroMeta}>
            <StageBadge label={candidate.stage || "Stage unknown"} />
            {candidate.tags.map((tag) => (
              <SectorTag key={tag} label={tag} />
            ))}
            <ConfidenceBadge level={candidate.confidence} />
          </div>
        </div>
        <div className={styles.heroScore}>
          <FounderScore value={candidate.score} prefix={candidate.sourceKind === "registered" ? undefined : "~"} />
          <span className={styles.heroScoreLabel}>Fit vs your request</span>
        </div>
      </header>

      <div className={styles.evidenceRow}>
        {mergePersonLinks(candidate.links, dossier).map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noreferrer noopener" className={styles.evidenceChip}>
            <LinkIcon link={link} />
            <span>{link.title || hostnameOf(link.url)}</span>
            <ArrowUpRight aria-hidden="true" />
          </a>
        ))}
      </div>

      <section className={styles.dossier} aria-label="Researched dossier" aria-live="polite">
        {isBusy && activity.length > 0 ? (
          <div className={styles.activityList}>
            {activity.map((row) => (
              <div key={row.key} className={styles.activityRow}>
                {row.running ? (
                  <LoaderCircle aria-hidden="true" className={styles.spin} />
                ) : (
                  <Check aria-hidden="true" className={styles.activityDone} />
                )}
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        ) : null}

        {dossier ? (
          <Markdown text={dossier} className={styles.dossierBody} streaming={isBusy && !cached} />
        ) : isBusy ? (
          <div className={styles.generating}>
            <LoaderCircle aria-hidden="true" className={styles.spin} />
            <span className={styles.shimmer}>Researching {candidate.name} on the live web…</span>
          </div>
        ) : null}

        {error ? (
          <div className={styles.errorRow} role="alert">
            <p>{error.message || "The dossier writer hit an error."}</p>
            <Button variant="secondary" onClick={refreshDossier}>Retry</Button>
          </div>
        ) : null}

        {emptyRun && !error && !isBusy && !dossier ? (
          <div className={styles.errorRow} role="alert">
            <p>The research run ended before the dossier was written.</p>
            <Button variant="secondary" onClick={refreshDossier}>Retry</Button>
          </div>
        ) : null}

        {cached && !isBusy ? (
          <p className={styles.generatedNote}>
            Generated {new Date(cached.generatedAt).toLocaleString("en-US")} from live web research ·
            cached in this browser tab
          </p>
        ) : null}
      </section>
    </div>
  );
}
