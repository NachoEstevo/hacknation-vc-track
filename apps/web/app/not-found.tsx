import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ padding: "10vh 8vw" }}>
      <p style={{ color: "var(--accent)", fontWeight: 700 }}>404</p>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "3rem" }}>
        This trail went cold.
      </h1>
      <p style={{ color: "var(--text)", maxWidth: 520 }}>
        The workspace could not find this page or opportunity.
      </p>
      <Link href="/" style={{ color: "var(--accent)", fontWeight: 700 }}>
        Return to undr
      </Link>
    </main>
  );
}
