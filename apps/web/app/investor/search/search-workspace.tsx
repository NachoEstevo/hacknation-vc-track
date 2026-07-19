"use client";

import type { Route } from "next";
import Link from "next/link";
import clsx from "clsx";
import {
  ArrowUp,
  Bookmark,
  BookOpen,
  Check,
  ChevronDown,
  Database,
  Github,
  Globe,
  History,
  LoaderCircle,
  Radar,
  Square,
  SquarePen,
  UserCheck,
  UserPlus,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Button, ChatUserBubble, PersonCard } from "@/components/pencil";
import { Markdown } from "@/components/markdown";
import { useWorkspace } from "@/components/workspace-provider";
import { CandidateReportSchema, thesisContextFor, type CandidateReport } from "@/lib/ai/sourcing-schema";
import { DEFAULT_TARGET_CANDIDATES } from "@/lib/search";
import styles from "./page.module.css";

const CHAT_STORAGE_KEY = "undr.sourcing-chat.v1";
const CANDIDATES_STORAGE_KEY = "undr.sourcing-candidates.v1";
const CHAT_ARCHIVE_KEY = "undr.sourcing-chat-archive.v1";
const CHAT_ARCHIVE_LIMIT = 6;
const CHAT_WIDTH_KEY = "undr.search-chat-width.v1";
/** Must match the defaults in page.module.css (`--chat-width` fallback and the results clamp). */
const CHAT_MIN_WIDTH = 574;
const RESULTS_MIN_WIDTH = 420;

interface StoredChat {
  sessionKey: string | null;
  messages: UIMessage[];
}

interface ArchivedChat {
  messages: UIMessage[];
  updatedAt: string;
}

type AnyPart = { type: string } & Record<string, unknown>;

