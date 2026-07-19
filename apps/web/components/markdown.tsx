"use client";

import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import clsx from "clsx";
import styles from "./markdown.module.css";

const REMARK_PLUGINS = [remarkGfm];

function hostnameOf(href: string): string | null {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const COMPONENTS = {
  /**
   * Links render as inline citation chips (adapted from aicss.dev's
   * "Inline Citations"): the cited title plus its source hostname, opening
   * in a new tab. react-markdown's default urlTransform already strips
   * dangerous protocols (javascript:, data:), so hrefs here are http(s)-safe.
   */
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => {
    if (!href) return <span>{children}</span>;
    const host = hostnameOf(href);
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className={styles.citation} title={href}>
        <span className={styles.citationLabel}>{children}</span>
        {host ? <span className={styles.citationHost}>{host}</span> : null}
      </a>
    );
  },
};

/**
 * Anthropic's web-search citations annotate streamed text with literal
 * `<cite index="…">…</cite>` wrappers; raw HTML is (deliberately) not
 * rendered, so strip the tags and keep the cited text.
 */
function stripCiteTags(text: string): string {
  return text.replace(/<\/?cite[^>]*>/g, "");
}

/**
 * Splits markdown into standalone blocks on blank lines, without splitting
 * inside fenced code blocks. Each block stays valid markdown on its own.
 */
function splitBlocks(text: string): string[] {
  const lines = stripCiteTags(text).split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
}

const MarkdownBlock = memo(
  function MarkdownBlock({ text }: { text: string }) {
    return (
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    );
  },
  (previous, next) => previous.text === next.text,
);

/**
 * Streaming-optimized markdown: the source is split into blocks and each
 * block is memoized on its own text, so while a response streams only the
 * final, still-growing block re-parses — everything above it is a cache hit.
 * `streaming` appends a blinking caret (aicss.dev "Streaming Text" pattern).
 */
export const Markdown = memo(
  function Markdown({
    text,
    className,
    streaming = false,
  }: {
    text: string;
    className?: string;
    streaming?: boolean;
  }) {
    const blocks = useMemo(() => splitBlocks(text), [text]);
    return (
      <div className={clsx(styles.markdown, className)}>
        {blocks.map((block, index) => (
          <MarkdownBlock key={index} text={block} />
        ))}
        {streaming ? <span className={styles.caret} aria-hidden="true" /> : null}
      </div>
    );
  },
  (previous, next) =>
    previous.text === next.text
    && previous.className === next.className
    && previous.streaming === next.streaming,
);
