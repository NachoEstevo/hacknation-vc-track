import type { ReactNode } from "react";
import styles from "./chat-bubble.module.css";

/** Port of Pencil `Chat / User`. */
export function ChatUserBubble({ children }: { children: ReactNode }) {
  return (
    <div className={styles.user}>
      <p className={styles.userText}>{children}</p>
    </div>
  );
}

/** Port of Pencil `Chat / Assistant`. `children` after the message can carry structured result chips. */
export function ChatAssistantBubble({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className={styles.assistant}>
      <p className={styles.assistantText}>{children}</p>
      {extra}
    </div>
  );
}
