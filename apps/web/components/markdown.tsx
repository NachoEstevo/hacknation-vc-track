"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import clsx from "clsx";
import styles from "./markdown.module.css";

const REMARK_PLUGINS = [remarkGfm];

const COMPONENTS = {
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
};

/**
 * Streaming-friendly markdown: memoized on the text itself, so while the
 * newest assistant message streams, every earlier message (and every earlier
 * render of this one with identical text) skips re-parsing entirely.
 */
export const Markdown = memo(
  function Markdown({ text, className }: { text: string; className?: string }) {
    return (
      <div className={clsx(styles.markdown, className)}>
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
          {text}
        </ReactMarkdown>
      </div>
    );
  },
  (previous, next) => previous.text === next.text && previous.className === next.className,
);