function readStoredChat(): StoredChat | null {
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredChat;
    if (!Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * useChat's per-id store survives unmounts, so a restored thread can briefly
 * merge with messages already in memory and hold the same id twice. Render
 * and persist a last-occurrence-wins view so React keys stay unique.
 */
function dedupeMessagesById(messages: UIMessage[]): UIMessage[] {
  const seen = new Set<string>();
  const unique: UIMessage[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || seen.has(message.id)) continue;
    seen.add(message.id);
    unique.unshift(message);
  }
  return unique.length === messages.length ? messages : unique;
}

function chatFingerprint(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Saved explorations keep their full transcript in localStorage (like the
 * saved searches themselves) so reopening one restores the answer and its
 * cards instead of silently re-running the agent.
 */
function readChatArchive(): Record<string, ArchivedChat> {
  try {
    const raw = localStorage.getItem(CHAT_ARCHIVE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ArchivedChat>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function archivedChatFor(query: string): ArchivedChat | null {
  const entry = readChatArchive()[chatFingerprint(query)];
  return entry && Array.isArray(entry.messages) && entry.messages.length > 0 ? entry : null;
}

function archiveChat(query: string, messages: UIMessage[]) {
  if (messages.length === 0 || !query.trim()) return;
  try {
    const archive = readChatArchive();
    archive[chatFingerprint(query)] = {
      messages: dedupeMessagesById(messages),
      updatedAt: new Date().toISOString(),
    };
    const byRecency = Object.keys(archive).sort(
      (a, b) => Date.parse(archive[b]?.updatedAt ?? "") - Date.parse(archive[a]?.updatedAt ?? ""),
    );
    for (const stale of byRecency.slice(CHAT_ARCHIVE_LIMIT)) delete archive[stale];
    localStorage.setItem(CHAT_ARCHIVE_KEY, JSON.stringify(archive));
  } catch {
    // Storage full or unavailable: reopening will re-run the search instead.
  }
}

function textOfMessage(message: UIMessage): string {
  return (message.parts as AnyPart[])
    .filter((part): part is AnyPart & { text: string } => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n\n");
}

function candidatesFromMessages(messages: UIMessage[]): CandidateReport[] {
  const bySlug = new Map<string, CandidateReport>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts as AnyPart[]) {
      if (part.type !== "tool-report_candidate") continue;
      if (part.state !== "input-available" && part.state !== "output-available") continue;
      const output = part.output as { recorded?: boolean } | undefined;
      if (output?.recorded === false) continue;
      const parsed = CandidateReportSchema.safeParse(part.input);
      if (!parsed.success) continue;
      if (!bySlug.has(parsed.data.slug)) bySlug.set(parsed.data.slug, parsed.data);
    }
  }
  return [...bySlug.values()];
}

const TOOL_ACTIVITY: Record<string, { icon: ReactNode; label: string; inputKey: string }> = {
  "tool-search_prospect_base": { icon: <Database aria-hidden="true" />, label: "undr base", inputKey: "query" },
  "tool-web_search": { icon: <Globe aria-hidden="true" />, label: "Web search", inputKey: "query" },
  "tool-tavily_search": { icon: <Radar aria-hidden="true" />, label: "Deep search", inputKey: "query" },
  "tool-read_page": { icon: <BookOpen aria-hidden="true" />, label: "Reading page", inputKey: "urls" },
  "tool-search_github": { icon: <Github aria-hidden="true" />, label: "GitHub", inputKey: "query" },
  "tool-search_registered_founders": { icon: <UserCheck aria-hidden="true" />, label: "Registered founders", inputKey: "keyword" },
  "tool-search_internal_catalog": { icon: <Database aria-hidden="true" />, label: "Internal catalog", inputKey: "term" },
};

/** read_page's input is a URL list, not a string — condense it to hostnames. */
function activityDetailFor(part: AnyPart, inputKey: string): string {
  const input = part.input as Record<string, unknown> | undefined;
  const value = input?.[inputKey];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => {
        try {
          return new URL(entry).hostname.replace(/^www\./, "");
        } catch {
          return entry;
        }
      })
      .join(", ");
  }
  return "";
}

function isRunningPart(part: AnyPart): boolean {
  return part.state === "input-streaming" || part.state === "input-available";
}

function ToolActivityRow({ part, index }: { part: AnyPart; index: number }) {
  const config = TOOL_ACTIVITY[part.type];
  if (!config) return null;
  const detail = activityDetailFor(part, config.inputKey);
  const running = isRunningPart(part);
  const failed = part.state === "output-error";

  return (
    <div
      className={styles.activityRow}
      data-state={failed ? "failed" : running ? "running" : "done"}
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <span className={styles.activityIcon}>{config.icon}</span>
      <span className={styles.activityLabel}>
        {config.label}
        {detail ? <> — “{detail}”</> : null}
      </span>
      {running ? (
        <LoaderCircle aria-hidden="true" className={styles.thinkingSpin} />
      ) : failed ? (
        <span className={styles.activityFailed}>failed</span>
      ) : (
        <Check aria-hidden="true" className={styles.activityDone} />
      )}
    </div>
  );
}

/**
 * Consecutive tool lookups grouped into one collapsible block — adapted from
 * aicss.dev's "Web Search" tool state: shimmering header while running,
 * staggered rows, auto-collapse to a one-line summary once every lookup lands.
 */
function ResearchActivity({ parts }: { parts: AnyPart[] }) {
  const runningCount = parts.filter(isRunningPart).length;
  const allDone = runningCount === 0;
  const [expanded, setExpanded] = useState(!allDone);
  const wasRunningRef = useRef(!allDone);

  useEffect(() => {
    if (wasRunningRef.current && allDone) setExpanded(false);
    wasRunningRef.current = !allDone;
  }, [allDone]);

  return (
    <div className={styles.researchBlock}>
      <button
        type="button"
        className={styles.researchHead}
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
      >
        {allDone ? (
          <Check aria-hidden="true" className={styles.activityDone} />
        ) : (
          <LoaderCircle aria-hidden="true" className={styles.thinkingSpin} />
        )}
        <span className={clsx(styles.researchTitle, !allDone && styles.shimmer)}>
          {allDone
            ? `Researched ${parts.length} source${parts.length === 1 ? "" : "s"}`
            : `Researching — ${parts.length} lookup${parts.length === 1 ? "" : "s"} so far`}
        </span>
        <ChevronDown aria-hidden="true" className={styles.researchCaret} data-open={expanded ? "true" : undefined} />
      </button>
      {expanded ? (
        <div className={styles.researchList}>
          {parts.map((part, index) => (
            <ToolActivityRow key={index} part={part} index={index} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CandidateChip({ part }: { part: AnyPart }) {
  const parsed = CandidateReportSchema.safeParse(part.input);
  const name = parsed.success ? parsed.data.name : null;
  const duplicate = (part.output as { recorded?: boolean } | undefined)?.recorded === false;
  if (duplicate) return null;
  return (
    <div className={styles.candidateChip}>
      <UserPlus aria-hidden="true" />
      <span>{name ? <>Card added — <strong>{name}</strong></> : "Adding candidate…"}</span>
    </div>
  );
}

type TurnGroup =
  | { kind: "text"; text: string; key: number }
  | { kind: "chip"; part: AnyPart; key: number }
  | { kind: "activity"; parts: AnyPart[]; key: number };

function AssistantTurn({ message, streaming }: { message: UIMessage; streaming: boolean }) {
  const groups: TurnGroup[] = [];
  for (const [index, part] of (message.parts as AnyPart[]).entries()) {
    if (part.type === "text" && typeof part.text === "string") {
      // Web-search citations split one passage into several contiguous text
      // parts; merge them back so sentences don't break into stray paragraphs.
      const last = groups[groups.length - 1];
      if (last?.kind === "text") {
        last.text += part.text;
      } else if (part.text.trim()) {
        groups.push({ kind: "text", text: part.text, key: index });
      }
    } else if (part.type === "tool-report_candidate") {
      groups.push({ kind: "chip", part, key: index });
    } else if (part.type in TOOL_ACTIVITY) {
      const last = groups[groups.length - 1];
      if (last?.kind === "activity") last.parts.push(part);
      else groups.push({ kind: "activity", parts: [part], key: index });
    }
  }
  const lastGroup = groups[groups.length - 1];

  return (
    <div className={styles.assistantTurn}>
      {groups.map((group) => {
        if (group.kind === "text") {
          return (
            <Markdown
              key={group.key}
              text={group.text}
              streaming={streaming && group === lastGroup}
            />
          );
        }
        if (group.kind === "chip") {
          return <CandidateChip key={group.key} part={group.part} />;
        }
        return <ResearchActivity key={group.key} parts={group.parts} />;
      })}
    </div>
  );
}

function HydratedSearchWorkspace() {
  const {
    savedSearches,
    saveSearch,
    activeThesis,
    storageAvailable,
    persistenceError,
    searchSession,
    searchSessionError,
    clearSearchSession,
  } = useWorkspace();

  const [initialChat] = useState<StoredChat | null>(() => readStoredChat());
  const sessionKeyAtLoad = searchSession?.updatedAt ?? null;
  const restoredMessages =
    initialChat && initialChat.sessionKey === sessionKeyAtLoad
      ? dedupeMessagesById(initialChat.messages)
      : [];

  const [transport] = useState(() => new DefaultChatTransport({ api: "/api/agent/chat" }));
  const { messages, sendMessage, setMessages, stop, status, error, regenerate } = useChat({
    id: "sourcing-agent",
    messages: restoredMessages,
    transport,
  });

  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const threadRef = useRef<HTMLDivElement | null>(null);
  const chatSessionKeyRef = useRef<string | null>(restoredMessages.length > 0 ? sessionKeyAtLoad : null);

  // Draggable split: the chat can only grow beyond its 574px default, never
  // shrink below it; the results panel always keeps at least 420px.
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [chatWidth, setChatWidth] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(CHAT_WIDTH_KEY);
      const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
      return Number.isFinite(parsed) && parsed > CHAT_MIN_WIDTH ? parsed : null;
    } catch {
      return null;
    }
  });

  function persistChatWidth(width: number | null) {
    try {
      if (width && width > CHAT_MIN_WIDTH) localStorage.setItem(CHAT_WIDTH_KEY, String(Math.round(width)));
      else localStorage.removeItem(CHAT_WIDTH_KEY);
    } catch {
      // Losing the preferred width on reload is the only cost.
    }
  }

  function startChatResize(event: ReactPointerEvent<HTMLDivElement>) {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = chatWidth ?? CHAT_MIN_WIDTH;
    const maxWidth = Math.max(CHAT_MIN_WIDTH, workspace.getBoundingClientRect().width - RESULTS_MIN_WIDTH);
    handle.setPointerCapture(event.pointerId);
    setIsResizing(true);
    let latest = startWidth;

    function onMove(move: PointerEvent) {
      latest = Math.min(maxWidth, Math.max(CHAT_MIN_WIDTH, startWidth + (move.clientX - startX)));
      setChatWidth(latest);
    }
    function onUp() {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      setIsResizing(false);
      persistChatWidth(latest);
    }

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  function resetChatWidth() {
    setChatWidth(null);
    persistChatWidth(null);
  }

  const thesisContext = useMemo(() => thesisContextFor(activeThesis), [activeThesis]);
  // Composer-selected data source and geography travel with every message of
  // the session so refinements keep the same constraints as the first brief.
  const searchControls = useMemo(() => {
    if (!searchSession) return undefined;
    const controls = {
      ...(searchSession.dataSource ? { dataSource: searchSession.dataSource } : {}),
      ...(searchSession.geography ? { geography: searchSession.geography } : {}),
      ...(searchSession.targetCandidates ? { targetCandidates: searchSession.targetCandidates } : {}),
    };
    return Object.keys(controls).length > 0 ? controls : undefined;
  }, [searchSession]);
  const targetCandidates = searchSession?.targetCandidates ?? DEFAULT_TARGET_CANDIDATES;
  const isBusy = status === "submitted" || status === "streaming";
  const autoContinuesRef = useRef(0);
  const manualStopRef = useRef(false);

  // A search session started from the home composer (or an example) opens
  // this workspace with a fresh brief: reset the thread and send it. Sessions
  // reopened from saved/recent searches restore their archived transcript
  // instead of re-running the agent.
  useEffect(() => {
    if (!searchSession) return;
    if (chatSessionKeyRef.current === searchSession.updatedAt) return;
    chatSessionKeyRef.current = searchSession.updatedAt;
    autoContinuesRef.current = 0;
    manualStopRef.current = false;
    stop();
    if (searchSession.source === "saved_search" || searchSession.source === "recent") {
      const archived = archivedChatFor(searchSession.query);
      if (archived) {
        setMessages(dedupeMessagesById(archived.messages));
        return;
      }
    }
    setMessages([]);
    void sendMessage(
      { text: searchSession.query },
      { body: { thesis: thesisContext, controls: searchControls } },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchSession?.updatedAt]);

  const renderMessages = useMemo(() => dedupeMessagesById(messages), [messages]);
  const candidates = useMemo(() => candidatesFromMessages(messages), [messages]);
  const brief = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message && message.role === "user") {
        const text = textOfMessage(message);
        if (text && !text.startsWith("[auto]")) return text;
      }
    }
    return searchSession?.query ?? "";
  }, [messages, searchSession?.query]);

  // If a run concludes below the requested bench size (weaker models often
  // stop early), nudge the agent to keep going — at most twice, never after
  // a manual stop, and never on a clarifying turn (no research tools used).
  useEffect(() => {
    if (status !== "ready") return;
    if (manualStopRef.current) return;
    if (autoContinuesRef.current >= Math.min(3, Math.max(2, Math.ceil(targetCandidates / 3)))) return;
    if (candidates.length >= targetCandidates) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const didResearch = (last.parts as AnyPart[]).some(
      (part) => typeof part.type === "string" && part.type.startsWith("tool-"),
    );
    if (!didResearch) return;
    autoContinuesRef.current += 1;
    void sendMessage(
      {
        text: `[auto] Continue searching: ${candidates.length} of ${targetCandidates} requested candidates reported so far. Research new angles and report the missing ones.`,
      },
      { body: { thesis: thesisContext, controls: searchControls } },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Persist the thread continuously (throttled while streaming) so a reload
  // or a card->profile->back trip mid-research restores the conversation and
  // its cards instead of silently re-running the whole search.
  const lastPersistRef = useRef(0);
  useEffect(() => {
    if (messages.length === 0) return;
    const settled = status === "ready" || status === "error";
    const now = Date.now();
    if (!settled && now - lastPersistRef.current < 1500) return;
    lastPersistRef.current = now;
    try {
      const stored: StoredChat = {
        sessionKey: chatSessionKeyRef.current,
        messages: dedupeMessagesById(messages),
      };
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Private-mode storage failures only cost thread restoration.
    }
  }, [messages, status]);

  // Candidate stubs feed the profile page (/investor/people/[slug]).
  useEffect(() => {
    if (candidates.length === 0) return;
    try {
      const raw = sessionStorage.getItem(CANDIDATES_STORAGE_KEY);
      const existing = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      for (const candidate of candidates) {
        existing[candidate.slug] = { candidate, query: brief };
      }
      sessionStorage.setItem(CANDIDATES_STORAGE_KEY, JSON.stringify(existing));
    } catch {
      // Same storage caveat as above.
    }
  }, [candidates, brief]);

  // Keep the archived copy of a saved exploration fresh (settled turns only)
  // so reopening it later restores follow-ups too, not just the first answer.
  useEffect(() => {
    if (messages.length === 0) return;
    if (status !== "ready" && status !== "error") return;
    if (!savedSearches.some((search) => chatFingerprint(search.query) === chatFingerprint(brief))) return;
    archiveChat(brief, messages);
  }, [messages, status, savedSearches, brief]);

  // Keep the newest narration in view while the agent streams.
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [messages, status]);

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim().replace(/\s+/g, " ").slice(0, 1000);
    if (!text || isBusy) return;
    setDraft("");
    setFeedback("");
    manualStopRef.current = false;
    autoContinuesRef.current = 0;
    void sendMessage({ text }, { body: { thesis: thesisContext, controls: searchControls } });
  }

  function startNewChat() {
    manualStopRef.current = true;
    stop();
    const cleared = clearSearchSession();
    if (!cleared && searchSession) {
      setFeedback(searchSessionError ?? "Private session storage could not start a new exploration.");
      return;
    }
    chatSessionKeyRef.current = null;
    setMessages([]);
    setDraft("");
    setFeedback("");
    try {
      sessionStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // Nothing else to clean up.
    }
  }

  const currentSaved = savedSearches.some((search) => search.query === brief);

  async function handleSave() {
    if (!brief) {
      setFeedback("Start a search before saving it.");
      return;
    }
    if (currentSaved) {
      setFeedback("This exploration is already saved.");
      return;
    }
    if (storageAvailable !== true || persistenceError) {
      setFeedback(persistenceError ?? "Browser storage is unavailable, so this exploration was not saved.");
      return;
    }
    const savedId = await saveSearch(brief);
    if (savedId) {
      // Snapshot the transcript right away so reopening the saved card shows
      // this answer even if the user navigates off before the next settle.
      archiveChat(brief, messages);
    }
    setFeedback(savedId
      ? "Search saved in this browser-only workspace."
      : "Browser storage could not save this exploration. Nothing was recorded as saved.");
  }

  const prospectCount = candidates.filter((candidate) => candidate.sourceKind === "prospect_base").length;
  const webCount = candidates.filter((candidate) => candidate.sourceKind === "web" || candidate.sourceKind === "github").length;
  const internalCount = candidates.filter((candidate) => candidate.sourceKind === "internal_base").length;
  const registeredCount = candidates.filter((candidate) => candidate.sourceKind === "registered").length;

  const showEmptyThread = messages.length === 0;

  return (
    <div
      className={styles.workspace}
      ref={workspaceRef}
      style={chatWidth ? ({ "--chat-width": `${chatWidth}px` } as CSSProperties) : undefined}
    >
      <aside className={styles.chatPanel} aria-label="Sourcing conversation">
        <div
          className={styles.resizeHandle}
          data-resizing={isResizing || undefined}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the conversation panel (drag right to widen, double-click to reset)"
          title="Drag to widen the conversation · double-click to reset"
          onPointerDown={startChatResize}
          onDoubleClick={resetChatWidth}
        />
        <div className={styles.chatHead}>
          <span className={styles.chatHeadTitle}>Conversation</span>
          <span className={styles.chatHeadSpacer} aria-hidden="true" />
          <Link
            href={"/investor/saved-searches" as Route}
            className={styles.chatHeadIcon}
            aria-label="View saved searches"
            title="Saved searches"
          >
            <History aria-hidden="true" />
          </Link>
          <button
            type="button"
            className={styles.chatHeadIcon}
            onClick={startNewChat}
            aria-label="Start a new search"
            title="New search"
          >
            <SquarePen aria-hidden="true" />
          </button>
        </div>

        <div className={styles.thread} aria-live="polite" ref={threadRef}>
          {showEmptyThread ? (
            <div className={styles.emptyThread}>
              <Radar aria-hidden="true" />
              <p className={styles.emptyThreadTitle}>Describe who you’re looking for</p>
              <p className={styles.emptyThreadHint}>
                The agent asks follow-ups when your brief is vague, then researches the live
                web{activeThesis ? " through the lens of your active thesis" : ""} and drops
                candidate cards on the right as it finds real people.
              </p>
            </div>
          ) : null}

          {renderMessages.map((message, index) => {
            if (message.role === "user") {
              const text = textOfMessage(message);
              if (text.startsWith("[auto]")) {
                return (
                  <p key={message.id} className={styles.autoNote}>
                    Below target — automatically asking the agent to keep searching…
                  </p>
                );
              }
              return <ChatUserBubble key={message.id}>{text}</ChatUserBubble>;
            }
            return (
              <AssistantTurn
                key={message.id}
                message={message}
                streaming={status === "streaming" && index === renderMessages.length - 1}
              />
            );
          })}

          {status === "submitted" ? (
            <div className={styles.thinkingRow}>
              <LoaderCircle aria-hidden="true" className={styles.thinkingSpin} />
              <span className={styles.shimmer}>Thinking…</span>
            </div>
          ) : null}

          {error ? (
            <div className={styles.errorRow} role="alert">
              <p>{error.message || "The sourcing agent hit an error."}</p>
              <Button variant="secondary" onClick={() => regenerate()}>Retry</Button>
            </div>
          ) : null}
        </div>

        <form className={styles.composer} onSubmit={submitMessage}>
          <label className="sr-only" htmlFor="sourcing-message">Message the sourcing agent</label>
          <div className={styles.composerBox}>
            <textarea
              id="sourcing-message"
              className={styles.composerTextarea}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder={showEmptyThread ? "Describe who you’re looking for…" : "Answer or refine…"}
            />
            {isBusy ? (
              <button
                type="button"
                className={styles.sendButtonComposer}
                onClick={() => {
                  manualStopRef.current = true;
                  void stop();
                }}
                aria-label="Stop the agent"
                title="Stop"
              >
                <Square aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                className={styles.sendButtonComposer}
                disabled={!draft.trim()}
                aria-label="Send message"
              >
                <ArrowUp aria-hidden="true" />
              </button>
            )}
          </div>
        </form>
      </aside>

      <section className={styles.results} aria-label="Researched candidates">
        <div className={styles.resultsHeadWrap}>
          <div className={styles.resultsHead}>
            <h1>
              {candidates.length} of {targetCandidates} candidate{targetCandidates === 1 ? "" : "s"}
            </h1>
            <Button
              variant={currentSaved ? "secondary" : "primary"}
              onClick={handleSave}
              leadingIcon={currentSaved ? <Check aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
            >
              {currentSaved ? "Saved" : "Save search"}
            </Button>
          </div>
          {brief ? <p className={styles.resultsQueryLine}>{brief}</p> : null}
        </div>

        <div className={styles.sourceSummary}>
          <span className={styles.summaryPill} data-tone="registered">
            <Database aria-hidden="true" /> undr base {prospectCount}
          </span>
          <span className={styles.summaryPill} data-tone="external_unconfirmed">
            <Globe aria-hidden="true" /> Web {webCount}
          </span>
          <span className={styles.summaryPill} data-tone="registered">
            <UserCheck aria-hidden="true" /> Registered {registeredCount}
          </span>
          <span className={styles.summaryPill} data-tone="internal_base">
            <Database aria-hidden="true" /> Internal base {internalCount}
          </span>
          <span className={styles.summarySpacer} aria-hidden="true" />
          <span className={clsx(styles.summaryUpdated, isBusy && styles.shimmer)}>
            {isBusy ? "Researching live…" : status === "error" ? "Agent stopped on an error" : candidates.length > 0 ? "Updated just now" : ""}
          </span>
        </div>

        <p className={styles.feedback} aria-live="polite">{feedback}</p>

        <div className={styles.resultList}>
          {candidates.map((candidate) => (
            <PersonCard key={candidate.slug} candidate={candidate} />
          ))}
        </div>

        {candidates.length === 0 ? (
          <div className={styles.resultsEmpty}>
            {isBusy ? (
              <>
                <LoaderCircle aria-hidden="true" className={styles.thinkingSpin} />
                <p>Candidate cards will land here as the agent confirms real people.</p>
              </>
            ) : (
              <p>
                No candidates yet. Cards appear here — each one a real person the agent
                found and backed with evidence links — as the research runs.
              </p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function SearchWorkspace() {
  const { hasHydrated, searchSessionError } = useWorkspace();

  if (!hasHydrated) {
    return (
      <div className={styles.workspace} role="status" aria-live="polite">
        Loading the private search session from this browser tab…
      </div>
    );
  }

  return (
    <>
      {searchSessionError ? (
        <p className={styles.feedback} role="status" aria-live="polite">{searchSessionError}</p>
      ) : null}
      <HydratedSearchWorkspace />
    </>
  );
}
