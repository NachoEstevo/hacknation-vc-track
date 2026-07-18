"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main style={{ padding: "10vh 8vw" }}>
      <p style={{ color: "var(--risk)", fontWeight: 700 }}>Workspace error</p>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "3rem" }}>
        We kept your evidence intact.
      </h1>
      <p style={{ color: "var(--text)", maxWidth: 520 }}>
        Something failed while loading this view. Try the request again.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          background: "var(--accent)",
          color: "white",
          padding: "12px 18px",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </main>
  );
}
